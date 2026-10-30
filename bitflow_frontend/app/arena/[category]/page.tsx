/** app/arena/[category]/page.tsx — /arena/<topic> has no page of its own: it is the Arena list filtered by topic. */
import { redirect } from "next/navigation";

export default function ArenaCategoryRedirect({ params }: { params: { category: string } }) {
  redirect(`/problems?level=Arena&category=${encodeURIComponent(params.category)}`);
}
