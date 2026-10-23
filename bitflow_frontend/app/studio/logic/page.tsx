/** app/studio/logic/page.tsx — truth table / K-map tool (components/studio/LogicTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { LogicTool } from "@/components/studio/loaders";

export const metadata = {
  title: "Truth table & K-map",
  description: "Fill in a truth table and get the K-map groups, the minimal sum-of-products and product-of-sums, and Verilog with an exhaustive testbench.",
  alternates: { canonical: "/studio/logic" },
};

export default function LogicPage() {
  return (
    <StudioShell title="Truth table & K-map" path="/studio/logic">
      <LogicTool />
    </StudioShell>
  );
}
