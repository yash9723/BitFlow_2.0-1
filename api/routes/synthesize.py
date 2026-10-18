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
from api.utils import check_source_size, cleanup_workspace, create_workspace

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
