/**
 * POST /api/layout — place and route a design into a chip layout (RTL to GDS) on the layout service
 * (lib/layout.ts, layout/app.py: OpenROAD-flow-scripts on SkyWater 130 nm).
 *
 * Body: { designCode, top, clock?: string | "" (no clock), periodNs?: 1..1000, language?: "verilog" | "vhdl" }
 * Returns { id, state, cached } at once; poll GET /api/layout/<id>. Signed-in learners only, one job at a time
 * (the service enforces that per learner), and rate-limited like /api/asic.
 */
import { NextResponse } from "next/server";
import { designAsVerilog } from "@/lib/backend";
import { layoutConfigured, layoutFetch } from "@/lib/layout";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser, signInRequired } from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

const MAX_SOURCE_CHARS = 100_000;   // the service's limit (layout/flow.py MAX_VERILOG_BYTES)
const IDENT = /^[A-Za-z_]\w{0,63}$/;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return signInRequired();
  if (!layoutConfigured()) return NextResponse.json({ error: "Chip layout isn't available yet." }, { status: 503 });
  const { success } = await rateLimit(request, { limit: 6, windowMs: 10 * 60_000, prefix: "layout", key: `user:${user.id}` });
  if (!success) return NextResponse.json({ error: "Too many layouts. Please wait a few minutes." }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const { designCode, top } = body ?? {};
  if (typeof designCode !== "string" || !designCode.trim()) return NextResponse.json({ error: "designCode is required." }, { status: 400 });
  if (designCode.length > MAX_SOURCE_CHARS) return NextResponse.json({ error: "The design is over 100 KB." }, { status: 413 });
  if (typeof top !== "string" || !IDENT.test(top)) return NextResponse.json({ error: "top must be a module name." }, { status: 400 });
  const clock = body.clock === "" ? "" : typeof body.clock === "string" && IDENT.test(body.clock) ? body.clock : undefined;
  const period = Number(body.periodNs);
  const periodNs = Number.isFinite(period) ? Math.min(1000, Math.max(1, period)) : 10;

  try {
    const converted = await designAsVerilog(designCode, body.language);
    if ("error" in converted) return NextResponse.json({ error: converted.error }, { status: 422 });
    const res = await layoutFetch("/jobs", user.id, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verilog: converted.verilog, top, clock, period_ns: periodNs, platform: "sky130hd" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const problems = data?.detail?.problems;
      return NextResponse.json({ error: Array.isArray(problems) ? problems.join(" ") : data?.detail || "The layout couldn't start." }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (err) {
    await reportError("[layout] service unreachable:", err);
    return NextResponse.json({ error: "The layout service didn't answer. Try again in a minute." }, { status: 502 });
  }
}
