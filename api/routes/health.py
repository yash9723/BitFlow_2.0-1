"""
routes/health.py — Observability endpoints
==========================================

    GET /health   Liveness: the process answers. Touches nothing else, so it is always fast.
                  (Docker HEALTHCHECK, load balancers, the frontend's /api/simulate/health.)

    GET /status   Readiness: are the simulator tools installed, and which limits are active.

Both return 200; the `status` field carries the state.
"""

from __future__ import annotations

import logging
import shutil

from fastapi import APIRouter

from api import sandbox
from api.config import settings
from api.models import HealthResponse, StatusResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Observability"])

# Increment this when the API contract changes
API_VERSION = "1.0.0"

# Every run needs these; the rest back optional features that report their own absence.
REQUIRED_TOOLS = ("iverilog", "vvp")
OPTIONAL_TOOLS = ("verilator", "yosys", "ghdl", "nextpnr-ice40", "sta", "z3", "verible-verilog-lint")


@router.get("/health", response_model=HealthResponse, summary="Liveness probe")
def health() -> HealthResponse:
    """200 with status "ok" whenever the process is running."""
    return HealthResponse(status="ok", version=API_VERSION)


@router.get("/status", response_model=StatusResponse, summary="Readiness probe")
def status() -> StatusResponse:
    """"ready" when Icarus Verilog is installed, else "unavailable"; plus the tools found and the active limits."""
    tools = {name: shutil.which(name) is not None for name in (*REQUIRED_TOOLS, *OPTIONAL_TOOLS)}
    ready = all(tools[name] for name in REQUIRED_TOOLS)
    if not ready:
        logger.warning("Not ready: missing %s", [name for name in REQUIRED_TOOLS if not tools[name]])

    return StatusResponse(
        status="ready" if ready else "unavailable",
        tools=tools,
        settings_summary={
            "timeout_seconds":            settings.timeout_seconds,
            "max_timeout_seconds":        settings.max_timeout_seconds,
            "max_concurrent_simulations": settings.max_concurrent_simulations,
            "max_heavy_simulations":      settings.max_heavy_simulations,
            "max_source_bytes":           settings.max_source_bytes,
            "max_output_bytes":           sandbox.MAX_OUTPUT_BYTES,
            "max_memory_bytes":           sandbox.MAX_MEMORY_BYTES,
            "include_vcd":                settings.include_vcd_in_response,
        },
    )
