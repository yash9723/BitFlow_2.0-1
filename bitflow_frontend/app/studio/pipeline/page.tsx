/** app/studio/pipeline/page.tsx — CPU pipeline animator (components/studio/PipelineTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { PipelineTool } from "@/components/studio/loaders";
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta("/studio/pipeline", "CPU pipeline animator", "Step a 5-stage RISC-V pipeline cycle by cycle: forwarding, load-use stalls, branch flushes and CPI, checked against the instruction set.");

export default function PipelinePage() {
  return (
    <StudioShell title="CPU pipeline" path="/studio/pipeline">
      <PipelineTool />
    </StudioShell>
  );
}
