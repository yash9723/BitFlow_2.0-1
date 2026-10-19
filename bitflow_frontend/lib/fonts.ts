/**
 * lib/fonts.ts — Inter (UI) and JetBrains Mono (code), self-hosted by
 * next/font at build time: no render-blocking request chain to Google, and
 * visitors' IPs never reach a third party.
 *
 * The root layout puts both `.variable` classes on <html>; globals.css maps
 * them to --font-ui / --font-display / --font-mono. Monaco and the PNG export
 * card take `mono.style.fontFamily` (the real, hashed family name) directly.
 */

import { Inter, JetBrains_Mono } from "next/font/google";

export const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const mono = JetBrains_Mono({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-jetbrains",
});
