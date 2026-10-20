/**
 * POST /api/formal — formal verification of a design's properties (Yosys + Z3).
 *
 * Body: { designCode, harnessCode?, mode?: "bmc" | "prove" | "cover", depth?: 1..40, language?: "verilog" | "vhdl" }
 * The properties (assert/assume/cover) live in the design under `ifdef FORMAL, or in
 * harnessCode: a top module that instantiates the design. A VHDL design is checked
 * through its GHDL Verilog netlist, so a Verilog harness works for it too.
 * Returns the backend result: status, failing assertion, covers and a counterexample VCD.
 * Open to guests like /api/synthesize, and rate-limited the same way.
 */

import { NextResponse } from "next/server";
import { designAsVerilog, formalOnBackend, type FormalMode } from "@/lib/backend";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

const MAX_SOURCE_CHARS = 512 * 1024;
const MODES: FormalMode[] = ["bmc", "prove", "cover"];

export async function POST(request: Request) {
  const user = await getSessionUser();
  const { success } = await rateLimit(request, {
    limit: 15, anonymousLimit: 60, windowMs: 60_000, prefix: "formal",
    key: user ? `user:${user.id}` : undefined,
  });
  if (!success) {
    return NextResponse.json({ error: "Too many proof requests. Please wait a moment." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const { designCode, harnessCode } = body ?? {};
  const mode: FormalMode = MODES.includes(body?.mode) ? body.mode : "bmc";
  const depth = Number.isInteger(body?.depth) ? Math.min(40, Math.max(1, body.depth)) : 20;
  if (typeof designCode !== "string" || !designCode.trim()) {
    return NextResponse.json({ error: "designCode is required." }, { status: 400 });
  }
  if (harnessCode != null && typeof harnessCode !== "string") {
    return NextResponse.json({ error: "harnessCode must be a string." }, { status: 400 });
  }
  if (designCode.length > MAX_SOURCE_CHARS || (harnessCode?.length ?? 0) > MAX_SOURCE_CHARS) {
    return NextResponse.json({ error: "Source exceeds 512 KB." }, { status: 413 });
  }

  try {
    const converted = await designAsVerilog(designCode, body.language);
    if ("error" in converted) return NextResponse.json({ status: "error", error: converted.error });
    const { status, data } = await formalOnBackend(converted.verilog, harnessCode?.trim() ? harnessCode : null, mode, depth);
    if (status !== 200) {
      return NextResponse.json({ error: data?.detail || data?.error || "Formal check failed." }, { status });
    }
    return NextResponse.json(data);
  } catch (err) {
    await reportError("[formal] backend unreachable:", err);
    return NextResponse.json({ error: "Formal verification backend unavailable." }, { status: 502 });
  }
}
