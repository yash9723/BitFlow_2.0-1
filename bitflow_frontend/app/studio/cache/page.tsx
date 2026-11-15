/** app/studio/cache/page.tsx — cache simulator (components/studio/CacheTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { CacheTool } from "@/components/studio/loaders";
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta("/studio/cache", "Cache simulator", "Step an address trace through a configurable cache and see hits, compulsory, capacity and conflict misses, evictions and the average access time.");

export default function Page() {
  return (
    <StudioShell title="Cache simulator" path="/studio/cache">
      <CacheTool />
    </StudioShell>
  );
}
