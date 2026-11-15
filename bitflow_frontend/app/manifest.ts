/** app/manifest.ts — /manifest.webmanifest: lets browsers name and theme the site when it is added to a home screen. */

import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME}: ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "browser",
    background_color: "#07080a",   // the page background (tailwind "void")
    theme_color: "#07080a",
    icons: [{ src: "/icon.png", type: "image/png", sizes: "64x64" }],
  };
}
