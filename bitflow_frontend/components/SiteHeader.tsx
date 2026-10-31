"use client";
/**
 * components/SiteHeader.tsx — the one site-wide navigation.
 *
 * SiteHeader:    the sticky top bar of every regular page: logo, the main sections, search
 *                (Ctrl+K palette), the account menu, and a menu button below lg. `children`
 *                adds page controls on the right (e.g. the Studio share button).
 * NavDrawer:     the full menu as a side drawer, mounted once in the root layout; it opens on
 *                OPEN_NAV (the header's menu button, or NavMenuButton in the IDE toolbars,
 *                which keep their own full-screen bar).
 * NavMenuButton: the ☰ button for those IDE toolbars.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { PaletteButton } from "@/components/CommandPalette";
import AnnouncementBell from "@/components/AnnouncementBell";

export const OPEN_NAV = "bitflow:nav";
const openNav = () => window.dispatchEvent(new Event(OPEN_NAV));

/** The main sections, in order. `wide`: shown in the bar only from xl (always in the drawer). */
export const NAV_LINKS: { href: string; label: string; wide?: boolean }[] = [
  { href: "/learn", label: "Learn" },
  { href: "/problems", label: "Problems" },
  { href: "/arena", label: "Arena" },
  { href: "/lab", label: "Board Lab" },
  { href: "/academy", label: "Academy" },
  { href: "/studio", label: "Studio" },
  { href: "/sandbox", label: "Sandbox" },
  { href: "/interview", label: "Interview", wide: true },
  { href: "/contests", label: "Contests", wide: true },
  { href: "/leaderboard", label: "Leaderboard", wide: true },
];
const MORE_LINKS: { href: string; label: string }[] = [
  { href: "/announcements", label: "Announcements" },
  { href: "/flash", label: "Flash a board" },
  { href: "/academy/roadmap", label: "VLSI roadmap" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

function accountLinks(role?: string) {
  return [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/profile", label: "Profile" },
    { href: "/classes", label: "Classes" },
    ...(role === "ADMIN" ? [{ href: "/admin", label: "Admin" }] : []),
  ];
}

function AccountMenu() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", close); };
  }, [open]);

  if (loading) return <span className="w-16" aria-hidden />;
  if (!user) {
    return (
      <Link href="/login" className="px-3 py-1 rounded-lg border border-phosphor/50 text-phosphor text-[11px] font-bold hover:bg-phosphor/10 transition-colors">
        Sign in
      </Link>
    );
  }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
              className="flex items-center gap-2 px-2 py-1 rounded-lg border border-rim hover:border-muted text-[11px] text-pale">
        <span className="w-5 h-5 rounded-full bg-phosphor/20 text-phosphor flex items-center justify-center font-bold uppercase">{user.username[0]}</span>
        <span className="hidden sm:inline max-w-[9rem] truncate">{user.username}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-44 rounded-lg border border-rim bg-pit shadow-2xl py-1 text-[12px] z-50">
          {accountLinks(user.role).map((l) => (
            <Link key={l.href} role="menuitem" href={l.href} onClick={() => setOpen(false)} className="block px-3 py-1.5 text-pale hover:bg-shaft hover:text-bright">{l.label}</Link>
          ))}
          <button role="menuitem" onClick={() => { setOpen(false); logout(); }} className="block w-full text-left px-3 py-1.5 text-ghost hover:bg-shaft hover:text-bright border-t border-rim mt-1">Sign out</button>
        </div>
      )}
    </div>
  );
}

export default function SiteHeader({ children }: { children?: ReactNode }) {
  const pathname = usePathname() ?? "/";
  return (
    <header className="sticky top-0 z-30 h-14 flex items-center gap-3 px-4 sm:px-6 border-b border-rim/50 bg-void/85 backdrop-blur-md font-mono">
      <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="BitFlow home">
        <Image src="/bitflow_logo_64.png" alt="" width={26} height={26} className="w-[26px] h-[26px] rounded" priority />
        <span className="font-display text-[15px] font-bold text-bright">BitFlow</span>
      </Link>
      <nav aria-label="Main" className="hidden lg:flex items-center gap-0.5 min-w-0 ml-2">
        {NAV_LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={isActive(pathname, l.href) ? "page" : undefined}
                className={`${l.wide ? "hidden xl:inline-block" : ""} px-2.5 py-1 rounded-lg text-[11.5px] whitespace-nowrap transition-colors ${
                  isActive(pathname, l.href) ? "text-phosphor bg-phosphor/10" : "text-ghost hover:text-bright hover:bg-shaft"}`}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-2 shrink-0">
        {children}
        <PaletteButton />
        <AnnouncementBell />
        <AccountMenu />
        <button onClick={openNav} aria-label="Open the menu" className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg border border-rim text-pale hover:text-bright">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" /></svg>
        </button>
      </div>
    </header>
  );
}

/** ☰ for the IDE toolbars (Sandbox, problems, Arena, Lab lessons), which keep their own bar. */
export function NavMenuButton({ className = "" }: { className?: string }) {
  return (
    <button onClick={openNav} aria-label="Open the site menu" title="Menu"
            className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-lg border border-rim text-ghost hover:text-bright hover:border-muted ${className}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" /></svg>
    </button>
  );
}

export function NavDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const { user, logout } = useAuth();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_NAV, show);
    return () => window.removeEventListener(OPEN_NAV, show);
  }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const link = (l: { href: string; label: string }) => (
    <li key={l.href}>
      <Link href={l.href} aria-current={isActive(pathname, l.href) ? "page" : undefined}
            className={`block px-3 py-2 rounded-lg text-[13px] ${isActive(pathname, l.href) ? "text-phosphor bg-phosphor/10" : "text-pale hover:bg-shaft hover:text-bright"}`}>
        {l.label}
      </Link>
    </li>
  );
  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Site menu">
      <button aria-label="Close the menu" tabIndex={-1} className="absolute inset-0 bg-void/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <nav className="absolute right-0 top-0 h-full w-72 max-w-[85vw] bg-pit border-l border-rim p-4 overflow-y-auto font-mono space-y-5">
        <div className="flex items-center justify-between">
          <span className="font-display font-bold text-bright">Menu</span>
          <button ref={closeRef} onClick={() => setOpen(false)} aria-label="Close the menu" className="w-8 h-8 rounded-lg border border-rim text-ghost hover:text-bright">✕</button>
        </div>
        <ul className="space-y-0.5">{NAV_LINKS.map(link)}</ul>
        <div>
          <div className="px-3 text-[10px] uppercase tracking-[0.16em] text-dim mb-1">{user ? user.username : "Account"}</div>
          <ul className="space-y-0.5">
            {user ? accountLinks(user.role).map(link) : link({ href: "/login", label: "Sign in" })}
            {user && <li><button onClick={() => { setOpen(false); logout(); }} className="w-full text-left px-3 py-2 rounded-lg text-[13px] text-ghost hover:bg-shaft hover:text-bright">Sign out</button></li>}
          </ul>
        </div>
        <ul className="space-y-0.5 border-t border-rim pt-3">{MORE_LINKS.map(link)}</ul>
      </nav>
    </div>
  );
}
