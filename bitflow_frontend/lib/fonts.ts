/**
 * lib/fonts.ts — Inter (UI) and JetBrains Mono (code), self-hosted by
 * next/font at build time: no render-blocking request chain to Google, and
 * visitors' IPs never reach a third party.
 *
 * The root layout puts both `.variable` classes on <html>; globals.css maps
 * them to --font-ui / --font-display / --font-mono. Monaco and the PNG export
 * card take `mono.style.fontFamily` (the real, hashed family name) directly.
 */

import { Inter, JetBrains_Mono, Jersey_10 } from "next/font/google";
import localFont from "next/font/local";

/** Blocky pixel lettering: the APEX title (app/announcements) and the pixel UI (components/pixel, `font-pixel`). */
export const pixel = Jersey_10({ subsets: ["latin"], weight: "400", display: "swap", adjustFontFallback: false, variable: "--font-pixel" });

export const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const mono = JetBrains_Mono({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-jetbrains",
});

/** Departure Mono (Helena Zhang, SIL OFL 1.1, lib/fonts-files): pixel monospace for terminal-style
 *  output, labels and the submission receipt (`font-term`). The editor and the PNG card stay on `mono`. */
export const term = localFont({ src: "./fonts-files/DepartureMono-Regular.woff2", display: "swap", variable: "--font-term", fallback: ["monospace"] });
