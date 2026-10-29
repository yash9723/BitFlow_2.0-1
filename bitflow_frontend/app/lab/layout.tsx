/**
 * app/lab/layout.tsx — the Board Lab's frame: header and page width. Public: lessons run in
 * the browser, so guests can use them and search engines can read them.
 */
import Link from "next/link";

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-void text-bright flex flex-col">
      <header className="sticky top-0 z-10 h-14 flex items-center justify-between gap-4 px-5 sm:px-6 bg-void/70 border-b border-rim/50 backdrop-blur-xl">
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/" className="flex items-center gap-2 group">
            <img src="/bitflow_logo_64.png" alt="BitFlow" className="w-6 h-6 object-contain rounded opacity-80 group-hover:opacity-100 transition-opacity" />
            <span className="font-display text-[13px] font-bold text-bright">BitFlow</span>
          </Link>
          <span className="hidden sm:inline text-rim">·</span>
          <Link href="/lab" className="hidden sm:inline font-mono text-[11px] text-ghost hover:text-bright">Board Lab</Link>
        </div>
        <nav className="flex items-center gap-4 sm:gap-5 min-w-0 overflow-x-auto whitespace-nowrap font-mono text-[11px]">
          <Link href="/learn" className="text-ghost hover:text-bright transition-colors">Learning Path</Link>
          <Link href="/sandbox" className="text-ghost hover:text-bright transition-colors">Sandbox</Link>
          <Link href="/flash" className="text-ghost hover:text-bright transition-colors">Flash a board</Link>
        </nav>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  );
}
