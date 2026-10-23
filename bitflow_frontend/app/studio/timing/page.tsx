/** app/studio/timing/page.tsx — timing-diagram designer (components/studio/TimingTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { TimingTool } from "@/components/studio/loaders";

export const metadata = {
  title: "Timing diagram",
  description: "Draw timing diagrams cycle by cycle, export SVG, PNG or WaveJSON, and turn them into a testbench for your Verilog design.",
  alternates: { canonical: "/studio/timing" },
};

export default function TimingPage() {
  return (
    <StudioShell title="Timing diagram" path="/studio/timing">
      <TimingTool />
    </StudioShell>
  );
}
