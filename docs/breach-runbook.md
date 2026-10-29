# Personal-data breach runbook (DPDP Act 2023, DPDP Rules 2025)

A personal-data breach is any unauthorised access, sharing, change, loss or destruction of
users' personal data: for example a leaked database URL or secret, someone reading the
database or a backup, or an admin account taken over.

The DPDP Rules give **72 hours** from becoming aware of it to send the detailed report to
the Data Protection Board. Affected users must be told **without delay**.

## 1. Contain (first hour)
- **Rotate every secret that might be exposed.** Generate each new value and paste it
  straight into the dashboards; never into chat, issues or commits.
  - In Vercel: `DATABASE_URL`/`DIRECT_URL` (reset the Neon role password first), `JWT_SECRET` or the ES256 keys, `BOT_CHECK_SECRET`, `ADMIN_SECRET`, `CRON_SECRET`, and the AI provider key.
  - In Render: the API's `JWT_SECRET` / `JWT_PUBLIC_KEY`.
  - In GitHub secrets: `CRON_SECRET`, `NEON_BACKUP_URL`, `BACKUP_PASSPHRASE`.
- **Sign everyone out:** delete all sessions with `DELETE FROM "Session";` in the Neon SQL editor.
- **If an admin account was used:** check `/admin` → System, and the `AuditLog` table for `admin.*` actions.
- **Write down when you became aware.** The 72 hours count from then.

## 2. Find out (hours 1–24)
- What data, whose, how many accounts, and when it started and ended.
- Sources:
  - Vercel and Render logs
  - Neon's query history
  - `AuditLog` and `ErrorLog` (kept one year)
  - GitHub's security log

## 3. Tell users (as soon as the facts are known)
Accounts have no email address, so tell users in the app:
- **Publish a notice:** `/admin` → System → **Site notice** → Publish. It shows to every visitor until they dismiss it. Say:
  - what happened and when
  - what personal data was involved
  - what we have done
  - what users should do (for example, change a password they reuse elsewhere)
  - how to reach the Grievance Officer: `/contact`, "My personal data"
- **Signing in again:** after the sessions are deleted, everyone has to sign in again, so they will see it.
- **Keep the notice up** until the investigation is closed.

## 4. Tell the Data Protection Board
- **First, without delay:** a short intimation describing the breach, its nature, extent, timing, location and likely impact.
- **Within 72 hours,** a detailed report covering:
  - the facts and how it happened
  - the steps taken to stop it and reduce harm
  - the findings about who caused it, if known
  - what was done to prevent it happening again
  - how and when users were told
- **How to file:** use the Board's online process at the time (check the official DPDP / MeitY site).

## 5. Afterwards
- Record in `AuditLog`, or this repository's security notes, what happened and what changed.
- Fix the root cause and add a check for it: CI, a `check-*` script or a test.
- Take down the site notice: `/admin` → System → Take down.
