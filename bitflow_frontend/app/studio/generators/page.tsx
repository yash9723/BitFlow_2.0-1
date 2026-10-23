/** app/studio/generators/page.tsx — verilog generators (components/studio/GeneratorsTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { GeneratorsTool } from "@/components/studio/loaders";

export const metadata = {
  title: "Verilog generators",
  description: "Parameterised LFSR, CRC, FIFO, clock divider, PWM, debouncer and more, each with a testbench checked against a reference model.",
};

export default function Page() {
  return (
    <StudioShell title="Verilog generators">
      <GeneratorsTool />
    </StudioShell>
  );
}
