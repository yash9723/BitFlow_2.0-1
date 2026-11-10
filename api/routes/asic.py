"""
routes/asic.py — POST /asic: what the design costs as a chip on SkyWater's 130 nm process.

  1. Yosys maps design.v to Sky130 HD standard cells (dfflibmap + abc -liberty): area in µm², cells.
  2. OpenSTA times the gate netlist at the requested clock: setup and hold slack, WNS/TNS, the
     critical path stage by stage, Fmax, and power (internal, switching, leakage).
  3. With a testbench, it runs twice under Icarus: on the RTL, where its VCD gives each input's
     switching activity for the power estimate, and on the gate netlist (gate-level simulation),
     to show whether the gates behave like the RTL.

Typical corner (tt, 25 C, 1.8 V), ideal clock, no wire load (before layout): estimates, not signoff.
The library and cell models come from api/install_sky130.sh.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
import time
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from api.config import settings
from api.jwt_auth import verify_jwt
from api.lanes import heavy
from api.sandbox import _run_limited
from api.utils import check_source_size, cleanup_workspace, create_workspace

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/asic", tags=["ASIC"])

SKY130_DIR = os.environ.get("SKY130_DIR", "/opt/sky130")
LIB   = os.path.join(SKY130_DIR, "sky130_fd_sc_hd__tt_025C_1v80.lib")
CELLS = os.path.join(SKY130_DIR, "cells.v")

SYNTH_TIMEOUT_SECONDS = 60
STA_TIMEOUT_SECONDS   = 30
SIM_TIMEOUT_SECONDS   = 15
MAX_NETLIST_BYTES     = 300 * 1024
DEFAULT_ACTIVITY      = 0.1     # input transitions per clock period when there's no simulation
OUTPUT_LOAD_PF        = 0.005   # about three gate inputs on every output

# Cells OpenROAD's sky130hd platform never uses (probes, low-power flow cells).
DONT_USE = "-dont_use *probe* -dont_use *lpflow*"

# dfflibmap maps flip-flops only; latches go to Sky130's latch cells.
LATCH_MAP = """\
module \\$_DLATCH_P_ (input E, input D, output Q);
  sky130_fd_sc_hd__dlxtp_1 _TECHMAP_REPLACE_ (.D(D), .GATE(E), .Q(Q));
endmodule
module \\$_DLATCH_N_ (input E, input D, output Q);
  sky130_fd_sc_hd__dlxtn_1 _TECHMAP_REPLACE_ (.D(D), .GATE_N(E), .Q(Q));
endmodule
"""

SYNTH_SCRIPT = """\
read_verilog -sv design.v
{elaborate}
dfflibmap -liberty {lib} {dont_use}
dfflegalize -cell $_DLATCH_P_ 01 -cell $_DLATCH_N_ 01
techmap -map latch_map.v
abc -liberty {lib} {dont_use} -D {period_ps}
setundef -zero
hilomap -singleton -hicell sky130_fd_sc_hd__conb_1 HI -locell sky130_fd_sc_hd__conb_1 LO
splitnets
opt_clean -purge
rename -enumerate
tee -q -o stat.json stat -json -liberty {lib}
write_verilog -noattr -noexpr -nohex -nodec netlist.v
write_json gates.json
"""

def sky130_area(tmpdir: str) -> Optional[float]:
    """
    Standard-cell area in µm² of tmpdir/design.v on Sky130 HD, mapped as /asic maps it
    (no timing). For the area leaderboard (POST /metrics); None when the library or yosys is
    missing or synthesis fails, so a missing score never fails a submission.
    """
    if not os.path.exists(LIB):
        return None
    _write(tmpdir, "latch_map.v", LATCH_MAP)
    script = SYNTH_SCRIPT.format(elaborate="synth -auto-top -flatten", lib=LIB, dont_use=DONT_USE, period_ps=10000)
    _write(tmpdir, "area.ys", script.replace("write_verilog -noattr -noexpr -nohex -nodec netlist.v\n", "")
                                    .replace("write_json gates.json\n", "").replace("stat.json", "area.json"))
    try:
        rc, _ = _run_limited(["yosys", "-q", "-s", "area.ys"], cwd=tmpdir, timeout=SYNTH_TIMEOUT_SECONDS)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None
    if rc != 0:
        return None
    return summarize_cells(json.loads(_read(os.path.join(tmpdir, "area.json")) or "{}"))["areaUm2"]


_CLOCK_NAMES = re.compile(r"^(clk|clock|clk_i|i_clk|clk_in|sys_clk|clock_i)$", re.I)
_SAFE_NAME   = re.compile(r"^[A-Za-z_]\w*$")


class AsicRequest(BaseModel):
    design_v:    str = Field(..., min_length=1, description="Verilog design source.")
    testbench_v: Optional[str] = Field(None, description="Optional testbench: power from its activity, and gate-level simulation.")
    period_ns:   float = Field(10.0, ge=0.5, le=1000.0, description="Clock period to time against.")
    clock:       Optional[str] = Field(None, max_length=64, pattern=r"^[A-Za-z_]\w*$", description="Clock port (default: guessed).")


# =============================================================================
# Parsing helpers (pure — unit-tested)
# =============================================================================

MAX_GATES_CELLS = 3000          # the schematic's limit (bitflow_frontend/lib/synth/yosys.ts)
MAX_GATES_BYTES = 2_000_000


def gates_module(gates_json: str, top: str, cells: int) -> Optional[dict]:
    """The top module of the mapped netlist (Yosys JSON), or None when too large to draw or unreadable."""
    if not gates_json or cells > MAX_GATES_CELLS or len(gates_json) > MAX_GATES_BYTES:
        return None
    try:
        module = json.loads(gates_json).get("modules", {}).get(top)
    except ValueError:
        return None
    return {"modules": {top: module}} if module else None


def netlist_ports(netlist_v: str) -> tuple[Optional[str], dict[str, dict]]:
    """Top module name and {port: {dir, width}} from Yosys write_verilog output."""
    top = re.search(r"^module\s+(\S+?)\s*\(", netlist_v, re.M)
    ports = {}
    for d, msb, lsb, name in re.findall(r"^\s*(input|output|inout)\s+(?:\[(\d+):(\d+)\]\s+)?(\S+);", netlist_v, re.M):
        ports[name] = {"dir": d, "width": abs(int(msb) - int(lsb)) + 1 if msb else 1}
    return (top.group(1) if top else None), ports


_LITERAL = re.compile(r"^(?:(\d+)?\s*'\s*([bodhBODH])\s*([0-9a-fA-F_]+)|(\d[\d_]*))$")
_BASE = {"b": 2, "o": 8, "d": 10, "h": 16}


def tb_parameters(design_v: str, testbench_v: str) -> tuple[Optional[str], dict[str, int]]:
    """
    The module the testbench instantiates with #(.NAME(value)) overrides, and those values,
    so the gates are synthesized in the configuration that is simulated. Only named overrides
    with number literals (4, 8'hFF); anything else keeps the design's default.
    """
    tb = re.sub(r"//[^\n]*|/\*.*?\*/", "", testbench_v, flags=re.S)
    for name in re.findall(r"^\s*module\s+(\w+)", design_v, re.M):
        m = re.search(rf"\b{name}\s*#\s*\((.*?)\)\s*\w+\s*\(", tb, re.S)
        if not m:
            continue
        params = {}
        for p, value in re.findall(r"\.(\w+)\s*\(\s*([^()]+?)\s*\)", m.group(1)):
            lit = _LITERAL.match(value.replace(" ", ""))
            if lit:
                params[p] = int(lit.group(4).replace("_", "")) if lit.group(4) else int(lit.group(3).replace("_", ""), _BASE[lit.group(2).lower()])
        return name, params
    return None, {}


def with_parameters(netlist_v: str, params: dict[str, int]) -> str:
    """The gate netlist with the overridden parameters declared (unused: their values are
    already in the gates), so the testbench's #(.NAME(value)) still elaborates against it."""
    if not params:
        return netlist_v
    decls = "".join(f"\n  parameter {p} = {v};" for p, v in params.items())
    return re.sub(r"^(module\s+\S+?\s*\(.*?\);)", lambda m: m.group(1) + decls, netlist_v, count=1, flags=re.S | re.M)


def pick_clock(ports: dict[str, dict], wanted: Optional[str]) -> Optional[str]:
    """The clock port: the one asked for, else a 1-bit input with a clock-like name."""
    inputs = [n for n, p in ports.items() if p["dir"] == "input" and p["width"] == 1]
    if wanted:
        return wanted if wanted in inputs else None
    return next((n for n in inputs if _CLOCK_NAMES.match(n)), None) or next((n for n in inputs if "clk" in n.lower()), None)


_UNITS_NS = {"s": 1e9, "ms": 1e6, "us": 1e3, "ns": 1.0, "ps": 1e-3, "fs": 1e-6}


def vcd_activity(vcd: str, inputs: dict[str, int], period_ns: float) -> dict[str, dict]:
    """
    Switching activity of the design's inputs in a VCD: {port: {activity, duty}}, where
    activity is 0<->1 transitions per bit per clock period (OpenSTA's unit) and duty the
    fraction of time at 1. Read from the deepest scope that has every input (the DUT
    instance, not the testbench), else the scope with the most of them.
    """
    head, sep, body = vcd.partition("$enddefinitions")
    if not sep or not inputs:
        return {}
    ts = re.search(r"\$timescale\s+(\d+)\s*(s|ms|us|ns|ps|fs)\s+\$end", head)
    unit_ns = int(ts.group(1)) * _UNITS_NS[ts.group(2)] if ts else 1.0

    scopes: dict[tuple, dict[str, tuple[str, int]]] = {}
    stack: list[str] = []
    for m in re.finditer(r"\$(scope|upscope|var)\b(.*?)\$end", head, re.S):
        kind, words = m.group(1), m.group(2).split()
        if kind == "scope" and len(words) >= 2:
            stack.append(words[1])
        elif kind == "upscope" and stack:
            stack.pop()
        elif kind == "var" and len(words) >= 4:
            scopes.setdefault(tuple(stack), {})[words[3]] = (words[2], int(words[1]))

    def score(path):
        return (sum(n in scopes[path] for n in inputs), len(path))
    best = max(scopes, key=score, default=None)
    if best is None or score(best)[0] == 0:
        return {}
    want = {scopes[best][n][0]: (n, scopes[best][n][1]) for n in inputs if n in scopes[best]}

    bits = {i: ["x"] * w for i, (_, w) in want.items()}
    toggles = {i: [0] * w for i, (_, w) in want.items()}
    high = {i: [0] * w for i, (_, w) in want.items()}
    since = {i: 0 for i in want}
    now = 0

    def change(ident: str, value: str):
        old, w = bits[ident], len(bits[ident])
        value = value.lower()
        new = list((value[0] if value[0] in "xz" else "0") * (w - len(value)) + value)[-w:]
        for k in range(w):
            if old[k] == "1":
                high[ident][k] += now - since[ident]
            if {old[k], new[k]} == {"0", "1"}:
                toggles[ident][k] += 1
        since[ident] = now
        bits[ident] = new

    vector = None   # the value of a "b0101" token; its identifier is the next token
    for tok in body.split():
        if vector is not None:
            if tok in want:
                change(tok, vector)
            vector = None
        elif tok[0] == "#":
            now = int(tok[1:]) if tok[1:].isdigit() else now
        elif tok[0] in "bB":
            vector = tok[1:]
        elif tok[0] in "01xzXZ" and tok[1:] in want:
            change(tok[1:], tok[0])

    total_ns = now * unit_ns
    if total_ns <= 0:
        return {}
    for i in want:
        for k, b in enumerate(bits[i]):
            if b == "1":
                high[i][k] += now - since[i]
    periods = total_ns / period_ns
    return {
        name: {"activity": round(sum(toggles[i]) / w / periods, 4), "duty": round(sum(high[i]) / w / now, 4)}
        for i, (name, w) in want.items()
    }


_STAGE = re.compile(r"^\s*(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+([\^v])\s+(\S+)\s+\((\S+)\)\s*$")
_NET   = re.compile(r"^\s*\d+\s+(\S+)\s+\(net\)\s*$")


def parse_path(report: str) -> Optional[dict]:
    """One OpenSTA report_checks path: endpoints, stages (pin, cell, delay, arrival, net), slack."""
    if "Startpoint:" not in report:
        return None
    start = re.search(r"Startpoint:\s+(\S+)\s+\((.*?)\)", report)
    end   = re.search(r"Endpoint:\s+(\S+)\s+\((.*?)\)", report)
    arrival_part = report.partition("data arrival time")[0]
    stages: list[dict] = []
    for line in arrival_part.splitlines():
        if m := _STAGE.match(line):
            kind = m.group(5)
            cell = {"in": "input port", "out": "output port"}.get(kind, kind.replace("sky130_fd_sc_hd__", ""))
            stages.append({"pin": m.group(4), "cell": cell, "edge": "rise" if m.group(3) == "^" else "fall",
                           "delay": float(m.group(1)), "arrival": float(m.group(2)), "net": None})
        elif (n := _NET.match(line)) and stages:
            stages[-1]["net"] = n.group(1)
    arrival = re.search(r"(-?\d+\.\d+)\s+data arrival time", report)
    slack = re.search(r"(-?\d+\.\d+)\s+slack \((MET|VIOLATED)\)", report)
    return {
        "startpoint": start.group(1) if start else None, "startKind": start.group(2) if start else None,
        "endpoint":   end.group(1) if end else None,     "endKind":   end.group(2) if end else None,
        "stages":  stages,
        "arrival": float(arrival.group(1)) if arrival else None,
        "slack":   float(slack.group(1)) if slack else None,
        "met":     bool(slack and slack.group(2) == "MET"),
    }


def parse_power(report: str) -> Optional[dict]:
    """report_power: watts by kind (internal, switching, leakage, total) and by group."""
    rows = {}
    for m in re.finditer(r"^(Sequential|Combinational|Total)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)", report, re.M):
        try:
            rows[m.group(1).lower()] = [float(x) for x in m.groups()[1:]]
        except ValueError:
            continue
    if "total" not in rows:
        return None
    internal, switching, leakage, total = rows["total"]
    return {"internal": internal, "switching": switching, "leakage": leakage, "total": total,
            "sequential": rows.get("sequential", [0, 0, 0, 0])[3], "combinational": rows.get("combinational", [0, 0, 0, 0])[3]}


def summarize_cells(stat: dict) -> dict:
    """Area (µm²) and cell counts by type from `stat -json -liberty`, flip-flops and latches counted apart."""
    mod = next(iter(stat.get("modules", {}).values()), {}) or stat.get("design", {})
    by_type = {t.replace("sky130_fd_sc_hd__", ""): n for t, n in mod.get("num_cells_by_type", {}).items()}
    return {
        "areaUm2":   round(float(mod.get("area", 0.0)), 2),
        "cells":     sum(by_type.values()),
        "registers": sum(n for t, n in by_type.items() if re.match(r"^(\w*df|dl)", t)),
        "byType":    dict(sorted(by_type.items(), key=lambda kv: -kv[1])),
    }


def sim_passed(rc: int, out: str) -> bool:
    """The platform's testbench convention: finished, and no FAIL line."""
    return rc == 0 and "FAIL" not in out


def comparable(out: str) -> list[str]:
    """Testbench output without simulator chatter, for comparing the RTL and gate runs."""
    return [l.rstrip() for l in out.splitlines()
            if l.strip() and not l.startswith(("VCD info", "VCD warning", "WARNING", "warning")) and "$finish called" not in l]


# =============================================================================
# The flow
# =============================================================================

def sta_script(top: str, ports: dict[str, dict], clock: Optional[str], period_ns: float,
               activity: dict[str, dict]) -> str:
    inputs = [n for n, p in ports.items() if p["dir"] == "input" and n != clock]
    lines = [
        f"read_liberty {LIB}",
        "read_verilog netlist.v",
        f"link_design {top}",
        f"create_clock -name clk -period {period_ns} [get_ports {{{clock}}}]" if clock
        else f"create_clock -name clk -period {period_ns}",   # virtual clock: input-to-output delay
    ]
    if inputs:
        lines.append("set_input_delay 0 -clock clk [get_ports {%s}]" % " ".join(inputs))
    lines += [
        "set_output_delay 0 -clock clk [all_outputs]",
        f"set_load {OUTPUT_LOAD_PF} [all_outputs]",
        f"set_power_activity -input -activity {DEFAULT_ACTIVITY} -duty 0.5",
    ]
    for name, a in activity.items():
        if name in inputs and _SAFE_NAME.match(name):
            lines.append(f"set_power_activity -input_ports [get_ports {{{name}}}] -activity {a['activity']} -duty {a['duty']}")
    lines += [
        'puts "@@setup"', "report_checks -path_delay max -fields {net} -digits 3",
        'puts "@@hold"',  "report_checks -path_delay min -fields {net} -digits 3",
        'puts "@@tns"',   "report_tns", "report_wns",
        'puts "@@power"', "report_power -digits 4",
    ]
    return "\n".join(lines) + "\n"


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


def _tail(out: str, n: int = 12) -> str:
    return "\n".join([l for l in out.strip().splitlines() if l.strip()][-n:])


def _simulate(tmpdir: str, sources: list[str], label: str) -> dict:
    """Compile and run tb.v with Icarus; returns {passed, stdout, vcd} or {error}."""
    for f in os.listdir(tmpdir):
        if f.endswith(".vcd"):
            os.remove(os.path.join(tmpdir, f))
    rc, out = _run_limited(["iverilog", "-g2012", "-o", "sim.out", *sources], cwd=tmpdir, timeout=SIM_TIMEOUT_SECONDS)
    if rc != 0:
        return {"error": f"The testbench doesn't compile with the {label} design:\n{_tail(out)}"}
    rc, out = _run_limited(["vvp", "-n", "sim.out"], cwd=tmpdir, timeout=SIM_TIMEOUT_SECONDS)
    dumps = [os.path.join(tmpdir, f) for f in os.listdir(tmpdir) if f.endswith(".vcd")]
    vcd = _read(max(dumps, key=os.path.getmtime)) if dumps else ""
    return {"passed": sim_passed(rc, out), "stdout": out[-20000:], "vcd": vcd}


def _gate_level(tmpdir: str, testbench_v: str, netlist: str, inputs: dict[str, int], period_ns: float) -> tuple[dict, dict]:
    """Run the testbench on the RTL (its VCD gives input activity) and on the gates: (gls, activity)."""
    _write(tmpdir, "tb.v", testbench_v)
    _write(tmpdir, "gates.v", netlist)
    try:
        rtl = _simulate(tmpdir, ["design.v", "tb.v"], "RTL")
        if "error" in rtl:
            return {"error": rtl["error"]}, {}
        activity = vcd_activity(rtl.pop("vcd"), inputs, period_ns)
        gates = _simulate(tmpdir, ["tb.v", "gates.v", CELLS], "gate-level")
        if "error" in gates:
            return {"error": gates["error"]}, activity
        gates.pop("vcd")
        return {"rtl": rtl, "gates": gates, "sameOutput": comparable(rtl["stdout"]) == comparable(gates["stdout"])}, activity
    except subprocess.TimeoutExpired:
        return {"error": f"The testbench ran longer than {SIM_TIMEOUT_SECONDS}s."}, {}


def _asic_sync(body: AsicRequest) -> dict:
    if not (os.path.exists(LIB) and os.path.exists(CELLS)):
        return {"ok": False, "error": "ASIC analysis is unavailable (the Sky130 library is not installed on the server)."}
    tmpdir, workspace_id = create_workspace()
    t0 = time.monotonic()
    try:
        _write(tmpdir, "design.v", body.design_v)
        _write(tmpdir, "latch_map.v", LATCH_MAP)
        dut, params = tb_parameters(body.design_v, body.testbench_v or "")
        elaborate = "synth -auto-top -flatten" if not dut else "\n".join(
            [f"hierarchy -top {dut}", *(f"chparam -set {p} {v} {dut}" for p, v in params.items()), f"synth -top {dut} -flatten"])
        _write(tmpdir, "synth.ys", SYNTH_SCRIPT.format(elaborate=elaborate, lib=LIB, dont_use=DONT_USE, period_ps=int(body.period_ns * 1000)))
        try:
            rc, out = _run_limited(["yosys", "-q", "-s", "synth.ys"], cwd=tmpdir, timeout=SYNTH_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": f"Synthesis timed out after {SYNTH_TIMEOUT_SECONDS}s."}
        except FileNotFoundError:
            return {"ok": False, "error": "ASIC analysis is unavailable (yosys is not installed on the server)."}
        if rc != 0:
            return {"ok": False, "error": _tail(out, 15) or f"yosys exited with code {rc}"}

        netlist = _read(os.path.join(tmpdir, "netlist.v"))
        top, ports = netlist_ports(netlist)
        if not top:
            return {"ok": False, "error": "Synthesis produced no module."}
        clock = pick_clock(ports, body.clock)
        if body.clock and not clock:
            return {"ok": False, "error": f"'{body.clock}' is not a 1-bit input of {top}."}
        cells = summarize_cells(json.loads(_read(os.path.join(tmpdir, "stat.json")) or "{}"))

        gls, activity = None, {}
        if body.testbench_v:
            inputs = {n: p["width"] for n, p in ports.items() if p["dir"] == "input" and n != clock}
            gls, activity = _gate_level(tmpdir, body.testbench_v, with_parameters(netlist, params), inputs, body.period_ns)

        _write(tmpdir, "sta.tcl", sta_script(top, ports, clock, body.period_ns, activity))
        try:
            rc, report = _run_limited(["sta", "-no_splash", "-exit", "sta.tcl"], cwd=tmpdir, timeout=STA_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": f"Timing analysis timed out after {STA_TIMEOUT_SECONDS}s."}
        except FileNotFoundError:
            return {"ok": False, "error": "ASIC analysis is unavailable (OpenSTA is not installed on the server)."}
        sections = dict(re.findall(r"@@(\w+)\n(.*?)(?=@@\w+\n|\Z)", report, re.S))
        power = parse_power(sections.get("power", ""))
        if rc != 0 or power is None:
            return {"ok": False, "error": "Timing analysis failed:\n" + _tail(report)}

        setup = parse_path(sections.get("setup", ""))
        hold = parse_path(sections.get("hold", ""))
        tns = re.search(r"tns\s+(-?\d+\.\d+)", sections.get("tns", ""))
        wns = re.search(r"wns\s+(-?\d+\.\d+)", sections.get("tns", ""))
        min_period = body.period_ns - setup["slack"] if setup and setup["slack"] is not None else None
        result = {
            "ok": True,
            "top": top,
            "parameters": params,           # the testbench's #(...) overrides the gates were built with
            "corner": "Sky130 HD, typical (tt, 25 °C, 1.8 V)",
            **cells,
            "timing": {
                "clock":    clock,           # None: no clock, so the path is input to output
                "periodNs": body.period_ns,
                "setup":    setup,
                "hold":     hold,
                "wnsNs":    float(wns.group(1)) if wns else None,
                "tnsNs":    float(tns.group(1)) if tns else None,
                "fmaxMhz":  round(1000.0 / min_period, 1) if clock and min_period and min_period > 0 else None,
                "delayNs":  setup["arrival"] if setup and not clock else None,
            },
            "power": {
                **power,
                "activitySource":  "simulation" if activity else "default",
                "activity":        activity,
                "defaultActivity": DEFAULT_ACTIVITY,
            },
            "gls": gls,
            "netlist": netlist if len(netlist) <= MAX_NETLIST_BYTES else None,
            # Chip X-ray: the mapped gates as Yosys JSON, cell names matching the netlist and the timing paths
            # (rename -enumerate), with each net's source location where Yosys kept it.
            "gates": gates_module(_read(os.path.join(tmpdir, "gates.json")), top, cells["cells"]),
        }
        logger.info(json.dumps({
            "event": "asic", "workspace_id": workspace_id, "cells": cells["cells"], "area": cells["areaUm2"],
            "gls": bool(gls), "duration_ms": round((time.monotonic() - t0) * 1000, 1),
        }))
        return result
    finally:
        cleanup_workspace(tmpdir)


@router.post("", dependencies=[Depends(verify_jwt)], summary="Sky130 area, timing and power (and gate-level simulation)")
async def asic(body: AsicRequest) -> dict:
    check_source_size(body.design_v, settings.max_source_bytes, "design_v")
    if body.testbench_v:
        check_source_size(body.testbench_v, settings.max_source_bytes, "testbench_v")
    async with heavy:
        return await asyncio.to_thread(_asic_sync, body)
