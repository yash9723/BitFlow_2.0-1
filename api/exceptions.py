"""
exceptions.py — Custom exception types and global FastAPI handlers
==================================================================

By defining our own exception hierarchy we can:
  • Raise a semantically meaningful error anywhere in business logic
    (e.g. `raise SandboxImageNotFound(...)`) without importing FastAPI.
  • Map them to precise HTTP status codes in one place.
  • Keep route handlers clean — they only catch what they need to.

Registration:
    These handlers are attached to the FastAPI app in main.py via
    app.add_exception_handler(ExcType, handler_fn).
"""

from __future__ import annotations

import logging
import traceback

from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


# =============================================================================
# Base
# =============================================================================

class VerilogSandboxError(Exception):
    """
    Root of the sandbox exception hierarchy.
    Every domain-specific error should inherit from this so callers can
    catch the base type when they want to handle all sandbox errors uniformly.
    """
    http_status: int = 500
    error_code: str  = "internal_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


# =============================================================================
# Input / validation errors  (4xx)
# =============================================================================

class SourceTooLargeError(VerilogSandboxError):
    """Raised when a submitted Verilog file exceeds MAX_SOURCE_BYTES."""
    http_status = 413
    error_code  = "source_too_large"


class InvalidSourceError(VerilogSandboxError):
    """
    Raised for structurally invalid input before it reaches iverilog
    (e.g. null bytes, non-UTF-8 content).
    """
    http_status = 422
    error_code  = "invalid_source"



# =============================================================================
# Global exception handlers (registered in main.py)
# =============================================================================

async def sandbox_error_handler(
    request: Request,
    exc: VerilogSandboxError,
) -> JSONResponse:
    """
    Converts any VerilogSandboxError into a consistent JSON error response.

    Response shape:
        { "error": "image_not_found", "detail": "Docker image '...' not found. ..." }
    """
    # Log at WARNING for client errors, ERROR for server errors
    level = logging.WARNING if exc.http_status < 500 else logging.ERROR
    logger.log(level, "[%s] %s — %s", exc.error_code, request.url.path, exc.message)

    return JSONResponse(
        status_code=exc.http_status,
        content={"error": exc.error_code, "detail": exc.message},
    )


async def unhandled_error_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    """
    Catch-all for any exception that was not anticipated.
    Logs the full traceback server-side; returns a safe generic message to
    the client (never expose internal stack traces to untrusted callers).
    """
    logger.error(
        "Unhandled exception on %s %s\n%s",
        request.method,
        request.url.path,
        traceback.format_exc(),
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "detail": "An unexpected server error occurred.",
        },
    )
