"use client";
/**
 * components/CommandPalette.tsx — Ctrl/⌘+K anywhere: jump to a page, a Studio tool, a
 * problem or an Academy topic by typing a few letters (lib/palette.ts ranks them), or open
 * the keyboard-shortcuts sheet. Mounted once in app/layout.tsx. Problems come from the
 * public list at /api/problems and Academy topics from a lazily loaded chunk, both on first
 * open. Other components open it with window.dispatchEvent(new Event(OPEN_PALETTE)).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type PaletteItem, rank } from "@/lib/palette";
import { STUDIO_TOOLS } from "@/lib/studio/tools";
import { problemHref } from "@/lib/problem-href";

export const OPEN_PALETTE = "bitflow:palette";
const RECENT_KEY = "bitflow_palette_recent";
const SHORTCUTS_ID = "action:shortcuts";

const PAGES: PaletteItem[] = [
  ["/", "Home"], ["/dashboard", "Dashboard"], ["/sandbox", "Sandbox IDE", "editor simulate run code"], ["/learn", "Learn: practice problems"],
  ["/arena", "Arena: challenge problems"], ["/academy", "Academy: lessons"], ["/academy/roadmap", "VLSI roadmap"], ["/studio", "Design Studio"],
  ["/classes", "Classes"], ["/contests", "Contests"], ["/leaderboard", "Leaderboard"], ["/profile", "Profile and settings", "account"],
  ["/about", "About BitFlow", "founders"],
].map(([href, title, keywords]) => ({ id: `page:${href}`, title, group: "Page", href, keywords }));

const STUDIO: PaletteItem[] = STUDIO_TOOLS.map((t) => ({ id: `studio:${t.href}`, title: t.title, group: "Studio", href: t.href, keywords: t.blurb, hint: t.icon }));
const ACTIONS: PaletteItem[] = [{ id: SHORTCUTS_ID, title: "Keyboard shortcuts", group: "Help", keywords: "keys hotkeys help" }];

const SHEET: { where: string; keys: [string, string][] }[] = [
  { where: "Everywhere", keys: [["Ctrl/⌘ + K", "command palette"], ["Esc", "close a dialog"]] },
  { where: "Sandbox and problems", keys: [["Ctrl/⌘ + Enter", "run the simulation"], ["Ctrl/⌘ + /", "comment lines"], ["Ctrl/⌘ + F", "find in the editor"]] },
  { where: "Circuit editor", keys: [["Ctrl + Z / Ctrl + Shift + Z", "undo / redo"], ["Ctrl + C / X / V / D", "copy / cut / paste / duplicate"],
    ["Ctrl + G", "make a block from the selection"], ["Delete", "delete the selection"], ["Arrows", "nudge (Shift: ×5)"], ["Ctrl + wheel", "zoom"],
    ["Space + drag", "pan"], ["?", "all circuit shortcuts"]] },
  { where: "Waveform viewer", keys: [["Wheel / trackpad", "zoom around the pointer"], ["Click", "place marker A"], ["Shift + click", "place marker B (Δt)"]] },
];

function readRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}
function remember(id: string) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 6))); } catch { /* recents are a convenience */ }
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState<PaletteItem[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const fetched = useRef(false);
  const list = useRef<HTMLUListElement>(null);
  const before = useRef<Element | null>(null);

  const show = useCallback(() => {
    before.current = document.activeElement;
    setQuery(""); setActive(0); setSheet(false); setRecent(readRecent()); setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false); setSheet(false);
    (before.current as HTMLElement | null)?.focus?.({ preventScroll: true });
  }, []);

  // Ctrl/⌘+K, in the capture phase so the code editor doesn't swallow it as a chord
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault(); e.stopPropagation();
        if (open) close(); else show();
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener(OPEN_PALETTE, show);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener(OPEN_PALETTE, show); };
  }, [open, show, close]);

  // Problems and lessons, once, the first time it opens
  useEffect(() => {
    if (!open || fetched.current) return;
    fetched.current = true;
    fetch("/api/problems").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const rows: { slug: string; title: string; difficulty: string; category: string; learningLevel: string; tags?: string[] }[] = d?.problems ?? [];
      const items = rows.map((q) => ({
        id: `problem:${q.slug}`, title: q.title, group: q.learningLevel === "Arena" ? "Arena" : "Practice", href: problemHref(q),
        hint: q.difficulty, keywords: `${q.category} ${q.learningLevel} ${(q.tags ?? []).join(" ")}`,
      }));
      setLoaded((l) => [...l.filter((x) => !x.id.startsWith("problem:")), ...items]);
    }).catch(() => { fetched.current = false; });                  // try again next time
    import("@/lib/academy-content").then(({ ACADEMY_TOPIC_META }) => {
      const items = ACADEMY_TOPIC_META.map((t) => ({ id: `academy:${t.slug}`, title: t.title, group: "Academy", href: `/academy/${t.slug}`, hint: t.icon, keywords: t.summary }));
      setLoaded((l) => [...l.filter((x) => !x.id.startsWith("academy:")), ...items]);
    }).catch(() => {});
  }, [open]);

  const all = useMemo(() => [...PAGES, ...STUDIO, ...ACTIONS, ...loaded], [loaded]);
  const results = useMemo(() => {
    if (query.trim()) return rank(all, query, 40);
    const byId = new Map(all.map((i) => [i.id, i]));
    const recents = recent.map((id) => byId.get(id)).filter((i): i is PaletteItem => !!i).map((i) => ({ ...i, group: `Recent · ${i.group}` }));
    return [...recents, ...[...PAGES, ...STUDIO, ...ACTIONS].filter((i) => !recent.includes(i.id))];
  }, [all, query, recent]);
  const problemCount = loaded.filter((x) => x.id.startsWith("problem:")).length;

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    remember(item.id);
    if (item.id === SHORTCUTS_ID) { setSheet(true); return; }
    close();
    if (item.href) router.push(item.href);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); if (sheet) setSheet(false); else close(); }
    else if (sheet) return;
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 backdrop-blur-sm px-4 pt-[12vh]" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label={sheet ? "Keyboard shortcuts" : "Command palette"} onKeyDown={onKeyDown}
           onMouseDown={(e) => e.stopPropagation()}
           className="w-full max-w-xl rounded-xl border border-rim bg-pit shadow-2xl overflow-hidden font-mono">
        {sheet ? (
          <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto outline-none" tabIndex={-1} ref={(el) => el?.focus()}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] uppercase tracking-wider text-pale">Keyboard shortcuts</span>
              <button onClick={() => setSheet(false)} className="text-[11px] text-dim hover:text-bright">← back</button>
            </div>
            {SHEET.map((g) => (
              <div key={g.where}>
                <div className="text-[10px] uppercase tracking-wider text-dim mb-1">{g.where}</div>
                <table className="w-full text-[12px]"><tbody>
                  {g.keys.map(([k, v]) => (
                    <tr key={k}><td className="py-0.5 pr-4 text-info whitespace-nowrap align-top w-1/2">{k}</td><td className="py-0.5 text-ghost">{v}</td></tr>
                  ))}
                </tbody></table>
              </div>
            ))}
          </div>
        ) : (
          <>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Go to a page, tool, problem or lesson…"
                   role="combobox" aria-expanded="true" aria-controls="palette-list" aria-label="Search"
                   aria-activedescendant={results[active] ? `palette-${active}` : undefined}
                   className="w-full bg-transparent border-b border-rim/70 px-4 py-3 text-[14px] text-bright placeholder:text-dim outline-none" />
            <ul id="palette-list" ref={list} role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
              {results.map((item, i) => (
                <li key={`${item.id}${i}`} id={`palette-${i}`} data-i={i} role="option" aria-selected={i === active}
                    onMouseMove={() => setActive(i)} onClick={() => choose(item)}
                    className={`flex items-center gap-3 px-4 py-2 cursor-pointer text-[13px] ${i === active ? "bg-phosphor/10 text-bright" : "text-ghost"}`}>
                  <span className="w-5 text-center text-dim">{item.hint && item.hint.length <= 2 ? item.hint : "›"}</span>
                  <span className="flex-1 truncate">{item.title}</span>
                  {item.hint && item.hint.length > 2 && <span className="text-[10px] text-dim">{item.hint}</span>}
                  <span className="text-[10px] uppercase tracking-wider text-dim whitespace-nowrap">{item.group}</span>
                </li>
              ))}
              {!results.length && <li className="px-4 py-6 text-center text-[12px] text-dim">Nothing matches “{query}”.</li>}
            </ul>
            <div className="flex gap-4 border-t border-rim/70 px-4 py-2 text-[10px] text-dim">
              <span>↑↓ move</span><span>Enter open</span><span>Esc close</span>
              <span className="ml-auto">{problemCount ? `${problemCount} problems` : "loading problems…"}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** A search button that opens the palette (for nav bars). */
export function PaletteButton({ className = "" }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE))} title="Search pages, tools and problems (Ctrl+K)"
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border border-rim/60 font-mono text-[11px] text-dim hover:text-bright hover:border-rim ${className}`}>
      <span aria-hidden>⌕</span><span className="hidden md:inline">Search</span>
      <kbd className="hidden md:inline text-[9px] px-1 rounded border border-rim/60 text-dim">Ctrl K</kbd>
    </button>
  );
}
