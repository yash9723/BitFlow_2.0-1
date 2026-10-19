/**
 * app/opengraph-image.tsx — the 1200×630 preview shown when a BitFlow link is
 * shared (Open Graph and Twitter). Drawn with next/og.
 */

import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const WAVE = [0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
                    padding: "80px", background: "#07080a", color: "#e8eaf6" }}>
        <div style={{ display: "flex", fontSize: 28, color: "#00e87a", letterSpacing: 6 }}>HDL ENGINEERING PLATFORM</div>
        <div style={{ display: "flex", fontSize: 120, fontWeight: 700, marginTop: 20 }}>{SITE_NAME}</div>
        <div style={{ display: "flex", fontSize: 44, color: "#b0b3cc", marginTop: 10 }}>{SITE_TAGLINE}</div>
        {/* a square wave */}
        <div style={{ display: "flex", marginTop: 60 }}>
          {WAVE.map((b, i) => (
            <div key={i} style={{ display: "flex", width: 70, height: 60, borderStyle: "solid", borderColor: "#00e87a",
                                  borderTopWidth: b ? 4 : 0, borderBottomWidth: b ? 0 : 4, borderRightWidth: 0,
                                  borderLeftWidth: i > 0 && WAVE[i - 1] !== b ? 4 : 0 }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
