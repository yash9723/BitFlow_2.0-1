/**
 * POST /api/asic — the design as a chip on SkyWater's 130 nm process (Yosys + OpenSTA).
 *
 * Body: { designCode, testbenchCode?, periodNs?: 0.5..1000, clock?, language?: "verilog" | "vhdl" }
 * Returns area, cells, setup/hold timing with the critical path, Fmax and power. With a
 * Verilog testbench it also runs it on the gate netlist (gate-level simulation) and takes the
 * power estimate's input activity from the RTL run. A VHDL design goes through its GHDL netlist.
 * Open to guests like /api/synthesize; rate-limited harder, since each run is a full flow.
 */

import { NextResponse } from "next/server";
import { asicOnBackend, designAsVerilog } from "@/lib/backend";
import { rateLimit } from "@/lib/rate-limit";
import { heavyBudget } from "@/lib/heavy-limit";
import { getSessionUser, signInRequired } from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

const MAX_SOURCE_CHARS = 512 * 1024;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return signInRequired();
  const { success } = await rateLimit(request, {
    limit: 10, anonymousLimit: 20, windowMs: 60_000, prefix: "asic",
    key: user ? `user:${user.id}` : undefined,
  });
  if (!success) {
    return NextResponse.json({ error: "Too many ASIC runs. Please wait a moment." }, { status: 429 });
  }
  const busy = await heavyBudget(request, user.id);
  if (busy) return busy;

  const body = await request.json().catch(() => ({}));
  const { designCode, testbenchCode } = body ?? {};
  if (typeof designCode !== "string" || !designCode.trim()) {
    return NextResponse.json({ error: "designCode is required." }, { status: 400 });
  }
  if (testbenchCode != null && typeof testbenchCode !== "string") {
    return NextResponse.json({ error: "testbenchCode must be a string." }, { status: 400 });
  }
  if (designCode.length > MAX_SOURCE_CHARS || (testbenchCode?.length ?? 0) > MAX_SOURCE_CHARS) {
    return NextResponse.json({ error: "Source exceeds 512 KB." }, { status: 413 });
  }
  const period = Number(body.periodNs);
  const periodNs = Number.isFinite(period) ? Math.min(1000, Math.max(0.5, period)) : 10;
  const clock = typeof body.clock === "string" && /^[A-Za-z_]\w{0,63}$/.test(body.clock) ? body.clock : null;

  try {
    const converted = await designAsVerilog(designCode, body.language);
    if ("error" in converted) return NextResponse.json({ ok: false, error: converted.error });
    const { status, data } = await asicOnBackend({
      design_v: converted.verilog, testbench_v: testbenchCode?.trim() ? testbenchCode : null, period_ns: periodNs, clock,
    });
    if (status !== 200) {
      return NextResponse.json({ error: data?.detail || data?.error || "ASIC analysis failed." }, { status });
    }
    return NextResponse.json(data);
  } catch (err) {
    await reportError("[asic] backend unreachable:", err);
    return NextResponse.json({ error: "ASIC backend unavailable." }, { status: 502 });
  }
}
