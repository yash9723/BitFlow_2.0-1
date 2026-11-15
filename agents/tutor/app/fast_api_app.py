# Copyright 2026 BitFlow
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""The tutor agent's HTTP face: one endpoint, POST /chat, only for BitFlow.

BitFlow sends the conversation and its tutor rules with a short-lived ES256 token naming one student and one problem.
This service checks that token with the PUBLIC key (AGENT_JWT_PUBLIC_KEY), runs the agent, and returns the text.
There is no web UI, no docs page and no other route: nothing here for anyone but BitFlow to call.
"""

import logging
import os
import uuid
from typing import Literal

import jwt
from fastapi import FastAPI, Header, HTTPException
from google.adk.agents.run_config import RunConfig
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel, Field

from app.agent import app as adk_app

logger = logging.getLogger("tutor")

AUDIENCE = "bitflow-tutor"
ISSUER = "bitflow-frontend"
MAX_MESSAGES = 40
MAX_CHARS = 100_000
MAX_MODEL_CALLS = 6  # the agent's whole turn: a few lookups, then the answer

app = FastAPI(title="tutor", docs_url=None, redoc_url=None, openapi_url=None)
_sessions = InMemorySessionService()
_runner = Runner(app=adk_app, session_service=_sessions)


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=MAX_CHARS)


class ChatRequest(BaseModel):
    system_prompt: str = Field(max_length=20_000)
    messages: list[Message] = Field(min_length=1, max_length=MAX_MESSAGES)


def verify_token(authorization: str | None) -> tuple[str, str]:
    """(token, problem slug) for a valid BitFlow token; raises 401 for anything else."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="unauthorized")
    token = authorization.removeprefix("Bearer ").strip()
    key = (os.environ.get("AGENT_JWT_PUBLIC_KEY") or "").replace("\\n", "\n")
    if not key:
        raise HTTPException(status_code=503, detail="not configured")
    try:
        claims = jwt.decode(token, key, algorithms=["ES256"], audience=AUDIENCE, issuer=ISSUER, options={"require": ["exp", "sub", "aud", "iss"]})
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="unauthorized") from None
    slug = claims.get("slug")
    if not isinstance(slug, str) or not slug:
        raise HTTPException(status_code=401, detail="unauthorized")
    return token, slug


def transcript(messages: list[Message]) -> str:
    """The earlier turns as text, then the student's latest message last (the new turn the agent answers)."""
    if len(messages) == 1:
        return messages[0].content
    earlier = "\n\n".join(f"[{m.role}]\n{m.content}" for m in messages[:-1])
    return f"Conversation so far:\n{earlier}\n\n[student, latest message]\n{messages[-1].content}"


async def answer(req: ChatRequest, token: str, slug: str) -> tuple[str, int | None]:
    """Run the agent once. Each request has its own throwaway session, so nothing is kept between students."""
    session = await _sessions.create_session(
        app_name=adk_app.name, user_id="student", state={"system_prompt": req.system_prompt, "token": token, "slug": slug}
    )
    new_message = types.Content(role="user", parts=[types.Part(text=transcript(req.messages))])
    text, tokens = "", None
    try:
        async for event in _runner.run_async(
            user_id="student", session_id=session.id, new_message=new_message, run_config=RunConfig(max_llm_calls=MAX_MODEL_CALLS)
        ):
            if event.usage_metadata and event.usage_metadata.total_token_count:
                tokens = (tokens or 0) + event.usage_metadata.total_token_count
            if event.is_final_response() and event.content and event.content.parts:
                text = "".join(p.text for p in event.content.parts if p.text and not p.thought)
    finally:
        await _sessions.delete_session(app_name=adk_app.name, user_id="student", session_id=session.id)
    return text.strip(), tokens


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "request": uuid.uuid4().hex[:8]}


@app.post("/chat")
async def chat(req: ChatRequest, authorization: str | None = Header(default=None)) -> dict[str, object]:
    token, slug = verify_token(authorization)
    try:
        text, tokens = await answer(req, token, slug)
    except Exception:  # never echo model or provider errors to the caller
        logger.exception("agent run failed")
        raise HTTPException(status_code=502, detail="agent failed") from None
    if not text:
        raise HTTPException(status_code=502, detail="agent returned no text")
    return {"content": text, "tokens_used": tokens}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
