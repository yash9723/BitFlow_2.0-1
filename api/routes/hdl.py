"""
routes/hdl.py — VHDL conversion and formal verification.

  POST /vhdl    VHDL design -> Verilog netlist (GHDL), so the frontend can grade,
                synthesize and compare a VHDL design with the Verilog-only tools.
  POST /formal  Bounded model check, k-induction proof or cover search of the
                design's assert/assume/cover statements (Yosys + yosys-smtbmc + Z3).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
import time
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from api.config import settings
from api.jwt_auth import verify_jwt
from api.langs import top_module, vhdl_to_verilog
from api.routes.simulate import _sim_slots
from api.sandbox import _run_limited
from api.utils import check_source_size, cleanup_workspace, create_workspace, read_vcd

logger = logging.getLogger(__name__)


def _write(tmpdir: str, name: str, content: str) -> None:
    path = os.path.join(tmpdir, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    os.chmod(path, 0o644)


def _read(path: str) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except FileNotFoundError:
        return ""


# =============================================================================
# POST /vhdl
# =============================================================================

vhdl_router = APIRouter(prefix="/vhdl", tags=["Languages"])


class VhdlRequest(BaseModel):
    design_vhdl: str = Field(..., min_length=1, description="VHDL design (synthesizable).")


def _vhdl_sync(design_vhdl: str) -> dict:
    tmpdir, _ = create_workspace()
    try:
        _write(tmpdir, "design.vhd", design_vhdl)
        error = vhdl_to_verilog(tmpdir)
        if error:
            return {"ok": False, "error": error}
        verilog = _read(os.path.join(tmpdir, "design.v"))
        return {"ok": True, "verilog": verilog, "top": top_module(verilog)}
    finally:
        cleanup_workspace(tmpdir)


@vhdl_router.post("", dependencies=[Depends(verify_jwt)], summary="Convert a VHDL design to Verilog (GHDL)")
async def vhdl(body: VhdlRequest) -> dict:
    check_source_size(body.design_vhdl, settings.max_source_bytes, "design_vhdl")
    async with _sim_slots:
        return await asyncio.to_thread(_vhdl_sync, body.design_vhdl)


# =============================================================================
# POST /formal
# =============================================================================

formal_router = APIRouter(prefix="/formal", tags=["Formal"])

FORMAL_TIMEOUT_SECONDS = 30

# The top module is the one nothing instantiates: the harness when there is one.
# async2sync/dffunmap: model async resets and enables as plain logic for the solver.
FORMAL_SCRIPT = """\
read_verilog -formal -sv {files}
prep -auto-top
async2sync
dffunmap
write_smt2 -wires model.smt2
"""

_HAS_ASSERT = re.compile(r"\bassert\s*(?:property\s*)?\(")
_HAS_COVER  = re.compile(r"\bcover\s*(?:property\s*)?\(")


class FormalRequest(BaseModel):
    design_v:  str           = Field(..., min_length=1, description="Design; may contain `ifdef FORMAL properties.")
    harness_v: Optional[str] = Field(default=None, description="Optional top module that instantiates the design and states properties.")
    mode:      Literal["bmc", "prove", "cover"] = "bmc"
    depth:     int           = Field(default=20, ge=1, le=40, description="Steps (clock cycles) to search.")


def parse_smtbmc(output: str) -> dict:
    """Outcome of a yosys-smtbmc run: status, failing assertion, cover results."""
    status = re.findall(r"Status: (\w+)", output)
    failed = None
    m = re.search(r"Assert failed in \S+: ([\w.]+):(\d+)", output)
    if m:
        steps = re.findall(r"step (\d+)", output[: m.start()])
        failed = {"file": m.group(1), "line": int(m.group(2)), "step": int(steps[-1]) if steps else None}
    # Yosys 0.33 says "Reached cover statement at design.sv:12.5-12.24 in step 9.", newer ones
    # "Reached cover statement in step 9 at \top: design.sv:12": take the step and file:line wherever they are.
    covers = []
    for line in output.splitlines():
        if "cover statement" not in line:
            continue
        loc = re.search(r"([\w.-]+\.s?vh?):(\d+)", line)
        step = re.search(r"in step (\d+)", line)
        if loc and ("Unreached" in line or step):
            covers.append({"file": loc.group(1), "line": int(loc.group(2)), "reached": "Unreached" not in line,
                           "step": int(step.group(1)) if step and "Unreached" not in line else None})
    return {
        "status":           status[-1].lower() if status else "error",
        "failed":           failed,
        "inductionFailed":  "induction failed" in output.lower(),
        "assumptionsUnsat": "Assumptions are unsatisfiable" in output,
        "covers":           sorted(covers, key=lambda c: c["line"]),
    }


def _formal_sync(design_v: str, harness_v: str | None, mode: str, depth: int) -> dict:
    sources = design_v + (harness_v or "")
    if mode == "cover" and not _HAS_COVER.search(sources):
        return {"status": "error", "error": "No cover statements found. Add e.g. `cover(count == 9);` inside an always block."}
    if mode != "cover" and not _HAS_ASSERT.search(sources):
        return {"status": "error", "error": "No assertions found. Add e.g. `always @(posedge clk) assert(count <= 9);`."}

    tmpdir, workspace_id = create_workspace()
    t0 = time.monotonic()
    try:
        files = ["design.v"] + (["harness.v"] if harness_v else [])
        _write(tmpdir, "design.v", design_v)
        if harness_v:
            _write(tmpdir, "harness.v", harness_v)
        _write(tmpdir, "formal.ys", FORMAL_SCRIPT.format(files=" ".join(files)))
        try:
            rc, out = _run_limited(["yosys", "-q", "-s", "formal.ys"], cwd=tmpdir, timeout=FORMAL_TIMEOUT_SECONDS)
            if rc != 0:
                lines = [l for l in out.replace(tmpdir + os.sep, "").splitlines() if l.strip()]
                return {"status": "error", "error": "\n".join(lines[-15:]) or "yosys failed"}
            def smtbmc(*flags: str) -> str:
                left = max(1, FORMAL_TIMEOUT_SECONDS - int(time.monotonic() - t0))
                return _run_limited(
                    ["yosys-smtbmc", "-s", "z3", "--presat", *flags, "-t", str(depth), "--dump-vcd", "trace.vcd", "model.smt2"],
                    cwd=tmpdir, timeout=left,
                )[1]

            # A proof is two checks, as in SymbiYosys: the base case (no failure within `depth`
            # steps from the initial state) and the induction step (`depth` good steps imply a
            # good next one, from ANY state). -i alone runs only the induction step.
            out = smtbmc("-c") if mode == "cover" else smtbmc()
            result = parse_smtbmc(out)
            if mode == "prove" and result["status"] == "passed":
                out = smtbmc("-i")
                result = parse_smtbmc(out)
                if result["status"] == "failed":
                    # Not a bug: the counterexample may start from a state reset can never reach.
                    result.update(status="unproven", inductionFailed=True)
        except subprocess.TimeoutExpired:
            return {"status": "error", "error": f"The solver took longer than {FORMAL_TIMEOUT_SECONDS}s. Try a smaller depth."}
        except FileNotFoundError:
            return {"status": "error", "error": "Formal verification is unavailable (yosys-smtbmc is not installed)."}

        vcd_b64 = None
        if os.path.exists(os.path.join(tmpdir, "trace.vcd")):
            vcd_b64, _ = read_vcd(tmpdir, "trace.vcd")
        log = [l.split("  ", 1)[-1] for l in out.splitlines() if l.startswith("##")]
        if result["status"] == "error":
            result["error"] = "\n".join((log or out.strip().splitlines())[-10:]) or "The solver failed."
        logger.info(json.dumps({"event": "formal", "workspace_id": workspace_id, "mode": mode, "status": result["status"],
                                "duration_ms": round((time.monotonic() - t0) * 1000, 1)}))
        return {**result, "mode": mode, "depth": depth, "vcd_base64": vcd_b64, "log": "\n".join(log[-40:])}
    finally:
        cleanup_workspace(tmpdir)


@formal_router.post("", dependencies=[Depends(verify_jwt)],
                    summary="Check assertions (bmc), prove them by induction (prove) or reach covers (cover)")
async def formal(body: FormalRequest) -> dict:
    check_source_size(body.design_v, settings.max_source_bytes, "design_v")
    if body.harness_v:
        check_source_size(body.harness_v, settings.max_source_bytes, "harness_v")
    async with _sim_slots:
        return await asyncio.to_thread(_formal_sync, body.design_v, body.harness_v, body.mode, body.depth)
