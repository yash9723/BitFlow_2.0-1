"""
langs.py — VHDL (GHDL) and Python testbenches (cocotb) for the simulator.

Three entry points, all under the sandbox limits of sandbox._run_limited:
  vhdl_to_verilog(tmpdir)       design.vhd -> design.v with `ghdl --synth`, so a VHDL
                                design runs against Verilog testbenches and every
                                Verilog-only tool (grading, synthesis, equivalence).
  run_vhdl_sync(...)            design.vhd + tb.vhd, simulated by GHDL.
  run_cocotb_sync(...)          design.v + test_tb.py, simulated by Icarus with cocotb.
"""

from __future__ import annotations

import ast
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

from api.models import SandboxExitCode, exit_code_to_status
from api.sandbox import SandboxResult, _run_limited

GHDL_STD        = "--std=08"
CONVERT_TIMEOUT = 20


def _result(code: int, out: list[str], t0: float, workspace_id: str, err: str = "") -> SandboxResult:
    return SandboxResult(
        exit_code=code, status=exit_code_to_status(code), stdout="\n".join(out), stderr=err,
        duration_ms=round((time.monotonic() - t0) * 1000, 1), workspace_id=workspace_id,
    )


def _clean(text: str, tmpdir: str) -> str:
    """Workspace-relative paths, and no GHDL binary path in front of every message."""
    return re.sub(r"^/usr/\S*ghdl\S*:", "ghdl:", text.replace(tmpdir + os.sep, ""), flags=re.M).strip()


# =============================================================================
# Verilog helpers
# =============================================================================

_MODULE = re.compile(r"^\s*module\s+([A-Za-z_]\w*)", re.M)


def top_module(verilog: str) -> str | None:
    """The module no other module instantiates (the last one if that's ambiguous)."""
    src = re.sub(r"/\*.*?\*/|//[^\n]*", "", verilog, flags=re.S)
    names = _MODULE.findall(src)
    tops = [n for n in names if not re.search(rf"^\s*{n}\s+(?:#\s*\(.*?\)\s*)?\w+\s*\(", src, re.M | re.S)]
    return (tops or names or [None])[-1]


# =============================================================================
# VHDL (GHDL)
# =============================================================================

def vhdl_to_verilog(tmpdir: str, src: str = "design.vhd", out: str = "design.v") -> str | None:
    """Synthesize the VHDL design to a Verilog netlist. Returns an error message, or None."""
    try:
        rc, log = _run_limited(
            ["sh", "-c", f"exec ghdl --synth {GHDL_STD} --out=verilog {src} -e > {out}"],
            cwd=tmpdir, timeout=CONVERT_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        return "VHDL synthesis timed out."
    log = _clean(log, tmpdir)
    if "not found" in log and "ghdl" in log and rc == 127:
        return "VHDL is unavailable (ghdl is not installed on the server)."
    path = os.path.join(tmpdir, out)
    if rc != 0 or not os.path.exists(path) or not os.path.getsize(path):
        lines = [l for l in log.splitlines() if "note:" not in l]
        return "\n".join(lines[-15:]) or f"ghdl exited with code {rc}"
    return None


def run_vhdl_sync(tmpdir: str, workspace_id: str, timeout: int) -> SandboxResult:
    """Analyse design.vhd + tb.vhd, then elaborate and run the top unit (the testbench)."""
    t0, out = time.monotonic(), ["--- Analysing (GHDL) ---"]
    try:
        rc, log = _run_limited(["ghdl", "-a", GHDL_STD, "design.vhd", "tb.vhd"], cwd=tmpdir, timeout=30)
        if log.strip():
            out.append(_clean(log, tmpdir))
        if rc != 0:
            out.append("[ERROR] Compilation failed.")
            return _result(SandboxExitCode.COMPILE_ERROR, out, t0, workspace_id)
        rc, top = _run_limited(["ghdl", "--find-top", GHDL_STD], cwd=tmpdir, timeout=15)
        top = top.strip().splitlines()[-1].strip() if rc == 0 and top.strip() else ""
        if not re.fullmatch(r"\w+", top):
            out.append("[ERROR] Could not find the testbench: tb.vhd needs one top-level entity with no ports.")
            return _result(SandboxExitCode.COMPILE_ERROR, out, t0, workspace_id)
        out.append(f"[OK] Analysis successful → top unit '{top}'")

        out.append(f"\n--- Simulating (limit: {timeout}s) ---")
        rc, log = _run_limited(
            ["ghdl", "--elab-run", GHDL_STD, top, "--vcd=wave.vcd", "--ieee-asserts=disable-at-0"],
            cwd=tmpdir, timeout=timeout,
        )
        if log.strip():
            out.append(_clean(log, tmpdir))
    except subprocess.TimeoutExpired:
        out.append(f"[ERROR] Simulation exceeded {timeout}s and was killed. "
                   "End the testbench with `std.env.finish;` (or `wait;` once every process is done).")
        return _result(SandboxExitCode.TIMEOUT, out, t0, workspace_id)
    except FileNotFoundError:
        out.append("[ERROR] VHDL is unavailable (ghdl is not installed on the server).")
        return _result(SandboxExitCode.INTERNAL_ERROR, out, t0, workspace_id)

    if rc != 0:
        out.append(f"[ERROR] Simulation runtime error (ghdl exit code: {rc}).")
        return _result(SandboxExitCode.RUNTIME_ERROR, out, t0, workspace_id)
    out.append("[OK] Simulation finished successfully.")
    vcd = os.path.join(tmpdir, "wave.vcd")
    out.append(f"[OK] Waveform written → wave.vcd ({os.path.getsize(vcd)} bytes)" if os.path.exists(vcd)
               else "[WARN] No VCD file produced.")
    return _result(SandboxExitCode.SUCCESS, out, t0, workspace_id)


# =============================================================================
# cocotb (Python testbenches)
# =============================================================================

# Two layers, on top of the usual sandbox (separate uid, empty env so no secrets, rlimits, timeout):
#   1. cocotb_policy_violation: an AST allowlist that refuses obvious escapes before anything runs.
#   2. GUARD_MODULE: a Python audit hook (PEP 578) loaded before the test module, which blocks
#      sockets, process creation, ctypes, new code objects and file access outside the workspace
#      at run time, whatever path the code took to get there. Hooks can't be removed once added.
# ponytail: still in-process Python, not an OS sandbox; a CPython audit-hook bypass (e.g. a
# memory-corruption bug) would get through. Real isolation needs nsjail/gVisor or a runner host.
ALLOWED_IMPORTS = {"cocotb", "random", "math", "itertools"}
BANNED_NAMES = {
    "open", "exec", "eval", "compile", "__import__", "getattr", "setattr", "delattr", "globals", "locals",
    "vars", "breakpoint", "input", "help", "exit", "quit", "memoryview",
}
BANNED_ATTRS = {
    "os", "sys", "subprocess", "socket", "shutil", "pathlib", "Path", "importlib", "builtins", "ctypes", "io",
    "signal", "threading", "multiprocessing", "asyncio", "inspect", "gc", "marshal", "pickle", "code", "pty",
    "resource", "environ", "system", "popen", "spawn", "fork", "kill", "remove", "unlink", "rmtree",
    "read_text", "write_text", "read_bytes", "write_bytes", "open", "load_module", "exec_module",
    "types", "typing", "CodeType", "FunctionType", "mro", "f_globals", "f_back", "gi_frame", "cr_frame",
}

# Imported by cocotb before test_tb (COCOTB_TEST_MODULES order); written into each workspace.
GUARD_MODULE = '''\
import os, sys, warnings

# This module has no tests of its own; don't let cocotb tell the learner so.
warnings.filterwarnings("ignore", message="No tests were discovered")

_CWD = os.path.realpath(os.getcwd())
_READ_OK = tuple({os.path.realpath(p) for p in (_CWD, sys.prefix, sys.base_prefix, sys.exec_prefix)}) + ("/usr/lib/python3",)
_BLOCKED = (
    "socket.__new__", "socket.connect", "socket.bind", "socket.sendto", "socket.sendmsg", "socket.getaddrinfo",
    "socket.gethostbyname", "socket.gethostbyaddr", "subprocess.", "os.system", "os.exec", "os.posix_spawn",
    "os.spawn", "os.fork", "os.forkpty", "os.kill", "os.killpg", "os.putenv", "os.unsetenv", "os.chmod",
    "os.chown", "os.listdir", "os.scandir", "os.symlink", "os.link", "ctypes.", "code.__new__", "marshal.",
    "pickle.", "sys.addaudithook", "sys.setprofile", "sys.settrace", "pty.", "webbrowser.",
    "urllib.", "http.", "ftplib.", "smtplib.", "imaplib.", "poplib.", "nntplib.", "telnetlib.", "fcntl.",
    "mmap.", "resource.setrlimit", "os.truncate", "shutil.",
)
_WRITE_FLAGS = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_TRUNC


def _inside(path, roots):
    return any(path == r or path.startswith(r + os.sep) for r in roots)


def _hook(event, args):
    if event.startswith(_BLOCKED):
        raise PermissionError(f"BitFlow sandbox: {event} is not allowed in testbenches")
    if event == "open" and args and args[0] is not None and not isinstance(args[0], int):
        path = os.path.realpath(os.fsdecode(args[0]))
        mode, flags = args[1] if len(args) > 1 else None, args[2] if len(args) > 2 else 0
        writing = (isinstance(mode, str) and any(c in mode for c in "wax+")) or bool((flags or 0) & _WRITE_FLAGS)
        if not _inside(path, (_CWD,) if writing else _READ_OK):
            raise PermissionError(f"BitFlow sandbox: {'writing' if writing else 'reading'} {path} is not allowed")
    if event in ("os.remove", "os.rename", "os.replace", "os.rmdir", "os.mkdir") and args:
        if not _inside(os.path.realpath(os.fsdecode(args[0])), (_CWD,)):
            raise PermissionError(f"BitFlow sandbox: {event} outside the workspace is not allowed")


sys.addaudithook(_hook)
'''


def cocotb_policy_violation(code: str) -> str | None:
    """Why a cocotb test file is refused, or None if it may run."""
    try:
        tree = ast.parse(code, filename="test_tb.py")
    except SyntaxError as e:
        return f"test_tb.py:{e.lineno}: syntax error: {e.msg}"
    for node in ast.walk(tree):
        line = getattr(node, "lineno", "?")
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            mods = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
            for m in mods:
                if m.split(".")[0] not in ALLOWED_IMPORTS or (isinstance(node, ast.ImportFrom) and node.level):
                    return f"test_tb.py:{line}: import of '{m}' is not allowed (allowed: {', '.join(sorted(ALLOWED_IMPORTS))})."
        elif isinstance(node, ast.Name) and (node.id in BANNED_NAMES or node.id.startswith("__")):
            return f"test_tb.py:{line}: '{node.id}' is not allowed in testbenches."
        elif isinstance(node, ast.Attribute) and (node.attr.startswith("_") or node.attr in BANNED_ATTRS):
            return f"test_tb.py:{line}: attribute '.{node.attr}' is not allowed in testbenches."
    return None


def _cocotb_env(tmpdir: str, top: str) -> dict:
    """What cocotb_tools.runner sets for a test run, minus everything inherited from the server's env."""
    import find_libpython   # installed with cocotb
    import cocotb_tools.config as cocotb_config
    libpython = find_libpython.find_libpython() or ""
    return {
        "COCOTB_TEST_MODULES": "bf_guard,test_tb", "COCOTB_TOPLEVEL": top, "TOPLEVEL_LANG": "verilog",
        "COCOTB_RESULTS_FILE": "results.xml", "PYGPI_PYTHON_BIN": sys.executable,
        "GPI_USERS": f"{libpython};{cocotb_config.pygpi_entry_point()}",
        "LIBPYTHON_LOC": libpython, "PYTHONPATH": tmpdir,
        "PYTHONDONTWRITEBYTECODE": "1", "NO_COLOR": "1", "COCOTB_ANSI_OUTPUT": "0",
        "GPI_LOG_LEVEL": "WARNING",       # no simulator-interface start-up chatter in the learner's output
    }


def cocotb_summary(results_xml: str) -> tuple[int, list[str]]:
    """(tests run, names of failed tests) from cocotb's JUnit results file."""
    if "<!" in results_xml:     # cocotb never writes a DTD; refuse entity tricks
        return 0, []
    try:
        root = ET.fromstring(results_xml)
    except ET.ParseError:
        return 0, []
    total, failed = 0, []
    for case in root.iter("testcase"):
        total += 1
        if case.find("failure") is not None or case.find("error") is not None:
            failed.append(case.get("name", "?"))
    return total, failed


def run_cocotb_sync(tmpdir: str, workspace_id: str, timeout: int) -> SandboxResult:
    t0, out = time.monotonic(), []
    with open(os.path.join(tmpdir, "test_tb.py"), encoding="utf-8") as f:
        violation = cocotb_policy_violation(f.read())
    if violation:
        return _result(SandboxExitCode.COMPILE_ERROR, [f"[ERROR] {violation}"], t0, workspace_id)
    try:
        import cocotb_tools.config as cocotb_config
    except ImportError:
        return _result(SandboxExitCode.INTERNAL_ERROR, ["[ERROR] cocotb is not installed on the server."], t0, workspace_id)

    with open(os.path.join(tmpdir, "design.v"), encoding="utf-8") as f:
        top = top_module(f.read())
    if not top:
        return _result(SandboxExitCode.COMPILE_ERROR, ["[ERROR] No module found in the design."], t0, workspace_id)
    # Our own VCD dump: cocotb's runner only writes FST, which the waveform viewer can't read.
    for name, text in (("bf_dump.v", f'module bf_dump; initial begin $dumpfile("wave.vcd"); $dumpvars(0, {top}); end endmodule\n'),
                       ("cmds.f", "+timescale+1ns/1ps\n"), ("bf_guard.py", GUARD_MODULE)):
        with open(os.path.join(tmpdir, name), "w", encoding="utf-8") as f:
            f.write(text)

    out.append("--- Compiling ---")
    try:
        rc, log = _run_limited(["iverilog", "-g2012", "-o", "sim.vvp", "-s", top, "-s", "bf_dump", "-f", "cmds.f",
                                "design.v", "bf_dump.v"], cwd=tmpdir, timeout=30)
        if log.strip():
            out.append(_clean(log, tmpdir))
        if rc != 0:
            out.append("[ERROR] Compilation failed.")
            return _result(SandboxExitCode.COMPILE_ERROR, out, t0, workspace_id)
        out.append(f"[OK] Compilation successful (toplevel '{top}')")

        out.append(f"\n--- Running cocotb tests (limit: {timeout}s) ---")
        rc, log = _run_limited(
            ["vvp", "-M", str(cocotb_config.libs_dir), "-m", cocotb_config.lib_entry("vpi", "icarus"), "sim.vvp"],
            cwd=tmpdir, timeout=timeout, extra_env=_cocotb_env(tmpdir, top),
        )
        out.append(_clean(log, tmpdir))
    except subprocess.TimeoutExpired:
        out.append(f"[ERROR] Tests exceeded {timeout}s and were killed (a coroutine waiting forever?).")
        return _result(SandboxExitCode.TIMEOUT, out, t0, workspace_id)

    results = os.path.join(tmpdir, "results.xml")
    total, failed = cocotb_summary(open(results, encoding="utf-8").read() if os.path.exists(results) else "")
    if total == 0:
        out.append("[ERROR] No cocotb tests ran. Mark test coroutines with @cocotb.test().")
        return _result(SandboxExitCode.RUNTIME_ERROR, out, t0, workspace_id)
    if failed:
        out.append(f"TESTS FAILED: {len(failed)} of {total} ({', '.join(failed)})")
        return _result(SandboxExitCode.RUNTIME_ERROR, out, t0, workspace_id)
    out.append(f"ALL TESTS PASSED ({total} cocotb test{'s' if total != 1 else ''})")
    return _result(SandboxExitCode.SUCCESS, out, t0, workspace_id)
