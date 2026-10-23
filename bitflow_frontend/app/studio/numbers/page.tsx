/** app/studio/numbers/page.tsx — number formats (components/studio/NumbersTool.tsx). Public. */

import StudioShell from "@/components/studio/StudioShell";
import { NumbersTool } from "@/components/studio/loaders";

export const metadata = {
  title: "Number formats",
  description: "Integers in any width and radix with two's complement, fixed-point Q formats and IEEE-754 floating point, bit by bit.",
  alternates: { canonical: "/studio/numbers" },
};

export default function Page() {
  return (
    <StudioShell title="Number formats" path="/studio/numbers">
      <NumbersTool />
    </StudioShell>
  );
}
