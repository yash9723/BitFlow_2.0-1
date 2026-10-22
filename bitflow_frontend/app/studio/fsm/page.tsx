/** app/studio/fsm/page.tsx — FSM designer (components/studio/FsmTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { FsmTool } from "@/components/studio/loaders";

export const metadata = {
  title: "FSM designer",
  description: "Draw a Moore or Mealy state machine, step it clock by clock, and get Verilog with a self-checking testbench.",
};

export default function FsmPage() {
  return (
    <StudioShell title="FSM designer">
      <FsmTool />
    </StudioShell>
  );
}
