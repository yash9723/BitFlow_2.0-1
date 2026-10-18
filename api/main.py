"""
main.py — FastAPI application factory
======================================

This is the entry-point module for uvicorn:
    uvicorn api.main:app --reload

What it does:
  1. Creates the FastAPI app with OpenAPI metadata
  2. Registers the lifespan context (startup / shutdown hooks)
  3. Attaches CORS middleware
  4. Attaches global exception handlers from exceptions.py
  5. Mounts routers from routes/simulate.py and routes/health.py
  6. Exposes a root redirect to /docs for convenience

Nothing here contains business logic — this file is intentionally thin.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from api.config import settings
from api.exceptions import VerilogSandboxError, sandbox_error_handler, unhandled_error_handler
from api.routes.health import router as health_router
from api.routes.simulate import router as simulate_router
from api.routes.synthesize import router as synthesize_router
from api.utils import configure_logging


# =============================================================================
# Lifespan — startup and shutdown hooks
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Code before `yield` runs at startup; code after `yield` runs at shutdown.

    FastAPI's lifespan replaces the deprecated @app.on_event("startup")
    decorators and is the modern way to manage resources that live as long
    as the process.
    """
    # ── Startup ──────────────────────────────────────────────────────────────
    configure_logging(settings.log_level)

    import logging
    logger = logging.getLogger(__name__)
    logger.info("Verilog Sandbox API starting up")
    logger.info("Docker image  : %s", settings.docker_image)
    logger.info("Timeout default : %ds  (max %ds)", settings.timeout_seconds, settings.max_timeout_seconds)
    logger.info("Memory limit  : %s", settings.mem_limit)
    logger.info("Network disabled: %s", settings.network_disabled)

    # Simulations run natively via iverilog/vvp subprocess — no Docker daemon needed.
    logger.info("Native simulation mode: using iverilog/vvp subprocess directly")

    yield  # ← application runs here

    # ── Shutdown ─────────────────────────────────────────────────────────────
    logger.info("Verilog Sandbox API shutting down")


# =============================================================================
# App factory
# =============================================================================

def create_app() -> FastAPI:
    """
    Build and return the configured FastAPI application.

    Separating construction into a factory function makes it easy to
    create test instances with patched settings (call create_app() in
    conftest.py after monkey-patching the settings object).
    """
    app = FastAPI(
        title       = "Verilog Sandbox API",
        description = (
            "A secure, containerised REST API for compiling and simulating "
            "Verilog designs using Icarus Verilog."
        ),
        version     = "1.0.0",
        docs_url    = "/docs" if settings.enable_docs else None,
        redoc_url   = "/redoc" if settings.enable_docs else None,
        openapi_url = "/openapi.json" if settings.enable_docs else None,
        lifespan    = lifespan,
    )

    # ── CORS ─────────────────────────────────────────────────────────────────
    # allow_origins=["*"] is fine for local development.
    # In production replace with your frontend origin, e.g.:
    #   CORS_ORIGINS='["https://yourapp.com"]' in .env
    app.add_middleware(
        CORSMiddleware,
        allow_origins     = settings.cors_origins,
        allow_credentials = True,
        allow_methods     = ["GET", "POST"],
        allow_headers     = ["*"],
    )

    # ── Exception handlers ────────────────────────────────────────────────────
    # VerilogSandboxError and all its subclasses → structured JSON 4xx/5xx
    app.add_exception_handler(VerilogSandboxError, sandbox_error_handler)
    # Everything else → safe generic 500
    app.add_exception_handler(Exception, unhandled_error_handler)

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(health_router)    # GET /health, GET /status
    app.include_router(simulate_router)  # POST /simulate, POST /simulate/upload
    app.include_router(synthesize_router)  # POST /synthesize

    # ── Root redirect ─────────────────────────────────────────────────────────
    @app.get("/", include_in_schema=False)
    def root():
        """Root endpoint."""
        if settings.enable_docs:
            return RedirectResponse(url="/docs")
        return {"status": "ok", "service": "Verilog Sandbox API"}

    return app


# Module-level app instance — this is what uvicorn imports
app = create_app()
