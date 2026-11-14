"""
config.py — Centralised application settings
=============================================

All configuration is read from environment variables (or a .env file).
Pydantic-settings validates and coerces types at startup so bad config
fails immediately instead of at request time.

Precedence (highest → lowest):
  1. Real environment variable   (export VAR=value)
  2. .env file in the project root
  3. Default value defined below

Usage anywhere in the codebase:
    from api.config import settings
    print(settings.timeout_seconds)
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Single source of truth for every runtime knob.
    All fields map 1-to-1 to an environment variable (case-insensitive).
    """

    model_config = SettingsConfigDict(
        env_file=".env",          # load from .env if present
        env_file_encoding="utf-8",
        case_sensitive=False,     # LOG_LEVEL == log_level
        extra="ignore",           # silently drop unknown env vars
    )

    # ── Simulation limits ─────────────────────────────────────────────────────
    timeout_seconds: int = Field(
        default=30,
        ge=1,
        le=300,
        description="Default wall-clock limit for vvp simulation (seconds).",
    )
    max_timeout_seconds: int = Field(
        default=120,
        ge=1,
        le=300,
        description="Hard ceiling a caller may request via the API.",
    )
    max_concurrent_simulations: int = Field(
        default=4,
        ge=1,
        description="Simulations run at once; further requests wait their turn.",
    )
    max_heavy_simulations: int = Field(
        default=0,
        ge=0,
        description=(
            "Heavy jobs (Verilator, cocotb, VHDL testbenches, formal, FPGA place-and-route, equivalence, "
            "ASIC) run at once in their own lane, so a 30 s build never blocks a quick Icarus run. "
            "0 = share the light pool, as before (right for small hosts: less memory at once)."
        ),
    )
    result_cache_mb: int = Field(
        default=24,
        ge=0,
        description="Memory for the result cache: identical requests are answered from memory. 0 disables it.",
    )
    warmup: bool = Field(
        default=True,
        description="After startup, run one tiny job in the background so the first real request isn't a cold start.",
    )

    # Per-run memory, file-size, process and output caps are fixed in api/sandbox.py.

    # ── Input validation ──────────────────────────────────────────────────────
    max_source_bytes: int = Field(
        default=512 * 1024,      # 512 KB
        ge=1024,
        description="Maximum allowed size (bytes) for each uploaded Verilog file.",
    )

    # ── API behaviour ─────────────────────────────────────────────────────────
    cors_origins: list[str] = Field(
        default=["*"],
        description=(
            "Allowed CORS origins. Replace ['*'] with your frontend URL "
            "in production, e.g. ['https://yourapp.com']."
        ),
    )
    log_level: str = Field(
        default="INFO",
        description="Python logging level: DEBUG | INFO | WARNING | ERROR.",
    )
    include_vcd_in_response: bool = Field(
        default=True,
        description=(
            "When True the VCD is base64-encoded and embedded in the JSON "
            "response.  Set False if you serve the file separately."
        ),
    )

    # ── Sandbox user ─────────────────────────────────────────────────────────
    sandbox_uid: int = Field(
        default=10001,
        description="UID user code runs as when the API itself runs as root (api/sandbox.py).",
    )
    sandbox_gid: int = Field(
        default=10001,
        description="GID that goes with sandbox_uid.",
    )
    cocotb_enabled: bool = Field(
        default=True,
        description="Accept Python (cocotb) testbenches. They run user Python; see langs.py for the limits.",
    )

    # ── JWT authentication & Security ─────────────────────────────────────
    # One of the two is required — no default. A public default secret lets
    # anyone mint tokens.
    jwt_secret: str | None = Field(
        default=None,
        min_length=32,
        description="Shared HMAC-SHA256 secret for signing/verifying JWTs between frontend and backend.",
    )
    jwt_public_key: str | None = Field(
        default=None,
        description=(
            "ES256 public key (PEM; literal \\n allowed). When set, only tokens signed with the "
            "frontend's JWT_PRIVATE_KEY are accepted and jwt_secret is ignored. Nothing secret "
            "lives on the API host."
        ),
    )
    enable_docs: bool = Field(
        default=False,
        description="Enable interactive OpenAPI /docs and /redoc Swagger UI endpoints.",
    )

    @model_validator(mode="after")
    def _need_jwt_key(self) -> "Settings":
        if not self.jwt_secret and not self.jwt_public_key:
            raise ValueError("Set JWT_PUBLIC_KEY (ES256) or JWT_SECRET (32+ chars).")
        return self

    @field_validator("jwt_secret", "jwt_public_key", mode="before")
    @classmethod
    def _trim_key(cls, v: str | None) -> str | None:
        """Drop spaces/newlines picked up when pasting into a dashboard; blank means unset."""
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @field_validator("log_level")
    @classmethod
    def _validate_log_level(cls, v: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in allowed:
            raise ValueError(f"log_level must be one of {allowed}, got '{v}'.")
        return upper


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return a cached Settings singleton.

    Using lru_cache means the .env file is read exactly once per process.
    In tests you can clear the cache with get_settings.cache_clear() and
    monkey-patch environment variables before re-calling.
    """
    return Settings()


# Module-level alias so callers can write `from api.config import settings`
settings: Settings = get_settings()
