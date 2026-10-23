/** app/studio/generators/page.tsx — verilog generators (components/studio/GeneratorsTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { GeneratorsTool } from "@/components/studio/loaders";

export const metadata = {
  title: "Verilog generators",
  description: "Parameterised LFSR, CRC, sync and async FIFOs, UART receiver, SPI master, round-robin arbiter, CDC synchronisers, VGA timing, 7-segment driver, sine table and more, in Verilog or SystemVerilog, each with a self-checking testbench.",
  alternates: { canonical: "/studio/generators" },
};

export default function Page() {
  return (
    <StudioShell title="Verilog generators" path="/studio/generators">
      <GeneratorsTool />
    </StudioShell>
  );
}
