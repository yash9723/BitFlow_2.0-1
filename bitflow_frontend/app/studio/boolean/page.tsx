/** app/studio/boolean/page.tsx — boolean algebra (components/studio/BooleanTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { BooleanTool } from "@/components/studio/loaders";
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta("/studio/boolean", "Boolean algebra", "Simplify a Boolean expression to its minimal sum of products and product of sums, get its truth table and canonical forms, and check two expressions for equivalence.");

export default function Page() {
  return (
    <StudioShell title="Boolean algebra" path="/studio/boolean">
      <BooleanTool />
    </StudioShell>
  );
}
