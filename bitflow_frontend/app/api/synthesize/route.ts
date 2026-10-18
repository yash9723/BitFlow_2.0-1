/**
 * POST /api/synthesize — Yosys synthesis of a design, with diagrams.
 *
 * Body: { designCode: string }
 * Proxies to the backend's POST /synthesize, then draws the schematic and
 * FSM diagrams here (lib/hardware-diagrams.ts) so the browser gets ready SVG.
 * Open to guests like /api/simulate, and rate-limited the same way.
 */

import { NextResponse } from "next/server";
import { synthesizeOnBackend } from "@/lib/backend";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth-utils";
import { fsmSvg, schematicSvg, type FsmInfo } from "@/lib/hardware-diagrams";

export const dynamic = "force-dynamic";

const MAX_SOURCE_CHARS = 512 * 1024;

export async function POST(request: Request) {
  const user = await getSessionUser();
  const { success } = rateLimit(request, {
    limit: 15, anonymousLimit: 60, windowMs: 60_000, prefix: "synth",
    key: user ? `user:${user.id}` : undefined,
  });
  if (!success) {
    return NextResponse.json({ error: "Too many synthesis requests. Please wait a moment." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const designCode = body?.designCode;
  if (typeof designCode !== "string" || !designCode.trim()) {
    return NextResponse.json({ error: "designCode is required." }, { status: 400 });
  }
  if (designCode.length > MAX_SOURCE_CHARS) {
    return NextResponse.json({ error: "Source exceeds 512 KB." }, { status: 413 });
  }

  let status: number, data: any;
  try {
    ({ status, data } = await synthesizeOnBackend(designCode));
  } catch (err) {
    console.error("[synthesize] backend unreachable:", err);
    return NextResponse.json({ error: "Synthesis backend unavailable." }, { status: 502 });
  }
  if (status !== 200) {
    return NextResponse.json({ error: data?.detail || data?.error || "Synthesis failed." }, { status });
  }
  if (!data?.ok) {
    return NextResponse.json({ ok: false, error: data?.error || "Synthesis failed." });
  }

  // A drawing that fails to lay out shouldn't hide the numbers.
  const draw = (f: () => Promise<string | null>) => f().catch((err) => {
    console.warn("[synthesize] diagram failed:", err);
    return null;
  });
  const { netlist, fsms, ...rest } = data as { netlist: any; fsms: FsmInfo[] };
  const [schematic, fsmDrawings] = await Promise.all([
    netlist ? draw(() => schematicSvg(netlist)) : Promise.resolve(null),
    Promise.all(fsms.map((f) => draw(() => fsmSvg(f)))),
  ]);

  return NextResponse.json({
    ...rest,
    schematicSvg:   schematic,
    schematicLimit: netlist ? null : "This design is too large to draw as a schematic.",
    fsms:           fsms.map((f, i) => ({ ...f, svg: fsmDrawings[i] })),
  });
}
