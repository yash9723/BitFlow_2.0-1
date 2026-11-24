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


def _last_int(rx: str, text: str) -> int | None:
    m = re.findall(rx, text)
    return int(m[-1]) if m else None


def read_results(base: Path, platform: str, top: str) -> dict:
    """Numbers from an ORFS work dir (WORK_HOME). A check whose report is missing gives None ("not run"), never a
    pass: the UI shows None as unchecked."""
    rep, log = base / "reports" / platform / top / "base", base / "logs" / platform / top / "base"
    read = lambda p: p.read_text(errors="replace") if p.exists() else ""
    fin, rpt, route = read(rep / "6_finish.rpt"), read(log / "6_report.log"), read(log / "5_2_route.log")
    lec = read(log / "6_final_lec_check.log")
    m = re.search(r"Design area ([0-9.]+) um\^2 ([0-9.]+)% utilization", rpt)
    # "  37  339.075  37  339.075 cells", bigger designs "  172 1.46E+03  172 1.46E+03 cells"
    num = r"[0-9.]+(?:[eE][+-]?[0-9]+)?"
    cells = _num(rf"^\s*([0-9]+)\s+{num}(?:\s+[0-9]+\s+{num})?\s+cells\s*$", read(rep / "synth_stat.txt"))
    return {
        "area_um2": float(m.group(1)) if m else None,
        "utilization_pct": float(m.group(2)) if m else None,
        "wns_ns": _num(r"^wns max\s+(-?[0-9.]+)", fin),
        "tns_ns": _num(r"^tns max\s+(-?[0-9.]+)", fin),
        # wns stops at 0 once timing is met; worst slack is the real margin (ORFS report_worst_slack)
        "slack_ns": _num(r"^worst slack(?: max)?\s+(-?[0-9.]+)", fin),
        "cells": int(cells) if cells is not None else None,
        # the detailed router's own check (5_route_drc.rpt is empty when clean); last count is after the final pass
        "drc_violations": _last_int(r"Number of violations = (\d+)", route),
        "antenna_violations": _last_int(r"Found (\d+) net violations", route),
        # the finished netlist proven equivalent to the synthesized one (ORFS 6_final_lec_check)
        "lec": None if "Circuits are" not in lec else "Circuits are IDENTICAL" in lec,
    }


# Sign-off timing corners for sky130hd: ORFS ships tt; ss/ff come from the OpenROAD repo's test/sky130hd libraries
# (installed into LIBS_DIR by user-data.sh). Label shown to learners.
CORNERS = {
    "ss": ("sky130_fd_sc_hd__ss_n40C_1v40.lib", "slow: −40 °C, 1.40 V"),
    "tt": ("sky130_fd_sc_hd__tt_025C_1v80.lib", "typical: 25 °C, 1.80 V"),
    "ff": ("sky130_fd_sc_hd__ff_n40C_1v95.lib", "fast: −40 °C, 1.95 V"),
}


def read_klayout(drc_log: str, lvs_log: str) -> dict:
    """ORFS `make drc` / `make lvs` (KLayout, sky130hd decks). make exits 0 even when LVS fails, so read the text:
    'Total violations: N' and 'Congratulations! Netlists match.' / 'ERROR : Netlists don't match'. Missing -> None."""
    lvs = True if "Netlists match" in lvs_log else False if "Netlists don't match" in lvs_log else None
    return {"drc_deck_violations": _last_int(r"Total violations: (\d+)", drc_log), "lvs": lvs}


def logic_area(out: str) -> float | None:
    """layout/logic_area.tcl's 'logic area <um2> cells <n>' -> um2, None if missing."""
    return _num(r"^logic area\s+([0-9.]+)\s+cells", out)


def worst_slack(sta_out: str) -> dict | None:
    """OpenSTA's report_worst_slack lines -> {"setup": ns, "hold": ns}, None if either is missing."""
    setup, hold = _num(r"^worst slack max\s+(-?[0-9.]+)", sta_out), _num(r"^worst slack min\s+(-?[0-9.]+)", sta_out)
    return None if setup is None or hold is None else {"setup": setup, "hold": hold}


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
