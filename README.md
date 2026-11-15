# BitFlow

An HDL learning platform: write, simulate and debug Verilog in the browser,
work through graded problems and Arena challenges, and earn XP.

- **Frontend** — Next.js 14 + Prisma (SQLite by default) in `bitflow_frontend/`
- **Simulation API** — FastAPI in `api/`: Icarus Verilog (Verilog / SystemVerilog subset), GHDL (VHDL),
  cocotb (Python testbenches), Yosys + Z3 (synthesis, formal verification), nextpnr-ice40 (place & route),
  Verilator (lint and verification runs), OpenSTA + Sky130 (ASIC area, timing, power)
- **Tutor agent** — an optional AI tutor service in `agents/tutor/`

## Repository layout

| Path | What it holds |
|------|---------------|
| `bitflow_frontend/` | The Next.js app: pages and API routes (`app/`), UI (`components/`), logic (`lib/`), database schema (`prisma/`), checks (`scripts/*.check.ts`), browser tests (`e2e/`) |
| `api/` | The FastAPI simulation API; `api/sandbox.py` runs every tool under resource limits |
| `tests/` | API tests (pytest) |
| `agents/tutor/` | The tutor agent service |
| `docker-compose.yml`, `Dockerfile.api`, `bitflow_frontend/Dockerfile` | The supported deployment: one server running Compose |
| `setup_server.sh`, `aws/`, `gcp/`, `scripts/backup.sh` | Server bootstrap for a VPS, EC2 or GCE, and the database backup job |
| `Dockerfile` | A smaller API image with Icarus Verilog only (simulation, no synthesis or ASIC tools) |
| `docs/` | Operations notes (`breach-runbook.md`) |
| `tools/windows-usb-setup/` | USB driver setup for flashing FPGA boards from Windows |
| `.github/` | CI, uptime and backup workflows, Dependabot |

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
| `backup` | Daily database backup into `./backups` (newest 14 kept) — on by default in `setup_server.sh` |

### Going live checklist

- DNS points at the server and `setup_server.sh your.domain` was used, so the
  `https` profile is on (Caddy redirects HTTP to HTTPS; the app sends HSTS) and
  `.env` has `HTTPS=true`, `TRUST_PROXY=true`, `FRONTEND_BIND=127.0.0.1` and
  `SITE_URL=https://your.domain`.
- Set `CONTACT_EMAIL` in `.env` (shown on the privacy and terms pages), then
  `docker compose --profile https --profile backup up -d --build`.
- Check `https://your.domain/sitemap.xml`, `/robots.txt` and a link preview
  (the image is `/opengraph-image`).
- Page views (cookieless, no consent banner needed) are on the admin page.

Re-running `setup_server.sh` pulls and rebuilds. Schema changes that would
drop data are refused at startup (no `--accept-data-loss`); apply those by hand.

## Backups

The `backup` profile writes one compressed backup a day to `./backups` on the
host (`bitflow-<UTC time>.db.gz` for SQLite, `.sql.gz` for Postgres) and keeps
the newest 14 (`BACKUP_KEEP`). Copy that folder off the server regularly.

Restore SQLite:

```bash
docker compose stop frontend
gunzip -c backups/bitflow-<time>.db.gz > restore.db
docker run --rm -v bitflow_20_bitflow-data:/data -v "$PWD":/r alpine cp /r/restore.db /data/dev.db
docker compose start frontend
```

(The volume is `<project>_bitflow-data`; check with `docker volume ls`.)
Restore Postgres: `gunzip -c backups/bitflow-<time>.sql.gz | docker compose exec -T postgres psql -U bitflow -d bitflow`.

## Moving from SQLite to Postgres

SQLite is fine for a class; move to Postgres when many people use the site at
once. `db:export` / `db:import` copy every table (users, progress, submissions,
classes, contests, reference solutions) and check the row counts.

```bash
# 1. Export (take a backup first)
docker compose exec frontend npm run db:export -- /app/data/bitflow-export.json

# 2. Start Postgres, then point the app at it: in .env set
#      POSTGRES_PASSWORD=<a strong password>
#      DATABASE_URL=postgresql://bitflow:<the same password>@postgres:5432/bitflow
docker compose --profile postgres up -d postgres
docker compose --profile postgres up -d frontend    # creates the tables and seeds the problems

# 3. Import; every table should print "ok"
docker compose exec frontend npm run db:import -- /app/data/bitflow-export.json

# 4. Check the site, then delete the export (it holds password hashes)
docker compose exec frontend rm /app/data/bitflow-export.json
```

Import only runs on a database without users, so it can't overwrite live data.
To go back, remove `DATABASE_URL` from `.env` and restart the frontend: the
SQLite file is left untouched by the move.

## Configuration

| Variable | Used by | Purpose |
|----------|---------|---------|
| `JWT_SECRET` | API + frontend | **Required** (or the key pair below). Shared secret the frontend uses to sign requests to the API. No default. |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | frontend / API | Alternative to `JWT_SECRET` for split hosting: ES256 key pair (PEM, literal `\n` allowed); only the frontend holds a secret. |
| `ADMIN_SECRET` | frontend | Secret needed to self-register as ADMIN. Empty disables admin sign-up. |
| `BACKEND_URL` | frontend | API base URL (compose sets `http://api:8080`). Required in production. |
| `BACKEND_URLS` | frontend | Optional comma-separated list of identical API deployments, e.g. two free Render services. Overrides `BACKEND_URL`; requests start at a random instance and move to the next on a connection error or 502/503. An entry may end in `\|weight` (default 1) to give a stronger host a bigger share of requests. Every instance needs the same `JWT_SECRET` / `JWT_PUBLIC_KEY`. |
| `DATABASE_URL` | frontend | Prisma connection string (default `file:/app/data/dev.db`). |
| `API_PORT` | compose | Host port for the API (default 8000, bound to 127.0.0.1). |
| `DOMAIN`, `HTTPS`, `FRONTEND_BIND` | compose / frontend | HTTPS deployment via the `https` profile (set by `setup_server.sh`). |
| `SITE_URL` | frontend (build + run) | Public origin, e.g. `https://bitflow.example.com`: sitemap, robots.txt, social previews. Rebuild after changing. |
| `CONTACT_EMAIL` | frontend (build + run) | Contact address shown on `/privacy` and `/terms`. Rebuild after changing. |
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
- **Python testbenches** (`api/langs.py`) run learner code, so they get two
  more layers on top of the sandbox: an AST allowlist (imports `cocotb`,
  `random`, `math`, `itertools`; no dunder/private attributes, `open`, `eval`…)
  and a Python audit hook loaded before the test module that blocks sockets,
  process creation, `ctypes`, new code objects and file access outside the
  workspace. Set `COCOTB_ENABLED=false` on the API to turn them off.

## Development

```bash
# API
pip install -r requirements-dev.txt   # runtime + test tools (the image uses requirements.txt)
JWT_SECRET=dev-secret-at-least-32-characters-long uvicorn api.main:app --reload

# Frontend
cd bitflow_frontend
npm ci
JWT_SECRET=dev-secret-at-least-32-characters-long npm run dev
```

## Tests

```bash
# API
ruff check api tests --select F,E9     # unused or undefined names, syntax errors
python -m pytest tests -q              # tests that need a tool (iverilog, yosys, …) skip without it

# Frontend
cd bitflow_frontend
npm run lint                           # ESLint, Next.js core-web-vitals rules
npm run type-check
npm run check                          # every scripts/*.check.ts; `npm run check -- pair wave` runs a subset
npm run build
```

CI (`.github/workflows/ci.yml`) runs all of these on every pull request and on pushes to the
release branches, plus the ASIC flow and the Playwright smoke tests in `bitflow_frontend/e2e/`
against a real API container. A new `scripts/<name>.check.ts` is picked up by `npm run check`
without touching `package.json` or the workflow.

## Waveforms

Testbenches that call `$dumpfile("wave.vcd"); $dumpvars(...)` produce a VCD,
returned base64-encoded in the API response and rendered in the waveform
panel. It also opens in GTKWave or Surfer.

## License

MIT
