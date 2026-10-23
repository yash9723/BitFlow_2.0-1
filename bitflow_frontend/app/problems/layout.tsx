import AuthGate from "@/components/AuthGate";
import { GATED } from "@/lib/site";

export const metadata = GATED;

export default function ProblemsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
