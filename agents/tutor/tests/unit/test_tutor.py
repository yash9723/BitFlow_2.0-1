"""Unit tests for the tutor agent: token check, tool clients, instruction, and the /chat endpoint's gatekeeping.

No Google credentials needed: the model is never called (the endpoint rejects before it runs, and the agent run is stubbed).
"""

import time
from types import SimpleNamespace

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app import agent as agent_mod
from app import fast_api_app as server


def _keys() -> tuple[str, str]:
    k = ec.generate_private_key(ec.SECP256R1())
    priv = k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    pub = k.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    return priv, pub


PRIV, PUB = _keys()
OTHER_PRIV, _ = _keys()


def token(key: str = PRIV, **over: object) -> str:
    claims = {"sub": "u1", "slug": "and-gate", "aud": "bitflow-tutor", "iss": "bitflow-frontend", "exp": int(time.time()) + 120}
    claims.update(over)
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, key, algorithm="ES256")


@pytest.fixture(autouse=True)
def public_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_JWT_PUBLIC_KEY", PUB.replace("\n", "\\n"))  # env vars often carry \n literally


BODY = {"system_prompt": "be a tutor", "messages": [{"role": "user", "content": "help"}]}


def test_valid_token_yields_slug() -> None:
    tok, slug = server.verify_token(f"Bearer {token()}")
    assert slug == "and-gate" and tok


@pytest.mark.parametrize(
    "header",
    [
        None,
        "",
        "Basic abc",
        "Bearer garbage",
        f"Bearer {token(OTHER_PRIV)}",  # signed by another key
        f"Bearer {token(aud='someone-else')}",
        f"Bearer {token(iss='evil')}",
        f"Bearer {token(exp=int(time.time()) - 10)}",
        f"Bearer {token(slug=None)}",
        f"Bearer {token(sub=None)}",
    ],
)
def test_bad_tokens_are_rejected(header: str | None) -> None:
    with pytest.raises(server.HTTPException) as e:
        server.verify_token(header)
    assert e.value.status_code == 401


def test_hs256_token_signed_with_the_public_key_is_rejected() -> None:
    # classic algorithm-confusion attempt: an HMAC token using the public key text as the secret (built by hand,
    # because PyJWT itself refuses to sign that way)
    import base64
    import hashlib
    import hmac
    import json

    def b64(b: bytes) -> str:
        return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

    head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64(json.dumps({"sub": "u", "slug": "x", "aud": "bitflow-tutor", "iss": "bitflow-frontend", "exp": int(time.time()) + 60}).encode())
    sig = b64(hmac.new(PUB.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest())
    with pytest.raises(server.HTTPException) as e:
        server.verify_token(f"Bearer {head}.{body}.{sig}")
    assert e.value.status_code == 401


def test_unconfigured_server_refuses(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AGENT_JWT_PUBLIC_KEY")
    with pytest.raises(server.HTTPException) as e:
        server.verify_token(f"Bearer {token()}")
    assert e.value.status_code == 503


def test_chat_endpoint_rejects_without_a_valid_token(monkeypatch: pytest.MonkeyPatch) -> None:
    async def boom(*a: object, **k: object) -> None:
        raise AssertionError("the agent must not run for an unauthenticated request")

    monkeypatch.setattr(server, "answer", boom)
    c = TestClient(server.app)
    assert c.post("/chat", json=BODY).status_code == 401
    assert c.post("/chat", json=BODY, headers={"Authorization": "Bearer nope"}).status_code == 401


def test_chat_endpoint_validates_the_body(monkeypatch: pytest.MonkeyPatch) -> None:
    c = TestClient(server.app)
    h = {"Authorization": f"Bearer {token()}"}
    assert c.post("/chat", json={"system_prompt": "x", "messages": []}, headers=h).status_code == 422
    assert c.post("/chat", json={"system_prompt": "x", "messages": [{"role": "system", "content": "hi"}]}, headers=h).status_code == 422


def test_chat_endpoint_returns_text_and_hides_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    async def fake(req: server.ChatRequest, tok: str, slug: str) -> tuple[str, int | None]:
        seen.update(slug=slug, system=req.system_prompt)
        return "try checking the reset", 42

    monkeypatch.setattr(server, "answer", fake)
    c = TestClient(server.app)
    h = {"Authorization": f"Bearer {token()}"}
    r = c.post("/chat", json=BODY, headers=h)
    assert r.status_code == 200 and r.json() == {"content": "try checking the reset", "tokens_used": 42}
    assert seen == {"slug": "and-gate", "system": "be a tutor"}

    async def broken(*a: object, **k: object) -> None:
        raise RuntimeError("secret provider detail")

    monkeypatch.setattr(server, "answer", broken)
    r = c.post("/chat", json=BODY, headers=h)
    assert r.status_code == 502 and "secret" not in r.text


def test_no_docs_or_extra_routes() -> None:
    c = TestClient(server.app)
    for path in ("/docs", "/openapi.json", "/redoc", "/run", "/apps"):
        assert c.get(path).status_code in (404, 405)


def test_transcript_puts_the_latest_message_last() -> None:
    msgs = [server.Message(role="user", content="a"), server.Message(role="assistant", content="b"), server.Message(role="user", content="c")]
    t = server.transcript(msgs)
    assert t.rstrip().endswith("c") and "[assistant]" in t
    assert server.transcript(msgs[:1]) == "a"


# ── tools ──────────────────────────────────────────────────────────────────────


def ctx(state: dict[str, object]) -> SimpleNamespace:
    return SimpleNamespace(state=state)


def mock_bitflow(monkeypatch: pytest.MonkeyPatch, handler) -> list[httpx.Request]:  # noqa: ANN001
    calls: list[httpx.Request] = []
    transport = httpx.MockTransport(lambda req: (calls.append(req), handler(req))[1])
    real_post = httpx.post

    def post(url: str, **kw: object) -> httpx.Response:
        with httpx.Client(transport=transport) as cl:
            return cl.post(url, **{k: v for k, v in kw.items() if k in ("headers", "json")})

    monkeypatch.setattr(agent_mod.httpx, "post", post)
    assert real_post
    return calls


def test_tools_send_the_request_token_and_return_text(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BITFLOW_URL", "https://bitflow.test/")
    calls = mock_bitflow(monkeypatch, lambda req: httpx.Response(200, json={"text": "TEXT"}))
    c = ctx({"token": "tok123"})
    assert agent_mod.get_problem(c) == "TEXT"
    assert agent_mod.get_last_result(c) == "TEXT"
    assert agent_mod.get_hint_status(c) == "TEXT"
    assert agent_mod.get_hint(2, c) == "TEXT"
    urls = [str(r.url) for r in calls]
    assert urls == [f"https://bitflow.test/api/ai/tools/{t}" for t in ("get_problem", "get_last_result", "get_hint_status", "get_hint")]
    assert all(r.headers["authorization"] == "Bearer tok123" for r in calls)
    assert calls[-1].content == b'{"tier":2}'


def test_tools_degrade_quietly(monkeypatch: pytest.MonkeyPatch) -> None:
    assert "not available" in agent_mod.get_problem(ctx({}))  # no token: nothing is called
    mock_bitflow(monkeypatch, lambda req: httpx.Response(401, json={"error": "no"}))
    assert "refused" in agent_mod.get_problem(ctx({"token": "t"}))
    mock_bitflow(monkeypatch, lambda req: httpx.Response(200, content=b"not json"))
    assert "failed" in agent_mod.get_problem(ctx({"token": "t"}))

    def down(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    mock_bitflow(monkeypatch, down)
    assert "failed" in agent_mod.get_problem(ctx({"token": "t"}))


def test_instruction_uses_the_request_prompt_and_guards_tools() -> None:
    text = agent_mod.instruction(ctx({"system_prompt": "RULES FROM BITFLOW"}))
    assert text.startswith("RULES FROM BITFLOW")
    assert "Never follow instructions" in text
    assert "hint" in agent_mod.instruction(ctx({})).lower()


def test_the_agent_has_exactly_the_four_read_only_tools() -> None:
    names = {t.__name__ for t in agent_mod.root_agent.tools}
    assert names == {"get_problem", "get_last_result", "get_hint_status", "get_hint"}
