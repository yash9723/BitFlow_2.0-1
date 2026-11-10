"""
api/routes/pair.py — pair mode's sync server: two people edit one Sandbox project at once.

The browsers speak the Yjs WebSocket protocol (y-websocket) to /pair/<room>; pycrdt-websocket keeps each room's
document in memory, forwards edits and cursors, and drops the room when the last person leaves. Nothing is stored:
the project's owner autosaves through the frontend as usual.

A room is "<projectId>.<16 hex>": one per pair link, so a new link or an ended session never reopens an old room.
The frontend (/api/pair/auth) decides who may join and hands the browser a token for exactly one room, signed with
its usual key but with the audience "bitflow-pair", which the simulation routes refuse (api/jwt_auth.py).
POST /pair/close (the frontend, with its normal token) ends a project's rooms: everyone in them is disconnected
and the rooms can't be joined again.
"""

from __future__ import annotations

import logging
import re
from contextlib import asynccontextmanager, suppress
from typing import AsyncIterator

import jwt
from fastapi import APIRouter, Depends, WebSocket
from pycrdt.websocket import WebsocketServer
from pydantic import BaseModel, Field

from api.jwt_auth import decode_token, verify_jwt

logger = logging.getLogger(__name__)
router = APIRouter()

PAIR_AUDIENCE = "bitflow-pair"
MAX_CLIENTS = 4          # owner + partner, with a spare tab each
UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
ROOM = re.compile(rf"^{UUID}\.[0-9a-f]{{16}}$")

_server: WebsocketServer | None = None
_open: dict[str, set[WebSocket]] = {}
_ended: dict[str, None] = {}   # closed rooms, oldest first. ponytail: in memory, so a restart forgets them;
                               # their tokens still expire with the link.


@asynccontextmanager
async def running() -> AsyncIterator[None]:
    """Run the sync server for the app's lifetime (api/main.py lifespan)."""
    global _server
    async with WebsocketServer(auto_clean_rooms=True, log=logger) as server:
        _server = server
        try:
            yield
        finally:
            _server = None


class _Channel:
    """A Starlette WebSocket as the channel pycrdt-websocket reads and writes."""

    def __init__(self, ws: WebSocket, path: str):
        self._ws, self._path = ws, path

    @property
    def path(self) -> str:
        return self._path

    def __aiter__(self):
        return self

    async def __anext__(self) -> bytes:
        message = await self._ws.receive()
        if message["type"] == "websocket.disconnect":
            raise StopAsyncIteration
        return message.get("bytes") or b""

    async def send(self, message: bytes) -> None:
        await self._ws.send_bytes(message)


@router.websocket("/pair/{room}")
async def pair_socket(ws: WebSocket, room: str, token: str = "") -> None:
    # Accept, then close with a 44xx code if refused: a refused handshake reaches the browser only as a network
    # error, and y-websocket would retry forever; a 44xx close makes it stop and say why.
    await ws.accept()
    try:
        claims = decode_token(token, audience=PAIR_AUDIENCE)
    except jwt.InvalidTokenError:
        await ws.close(code=4401)
        return
    if _server is None or claims.get("room") != room or not ROOM.match(room) or room in _ended:
        await ws.close(code=4403)
        return
    current = _server.rooms.get(room)
    if current is not None and len(current.clients) >= MAX_CLIENTS:
        await ws.close(code=4429)
        return
    _open.setdefault(room, set()).add(ws)
    try:
        await _server.serve(_Channel(ws, room))
    finally:
        sockets = _open.get(room)
        if sockets is not None:
            sockets.discard(ws)
            if not sockets:
                _open.pop(room, None)


class CloseBody(BaseModel):
    project: str = Field(pattern=rf"^{UUID}$")


@router.post("/pair/close", dependencies=[Depends(verify_jwt)])
async def close_rooms(body: CloseBody) -> dict:
    """End every room of a project: disconnect whoever is in them and refuse their tokens from now on."""
    prefix = body.project + "."
    names = {r for r in _open if r.startswith(prefix)} | {r for r in (_server.rooms if _server else {}) if r.startswith(prefix)}
    for name in names:
        _ended[name] = None
        for ws in list(_open.get(name, ())):
            with suppress(Exception):
                await ws.close(code=4410)   # 44xx: y-websocket stops reconnecting
    while len(_ended) > 10_000:
        _ended.pop(next(iter(_ended)))
    return {"closed": len(names)}
