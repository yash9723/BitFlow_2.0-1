/** app/studio/circuit/page.tsx — circuit editor (components/studio/CircuitTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { CircuitTool } from "@/components/studio/loaders";

export const metadata = {
  title: "Circuit editor",
  description: "Build circuits from gates, flip-flops, switches and LEDs, watch them run live, and export Verilog with a self-checking testbench.",
  alternates: { canonical: "/studio/circuit" },
};

export default function CircuitPage() {
  return (
    <StudioShell title="Circuit editor" path="/studio/circuit">
      <CircuitTool />
    </StudioShell>
  );
}
