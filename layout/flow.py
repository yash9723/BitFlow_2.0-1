"""
layout/flow.py: the pure parts of the RTL-to-GDS service (no Docker, no HTTP), so they can be tested anywhere.

  check_request(verilog, top, clock, period_ns, platform)  -> list of problems (empty = OK)
  job_id(...)                     the cache key: same code, settings and tool image -> same job
  config_mk(...), sdc(...)        written by the server; learners never supply Tcl or make syntax
  die_for_area(area_um2)          chip size from synthesized cell area, never below the power-grid minimum
  read_results(work)              area, utilization, timing, DRC count from the ORFS reports
  explain(log)                    an ORFS error code -> a plain-English message
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path

PLATFORMS = {"sky130hd": "SkyWater 130 nm", "gf180": "GlobalFoundries 180 nm", "ihp-sg13g2": "IHP 130 nm SiGe"}
MAX_VERILOG_BYTES = 100_000
MIN_CORE_UM = 80        # below this the power grid can't fit its straps (PDN-0185 on sky130hd)
MARGIN_UM = 10          # die edge to core edge, room for the pins
TARGET_UTIL = 0.35      # cell area / core area for the first try

IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]{0,63}$")
# File access, system calls and includes: the synthesis tools would act on them.
FORBIDDEN = [
    (re.compile(r"`\s*include\b"), "`include is not allowed: put every module in one file."),
    (re.compile(r"\$(readmem[bh]|fopen|fread|fscanf|fgets|system|dumpfile|writemem[bh])\b"), "File and system tasks ($readmemh, $fopen, $system…) are not allowed in a design for layout."),
    (re.compile(r"\(\*[^)]*\*\)"), "Attributes (* … *) are not allowed."),
]


def strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", " ", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def modules(src: str) -> list[str]:
    return re.findall(r"\bmodule\s+([A-Za-z_][A-Za-z0-9_$]*)", strip_comments(src))


def ports(src: str, top: str) -> list[str]:
    """Port names of `top` (ANSI or non-ANSI header), best effort."""
    m = re.search(rf"\bmodule\s+{re.escape(top)}\b(.*?);", strip_comments(src), flags=re.S)
    if not m:
        return []
    header = re.sub(r"#\s*\(.*?\)\s*(?=\()", "", m.group(1), flags=re.S)   # drop a parameter list
    return re.findall(r"([A-Za-z_][A-Za-z0-9_$]*)\s*(?=[,)])", header)


def guess_clock(src: str, top: str) -> str | None:
    for p in ports(src, top):
        if p.lower() in ("clk", "clock", "clk_i", "i_clk", "aclk", "sys_clk"):
            return p
    return None


def check_request(verilog: str, top: str, clock: str | None, period_ns: float, platform: str) -> list[str]:
    errs: list[str] = []
    if not verilog.strip():
        return ["The design is empty."]
    if len(verilog.encode()) > MAX_VERILOG_BYTES:
        errs.append(f"The design is over {MAX_VERILOG_BYTES // 1000} KB.")
    code = strip_comments(verilog)
    errs += [msg for rx, msg in FORBIDDEN if rx.search(code)]
    if not IDENT.match(top or ""):
        errs.append("The top module name isn't a plain Verilog identifier.")
    elif top not in modules(verilog):
        errs.append(f"There is no module named {top}.")
    if clock is not None:
        if not IDENT.match(clock):
            errs.append("The clock port name isn't a plain Verilog identifier.")
        elif IDENT.match(top or "") and clock not in ports(verilog, top):
            errs.append(f"{top} has no port named {clock}.")
    if not (1.0 <= period_ns <= 1000.0):
        errs.append("The clock period must be between 1 and 1000 ns.")
    if platform not in PLATFORMS:
        errs.append(f"Unknown process {platform}.")
    return errs


def job_id(verilog: str, top: str, clock: str | None, period_ns: float, platform: str, image: str) -> str:
    key = json.dumps([verilog, top, clock, float(round(period_ns, 3)), platform, image], separators=(",", ":"))
    return hashlib.sha256(key.encode()).hexdigest()[:24]


def die_for_area(area_um2: float, util: float = TARGET_UTIL) -> tuple[float, float]:
    """(core side, die side) in um for a square chip holding `area_um2` of cells at `util`."""
    core = max(MIN_CORE_UM, math.ceil(math.sqrt(max(area_um2, 1.0) / util)))
    return core, core + 2 * MARGIN_UM


def config_mk(top: str, platform: str, core_um: float | None = None, density: float = 0.6) -> str:
    lines = [
        f"export DESIGN_NAME = {top}",
        f"export PLATFORM = {platform}",
        "export VERILOG_FILES = /work/design.v",
        "export SDC_FILE = /work/constraint.sdc",
        f"export PLACE_DENSITY = {density:.2f}",
    ]
    if core_um:
        die = core_um + 2 * MARGIN_UM
        lines += [f"export DIE_AREA = 0 0 {die:g} {die:g}", f"export CORE_AREA = {MARGIN_UM} {MARGIN_UM} {core_um + MARGIN_UM:g} {core_um + MARGIN_UM:g}"]
    return "\n".join(lines) + "\n"


def sdc(clock: str | None, period_ns: float) -> str:
    io = round(period_ns * 0.2, 3)
    clk = f"[get_ports {clock}]" if clock else ""   # no clock port: a virtual clock times the input-to-output paths
    inputs = f"[delete_from_list [all_inputs] [get_ports {clock}]]" if clock else "[all_inputs]"
    return (f"create_clock -name core_clock -period {period_ns:g} {clk}\n"
            f"set_input_delay {io:g} -clock core_clock {inputs}\n"
            f"set_output_delay {io:g} -clock core_clock [all_outputs]\n")


def synth_area(stat_text: str) -> float | None:
    m = re.findall(r"Chip area for (?:top )?module '\\?[^']*':\s*([0-9.]+)", stat_text)
    return float(m[-1]) if m else None


def _num(rx: str, text: str) -> float | None:
    m = re.search(rx, text, flags=re.M)
    return float(m.group(1)) if m else None


def read_results(base: Path, platform: str, top: str) -> dict:
    """Numbers from an ORFS work dir (WORK_HOME); missing files give None, not errors."""
    rep, log = base / "reports" / platform / top / "base", base / "logs" / platform / top / "base"
    read = lambda p: p.read_text(errors="replace") if p.exists() else ""
    fin, rpt, drc = read(rep / "6_finish.rpt"), read(log / "6_report.log"), read(rep / "5_route_drc.rpt")
    m = re.search(r"Design area ([0-9.]+) um\^2 ([0-9.]+)% utilization", rpt)
    cells = _num(r"^\s*([0-9]+)\s+[0-9.]+(?:\s+[0-9]+\s+[0-9.]+)?\s+cells\s*$", read(rep / "synth_stat.txt"))   # "  37  339.075  37  339.075 cells"
    return {
        "area_um2": float(m.group(1)) if m else None,
        "utilization_pct": float(m.group(2)) if m else None,
        "wns_ns": _num(r"^wns max\s+(-?[0-9.]+)", fin),
        "tns_ns": _num(r"^tns max\s+(-?[0-9.]+)", fin),
        "cells": int(cells) if cells is not None else None,
        "drc_violations": len(re.findall(r"violation type:", drc, flags=re.I)),
    }


# ORFS error codes we have seen -> what the learner should do. Anything else falls back to the raw line.
EXPLAIN = {
    "PDN-0185": "The chip is too small for the power grid. (The service retries with a bigger chip.)",
    "GRT-0116": "Routing is too congested: the cells are packed too tightly for the wires.",
    "DRT-": "Detailed routing could not finish cleanly.",
    "GPL-0302": "Placement could not spread the cells: the design may be too dense for the chip.",
    "SYN-": "Synthesis failed: check the Verilog for constructs the synthesizer doesn't support.",
}


def explain(log: str) -> str:
    errors = re.findall(r"\[ERROR ([A-Z]+-[0-9]+)\]\s*(.*)", log)
    if not errors:
        m = re.search(r"(?i)\bERROR:\s*(.*)", log)
        if m:
            return f"Synthesis failed: {m.group(1).strip()[:300]}"
        return "The flow stopped without an error message (it may have run out of time)."
    code, text = errors[0]
    for prefix, msg in EXPLAIN.items():
        if code.startswith(prefix):
            return f"{msg} ({code})"
    return f"{code}: {text.strip()[:300]}"


def recovery(log: str, core_um: float, density: float) -> tuple[float, float] | None:
    """A changed (core size, density) worth one more try, or None."""
    if "PDN-0185" in log:
        return core_um * 1.5, density
    if "GRT-0116" in log or "GPL-0302" in log:
        return core_um * 1.3, max(0.4, density - 0.1)
    return None
