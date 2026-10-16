# BitFlow

An HDL learning platform: write, simulate and debug Verilog in the browser,
work through graded problems and Arena challenges, and earn XP.

- **Frontend** — Next.js 14 + Prisma (SQLite by default) in `bitflow_frontend/`
- **Simulation API** — FastAPI + Icarus Verilog (`iverilog` / `vvp`) in `api/`

---

## Quick start (Docker)

```bash
cp .env.example .env
# set JWT_SECRET in .env, e.g. the output of: openssl rand -hex 32
docker compose up -d --build
```

| Service  | URL                     | Notes |
|----------|-------------------------|-------|
| Frontend | http://localhost:3000   | Seeds the problem set on first start |
| API      | http://127.0.0.1:8000   | Requires a JWT; change the host port with `API_PORT` |

Stop with `docker compose down`. The SQLite database lives in the
`bitflow-data` volume.

## Deploy (VPS + Docker Compose)

The supported production setup is one Linux server running the compose stack.
On a fresh Ubuntu/Debian VPS:

```bash
curl -fsSLO https://raw.githubusercontent.com/abhilashjoyealuppalaguptha-netizen/BitFlow_2.0/main/setup_server.sh
bash setup_server.sh your.domain     # omit the domain for plain HTTP on :3000
```

It installs Docker, clones the repo, creates `.env` with fresh secrets (only
the first time), and starts the stack. With a domain it enables the `https`
profile: Caddy obtains a Let's Encrypt certificate (point the domain's DNS at
the server first) and the app is only reachable through it.

Optional profiles:

| Profile | Adds |
|---------|------|
| `https` | Caddy reverse proxy with automatic TLS for `$DOMAIN` |
| `postgres` | A Postgres 16 container; set `DATABASE_URL` as shown in `.env.example` |

Re-running `setup_server.sh` pulls and rebuilds. Schema changes that would
drop data are refused at startup (no `--accept-data-loss`); apply those by hand.

## Configuration

| Variable | Used by | Purpose |
|----------|---------|---------|
| `JWT_SECRET` | API + frontend | **Required.** Shared secret the frontend uses to sign requests to the API. No default. |
| `ADMIN_SECRET` | frontend | Secret needed to self-register as ADMIN. Empty disables admin sign-up. |
| `BACKEND_URL` | frontend | API base URL (compose sets `http://api:8080`). Required in production. |
| `DATABASE_URL` | frontend | Prisma connection string (default `file:/app/data/dev.db`). |
| `API_PORT` | compose | Host port for the API (default 8000, bound to 127.0.0.1). |
| `DOMAIN`, `HTTPS`, `FRONTEND_BIND` | compose / frontend | HTTPS deployment via the `https` profile (set by `setup_server.sh`). |
| `MAX_CONCURRENT_SIMULATIONS` | API | Simulations run in parallel (default 4); the rest queue. |
| `BITFLOW_AI_PROVIDER`, `OPENAI_API_KEY`, … | frontend | AI assistant (signed-in users only, rate-limited). |
| `TIMEOUT_SECONDS`, `MAX_TIMEOUT_SECONDS`, `MAX_SOURCE_BYTES`, `CORS_ORIGINS`, `ENABLE_DOCS` | API | See `api/config.py` and `.env.example`. |

## How it fits together

```
Browser ──► Next.js API routes ──(short-lived JWT)──► FastAPI /simulate ──► iverilog + vvp
              │
              ├─ /api/simulate                 Sandbox runs (rate-limited per IP)
              ├─ /api/problems/[slug]/submit   Server-side grading against hidden tests
              └─ /api/auth/*                   DB-backed sessions (random tokens)
```

- **Grading is server-side.** Hidden testbenches/testcases never leave the
  server; `lib/grading.ts` runs them and `lib/record-submission.ts` records the
  result and awards XP once per problem.
- **Sessions** are random tokens stored in the `Session` table. Passwords are
  hashed with scrypt and a per-user salt (older PBKDF2 hashes are upgraded on
  login).
- **Simulation sandbox** (`api/sandbox.py`): each `iverilog`/`vvp` run is
  executed under `prlimit` (memory, CPU, file size, process count) as an
  unprivileged uid, with a scrubbed environment and size-capped output.
  This stops resource abuse and secret reads, but runs share one uid and the
  container's filesystem; for hostile multi-tenant use, move simulation into a
  gVisor/nsjail runner.

## Development

```bash
# API
pip install -r requirements.txt
JWT_SECRET=dev-secret-at-least-32-characters-long uvicorn api.main:app --reload

# Frontend
cd bitflow_frontend
npm ci
JWT_SECRET=dev-secret-at-least-32-characters-long npm run dev
```

## Tests

```bash
python -m pytest tests -q                        # API (sandbox tests need iverilog)
cd bitflow_frontend && npm run type-check && npm run build
```

CI (`.github/workflows/ci.yml`) runs both on every push and pull request.

## Waveforms

Testbenches that call `$dumpfile("wave.vcd"); $dumpvars(...)` produce a VCD,
returned base64-encoded in the API response and rendered in the waveform
panel. It also opens in GTKWave or Surfer.

## License

MIT
