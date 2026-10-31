import { GATED } from "@/lib/site";
import SiteHeader from "@/components/SiteHeader";
import AuthGate from "@/components/AuthGate";

export const metadata = {
  ...GATED,
  title: "Interview prep",
  description: "Digital design interview practice: Verilog problems by topic, and a timed 45-minute mock interview with a report.",
};

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="min-h-screen bg-void text-bright">
        <SiteHeader />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
      </div>
    </AuthGate>
  );
}
