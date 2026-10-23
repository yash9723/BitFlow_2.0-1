import { GATED } from "@/lib/site";
import AuthGate from "@/components/AuthGate";

export const metadata = {
  ...GATED,
  title: "Academy",
  description: "Short, practical Verilog lessons: from wires and gates to FSMs, pipelines and verification, each with runnable examples.",
};

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
