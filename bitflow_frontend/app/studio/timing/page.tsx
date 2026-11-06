/** app/studio/timing/page.tsx — timing-diagram designer (components/studio/TimingTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { TimingTool } from "@/components/studio/loaders";
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta("/studio/timing", "Timing diagram", "Draw timing diagrams cycle by cycle, export SVG, PNG or WaveJSON, and turn them into a testbench for your Verilog design.");

export default function TimingPage() {
  return (
    <StudioShell title="Timing diagram" path="/studio/timing">
      <TimingTool />
    </StudioShell>
  );
}
