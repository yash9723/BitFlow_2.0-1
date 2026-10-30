import { GATED } from "@/lib/site";
import SiteHeader from "@/components/SiteHeader";
import AuthGate from "@/components/AuthGate";

export const metadata = {
  ...GATED,
  title: "Contests",
  description: "Timed Verilog contests: solve a set of problems against the clock and climb the contest leaderboard.",
};

export default function ContestsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="min-h-screen bg-void text-bright">
        <SiteHeader />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
      </div>
    </AuthGate>
  );
}
