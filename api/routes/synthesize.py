"""
routes/synthesize.py — POST /synthesize: what hardware does this design become?

Runs Yosys (generic, technology-independent synthesis) on design.v under the
same sandbox limits as simulations and returns:
  - cell counts and flip-flop bits,
  - inferred latches and Yosys warnings (logic loops, multiple drivers, ...),
  - the netlist as Yosys JSON (for the schematic), unless it's too large,
  - extracted FSMs: states (with localparam names when they match) and
    transitions with their input conditions.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from api.config import settings
from api.jwt_auth import verify_jwt
from api.routes.simulate import _sim_slots
from api.sandbox import _run_limited
from api.utils import check_source_size, cleanup_workspace, create_workspace, read_vcd

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/synthesize", tags=["Synthesis"])

SYNTH_TIMEOUT_SECONDS = 20
MAX_SCHEMATIC_CELLS   = 300     # bigger netlists aren't readable as a drawing anyway
MAX_WARNINGS          = 30

# The netlist is written before FSM extraction so the schematic shows the
# plain register + next-state logic rather than an opaque $fsm cell.
# -nosdff/-nodffe keep state registers in the form fsm_detect recognises.
YOSYS_SCRIPT = """\
read_verilog -sv design.v
hierarchy -auto-top
proc
opt -nodffe -nosdff
memory -nomap
opt -nodffe -nosdff
write_json netlist.json
tee -q -o stat.json stat -json
check
fsm_detect
fsm_extract
tee -q -o fsm.txt fsm_info
"""


class SynthesizeRequest(BaseModel):
    design_v: str = Field(..., min_length=1, description="Verilog design source.")


# =============================================================================
# Parsing helpers (pure — unit-tested)
# =============================================================================

_PARAM_DECL = re.compile(r"\b(?:localparam|parameter)\b([^;]*);")
_PARAM_PAIR = re.compile(r"([A-Za-z_]\w*)\s*=\s*([^,;]+)")
_NUMBER     = re.compile(r"^\s*(?:\d*\s*'\s*[sS]?([bBoOdDhH])\s*([0-9a-fA-F_]+)|(\d+))\s*$")
_BASES      = {"b": 2, "o": 8, "d": 10, "h": 16}


def param_names(source: str) -> dict[int, str]:
    """value -> name for localparams/parameters with a constant value (unique values only)."""
    by_value: dict[int, list[str]] = {}
    for decl in _PARAM_DECL.findall(re.sub(r"//.*", "", source)):
        decl = re.sub(r"\[[^\]]*\]", "", decl)          # drop [1:0] ranges
        for name, value in _PARAM_PAIR.findall(decl):
            m = _NUMBER.match(value)
            if not m:
                continue
            n = int(m.group(3)) if m.group(3) else int(m.group(2).replace("_", ""), _BASES[m.group(1).lower()])
            by_value.setdefault(n, []).append(name)
    return {v: names[0] for v, names in by_value.items() if len(names) == 1}


def parse_fsm_info(text: str, names: dict[int, str]) -> list[dict]:
    """Parse Yosys `fsm_info` output into states + merged transitions."""
    fsms = []
    for block in re.split(r"\n(?=FSM `)", text):
        head = re.search(r"FSM `[^']*' from module `([^']*)'", block)
        reg  = re.search(r"Information on FSM \S+ \(\\?([^)]*)\)", block)
        if not head or not reg:
            continue

        inputs = []
        sec = re.search(r"Input signals:\n((?:\s+\d+: .*\n)+)", block)
        for line in (sec.group(1).splitlines() if sec else []):
            sig = line.split(":", 1)[1].strip()
            inputs.append(sig[1:] if sig.startswith("\\") else None)   # None = internal ($...) net

        states = []
        sec = re.search(r"State encoding:\n((?:\s+\d+: .*\n)+)", block)
        for line in (sec.group(1).splitlines() if sec else []):
            m = re.match(r"\s*(\d+):\s+\d+'([01xz]+)(\s+<RESET STATE>)?", line)
            if m:
                code = int(m.group(2), 2) if set(m.group(2)) <= {"0", "1"} else None
                states.append({
                    "id":    int(m.group(1)),
                    "code":  code,
                    "name":  names.get(code) if code is not None else None,
                    "reset": bool(m.group(3)),
                })

        merged: dict[tuple[int, int], list[str]] = {}
        for m in re.finditer(r"^\s*\d+:\s+(\d+)\s+\d+'([01-]+)\s+->\s+(\d+)", block, re.M):
            src, bits, dst = int(m.group(1)), m.group(2), int(m.group(3))
            terms, hidden = [], False
            for i, ch in enumerate(reversed(bits)):          # bit i belongs to input i
                if ch == "-":
                    continue
                name = inputs[i] if i < len(inputs) else None
                if name is None:
                    hidden = True
                else:
                    terms.append(f"{name}={ch}")
            cond = " & ".join(terms) + (" & …" if hidden and terms else "…" if hidden else "")
            conds = merged.setdefault((src, dst), [])
            if cond not in conds:
                conds.append(cond)

        reset_term = _factor_out_reset(merged, states)
        fsms.append({
            "module":      head.group(1).lstrip("\\"),
            "stateReg":    reg.group(1),
            "states":      states,
            "reset":       reset_term,     # e.g. "rst=1": from every state to the reset state
            "transitions": [
                {"from": s, "to": d, "conditions": c} for (s, d), c in merged.items() if c
            ],
        })
    return fsms


def _factor_out_reset(merged: dict[tuple[int, int], list[str]], states: list[dict]) -> str | None:
    """
    A synchronous reset shows up as "rst=1" from every state to the reset
    state, plus "rst=0 & ..." on every other condition. Drawn as-is that's an
    edge from every state and noise on every label, so pull it out: drop
    those edges and the "rst=0" terms, and return "rst=1" to show once.
    """
    reset = next((s["id"] for s in states if s["reset"]), None)
    if reset is None or len(states) < 2:
        return None
    candidates = None
    for s in states:
        conds = set(merged.get((s["id"], reset), []))
        single = {c for c in conds if "&" not in c and "…" not in c and "=" in c}
        candidates = single if candidates is None else candidates & single
    if not candidates:
        return None
    term = sorted(candidates)[0]
    name, value = term.split("=")
    inactive = f"{name}={'0' if value == '1' else '1'}"
    for key, conds in merged.items():
        cleaned = []
        for c in conds:
            if c == term and key[1] == reset:
                continue
            parts = [p for p in c.split(" & ") if p != inactive]
            c2 = " & ".join(parts)
            if c2 not in cleaned:
                cleaned.append(c2)
        merged[key] = cleaned
    return term


def summarize(stat: dict, netlist: dict) -> dict:
    """Cell counts by type and total flip-flop bits."""
    design = stat.get("design", {})
    cells  = design.get("num_cells_by_type", {})
    ff_bits = 0
    for module in netlist.get("modules", {}).values():
        for cell in module.get("cells", {}).values():
            if "dff" in cell.get("type", "") or "dlatch" in cell.get("type", ""):
                width = cell.get("parameters", {}).get("WIDTH", "1")
                ff_bits += int(width, 2) if isinstance(width, str) else int(width)
    num_cells = design.get("num_cells")
    if num_cells is None:
        num_cells = sum(len(m.get("cells", {})) for m in netlist.get("modules", {}).values())
    return {"numCells": num_cells, "cells": cells, "ffBits": ff_bits}


def latches_from_log(log: str) -> list[str]:
    """Signals Yosys turned into latches (incomplete assignment in always @*)."""
    return sorted(set(re.findall(r"^Latch inferred for signal `[^']*?\.\\?([^'.]+)'", log, re.M)))


def warnings_from_output(output: str) -> list[str]:
    seen: list[str] = []
    for line in output.splitlines():
        line = line.strip()
        if line.startswith("Warning:") and line not in seen:
            seen.append(line)
    return seen[:MAX_WARNINGS]


# =============================================================================
# Runner
# =============================================================================

def _read(path: str) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except FileNotFoundError:
        return ""


def _synthesize_sync(design_v: str) -> dict:
    tmpdir, workspace_id = create_workspace()
    t0 = time.monotonic()
    try:
        for name, content in (("design.v", design_v), ("synth.ys", YOSYS_SCRIPT)):
            path = os.path.join(tmpdir, name)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            os.chmod(path, 0o644)

        try:
            rc, output = _run_limited(
                ["yosys", "-q", "-l", "yosys.log", "-s", "synth.ys"],
                cwd=tmpdir, timeout=SYNTH_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": f"Synthesis timed out after {SYNTH_TIMEOUT_SECONDS}s."}
        except FileNotFoundError:
            return {"ok": False, "error": "Synthesis is unavailable (yosys is not installed on the server)."}

        if rc != 0:
            lines = [l for l in output.strip().splitlines() if l.strip()]
            return {"ok": False, "error": "\n".join(lines[-15:]) or f"yosys exited with code {rc}"}

        netlist = json.loads(_read(os.path.join(tmpdir, "netlist.json")) or "{}")
        stat    = json.loads(_read(os.path.join(tmpdir, "stat.json")) or "{}")
        summary = summarize(stat, netlist)
        top = next(
            (n for n, m in netlist.get("modules", {}).items() if m.get("attributes", {}).get("top")),
            None,
        )
        result = {
            "ok":       True,
            "top":      top,
            **summary,
            "latches":  latches_from_log(_read(os.path.join(tmpdir, "yosys.log"))),
            "warnings": warnings_from_output(output),
            "fsms":     parse_fsm_info(_read(os.path.join(tmpdir, "fsm.txt")), param_names(design_v)),
            "netlist":  netlist if summary["numCells"] <= MAX_SCHEMATIC_CELLS else None,
        }
        logger.info(json.dumps({
            "event": "synthesis", "workspace_id": workspace_id, "cells": summary["numCells"],
            "fsms": len(result["fsms"]), "duration_ms": round((time.monotonic() - t0) * 1000, 1),
        }))
        return result
    finally:
        cleanup_workspace(tmpdir)


@router.post("", dependencies=[Depends(verify_jwt)], summary="Synthesize a design with Yosys")
async def synthesize(body: SynthesizeRequest) -> dict:
    check_source_size(body.design_v, settings.max_source_bytes, "design_v")
    async with _sim_slots:
        return await asyncio.to_thread(_synthesize_sync, body.design_v)


# =============================================================================
# POST /metrics — gate count, flip-flops and logic depth (optimization scores)
# =============================================================================

metrics_router = APIRouter(prefix="/metrics", tags=["Synthesis"])

# Gate-level synthesis to a fixed library of 2-input gates and muxes, so counts
# are comparable between designs; ltp -noff = longest path between registers/ports.
METRICS_SCRIPT = """\
read_verilog -sv design.v
synth -auto-top -flatten -noabc
abc -g AND,NAND,OR,NOR,XOR,XNOR,MUX
opt_clean
tee -q -o stat.json stat -json
tee -q -o ltp.txt ltp -noff
"""

_REGISTER_CELL = re.compile(r"DFF|DLATCH|_SR_|_FF_", re.I)


def gate_metrics(stat: dict, ltp_text: str) -> dict:
    """{gates, ffBits, depth} from `stat -json` and `ltp -noff` output."""
    cells = stat.get("design", {}).get("num_cells_by_type", {})
    ff_bits = sum(n for t, n in cells.items() if _REGISTER_CELL.search(t))
    gates = sum(n for t, n in cells.items() if not _REGISTER_CELL.search(t))
    depths = [int(d) for d in re.findall(r"length=(\d+)", ltp_text)]
    return {"gates": gates, "ffBits": ff_bits, "depth": max(depths, default=0)}


def _run_script(design_v: str, script: str, finish) -> dict:
    """Run a Yosys script on design.v; finish(tmpdir) builds the result from its output files."""
    tmpdir, _ = create_workspace()
    try:
        _write(tmpdir, "design.v", design_v)
        _write(tmpdir, "run.ys", script)
        try:
            rc, out = _run_limited(["yosys", "-q", "-s", "run.ys"], cwd=tmpdir, timeout=SYNTH_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": f"Synthesis timed out after {SYNTH_TIMEOUT_SECONDS}s."}
        except FileNotFoundError:
            return {"ok": False, "error": "Synthesis is unavailable (yosys is not installed on the server)."}
        if rc != 0:
            lines = [l for l in out.strip().splitlines() if l.strip()]
            return {"ok": False, "error": "\n".join(lines[-15:]) or f"yosys exited with code {rc}"}
        return finish(tmpdir)
    finally:
        cleanup_workspace(tmpdir)


def _metrics_sync(design_v: str) -> dict:
    def finish(tmpdir: str) -> dict:
        stat = json.loads(_read(os.path.join(tmpdir, "stat.json")) or "{}")
        return {"ok": True, **gate_metrics(stat, _read(os.path.join(tmpdir, "ltp.txt")))}
    return _run_script(design_v, METRICS_SCRIPT, finish)


@metrics_router.post("", dependencies=[Depends(verify_jwt)], summary="Gate count, flip-flop bits and logic depth")
async def metrics(body: SynthesizeRequest) -> dict:
    check_source_size(body.design_v, settings.max_source_bytes, "design_v")
    async with _sim_slots:
        return await asyncio.to_thread(_metrics_sync, body.design_v)


# =============================================================================
# POST /board — gate-level netlist for the virtual board (simulated in the browser)
# =============================================================================

board_router = APIRouter(prefix="/board", tags=["Synthesis"])

MAX_BOARD_CELLS = 20_000

# dffunmap turns enables and sync resets into gates, leaving edge flip-flops with
# at most an async set/reset (lib/gate-sim.ts models those; async2sync would not
# clear the stored value until the next clock edge, which a paused board never gets).
# -nordff keeps registers where the design has them: otherwise a case-statement
# decoder becomes a ROM whose output register powers up at 0 until the first clock.
BOARD_SCRIPT = """\
read_verilog -sv design.v
synth -auto-top -flatten -noabc -nordff
dffunmap
abc -g AND,NAND,OR,NOR,XOR,XNOR,MUX
opt_clean
write_json board.json
"""

BOARD_CELLS = {
    "$_BUF_", "$_NOT_", "$_AND_", "$_NAND_", "$_OR_", "$_NOR_", "$_XOR_", "$_XNOR_",
    "$_ANDNOT_", "$_ORNOT_", "$_MUX_", "$_NMUX_", "$_DFF_P_", "$_DFF_N_",
    *(f"$_DFF_{c}{r}{v}_" for c in "NP" for r in "NP" for v in "01"),        # async reset to v
    *(f"$_DFFSR_{c}{s}{r}_" for c in "NP" for s in "NP" for r in "NP"),      # async set + reset
}


def board_netlist(netlist: dict) -> dict:
    """Top module's ports and cells, or an error if the board can't run it."""
    modules = list(netlist.get("modules", {}).values())
    top = next((m for m in modules if m.get("attributes", {}).get("top")), modules[0] if len(modules) == 1 else None)
    if top is None:
        return {"ok": False, "error": "No top module found."}
    cells = [c for c in top.get("cells", {}).values() if c["type"] != "$scopeinfo"]
    unsupported = sorted({c["type"] for c in cells} - BOARD_CELLS)
    if unsupported:
        what = "latches" if any("LATCH" in t for t in unsupported) else ", ".join(unsupported)
        return {"ok": False, "error": f"The board can't simulate {what}. Use clocked registers and plain logic."}
    if len(cells) > MAX_BOARD_CELLS:
        return {"ok": False, "error": f"Too large for the board ({len(cells)} gates; limit {MAX_BOARD_CELLS})."}
    return {
        "ok":    True,
        "ports": {n: {"direction": p["direction"], "bits": p["bits"]} for n, p in top.get("ports", {}).items()},
        "cells": [{"type": c["type"], "conn": c["connections"]} for c in cells],
    }


def _board_sync(design_v: str) -> dict:
    return _run_script(design_v, BOARD_SCRIPT,
                       lambda d: board_netlist(json.loads(_read(os.path.join(d, "board.json")) or "{}")))


@board_router.post("", dependencies=[Depends(verify_jwt)], summary="Gate-level netlist for the virtual board")
async def board(body: SynthesizeRequest) -> dict:
    check_source_size(body.design_v, settings.max_source_bytes, "design_v")
    async with _sim_slots:
        return await asyncio.to_thread(_board_sync, body.design_v)


# =============================================================================
# POST /equivalence — shortest input sequence where two designs differ
# =============================================================================

equivalence_router = APIRouter(prefix="/equivalence", tags=["Synthesis"])

EQUIV_TIMEOUT_SECONDS = 20
RESET_NAMES = {"rst", "reset", "rst_n", "reset_n", "rstn", "resetn", "areset", "arst", "arst_n", "aresetn", "clr", "clear"}

# Build a miter of the two designs. Each is flattened and renamed first, so both
# can define the same module names (they implement the same problem).
MITER_SCRIPT = """\
read_verilog -sv gold.v
hierarchy -auto-top
proc; flatten; opt_clean
rename -top gold
design -stash gold_design
read_verilog -sv gate.v
hierarchy -auto-top
proc; flatten; opt_clean
rename -top gate
design -stash gate_design
design -copy-from gold_design -as gold gold
design -copy-from gate_design -as gate gate
miter -equiv -flatten -make_outputs -ignore_gold_x gold gate miter
hierarchy -top miter
write_rtlil miter.il
"""


class EquivalenceRequest(BaseModel):
    gold_v: str = Field(..., min_length=1, description="Reference design.")
    gate_v: str = Field(..., min_length=1, description="Design under test (same ports).")
    max_cycles: int = Field(default=16, ge=1, le=24, description="Longest sequence to search, from reset.")


def miter_inputs(rtlil: str) -> list[str]:
    """Input port names of the miter (without the in_ prefix)."""
    names = re.findall(r"^\s*wire (?:width \d+ )?input \d+ \\(\S+)", rtlil, re.M)
    return [n[3:] for n in names if n.startswith("in_")]


def reset_port(inputs: list[str]) -> tuple[str, int] | None:
    """(name, active level) of the reset input, by naming convention (…n = active low)."""
    for name in inputs:
        if name.lower() in RESET_NAMES:
            return name, 0 if name.lower().endswith("n") else 1
    return None


def sat_script(inputs: list[str], max_cycles: int) -> tuple[str, int]:
    """Bounded checks of length first..max_cycles; the first one to fail is the shortest."""
    rst = reset_port(inputs)
    # With a reset: step 1 applies it and isn't compared (outputs during reset may legitimately differ).
    extra = f"-set-at 1 in_{rst[0]} {rst[1]} -prove-skip 1 " if rst else ""
    first = 2 if rst else 1
    lines = ["read_rtlil miter.il", "hierarchy -top miter", "async2sync", "opt_clean"]
    for n in range(first, max_cycles + 1):
        # -show-inputs/-show-outputs put the ports into the dumped trace
        lines.append(f"sat -seq {n} -prove trigger 0 -set-init-zero -enable_undef {extra}-show-inputs -show-outputs -dump_vcd cex{n}.vcd miter")
    return "\n".join(lines) + "\n", first


def _write(tmpdir: str, name: str, content: str) -> None:
    path = os.path.join(tmpdir, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    os.chmod(path, 0o644)


def _equivalence_sync(gold_v: str, gate_v: str, max_cycles: int) -> dict:
    tmpdir, workspace_id = create_workspace()
    t0 = time.monotonic()
    try:
        _write(tmpdir, "gold.v", gold_v)
        _write(tmpdir, "gate.v", gate_v)
        _write(tmpdir, "miter.ys", MITER_SCRIPT)
        try:
            rc, out = _run_limited(["yosys", "-q", "-s", "miter.ys"], cwd=tmpdir, timeout=EQUIV_TIMEOUT_SECONDS)
            if rc != 0:
                reason = "the designs' ports differ" if "miter" in out.lower() else "a design does not synthesize"
                return {"status": "unknown", "reason": reason}
            script, first = sat_script(miter_inputs(_read(os.path.join(tmpdir, "miter.il"))), max_cycles)
            _write(tmpdir, "sat.ys", script)
            left = max(1, EQUIV_TIMEOUT_SECONDS - int(time.monotonic() - t0))
            rc, out = _run_limited(["yosys", "-q", "-s", "sat.ys"], cwd=tmpdir, timeout=left)
        except subprocess.TimeoutExpired:
            return {"status": "unknown", "reason": "the check took too long"}
        except FileNotFoundError:
            return {"status": "unknown", "reason": "yosys is not installed on the server"}

        # Only failing (counterexample) runs write a VCD; the first is the shortest.
        for n in range(first, max_cycles + 1):
            if os.path.exists(os.path.join(tmpdir, f"cex{n}.vcd")):
                vcd_b64, _ = read_vcd(tmpdir, f"cex{n}.vcd")
                logger.info(json.dumps({"event": "equivalence", "workspace_id": workspace_id, "differs_at": n,
                                        "duration_ms": round((time.monotonic() - t0) * 1000, 1)}))
                return {"status": "differs", "cycles": n, "vcd_base64": vcd_b64}
        if rc != 0:
            return {"status": "unknown", "reason": "the check failed"}
        return {"status": "no_difference", "cycles": max_cycles}
    finally:
        cleanup_workspace(tmpdir)


@equivalence_router.post("", dependencies=[Depends(verify_jwt)],
                         summary="Shortest input sequence (from reset) where two designs' outputs differ")
async def equivalence(body: EquivalenceRequest) -> dict:
    check_source_size(body.gold_v, settings.max_source_bytes, "gold_v")
    check_source_size(body.gate_v, settings.max_source_bytes, "gate_v")
    async with _sim_slots:
        return await asyncio.to_thread(_equivalence_sync, body.gold_v, body.gate_v, body.max_cycles)
