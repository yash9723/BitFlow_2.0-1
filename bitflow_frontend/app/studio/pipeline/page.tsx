/** app/studio/pipeline/page.tsx — CPU pipeline animator (components/studio/PipelineTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { PipelineTool } from "@/components/studio/loaders";

export const metadata = {
  title: "CPU pipeline animator",
  description: "Step a 5-stage RISC-V pipeline cycle by cycle: forwarding, load-use stalls, branch flushes and CPI, checked against the instruction set.",
  alternates: { canonical: "/studio/pipeline" },
};

export default function PipelinePage() {
  return (
    <StudioShell title="CPU pipeline" path="/studio/pipeline">
      <PipelineTool />
    </StudioShell>
  );
}
