"""
jwt_auth.py — JWT Bearer token verification for FastAPI
=========================================================

Provides a FastAPI dependency that extracts and verifies a JWT from the
Authorization: Bearer <token> header.

Usage in route files:
    from api.jwt_auth import verify_jwt

    @router.post("/simulate", dependencies=[Depends(verify_jwt)])
    async def simulate_json(body: ...) -> ...:
        ...
"""

from __future__ import annotations

import logging

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.config import settings

logger = logging.getLogger(__name__)

# HTTPBearer extracts the token from "Authorization: Bearer <token>"
_bearer_scheme = HTTPBearer()


async def verify_jwt(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> dict:
    """
    FastAPI dependency that verifies the incoming JWT.

    Returns the decoded payload dict on success.
    Raises HTTPException 401 on any failure (missing, expired, bad signature).
    """
    token = credentials.credentials
    # Public-key mode accepts ES256 only, so an HS256 token "signed" with the
    # public key can't slip through (algorithm confusion).
    if settings.jwt_public_key:
        key, algorithms = settings.jwt_public_key.replace("\\n", "\n"), ["ES256"]
    else:
        key, algorithms = settings.jwt_secret, ["HS256"]

    try:
        payload = jwt.decode(token, key, algorithms=algorithms)
        return payload

    except jwt.ExpiredSignatureError:
        logger.warning("JWT rejected: token has expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as exc:
        logger.warning("JWT rejected: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
