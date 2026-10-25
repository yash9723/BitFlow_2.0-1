"""
utils.py — Helper utilities for the Verilog sandbox API
========================================================

Small, pure functions that handle:
  • Writing source files to a temporary workspace directory
  • Reading and base64-encoding the VCD waveform output
  • Generating short workspace IDs for log correlation
  • Configuring structured logging for the entire application

None of these functions talk to Docker — that lives in sandbox.py.
Keeping I/O helpers here makes sandbox.py easier to unit-test in isolation.
"""

from __future__ import annotations

import base64
import itertools
import logging
import logging.config
import os
import secrets
import shutil
import tempfile
import threading
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


# =============================================================================
# Logging setup
# =============================================================================

def configure_logging(level: str = "INFO") -> None:
    """
    Set up structured, consistently formatted logging for the whole process.

    Call once from main.py's lifespan startup.  After this, every module
    that does `logger = logging.getLogger(__name__)` inherits the format.

    Format example:
        2024-01-15 10:23:45,123 | INFO     | api.sandbox | Container started ws=abc123
    """
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "standard": {
                    "format": "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                    "datefmt": "%Y-%m-%d %H:%M:%S",
                }
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "standard",
                    "stream": "ext://sys.stdout",
                }
            },
            "root": {
                "handlers": ["console"],
                "level": level.upper(),
            },
        }
    )


# =============================================================================
# Workspace management
# =============================================================================

def create_workspace() -> tuple[str, str]:
    """
    Create a temporary directory on the host that will be bind-mounted
    into the container as /workspace.

    Returns:
        (tmpdir_path, workspace_id)
        - tmpdir_path : absolute path to the directory (e.g. /tmp/verilog_abc123)
        - workspace_id: short random ID used in logs and API responses

    The caller is responsible for deleting the directory (use cleanup_workspace).
    We deliberately do NOT use TemporaryDirectory() as a context manager here
    because the lifetime spans async await boundaries where 'finally' is safer.
    """
    workspace_id = secrets.token_hex(6)          # 12-char hex, e.g. "3f9a2b1c4d8e"
    tmpdir = tempfile.mkdtemp(prefix=f"verilog_{workspace_id}_")
    if os.name == "posix" and os.geteuid() == 0:
        # Its own uid per run (sandbox._run_limited runs as the directory's owner), group root
        # so the API can still write and clean up: another run's code can't open this
        # directory, nor /proc/<pid>/cwd of this run's processes (e.g. a hidden testbench).
        with _uid_lock:
            uid = RUN_UID_BASE + next(_uid_counter) % RUN_UID_COUNT
        try:
            os.chown(tmpdir, uid, 0)
            os.chmod(tmpdir, 0o770)
            return tmpdir, workspace_id
        except PermissionError:
            logger.warning("No CAP_CHOWN: runs share the sandbox uid")
    os.chmod(tmpdir, 0o777)
    return tmpdir, workspace_id


# ponytail: one uvicorn process, so a counter keeps concurrent runs on distinct uids;
# several worker processes would need a shared allocator.
RUN_UID_BASE, RUN_UID_COUNT = 20000, 10000
_uid_counter = itertools.count(secrets.randbelow(RUN_UID_COUNT))
_uid_lock = threading.Lock()


def write_source_files(
    tmpdir: str,
    design_v: str,
    testbench_v: str,
    files: dict | None = None,
) -> None:
    """
    Write design.v and tb.v into the workspace directory.

    Both files are written as UTF-8.  The container's entrypoint.sh expects
    exactly these filenames in /workspace.

    Args:
        tmpdir      : Absolute path to the host-side workspace directory.
        design_v    : String content of the Verilog design module.
        testbench_v : String content of the Verilog testbench.

    Raises:
        OSError if the directory is not writable.
    """
    design_path = Path(tmpdir, "design.v")
    tb_path = Path(tmpdir, "tb.v")
    design_path.write_text(design_v, encoding="utf-8")
    tb_path.write_text(testbench_v, encoding="utf-8")
    os.chmod(design_path, 0o644)
    os.chmod(tb_path, 0o644)

    # Extra input files (names already validated in SimulateJsonRequest).
    for name, content in (files or {}).items():
        path = Path(tmpdir, name)
        path.write_text(content, encoding="utf-8")
        os.chmod(path, 0o644)


def cleanup_workspace(tmpdir: str) -> None:
    """
    Recursively delete the temporary workspace directory.

    Uses ignore_errors=True so a partially-created directory (e.g. after a
    DockerDaemonError during container startup) doesn't mask the original error.
    Always call this in a `finally` block.
    """
    shutil.rmtree(tmpdir, ignore_errors=True)


# =============================================================================
# VCD waveform helpers
# =============================================================================

def read_vcd(tmpdir: str, filename: str = "wave.vcd") -> tuple[Optional[str], int]:
    """
    Read the VCD waveform file produced by the simulation and return it
    as a base64-encoded string.

    Args:
        tmpdir   : Host-side workspace directory (bind-mounted as /workspace).
        filename : Name of the VCD file (default: wave.vcd).

    Returns:
        (vcd_base64, size_bytes)
        - vcd_base64 : Base64-encoded string, or None if the file does not exist.
        - size_bytes : Raw byte length of the file (0 if not found).

    Why base64?
        The VCD format is plain ASCII so it could be returned as-is, but
        base64 encoding makes it safe to embed in JSON without any escaping
        concerns and keeps the response a single content-type.
    """
    vcd_path = Path(tmpdir, filename)
    if not vcd_path.exists():
        return None, 0

    raw = vcd_path.read_bytes()
    encoded = base64.b64encode(raw).decode("ascii")
    return encoded, len(raw)


def decode_vcd(vcd_base64: str) -> bytes:
    """
    Convenience helper for clients / tests that need the raw VCD bytes
    back from a base64 response field.

    Usage:
        raw = decode_vcd(response["waveform"]["vcd_base64"])
        Path("wave.vcd").write_bytes(raw)
    """
    return base64.b64decode(vcd_base64)


# =============================================================================
# Size validation helpers
# =============================================================================

def check_source_size(content: str | bytes, limit_bytes: int, label: str) -> None:
    """
    Raise SourceTooLargeError if `content` exceeds `limit_bytes`.

    Accepts both str (encodes to UTF-8 for measurement) and bytes.
    Importing inside the function avoids a circular import with exceptions.py.

    Args:
        content     : The file content to check.
        limit_bytes : Maximum allowed size in bytes.
        label       : Human-readable name for error messages (e.g. 'design.v').
    """
    from api.exceptions import SourceTooLargeError   # local import — avoid circular

    size = len(content.encode("utf-8") if isinstance(content, str) else content)
    if size > limit_bytes:
        raise SourceTooLargeError(
            f"{label} is {size:,} bytes, which exceeds the "
            f"{limit_bytes:,}-byte limit."
        )


# =============================================================================
# Formatting helpers (used in log messages)
# =============================================================================

def fmt_duration(seconds: float) -> str:
    """Format a duration for human-readable log messages, e.g. '1.23 s', '450 ms'."""
    if seconds >= 1.0:
        return f"{seconds:.2f} s"
    return f"{seconds * 1000:.0f} ms"
