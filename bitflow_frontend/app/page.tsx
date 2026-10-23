/** app/page.tsx — the landing page (components/HomePage.tsx), with its metadata and canonical URL. */

import HomePage from "@/components/HomePage";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const metadata = {
  title: { absolute: `${SITE_NAME} — ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

export default function Page() {
  return <HomePage />;
}
