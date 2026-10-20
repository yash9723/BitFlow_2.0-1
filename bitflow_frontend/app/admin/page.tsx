"use client";
/**
 * app/admin/page.tsx — the admin console: one tab at a time, so only that tab's data loads.
 * The admin check happens server-side in app/admin/layout.tsx; every API it calls checks again.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "../../hooks/useAuth";
import { Card, Loading, Panel } from "@/components/admin/ui";

const loading = () => <Loading what="tab" />;
const AdminOverview = dynamic(() => import("@/components/admin/AdminOverview"), { loading });
const AdminProblems = dynamic(() => import("@/components/admin/AdminProblems"), { loading });
const AdminUsers    = dynamic(() => import("@/components/admin/AdminUsers"), { loading });
const AdminSystem   = dynamic(() => import("@/components/admin/AdminSystem"), { loading });
const ContestsAdmin  = dynamic(() => import("@/components/ContestsAdmin"), { loading });
const AnalyticsAdmin = dynamic(() => import("@/components/AnalyticsAdmin"), { loading });

const EXPORTS = [
  { label: "Submissions JSONL", href: "/api/admin/export?dataset=submissions&format=jsonl" },
  { label: "Submissions JSON", href: "/api/admin/export?dataset=submissions&format=json" },
  { label: "Everything (JSON)", href: "/api/admin/export?dataset=all&format=json" },
  { label: "JSONL with waveforms", href: "/api/admin/export?dataset=submissions&format=jsonl&includeWaveforms=true" },
];

function Analytics() {
  return (
    <div className="space-y-6">
      <Panel><AnalyticsAdmin /></Panel>
      <Card title="Data exports" subtitle="Admin-only downloads for analysis or model training. Passwords are never exported.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {EXPORTS.map((e) => (
            <a key={e.href} href={e.href} download
               className="text-center rounded border border-rim/60 bg-pit/30 px-3 py-2 text-[10px] text-ghost hover:text-info hover:border-info/50">{e.label}</a>
          ))}
        </div>
      </Card>
    </div>
  );
}

const TABS = {
  overview: { label: "Overview", render: () => <AdminOverview /> },
  problems: { label: "Problems", render: () => <AdminProblems /> },
  users:    { label: "Users", render: () => <AdminUsers /> },
  contests: { label: "Contests", render: () => <Panel><ContestsAdmin /></Panel> },
  analytics:{ label: "Analytics", render: () => <Analytics /> },
  system:   { label: "System", render: () => <AdminSystem /> },
};
type Tab = keyof typeof TABS;
const isTab = (s: string): s is Tab => s in TABS;

export default function AdminConsole() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  // The URL hash keeps the tab across reloads and makes tabs linkable (/admin#users).
  useEffect(() => {
    const sync = () => { const h = window.location.hash.slice(1); if (isTab(h)) setTab(h); };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <div className="min-h-screen bg-void text-bright font-mono flex flex-col">
      <header className="sticky top-0 z-20 bg-surface/90 border-b border-rim backdrop-blur-sm">
        <div className="h-12 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-display text-[13px] font-bold text-bright">BitFlow</Link>
            <span className="text-rim">·</span>
            <span className="text-[11px] text-info uppercase tracking-widest bg-info/10 border border-info/20 px-2 py-0.5 rounded">Admin</span>
          </div>
          <div className="flex items-center gap-4">
            {user && <span className="text-[10px] text-ghost">Signed in as <strong className="text-info">{user.username}</strong></span>}
            <Link href="/dashboard" className="text-[10px] text-dim hover:text-ghost border border-rim/60 hover:border-rim px-2 py-1 rounded">Exit</Link>
          </div>
        </div>
        <nav className="flex gap-1 px-6 overflow-x-auto" role="tablist" aria-label="Admin sections">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <a key={t} href={`#${t}`} role="tab" aria-selected={tab === t}
               className={`px-3 py-2 text-[11px] border-b-2 whitespace-nowrap ${tab === t ? "border-info text-info" : "border-transparent text-dim hover:text-ghost"}`}>
              {TABS[t].label}
            </a>
          ))}
        </nav>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">{TABS[tab].render()}</main>
    </div>
  );
}
