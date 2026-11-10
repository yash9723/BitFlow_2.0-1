"""Pair mode's sync server (api/routes/pair.py): who gets in, edits reaching the other person, ending a room."""

import os
import time

import jwt
import pytest
from fastapi.testclient import TestClient
from pycrdt import Doc, Text, create_update_message, handle_sync_message
from starlette.websockets import WebSocketDisconnect

SECRET = "test-secret-0123456789abcdef0123456789abcdef"
os.environ["JWT_SECRET"] = SECRET

from api.main import create_app  # noqa: E402

PROJECT = "0f1e2d3c-aaaa-bbbb-cccc-111122223333"
ROOM = PROJECT + ".0123456789abcdef"


def pair_token(room: str = ROOM, aud: str = "bitflow-pair") -> str:
    return jwt.encode({"room": room, "aud": aud, "exp": int(time.time()) + 60}, SECRET, algorithm="HS256")


def backend_token() -> str:
    return jwt.encode({"iss": "test", "exp": int(time.time()) + 60}, SECRET, algorithm="HS256")


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


def refused(client, url: str) -> int:
    with pytest.raises(WebSocketDisconnect) as e, client.websocket_connect(url) as ws:
        ws.receive_bytes()
    return e.value.code


def test_who_gets_in(client):
    assert refused(client, f"/pair/{ROOM}") == 4401                                          # no token
    assert refused(client, f"/pair/{ROOM}?token={backend_token()}") == 4401                  # a simulate token
    assert refused(client, f"/pair/{ROOM}?token={pair_token(aud='other')}") == 4401
    other = PROJECT + ".fedcba9876543210"
    assert refused(client, f"/pair/{other}?token={pair_token()}") == 4403                    # someone else's room
    assert refused(client, f"/pair/x?token={pair_token('x')}") == 4403                       # not a room name


def test_pair_token_cannot_simulate(client):
    r = client.post("/simulate", json={"design_v": "module m; endmodule", "testbench_v": "module t; endmodule"},
                    headers={"Authorization": f"Bearer {pair_token()}"})
    assert r.status_code == 401


def updates(ws, doc: Doc) -> None:
    """Read the server's messages until one changes `doc`."""
    for _ in range(10):
        msg = ws.receive_bytes()
        if msg[0] == 0:
            before = str(doc.get("t", type=Text))
            reply = handle_sync_message(msg[1:], doc)
            if str(doc.get("t", type=Text)) != before:
                return
            if reply:
                ws.send_bytes(reply)
    raise AssertionError("no update arrived")


def test_edits_reach_the_partner_and_close_ends_the_room(client):
    url = f"/pair/{ROOM}?token={pair_token()}"
    with client.websocket_connect(url) as a, client.websocket_connect(url) as b:
        da, db = Doc(), Doc()
        ta = da.get("t", type=Text)
        with da.new_transaction():
            ta += "module m; endmodule"
        a.send_bytes(create_update_message(da.get_update()))
        updates(b, db)
        assert str(db.get("t", type=Text)) == "module m; endmodule"

        assert client.post("/pair/close", json={"project": PROJECT}).status_code == 401      # frontend only
        r = client.post("/pair/close", json={"project": PROJECT}, headers={"Authorization": f"Bearer {backend_token()}"})
        assert r.json() == {"closed": 1}
        with pytest.raises(WebSocketDisconnect) as e:
            for _ in range(20):
                b.receive_bytes()
        assert e.value.code == 4410
    assert refused(client, url) == 4403                                                      # can't come back
