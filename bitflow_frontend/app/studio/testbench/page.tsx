/** app/studio/testbench/page.tsx — testbench generator (components/studio/TbGenTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { TbGenTool } from "@/components/studio/loaders";

export const metadata = {
  title: "Testbench generator",
  description: "Paste a Verilog or SystemVerilog module and get a self-checking testbench: clock, reset, exhaustive or random stimulus, X/Z checks and a reference-model slot.",
  alternates: { canonical: "/studio/testbench" },
};

export default function Page() {
  return (
    <StudioShell title="Testbench generator" path="/studio/testbench">
      <TbGenTool />
    </StudioShell>
  );
}
