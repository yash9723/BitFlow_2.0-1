"""
layout/app.py: BitFlow's RTL-to-GDS service. Learner Verilog in, a placed-and-routed chip out
(OpenROAD-flow-scripts in Docker), one job at a time per worker.

  POST /jobs                {verilog, top, clock?, period_ns?, platform?}  -> {id, state}
  GET  /jobs/{id}           state (queued|running|done|failed), stage, message, results
  GET  /jobs/{id}/files/{n} one of FILES (layout pictures, the GDS)
  GET  /health

Every route but /health needs the site's ES256 JWT (same key pair as the simulator). Each job runs in a
fresh container: no network, non-root, no capabilities, read-only image, memory/CPU/process/time limits.
The server writes the config and constraints itself; the learner only supplies Verilog and a few checked
numbers. A job's id is a hash of its inputs and the tool image, so a resubmit returns the cached result.

Settings (env): JWT_PUBLIC_KEY, ORFS_IMAGE (pin a digest), JOBS_DIR, WORKERS, MAX_QUEUE, JOB_TIMEOUT_S,
JOB_MEMORY, JOB_CPUS, KEEP_DAYS, LIBS_DIR (slow/fast corner libraries for sign-off timing).
"""
from __future__ import annotations

import json
import logging
import os
import queue
import shutil
import subprocess
import threading
import time
from pathlib import Path

import jwt
from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

import flow

log = logging.getLogger("layout")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

IMAGE = os.environ.get("ORFS_IMAGE", "openroad/orfs:latest")
JOBS = Path(os.environ.get("JOBS_DIR", "/var/lib/bitflow-layout/jobs"))
WORKERS = int(os.environ.get("WORKERS", "1"))
MAX_QUEUE = int(os.environ.get("MAX_QUEUE", "20"))
TIMEOUT_S = int(os.environ.get("JOB_TIMEOUT_S", "420"))
MEMORY = os.environ.get("JOB_MEMORY", "2g")
CPUS = os.environ.get("JOB_CPUS", "2")
KEEP_DAYS = float(os.environ.get("KEEP_DAYS", "7"))
UID = os.environ.get("JOB_UID", "1000:1000")
PUBLIC_KEY = os.environ.get("JWT_PUBLIC_KEY", "").replace("\\n", "\n")
LIBS_DIR = Path(os.environ.get("LIBS_DIR", "/opt/bitflow-layout/libs"))      # ss/ff Liberty files for sign-off timing
CHECKS_VERSION = "signoff-2"      # in the cache key: bump when the checks change so old results are recomputed
TT_LIB = "/OpenROAD-flow-scripts/flow/platforms/sky130hd/lib/" + flow.CORNERS["tt"][0]

FILES = {
    "final_all.webp": "image/webp", "final_placement.webp": "image/webp", "final_routing.webp": "image/webp",
    "final_clocks.webp": "image/webp", "final_worst_path.webp": "image/webp", "final_congestion.webp": "image/webp",
    "6_final.gds": "application/octet-stream",
}
STAGES = [("1_", "synthesis"), ("2_", "floorplan"), ("3_", "placement"), ("4_", "clock tree"), ("5_", "routing"), ("6_", "finishing")]

app = FastAPI(title="BitFlow layout", docs_url=None, redoc_url=None)
_bearer = HTTPBearer()
_q: "queue.Queue[str]" = queue.Queue()
_lock = threading.Lock()
_active: dict[str, str] = {}      # user -> job id while queued or running


def auth(c: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    if not PUBLIC_KEY:
        raise HTTPException(503, "Server has no JWT_PUBLIC_KEY.")
    try:
        # ES256 only (no algorithm confusion); tokens with an audience (pair mode) are refused, as in api/jwt_auth.py.
        claims = jwt.decode(c.credentials, PUBLIC_KEY, algorithms=["ES256"], options={"verify_aud": False})
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid or expired token.")
    if claims.get("aud"):
        raise HTTPException(401, "This token can't use the layout service.")
    return claims


def _status_path(jid: str) -> Path:
    return JOBS / jid / "status.json"


def read_status(jid: str) -> dict | None:
    try:
        return json.loads(_status_path(jid).read_text())
    except (OSError, ValueError):
        return None


def write_status(jid: str, **kv) -> dict:
    st = (read_status(jid) or {}) | kv | {"updated": time.time()}
    tmp = _status_path(jid).with_suffix(".tmp")
    tmp.write_text(json.dumps(st))
    tmp.replace(_status_path(jid))
    return st


class JobIn(BaseModel):
    verilog: str = Field(..., max_length=flow.MAX_VERILOG_BYTES)
    top: str
    clock: str | None = None         # None: guess from the ports; "": no clock (combinational)
    period_ns: float = 10.0
    platform: str = "sky130hd"


@app.get("/health")
def health():
    return {"ok": True, "queued": _q.qsize(), "image": IMAGE}


@app.post("/jobs")
def submit(body: JobIn, claims: dict = Depends(auth)):
    clock = flow.guess_clock(body.verilog, body.top) if body.clock is None else (body.clock or None)
    problems = flow.check_request(body.verilog, body.top, clock, body.period_ns, body.platform)
    if problems:
        raise HTTPException(422, {"problems": problems})
    jid = flow.job_id(body.verilog, body.top, clock, body.period_ns, body.platform, f"{IMAGE}|{CHECKS_VERSION}")
    user = str(claims.get("sub") or claims.get("userId") or "anon")
    with _lock:
        st = read_status(jid)
        if st and st["state"] in ("queued", "running", "done"):
            return {"id": jid, "state": st["state"], "cached": st["state"] == "done"}
        if user in _active:
            raise HTTPException(429, "You already have a layout running. Wait for it to finish.")
        if _q.qsize() >= MAX_QUEUE:
            raise HTTPException(429, "The layout queue is full. Try again in a few minutes.")
        d = JOBS / jid
        shutil.rmtree(d, ignore_errors=True)         # a failed earlier try of the same inputs
        d.mkdir(parents=True)
        (d / "design.v").write_text(body.verilog)
        (d / "constraint.sdc").write_text(flow.sdc(clock, body.period_ns))
        (d / "request.json").write_text(json.dumps({"top": body.top, "clock": clock, "period_ns": body.period_ns, "platform": body.platform, "user": user}))
        write_status(jid, id=jid, state="queued", stage=None, message=None, results=None, created=time.time(),
                     top=body.top, clock=clock, period_ns=body.period_ns, platform=body.platform)
        _active[user] = jid
        _q.put(jid)
    return {"id": jid, "state": "queued", "cached": False}


@app.get("/jobs/{jid}")
def status(jid: str, _: dict = Depends(auth)):
    if not jid.isalnum():
        raise HTTPException(404)
    st = read_status(jid)
    if not st:
        raise HTTPException(404, "No such job.")
    if st["state"] == "queued":
        st["position"] = list(_q.queue).index(jid) + 1 if jid in _q.queue else None
    st["files"] = sorted(n for n in FILES if (JOBS / jid / "out" / n).exists())
    return st


@app.get("/jobs/{jid}/files/{name}")
def file(jid: str, name: str, _: dict = Depends(auth)):
    if not jid.isalnum() or name not in FILES:
        raise HTTPException(404)
    p = JOBS / jid / "out" / name
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(p, media_type=FILES[name], filename=name if name.endswith(".gds") else None)


# ── the runner ────────────────────────────────────────────────────────────────

def docker(jid: str, target: str, logname: str) -> tuple[int, str]:
    """Run one `make <target>` in a locked-down container; returns (exit code, log text)."""
    d = JOBS / jid
    name = f"layout-{jid}"
    cmd = ["docker", "run", "--rm", "--name", name, "--network", "none", "--user", UID,
           "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--read-only",
           "--tmpfs", "/tmp:rw,size=512m", "-e", "HOME=/tmp", "--memory", MEMORY, "--memory-swap", MEMORY, "--cpus", CPUS,
           "--pids-limit", "1024", "-v", f"{d}:/work", IMAGE, "bash", "-c",
           f"cd /OpenROAD-flow-scripts/flow && source ../env.sh >/dev/null 2>&1; "
           f"make DESIGN_CONFIG=/work/config.mk WORK_HOME=/work/run {target} > /work/{logname} 2>&1"]
    try:
        rc = subprocess.run(cmd, timeout=TIMEOUT_S, capture_output=True).returncode
    except subprocess.TimeoutExpired:
        subprocess.run(["docker", "kill", name], capture_output=True)
        rc = 124
    text = (d / logname).read_text(errors="replace") if (d / logname).exists() else ""
    return rc, text


def signoff_timing(jid: str, plat: str, top: str) -> dict | None:
    """Worst setup/hold slack of the finished layout at each corner (layout/corners.tcl, one OpenSTA run per corner,
    same lockdown as the flow). A corner whose library is missing or whose run fails is None, shown as not run."""
    if plat != "sky130hd":
        return None
    res = JOBS / jid / "run" / "results" / plat / top / "base"
    if not (res / "6_final.odb").exists():
        return None
    out: dict = {}
    for corner, (lib, _) in flow.CORNERS.items():
        path = TT_LIB if corner == "tt" else f"/libs/{lib}"
        if corner != "tt" and not (LIBS_DIR / lib).exists():
            out[corner] = None
            continue
        cmd = ["docker", "run", "--rm", "--network", "none", "--user", UID, "--cap-drop", "ALL",
               "--security-opt", "no-new-privileges", "--read-only", "--tmpfs", "/tmp:rw,size=64m",
               "--memory", MEMORY, "--memory-swap", MEMORY, "--cpus", CPUS, "--pids-limit", "256",
               "-v", f"{res}:/r:ro", "-v", f"{LIBS_DIR}:/libs:ro", "-v", f"{Path(__file__).parent / 'corners.tcl'}:/corners.tcl:ro",
               "-e", "RESULTS=/r", "-e", f"LIB={path}", IMAGE, "bash", "-c",
               "source /OpenROAD-flow-scripts/env.sh >/dev/null 2>&1; openroad -no_init -no_splash -exit /corners.tcl 2>&1"]
        try:
            p = subprocess.run(cmd, timeout=120, capture_output=True, text=True)
            out[corner] = flow.worst_slack(p.stdout)
        except subprocess.TimeoutExpired:
            out[corner] = None
    return out


def stage_watch(jid: str, req: dict, stop: threading.Event):
    """Report the stage as ORFS writes each step's result file."""
    res = JOBS / jid / "run" / "results" / req["platform"] / req["top"] / "base"
    while not stop.wait(2):
        done = {p.name[:2] for p in res.glob("[1-6]_*")} if res.exists() else set()
        current = next((label for prefix, label in STAGES if prefix not in done), "finishing")
        with _lock:
            if (read_status(jid) or {}).get("state") == "running":
                write_status(jid, stage=current)


def finish(jid: str, **kv) -> dict:
    with _lock:      # the stage watcher writes under the same lock, so it can't overwrite a final state
        return write_status(jid, **kv)


def run_job(jid: str):
    d = JOBS / jid
    req = json.loads((d / "request.json").read_text())
    top, plat = req["top"], req["platform"]
    t0 = time.time()
    write_status(jid, state="running", stage="synthesis", started=t0)
    stop = threading.Event()
    threading.Thread(target=stage_watch, args=(jid, req, stop), daemon=True).start()
    try:
        (d / "config.mk").write_text(flow.config_mk(top, plat))
        rc, text = docker(jid, "synth", "synth.log")
        if rc:
            return finish(jid, state="failed", message=flow.explain(text) if rc != 124 else "Synthesis took too long.")
        stat = d / "run" / "reports" / plat / top / "base" / "synth_stat.txt"
        area = flow.synth_area(stat.read_text()) if stat.exists() else None
        core, density = flow.die_for_area(area or 1.0)[0], 0.6
        for attempt in range(3):
            (d / "config.mk").write_text(flow.config_mk(top, plat, core, density))
            rc, text = docker(jid, "", f"flow{attempt}.log")
            if rc == 0:
                break
            nxt = flow.recovery(text, core, density) if rc != 124 else None
            if not nxt:
                break
            core, density = nxt
            for p in (d / "run" / "results" / plat / top / "base").glob("[2-6]_*"):
                p.unlink()
        out = d / "out"
        out.mkdir(exist_ok=True)
        rep = d / "run" / "reports" / plat / top / "base"
        for n in FILES:
            src = (d / "run" / "results" / plat / top / "base" / n) if n.endswith(".gds") else rep / n
            if src.exists():
                shutil.copy(src, out / n)
        corners = signoff_timing(jid, plat, top) if rc == 0 else None
        if rc == 0 and plat == "sky130hd":     # KLayout DRC + LVS (needs the orfs-klayout image; else they read as not run)
            docker(jid, "drc", "drc.log")
            docker(jid, "lvs", "lvs.log")
        rd = lambda n: (d / n).read_text(errors="replace") if (d / n).exists() else ""
        results = flow.read_results(d / "run", plat, top) | flow.read_klayout(rd("drc.log"), rd("lvs.log")) | {
                                                            "corners": corners, "synth_area_um2": area, "core_um": core,
                                                             "seconds": round(time.time() - t0, 1), "image": IMAGE}
        if rc:
            msg = "The layout took too long (over the time limit)." if rc == 124 else flow.explain(text)
            finish(jid, state="failed", message=msg, results=results)
        else:
            finish(jid, state="done", stage=None, results=results)
    except Exception as e:      # the service must keep running whatever one job does
        log.exception("job %s", jid)
        finish(jid, state="failed", message=f"Internal error: {type(e).__name__}")
    finally:
        stop.set()
        shutil.rmtree(d / "run", ignore_errors=True)      # keep only the inputs, the logs and out/
        with _lock:
            for u, j in list(_active.items()):
                if j == jid:
                    del _active[u]


def worker():
    while True:
        run_job(_q.get())


def housekeeping():
    """Fail jobs a restart interrupted; delete jobs older than KEEP_DAYS."""
    JOBS.mkdir(parents=True, exist_ok=True)
    for d in JOBS.iterdir():
        st = read_status(d.name)
        if st and st["state"] in ("queued", "running"):
            write_status(d.name, state="failed", message="The layout server restarted. Submit again.")
        if not st or time.time() - st.get("updated", 0) > KEEP_DAYS * 86400:
            shutil.rmtree(d, ignore_errors=True)


@app.on_event("startup")
def start():
    housekeeping()
    for _ in range(WORKERS):
        threading.Thread(target=worker, daemon=True).start()
