/** app/studio/cache/page.tsx — cache simulator (components/studio/CacheTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { CacheTool } from "@/components/studio/loaders";

export const metadata = {
  title: "Cache simulator",
  description: "Step an address trace through a configurable cache and see hits, compulsory, capacity and conflict misses, evictions and the average access time.",
};

export default function Page() {
  return (
    <StudioShell title="Cache simulator">
      <CacheTool />
    </StudioShell>
  );
}
