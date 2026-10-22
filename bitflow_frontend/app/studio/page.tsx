/** app/studio/page.tsx — Design Studio hub: draw a design, get Verilog and a testbench. Public. */

import Link from "next/link";
import StudioShell from "@/components/studio/StudioShell";
import { STUDIO_TOOLS } from "@/lib/studio/tools";

export const metadata = {
  title: "Design Studio",
  description: "Visual digital-design tools: state machines, timing diagrams, truth tables and K-maps that turn into Verilog with a self-checking testbench, ready to run in the BitFlow Sandbox.",
};

export default function StudioPage() {
  return (
    <StudioShell>
      <h1 className="font-display text-2xl font-bold">Design Studio</h1>
      <p className="mt-1 text-[13px] text-ghost max-w-2xl">
        Design visually, then get real Verilog and a testbench that checks it. Everything runs in your browser;
        open the result in the Sandbox to simulate it.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STUDIO_TOOLS.map((t) => (
          <Link key={t.href} href={t.href}
                className="group block p-5 rounded-xl border border-rim/60 bg-surface/40 hover:border-phosphor/50 hover:bg-surface/70 transition-colors">
            <div className="text-2xl text-phosphor/80">{t.icon}</div>
            <h2 className="mt-2 font-display text-[15px] font-semibold text-bright group-hover:text-phosphor">{t.title}</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-ghost">{t.blurb}</p>
          </Link>
        ))}
      </div>
    </StudioShell>
  );
}
