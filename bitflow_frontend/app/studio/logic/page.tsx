/** app/studio/logic/page.tsx — truth table / K-map tool (components/studio/LogicTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { LogicTool } from "@/components/studio/loaders";
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta("/studio/logic", "Truth table & K-map", "Fill in a truth table and get the K-map groups, the minimal sum-of-products and product-of-sums, and Verilog with an exhaustive testbench.");

export default function LogicPage() {
  return (
    <StudioShell title="Truth table & K-map" path="/studio/logic">
      <LogicTool />
    </StudioShell>
  );
}
