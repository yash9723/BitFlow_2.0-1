// Metadata only: the page is a client component.
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta("/about", "About",
  "Who builds BitFlow and why: browser-based Verilog simulation, synthesis and practice for students and engineers.");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
