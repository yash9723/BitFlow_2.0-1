# BitFlow tutor agent

A small Google ADK (Python) agent that answers students on BitFlow's graded problems. BitFlow's own route
(`bitflow_frontend/app/api/ai/chat/route.ts`) stays the gatekeeper: sign-in, guardian permission for under-18s, rate
limits and the site-wide daily cap all run there first. Only then does it call this service.

```
student → /api/ai/chat → (checks) → POST {AGENT_URL}/chat  ──►  this agent (Cloud Run, us-east4)
                                         Bearer: 2-minute ES256 token                 │ tools (read-only, same token)
                                         {system_prompt, messages}                    ▼
                                                                  POST {BITFLOW_URL}/api/ai/tools/<tool>
```

- **Prompt**: BitFlow sends its tutor rules with every request (`lib/ai-prompts.ts` stays the single source of truth).
- **Tools** (`app/agent.py`): `get_problem`, `get_last_result`, `get_hint_status`, `get_hint(tier)`. They call back to BitFlow with
  the request's token; BitFlow's tool route only returns allow-listed fields and only hint tiers the student unlocked.
  The agent never sees hidden tests, the reference solution, mutants or the editorial.
- **Auth** (`app/fast_api_app.py`): the service verifies the ES256 token (public key in `AGENT_JWT_PUBLIC_KEY`, audience
  `bitflow-tutor`, issuer `bitflow-frontend`) before running anything. No web UI, no docs, no other routes.
- **Cost guards**: at most 6 model calls per request, 2048 output tokens, per-request throwaway session, and Cloud Run
  `--max-instances`. If this service is slow or down, BitFlow falls back to the plain Gemini provider after 25 s.
- **Privacy**: do not log prompts or student code. Keep Cloud Run request logging to metadata only.

## Run the tests (no Google credentials needed)

```bash
uv run pytest tests/unit
```

## Evals (needs a Gemini key or Google auth)

`tests/eval/datasets/basic-dataset.json` has 25 tutor scenarios (asks for the answer, prompt injection in code and test
output, hidden-test requests, off-topic, frustrated student, real Verilog mistakes). The judge rubric is in
`tests/eval/response_quality.py`; the threshold (mean ≥ 4/5) is in `tests/eval/eval_config.yaml`.

```bash
export GEMINI_API_KEY=...            # your own shell; never paste it in chat or commit it
export AGENTS_CLI_TELEMETRY=0
agents-cli eval run                  # agents-cli 1.13.0 (pinned in agents-cli-manifest.yaml)
```

Evals run without BitFlow's real prompt or tools (no token), so they test the fallback prompt's hint-only behaviour. The
final check is a preview deploy on Vercel with a real signed-in test student.

## Deploy (needs the owner's Google sign-in)

See `gcp/README.md` at the repo root. In short: `gcloud auth login`, then `agents-cli deploy` to Cloud Run in `us-east4` with
`--min-instances=0 --max-instances=2`, set `AGENT_JWT_PUBLIC_KEY` and `BITFLOW_URL` as service env vars, then on Vercel
**preview first**: `BITFLOW_AI_PROVIDER=agent`, `AGENT_URL`, `AGENT_JWT_PRIVATE_KEY` (sensitive). Keep `GEMINI_API_KEY` for
the fallback. Tear down before 26 Jan 2027 (trial credits end 2 Feb 2027).
