"use client";
/**
 * components/AnalyticsAdmin.tsx — admin page section: page views for the last
 * 30 days (GET /api/admin/analytics), top pages and referring sites.
 */

import { useEffect, useState } from "react";

type Report = {
  total: number;
  perDay: { day: string; views: number }[];
  pages: { path: string; views: number }[];
  referrers: { host: string; views: number }[];
};

function Table({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider text-ghost mb-2">{title}</h3>
      {rows.length === 0 ? <p className="text-[12px] text-dim">None yet.</p> : (
        <table className="w-full text-[12px] font-mono">
          <tbody>
            {rows.map(([label, n]) => (
              <tr key={label} className="border-t border-rim/40">
                <td className="py-1 pr-2 text-pale truncate max-w-[16rem]">{label}</td>
                <td className="py-1 text-right text-bright">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function AnalyticsAdmin() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics?days=30")
      .then(async (r) => (r.ok ? setReport(await r.json()) : setError((await r.json()).error ?? "Couldn't load analytics.")))
      .catch(() => setError("Couldn't load analytics."));
  }, []);

  const max = Math.max(1, ...(report?.perDay.map((d) => d.views) ?? []));

  return (
    <div>
      <h2 className="text-[15px] font-bold text-info mb-1">Analytics</h2>
      <p className="text-[12px] text-ghost mb-4">
        Cookieless page views, last 30 days{report ? `: ${report.total} total` : ""}. Visitors with Do Not Track or GPC aren&apos;t counted.
      </p>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      {report && (
        <div className="space-y-6">
          <div className="flex items-end gap-1 h-24" aria-label="Views per day">
            {report.perDay.map((d) => (
              <div key={d.day} title={`${d.day}: ${d.views}`} className="flex-1 min-w-[4px] bg-phosphor/60 rounded-t"
                   style={{ height: `${(d.views / max) * 100}%` }} />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Table title="Top pages" rows={report.pages.map((p) => [p.path, p.views])} />
            <Table title="Referring sites" rows={report.referrers.map((r) => [r.host, r.views])} />
          </div>
        </div>
      )}
    </div>
  );
}
