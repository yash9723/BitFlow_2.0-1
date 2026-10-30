/** app/learn/roadmap/page.tsx — the roadmap lives in the Academy now. */
import { permanentRedirect } from "next/navigation";

export default function LearnRoadmapRedirect() {
  permanentRedirect("/academy/roadmap");
}
