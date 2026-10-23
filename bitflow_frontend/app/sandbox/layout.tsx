import { GATED } from "@/lib/site";
// Metadata only: the page is a client component.
export const metadata = {
  ...GATED,
  title: "Sandbox IDE",
  description: "A Verilog IDE in your browser: edit, simulate with Icarus Verilog, view waveforms, synthesize with Yosys and run designs on a virtual board.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
