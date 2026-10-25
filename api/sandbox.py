"""
sandbox.py — Native subprocess simulation engine
=================================================

Runs Verilog simulations natively using iverilog/vvp installed in the
container, instead of launching a Docker-in-Docker child container.

This also works on hosts where the
Docker daemon is not available inside the running container.

Public surface:
    run_simulation(tmpdir, workspace_id, timeout) -> SandboxResult
    inspect_image(image_name) -> ImageInfo | None
    docker_is_available() -> bool
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from typing import Optional

from api.config import settings
from api.models import SandboxExitCode, exit_code_to_status
from api.utils import RUN_UID_BASE, RUN_UID_COUNT

logger = logging.getLogger(__name__)


# =============================================================================
# Data classes (internal — not exposed to HTTP layer)
# =============================================================================

@dataclass
class SandboxResult:
    """
    Everything the route handler needs to know after a simulation run.
    This is an internal dataclass, not a Pydantic model — conversion to
    SimulateResponse happens in the route handler.
    """
    exit_code:    int
    status:       str
    stdout:       str
    stderr:       str
    duration_ms:  float
    workspace_id: str


@dataclass
class ImageInfo:
    """Stub kept for API compatibility with health/status routes."""
    image_id:    str
    size_bytes:  int
    size_mb:     float


# =============================================================================
# Resource-limited child processes
# =============================================================================

# ponytail: prlimit + a dedicated uid + a scrubbed env stop resource abuse and
# secret reads (e.g. $fopen("/proc/self/environ")), but every run shares one uid
# and the container's filesystem view. Real isolation needs gVisor/nsjail or a
# separate runner service.
MAX_OUTPUT_BYTES = 1 * 1024 * 1024     # stdout returned to the client
MAX_FILE_BYTES   = 32 * 1024 * 1024    # any file a child writes (log, VCD, $fopen)
MAX_MEMORY_BYTES = 512 * 1024 * 1024   # address space per process
MAX_PROCS        = 64                  # processes for the sandbox uid (fork bombs)


def _run_limited(
    cmd: list[str],
    cwd: str,
    timeout: int,
    extra_env: Optional[dict] = None,
) -> tuple[int, str]:
    """
    Run cmd under rlimits as the sandbox user, with a minimal environment.
    stdout+stderr go to a size-capped file (not a pipe) so a $display flood
    can't exhaust API memory. Returns (returncode, output text).
    Raises subprocess.TimeoutExpired / FileNotFoundError like subprocess.run.
    """
    kwargs: dict = {}
    if os.name == "posix" and shutil.which("prlimit"):
        limits = [
            f"--as={MAX_MEMORY_BYTES}",
            f"--fsize={MAX_FILE_BYTES}",
            f"--cpu={timeout + 1}",
        ]
        if os.geteuid() == 0:   # drop root for user code
            # The workspace's own uid (utils.create_workspace), else the shared sandbox uid.
            owner = os.stat(cwd).st_uid
            uid = owner if RUN_UID_BASE <= owner < RUN_UID_BASE + RUN_UID_COUNT else settings.sandbox_uid
            gid = uid if uid == owner else settings.sandbox_gid
            kwargs = {"user": uid, "group": gid, "extra_groups": []}
            # NPROC counts every process of the uid, so only cap the dedicated
            # sandbox uids — never the server's own user (CI, local dev).
            limits.append(f"--nproc={MAX_PROCS}")
        cmd = ["prlimit", *limits, "--", *cmd]

    # The child enforces its own wall-clock limit (`timeout` runs as the sandbox uid, inside
    # prlimit): hosts like Render drop CAP_KILL, so the API can't signal a process owned by
    # another uid, and subprocess.run's own kill on timeout would raise PermissionError.
    if shutil.which("timeout"):
        if cmd[0] == "prlimit":
            split = cmd.index("--") + 1
            cmd = [*cmd[:split], "timeout", "-s", "KILL", str(timeout), *cmd[split:]]
        else:
            cmd = ["timeout", "-s", "KILL", str(timeout), *cmd]

    env = {"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"), "HOME": cwd, **(extra_env or {})}
    log_path = os.path.join(cwd, ".proc_output.log")
    t0 = time.monotonic()
    with open(log_path, "w+b") as log:
        try:
            proc = subprocess.run(
                cmd, stdout=log, stderr=subprocess.STDOUT,
                cwd=cwd, env=env, timeout=timeout + 5, **kwargs,   # backstop; `timeout` fires first
            )
        except PermissionError:
            if time.monotonic() - t0 < timeout:
                raise                                   # a real exec/setuid failure, not a timeout
            raise subprocess.TimeoutExpired(cmd, timeout)
        log.seek(0)
        data = log.read(MAX_OUTPUT_BYTES + 1)
    if proc.returncode in (137, -9) and time.monotonic() - t0 >= timeout - 0.5:
        raise subprocess.TimeoutExpired(cmd, timeout)   # killed by `timeout` (128 + SIGKILL)

    text = data[:MAX_OUTPUT_BYTES].decode("utf-8", errors="replace")
    if len(data) > MAX_OUTPUT_BYTES:
        text += f"\n[WARN] Output truncated at {MAX_OUTPUT_BYTES // 1024} KB."
    if proc.returncode < 0:
        text += f"\n[ERROR] Process killed by signal {-proc.returncode} (CPU, memory or file-size limit)."
    return proc.returncode, text


LINT_TIMEOUT_SECONDS = 15


_COMPILE_ERROR = re.compile(r"^\S+\.v:\d+: (?:error: )?.*(?:error|Unknown module|I give up)", re.I)


def first_compile_error(compile_out: str) -> str | None:
    """The first located iverilog error, e.g. 'tb.v:10: error: Unknown module type: counter'."""
    for line in compile_out.splitlines():
        if _COMPILE_ERROR.match(line.strip()):
            return line.strip()
    return None


def compile_hint(cause: str) -> str | None:
    """Plain-language next step for the compile errors students hit most."""
    m = re.search(r"'(\w+)' has already been declared", cause)
    if m:
        return (f"'{m.group(1)}' is declared twice. If it is a module, your files contain two copies of it: "
                f"delete one (or load a template, which replaces both editors).")
    m = re.search(r"Unknown module type: (\w+)", cause)
    if m:
        return (f"there is no module named '{m.group(1)}'. Check the name, or the testbench "
                f"may belong to a different design.")
    return None


def _lint_design(design_file: str, cwd: str) -> str:
    """
    Verilator lint of design.v. Never affects the simulation verdict: issues
    are reported as text, and a missing verilator just yields a note.
    """
    if not shutil.which("verilator"):
        return "[INFO] Lint unavailable (verilator not installed)."
    try:
        rc, out = _run_limited(
            [
                "verilator", "--lint-only", "-Wall", "-Wno-fatal",
                "-Wno-DECLFILENAME", "-Wno-EOFNEWLINE", "--timing",
                os.path.basename(design_file),
            ],
            cwd=cwd,
            timeout=LINT_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return "[WARN] Lint timed out."
    # Drop Verilator's "- V e r i l a t i o n   R e p o r t" / "- Verilator: ..." stats
    # banner (printed even on clean code; --quiet isn't available in older releases).
    out = "\n".join(
        line for line in out.splitlines()
        if not line.startswith(("- V e r i l a t i o n", "- Verilator:"))
    ).strip()
    if rc == 0 and not out:
        return "[OK] No lint warnings."
    return out


# =============================================================================
# Public helpers
# =============================================================================

def docker_is_available() -> bool:
    """
    Always returns False — simulations run natively (no Docker daemon needed).
    Kept for API compatibility with health/status routes.
    """
    return False


def inspect_image(image_name: str) -> Optional[ImageInfo]:
    """
    Always returns None — no Docker image management in native mode.
    Kept for API compatibility with the /status route.
    """
    return None


# =============================================================================
# Core: synchronous simulation runner (called from thread pool)
# =============================================================================

def _run_simulation_sync(
    tmpdir: str,
    workspace_id: str,
    timeout: int,
    lint: bool = False,
) -> SandboxResult:
    """
    Runs iverilog compilation and vvp simulation directly as subprocesses.

    Flow:
      1. Compile design.v + tb.v with iverilog
      2. Simulate the compiled binary with vvp under a timeout
      3. Return stdout/stderr and a structured exit code

    Args:
        tmpdir       : Directory containing design.v and tb.v
        workspace_id : Short ID used for log correlation
        timeout      : Simulation wall-clock limit in seconds
    """
    t_start = time.monotonic()
    logger.info("ws=%s | Starting native simulation timeout=%ds", workspace_id, timeout)

    design_file    = os.path.join(tmpdir, "design.v")
    testbench_file = os.path.join(tmpdir, "tb.v")
    output_bin     = os.path.join(tmpdir, "a.out")
    vcd_file       = os.path.join(tmpdir, "wave.vcd")

    combined_stdout = []
    combined_stderr = []
    exit_code = SandboxExitCode.INTERNAL_ERROR

    # ── Step 1: validate source files ─────────────────────────────────────────
    for fpath in (design_file, testbench_file):
        if not os.path.exists(fpath):
            msg = f"[ERROR] Required source file not found: {fpath}"
            logger.error("ws=%s | %s", workspace_id, msg)
            combined_stderr.append(msg)
            duration_ms = (time.monotonic() - t_start) * 1000
            return SandboxResult(
                exit_code    = SandboxExitCode.INTERNAL_ERROR,
                status       = exit_code_to_status(SandboxExitCode.INTERNAL_ERROR),
                stdout       = "",
                stderr       = "\n".join(combined_stderr),
                duration_ms  = round(duration_ms, 1),
                workspace_id = workspace_id,
            )

    # ── Step 1b: optional Verilator lint of the design (feedback only) ────────
    if lint:
        combined_stdout.append("--- Lint (Verilator) ---")
        combined_stdout.append(_lint_design(design_file, tmpdir))

    # ── Step 2: compile with iverilog ─────────────────────────────────────────
    combined_stdout.append("--- Compiling ---")
    try:
        # iverilog warnings/errors are shown inline with the compile output.
        # -g2012: accept SystemVerilog (logic, always_ff, multi-statement tasks…).
        compile_rc, compile_out = _run_limited(
            ["iverilog", "-g2012", "-o", output_bin, "-Wall", design_file, testbench_file],
            cwd=tmpdir,
            timeout=30,
        )
        # Paths relative to the workspace: "tb.v:10", not "/tmp/verilog_…/tb.v:10".
        compile_out = (compile_out or "").replace(tmpdir + os.sep, "")
        if compile_out:
            combined_stdout.append(compile_out)

        if compile_rc != 0:
            cause = first_compile_error(compile_out)
            combined_stdout.append(f"[ERROR] Compilation failed: {cause}" if cause
                                   else "[ERROR] Compilation failed (iverilog exited with error).")
            hint = compile_hint(cause or "")
            if hint:
                combined_stdout.append(f"Hint: {hint}")
            logger.warning("ws=%s | Compilation failed: %s", workspace_id, cause)
            exit_code = SandboxExitCode.COMPILE_ERROR
            duration_ms = (time.monotonic() - t_start) * 1000
            return SandboxResult(
                exit_code    = exit_code,
                status       = exit_code_to_status(exit_code),
                stdout       = "\n".join(combined_stdout),
                stderr       = "\n".join(combined_stderr),
                duration_ms  = round(duration_ms, 1),
                workspace_id = workspace_id,
            )

        combined_stdout.append("[OK] Compilation successful → a.out")

    except subprocess.TimeoutExpired:
        combined_stderr.append("[ERROR] Compilation exceeded time limit.")
        exit_code = SandboxExitCode.INTERNAL_ERROR
        duration_ms = (time.monotonic() - t_start) * 1000
        return SandboxResult(
            exit_code    = exit_code,
            status       = exit_code_to_status(exit_code),
            stdout       = "\n".join(combined_stdout),
            stderr       = "\n".join(combined_stderr),
            duration_ms  = round(duration_ms, 1),
            workspace_id = workspace_id,
        )
    except FileNotFoundError:
        msg = "[ERROR] iverilog not found. Ensure iverilog is installed in the container."
        combined_stderr.append(msg)
        logger.error("ws=%s | %s", workspace_id, msg)
        exit_code = SandboxExitCode.INTERNAL_ERROR
        duration_ms = (time.monotonic() - t_start) * 1000
        return SandboxResult(
            exit_code    = exit_code,
            status       = exit_code_to_status(exit_code),
            stdout       = "\n".join(combined_stdout),
            stderr       = "\n".join(combined_stderr),
            duration_ms  = round(duration_ms, 1),
            workspace_id = workspace_id,
        )

    # ── Step 3: simulate with vvp ─────────────────────────────────────────────
    combined_stdout.append(f"\n--- Simulating (limit: {timeout}s) ---")
    try:
        sim_rc, sim_out = _run_limited(
            ["vvp", output_bin],
            cwd=tmpdir,
            timeout=timeout,
            extra_env={"VCD_FILE": vcd_file},
        )
        if sim_out:
            combined_stdout.append(sim_out)

        if sim_rc != 0:
            combined_stdout.append(
                f"[ERROR] Simulation runtime error (vvp exit code: {sim_rc})."
            )
            exit_code = SandboxExitCode.RUNTIME_ERROR
        else:
            combined_stdout.append("[OK] Simulation finished successfully.")
            exit_code = 0  # success

        # Testbenches often pick their own name ($dumpfile("dump.vcd")): use the newest .vcd they wrote
        if not os.path.exists(vcd_file):
            dumps = [os.path.join(tmpdir, f) for f in os.listdir(tmpdir) if f.endswith(".vcd")]
            if dumps:
                os.replace(max(dumps, key=os.path.getmtime), vcd_file)

        # Report VCD
        if os.path.exists(vcd_file):
            vcd_size = os.path.getsize(vcd_file)
            combined_stdout.append(f"[OK] Waveform written → wave.vcd ({vcd_size} bytes)")
        else:
            combined_stdout.append(
                "[WARN] No VCD file produced. Check that your testbench calls $dumpfile/$dumpvars."
            )

    except subprocess.TimeoutExpired:
        combined_stderr.append(
            f"[ERROR] Simulation exceeded {timeout}s time limit and was killed."
        )
        logger.warning("ws=%s | Simulation timed out", workspace_id)
        exit_code = SandboxExitCode.TIMEOUT

    except FileNotFoundError:
        msg = "[ERROR] vvp not found. Ensure iverilog is installed in the container."
        combined_stderr.append(msg)
        logger.error("ws=%s | %s", workspace_id, msg)
        exit_code = SandboxExitCode.INTERNAL_ERROR

    duration_ms = (time.monotonic() - t_start) * 1000
    status = exit_code_to_status(exit_code)

    logger.info(
        "ws=%s | Finished status=%s exit_code=%s duration=%.0fms",
        workspace_id, status, exit_code, duration_ms,
    )

    return SandboxResult(
        exit_code    = exit_code,
        status       = status,
        stdout       = "\n".join(combined_stdout),
        stderr       = "\n".join(combined_stderr),
        duration_ms  = round(duration_ms, 1),
        workspace_id = workspace_id,
    )


def _simulate_sync(
    tmpdir: str,
    workspace_id: str,
    timeout: int,
    lint: bool,
    design_language: str,
    testbench_language: str,
) -> SandboxResult:
    """Pick the flow: GHDL (VHDL testbench), cocotb (Python testbench) or Icarus.
    A VHDL design with any other testbench is first converted to Verilog."""
    from api import langs   # langs imports this module

    if design_language == "vhdl":
        os.replace(os.path.join(tmpdir, "design.v"), os.path.join(tmpdir, "design.vhd"))
    if testbench_language != "verilog":
        tb_name = "tb.vhd" if testbench_language == "vhdl" else "test_tb.py"
        os.replace(os.path.join(tmpdir, "tb.v"), os.path.join(tmpdir, tb_name))
    if testbench_language == "vhdl":
        return langs.run_vhdl_sync(tmpdir, workspace_id, timeout)

    note = ""
    if design_language == "vhdl":
        t0 = time.monotonic()
        error = langs.vhdl_to_verilog(tmpdir)
        if error:
            return langs._result(SandboxExitCode.COMPILE_ERROR,
                                 ["--- Converting VHDL to Verilog (GHDL) ---", error, "[ERROR] Compilation failed."],
                                 t0, workspace_id)
        note = "[OK] VHDL design converted to Verilog (GHDL)\n"
    result = (langs.run_cocotb_sync(tmpdir, workspace_id, timeout) if testbench_language == "python"
              else _run_simulation_sync(tmpdir, workspace_id, timeout, lint and design_language == "verilog"))
    result.stdout = note + result.stdout
    return result


# =============================================================================
# Async wrapper — called by route handlers
# =============================================================================

async def run_simulation(
    tmpdir: str,
    workspace_id: str,
    timeout: int,
    lint: bool = False,
    design_language: str = "verilog",
    testbench_language: str = "verilog",
) -> SandboxResult:
    """
    Async entry-point for the route handlers.

    Runs _run_simulation_sync in a thread-pool executor so the blocking
    subprocess calls don't stall FastAPI's event loop.

    Args:
        tmpdir       : Directory containing design.v and tb.v
        workspace_id : Short ID for log correlation
        timeout      : Simulation timeout in seconds

    Returns:
        SandboxResult
    """
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        _simulate_sync,
        tmpdir,
        workspace_id,
        timeout,
        lint,
        design_language,
        testbench_language,
    )
    return result
