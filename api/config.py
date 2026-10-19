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
    print(settings.docker_image)
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
        case_sensitive=False,     # DOCKER_IMAGE == docker_image
        extra="ignore",           # silently drop unknown env vars
    )

    # ── Docker image ─────────────────────────────────────────────────────────
    docker_image: str = Field(
        default="verilog-sandbox:latest",
        description="Name:tag of the pre-built Icarus Verilog sandbox image.",
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

    # ── Container resource caps ───────────────────────────────────────────────
    mem_limit: str = Field(
        default="128m",
        description="Docker memory limit string, e.g. '128m', '512m', '1g'.",
    )
    cpu_quota: int = Field(
        default=50_000,
        ge=1_000,
        description="Docker CPU quota in microseconds per cpu_period.",
    )
    cpu_period: int = Field(
        default=100_000,
        ge=1_000,
        description="Docker CPU period in microseconds (default 100 ms).",
    )
    pids_limit: int = Field(
        default=64,
        ge=8,
        description="Maximum number of processes inside the container.",
    )

    # ── Networking ────────────────────────────────────────────────────────────
    network_disabled: bool = Field(
        default=True,
        description="Set to false only for debugging — never in production.",
    )

    host_tmp_dir: str | None = Field(
        default=None,
        description="Host-side path to mapping of /tmp for sibling containers.",
    )

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

    # ── Sandbox user (must match Dockerfile) ─────────────────────────────────
    sandbox_uid: int = Field(
        default=10001,
        description="UID of the non-root user inside the sandbox container.",
    )
    sandbox_gid: int = Field(
        default=10001,
        description="GID of the non-root user inside the sandbox container.",
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

    # ── Computed helpers ──────────────────────────────────────────────────────
    @property
    def sandbox_user(self) -> str:
        """Returns 'uid:gid' string expected by the Docker SDK's `user` param."""
        return f"{self.sandbox_uid}:{self.sandbox_gid}"

    @model_validator(mode="after")
    def _need_jwt_key(self) -> "Settings":
        if not self.jwt_secret and not self.jwt_public_key:
            raise ValueError("Set JWT_PUBLIC_KEY (ES256) or JWT_SECRET (32+ chars).")
        return self

    @field_validator("mem_limit")
    @classmethod
    def _validate_mem_limit(cls, v: str) -> str:
        """Ensure the mem_limit string ends with a valid Docker suffix."""
        if not v[-1].lower() in ("b", "k", "m", "g"):
            raise ValueError(
                f"mem_limit '{v}' must end with b/k/m/g (e.g. '128m')."
            )
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
