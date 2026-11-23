"use client";
/**
 * components/LayoutSection.tsx — "Place and route": the design as a real chip layout, from Verilog to GDS
 * (POST /api/layout → layout service, OpenROAD-flow-scripts on SkyWater 130 nm). Inside the ASIC panel,
 * after its pre-layout estimates. Submits once, polls the job every 2 s, then shows the layout pictures
 * OpenROAD drew, the area, timing after routing and DRC count, and a GDS download.
 */
import { useEffect, useRef, useState } from "react";
import { PixelSpinner } from "@/components/pixel/PixelLoader";

interface Results {
  area_um2: number | null; utilization_pct: number | null; wns_ns: number | null; tns_ns: number | null; slack_ns?: number | null;
  cells: number | null; drc_violations: number; core_um: number; seconds: number;
}
interface Job {
  id: string; state: "queued" | "running" | "done" | "failed"; stage: string | null; message: string | null;
  results: Results | null; position?: number | null; files?: string[]; periodNs?: number; clock?: string | null;
}

const STAGES = ["synthesis", "floorplan", "placement", "clock tree", "routing", "finishing"];
const VIEWS: [string, string][] = [
  ["final_all.webp", "Chip"], ["final_placement.webp", "Placement"], ["final_routing.webp", "Routing"],
  ["final_clocks.webp", "Clock tree"], ["final_worst_path.webp", "Worst path"], ["final_congestion.webp", "Congestion"],
];

export default function LayoutSection({ designCode, top, clock, periodNs, language }: {
  designCode: string; top: string; clock: string | null; periodNs: number; language?: "verilog" | "vhdl";
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState("final_all.webp");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const poll = (id: string) => {
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/layout/${id}`).catch(() => null);
      const data = res ? await res.json().catch(() => null) : null;
      if (!res?.ok || !data) { setError(data?.error ?? "Lost touch with the layout service."); return; }
      setJob(data);
      if (data.state === "queued" || data.state === "running") poll(id);
    }, 2000);
  };

  const start = async () => {
    clearTimeout(timer.current);
    setError(null); setJob(null); setView("final_all.webp");
    const res = await fetch("/api/layout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designCode, top, clock: clock ?? "", periodNs, language }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) { setError(data.error ?? "The layout couldn't start."); return; }
    setJob({ id: data.id, state: data.state, stage: null, message: null, results: null });
    poll(data.id);
  };

  const busy = job?.state === "queued" || job?.state === "running";
  const r = job?.results;
  const slack = r ? r.slack_ns ?? r.wns_ns : null;   // wns is 0 whenever timing is met; worst slack is the real margin
  const stageIdx = job?.stage ? STAGES.indexOf(job.stage) : 0;

  return (
    <section aria-label="Place and route" className="space-y-2 rounded-lg border border-rim p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-dim">Place and route · real chip layout</h3>
          <p className="font-mono text-[11px] text-ghost">
            OpenROAD places every cell and routes every wire on SkyWater 130 nm, then checks timing with real wire delays. About a minute.
          </p>
        </div>
        <button onClick={start} disabled={busy}
                className="sig-press shrink-0 px-3 py-1.5 rounded-lg bg-phosphor text-void font-mono text-[11px] font-semibold disabled:opacity-50">
          {busy ? "Laying out…" : job?.state === "done" ? "Run again" : `Lay out ${top}`}
        </button>
      </div>

      {error && <p role="alert" className="font-mono text-[11px] text-danger">{error}</p>}

      {busy && (
        <div role="status" className="space-y-1.5 font-term text-[11px]">
          {job?.state === "queued"
            ? <p className="text-ghost flex items-center gap-2"><PixelSpinner size={10} /> In the queue{job.position ? ` (position ${job.position})` : ""}…</p>
            : <ol className="flex flex-wrap gap-1.5" aria-label="Flow stages">
                {STAGES.map((s, i) => (
                  <li key={s} className={`px-2 py-0.5 rounded border ${i < stageIdx ? "border-phosphor/40 text-phosphor" : i === stageIdx ? "border-info/60 text-info" : "border-rim text-dim"}`}>
                    {i === stageIdx && <PixelSpinner size={8} className="inline-block mr-1 align-middle" />}{s}
                  </li>
                ))}
              </ol>}
        </div>
      )}

      {job?.state === "failed" && <p role="alert" className="font-mono text-[11px] text-danger">{job.message}</p>}

      {job?.state === "done" && r && (
        <div className="space-y-2">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-term text-[11px]">
            <Stat k="Cell area" v={r.area_um2 !== null ? `${r.area_um2} µm²` : "—"} />
            <Stat k="Chip" v={`${r.core_um + 20} × ${r.core_um + 20} µm`} sub={r.utilization_pct !== null ? `${r.utilization_pct}% full` : undefined} />
            <Stat k="Slack after routing" v={slack != null ? `${slack} ns` : "—"}
                  tone={slack != null && slack < 0 ? "text-danger" : "text-phosphor"}
                  sub={slack != null && slack < 0 ? `misses ${job.periodNs ?? periodNs} ns` : `meets ${job.periodNs ?? periodNs} ns`} />
            <Stat k="DRC" v={r.drc_violations === 0 ? "clean" : `${r.drc_violations} violations`} tone={r.drc_violations ? "text-danger" : "text-phosphor"}
                  sub={`${r.seconds} s run`} />
          </dl>
          <div role="tablist" aria-label="Layout views" className="flex flex-wrap gap-1">
            {VIEWS.filter(([f]) => job.files?.includes(f)).map(([f, label]) => (
              <button key={f} role="tab" aria-selected={view === f} onClick={() => setView(f)}
                      className={`px-2 py-0.5 rounded font-mono text-[11px] border ${view === f ? "border-phosphor/50 text-phosphor bg-phosphor/10" : "border-rim text-ghost hover:text-bright"}`}>{label}</button>
            ))}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- a private, already-small image from our own route */}
          <img src={`/api/layout/${job.id}/files/${view}`} alt={`${top}: ${VIEWS.find(([f]) => f === view)?.[1]} view of the layout`}
               className="w-full max-w-xl mx-auto rounded border border-rim bg-black" loading="lazy" />
          {job.files?.includes("6_final.gds") && (
            <a href={`/api/layout/${job.id}/files/6_final.gds`} className="inline-block font-mono text-[11px] text-bright hover:underline">
              Download the GDS (open it in KLayout)
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ k, v, sub, tone = "text-bright" }: { k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded border border-rim bg-void/50 px-2 py-1.5">
      <dt className="text-dim uppercase">{k}</dt>
      <dd className={tone}>{v}</dd>
      {sub && <dd className="text-dim">{sub}</dd>}
    </div>
  );
}
