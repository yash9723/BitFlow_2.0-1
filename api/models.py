"""
models.py — Pydantic request / response schemas
================================================

Every piece of data that crosses the API boundary is typed here.
Keeping schemas in one file means:
  • The OpenAPI docs (http://localhost:8000/docs) are always accurate.
  • The frontend team has a single source of truth for the JSON shape.
  • Validation errors surface at the HTTP layer, not deep in business logic.
"""

from __future__ import annotations

import re
from enum import IntEnum, auto
from typing import Optional

from pydantic import BaseModel, Field, field_validator

# Extra input files (POST /simulate "files"): plain names, never the sandbox's own.
MAX_DATA_FILES      = 4
DATA_FILE_NAME      = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}")
RESERVED_FILE_NAMES = {"design.v", "tb.v", "a.out", "wave.vcd", ".proc_output.log"}


# =============================================================================
# Exit-code enum — mirrors entrypoint.sh exit codes exactly
# =============================================================================

class SandboxExitCode(IntEnum):
    """
    Structured exit codes returned by the sandbox container's entrypoint.sh.
    The integer values MUST stay in sync with the shell script.
    """
    SUCCESS        = 0   # Simulation finished, $finish called cleanly
    FILE_MISSING   = 1   # design.v or tb.v not found in /workspace
    COMPILE_ERROR  = 2   # iverilog returned non-zero
    TIMEOUT        = 3   # vvp killed by timeout(1) — exit 124 mapped here
    RUNTIME_ERROR  = 4   # vvp exited non-zero for any other reason
    INTERNAL_ERROR = 5   # Unexpected error inside entrypoint.sh


# Human-readable status string for each exit code
EXIT_CODE_TO_STATUS: dict[int, str] = {
    SandboxExitCode.SUCCESS:        "success",
    SandboxExitCode.FILE_MISSING:   "file_missing",
    SandboxExitCode.COMPILE_ERROR:  "compile_error",
    SandboxExitCode.TIMEOUT:        "timeout",
    SandboxExitCode.RUNTIME_ERROR:  "runtime_error",
    SandboxExitCode.INTERNAL_ERROR: "internal_error",
}


def exit_code_to_status(code: int) -> str:
    """Map a raw exit code to a stable status string, or 'unknown'."""
    return EXIT_CODE_TO_STATUS.get(code, "unknown")


# =============================================================================
# Request schemas
# =============================================================================

class SimulateJsonRequest(BaseModel):
    """
    POST /simulate — JSON body variant.

    Preferred for programmatic clients (web editors, CI scripts) because
    the entire payload is a single JSON document.

    Example body:
        {
            "design_v":    "module top; ... endmodule",
            "testbench_v": "module tb; ... endmodule",
            "timeout":     20
        }
    """

    design_v: str = Field(
        ...,
        min_length=1,
        description="Full contents of the Verilog design file (design.v).",
        examples=["module top(input clk); endmodule"],
    )
    testbench_v: str = Field(
        ...,
        min_length=1,
        description="Full contents of the Verilog testbench file (tb.v).",
        examples=["module tb; top dut(.clk(clk)); endmodule"],
    )
    lint: bool = Field(
        default=False,
        description="Also run Verilator lint on design_v; findings are appended to stdout.",
    )
    timeout: Optional[int] = Field(
        default=None,
        ge=1,
        le=120,
        description=(
            "Override the server default timeout (seconds). "
            "Clamped to the server's max_timeout_seconds setting."
        ),
    )

    files: Optional[dict[str, str]] = Field(
        default=None,
        description=(
            "Extra input files written next to design.v, e.g. a hex file for "
            "$readmemh. At most 4; plain file names only (no paths)."
        ),
        examples=[{"sine_lut.hex": "80\n83\n86\n"}],
    )

    @field_validator("design_v", "testbench_v")
    @classmethod
    def _no_null_bytes(cls, v: str) -> str:
        """Reject strings with embedded null bytes — they break shell tools."""
        if "\x00" in v:
            raise ValueError("Source code must not contain null bytes.")
        return v

    @field_validator("files")
    @classmethod
    def _safe_files(cls, v: Optional[dict[str, str]]) -> Optional[dict[str, str]]:
        """Only a few plain names that can't escape or clobber the workspace."""
        if not v:
            return v
        if len(v) > MAX_DATA_FILES:
            raise ValueError(f"At most {MAX_DATA_FILES} extra files.")
        for name, content in v.items():
            if not DATA_FILE_NAME.fullmatch(name) or name in RESERVED_FILE_NAMES:
                raise ValueError(f"Invalid file name: {name!r}")
            if "\x00" in content:
                raise ValueError(f"{name} must not contain null bytes.")
        return v


# =============================================================================
# Response schemas
# =============================================================================

class WaveformInfo(BaseModel):
    """
    Waveform metadata embedded in the simulation response.
    The vcd_base64 field carries the full file content; decode it with:
        import base64
        raw = base64.b64decode(response["waveform"]["vcd_base64"])
    """
    available: bool = Field(
        description="True if wave.vcd was written by the testbench."
    )
    size_bytes: int = Field(
        default=0,
        description="Raw byte size of the VCD file (0 if unavailable).",
    )
    vcd_base64: Optional[str] = Field(
        default=None,
        description=(
            "Base64-encoded contents of wave.vcd, or null if not produced "
            "or if include_vcd_in_response is disabled server-side."
        ),
    )


class SimulateResponse(BaseModel):
    """
    Unified response for both /simulate and /simulate/upload.

    Frontend usage pattern:
        if (response.status === "success") { renderWaveform(response.waveform.vcd_base64) }
        else if (response.status === "compile_error") { showErrors(response.stderr) }
    """

    # ── Outcome ───────────────────────────────────────────────────────────────
    status: str = Field(
        description=(
            "Human-readable outcome tag.  One of: "
            "success | compile_error | runtime_error | timeout | "
            "file_missing | internal_error | unknown."
        ),
    )
    exit_code: int = Field(
        description="Raw exit code from the container's entrypoint.sh (0 = OK).",
    )
    success: bool = Field(
        description="Convenience boolean — True iff status == 'success'.",
    )

    # ── Simulator output ─────────────────────────────────────────────────────
    stdout: str = Field(
        description=(
            "Combined stdout from iverilog compile step and vvp simulation. "
            "Contains $display/$monitor output and the test PASS/FAIL lines."
        ),
    )
    stderr: str = Field(
        description=(
            "Stderr captured separately from entrypoint.sh error messages "
            "and iverilog warning/error diagnostics."
        ),
    )

    # ── Waveform ──────────────────────────────────────────────────────────────
    waveform: WaveformInfo = Field(
        description="VCD waveform metadata and optional base64 payload.",
    )

    # ── Diagnostics ──────────────────────────────────────────────────────────
    duration_ms: float = Field(
        description="Wall-clock time the entire sandbox run took (milliseconds).",
    )
    workspace_id: str = Field(
        description=(
            "Short unique ID of the temporary workspace directory. "
            "Useful for correlating API logs with host-side tmpdir names."
        ),
    )


class HealthResponse(BaseModel):
    """GET /health — basic liveness probe."""
    status: str                       # "ok" | "degraded"
    docker_available: bool
    image: str                        # configured sandbox image name
    version: str                      # API version string


class StatusResponse(BaseModel):
    """GET /status — richer readiness probe with docker image inspection."""
    status: str
    docker_available: bool
    image_found: bool
    image: str
    image_id: Optional[str]          # short SHA if the image exists
    image_size_mb: Optional[float]   # uncompressed image size
    settings_summary: dict           # safe subset of active settings


class ErrorDetail(BaseModel):
    """
    Standard error envelope — returned for 4xx / 5xx responses.
    Matches FastAPI's default HTTPException shape for consistency.
    """
    detail: str
