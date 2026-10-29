/**
 * lib/error-log.ts — record server and browser errors for the admin page
 * (ErrorLog table, kept a year: lib/privacy.ts LOG_RETENTION_DAYS). Use instead of console.error in API routes:
 *
 *   } catch (err) {
 *     await reportError("[submit] grading failed", err);
 *
 * It still prints to the server log. Only where it happened, the message and
 * the stack are stored — never request bodies. Never throws.
 */

import { prisma } from "@/lib/prisma";
import { LOG_RETENTION_DAYS } from "@/lib/privacy";

const KEEP_MS = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function describe(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === "string") return err;
  if (err == null) return fallback;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export async function reportError(
  location: string,
  err?: unknown,
  opts: { source?: "server" | "client"; stack?: string } = {},
): Promise<void> {
  if ((opts.source ?? "server") === "server") console.error(location, err ?? "");
  try {
    await prisma.errorLog.create({
      data: {
        source:   opts.source ?? "server",
        location: location.slice(0, 200),
        message:  describe(err, location).slice(0, 1000),
        stack:    (opts.stack ?? (err instanceof Error ? err.stack : undefined))?.slice(0, 4000) ?? null,
      },
    });
    if (Math.random() < 0.02) {
      // Retention (DPDP Rules: processing logs at least a year): errors, the audit trail,
      // and contact messages a year after they were resolved.
      const cutoff = new Date(Date.now() - KEEP_MS);
      await Promise.all([
        prisma.errorLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
        prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
        prisma.contactMessage.deleteMany({ where: { resolvedAt: { lt: cutoff } } }),
      ]);
    }
  } catch {
    // The log itself must never break the request (e.g. database down).
  }
}
