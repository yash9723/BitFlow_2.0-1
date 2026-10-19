import Link from "next/link";
import AuthGate from "@/components/AuthGate";

export const metadata = {
  title: "Contests",
  description: "Timed Verilog contests: solve a set of problems against the clock and climb the contest leaderboard.",
};

export default function ContestsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="min-h-screen bg-void text-bright">
        <header className="sticky top-0 z-10 h-14 flex items-center justify-between px-4 sm:px-6 border-b border-rim/50 bg-void/80 backdrop-blur-md">
          <Link href="/" className="font-display font-bold text-lg hover:text-phosphor transition-colors">BitFlow</Link>
          <nav className="flex items-center gap-4 sm:gap-6 text-[12px] text-ghost">
            <Link href="/dashboard" className="hidden sm:inline hover:text-bright transition-colors">Dashboard</Link>
            <Link href="/learn" className="hover:text-bright transition-colors">Learning</Link>
            <Link href="/arena" className="hover:text-bright transition-colors">Arena</Link>
            <Link href="/contests" className="text-phosphor">Contests</Link>
          </nav>
        </header>
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
      </div>
    </AuthGate>
  );
}
