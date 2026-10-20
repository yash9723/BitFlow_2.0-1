/** components/admin/ui.tsx — small building blocks shared by the admin console tabs. */
import type { ReactNode } from "react";

export function Card({ title, subtitle, action, children, className = "" }: {
  title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`bg-surface/30 border border-rim/50 rounded-lg p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-rim/40 pb-3 mb-4">
        <div>
          <h2 className="text-[12px] font-bold text-info uppercase tracking-wider">{title}</h2>
          {subtitle && <p className="text-[10px] text-dim mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A frame for the older admin sections that render their own heading. */
export function Panel({ children }: { children: ReactNode }) {
  return <section className="bg-surface/30 border border-rim/50 rounded-lg p-5">{children}</section>;
}

const TONES = {bright: "text-bright", phosphor: "text-phosphor", info: "text-info", warn: "text-warn", danger: "text-danger" };

export function Stat({ label, value, hint, tone = "bright" }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: keyof typeof TONES;
}) {
  return (
    <div className="bg-pit/40 border border-rim/40 rounded-lg p-3 min-w-0">
      <div className="text-[9px] text-dim uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold ${TONES[tone]} truncate`}>{value}</div>
      {hint && <div className="text-[10px] text-dim mt-0.5">{hint}</div>}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return <p className="py-6 text-center text-[10px] text-dim animate-pulse">Loading {what}…</p>;
}

export function Failed({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <p className="py-4 text-[10px] text-danger">
      {message} {retry && <button onClick={retry} className="underline text-info ml-1">Retry</button>}
    </p>
  );
}

/** fetch JSON from an admin API; throws a readable error on failure. */
export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const pct = (x: number | null | undefined) => (x == null ? "–" : `${Math.round(x * 100)}%`);

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
