/**
 * app/c/[id]/opengraph-image.tsx — the link preview for a shared certificate.
 */

import { ImageResponse } from "next/og";
import { certificateById } from "@/lib/tracks";

export const alt = "BitFlow certificate of completion";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function CertificateImage({ params }: { params: { id: string } }) {
  const c = await certificateById(params.id);
  const name  = c?.username ?? "BitFlow";
  const track = c?.track.name ?? "Certificate";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", padding: 40, background: "#07080a" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      background: "#fbfaf6", borderRadius: 16, border: "6px solid #00a85a", color: "#16181d" }}>
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 8, color: "#00a85a", fontWeight: 700 }}>CERTIFICATE OF COMPLETION</div>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, marginTop: 28 }}>{name}</div>
          <div style={{ display: "flex", fontSize: 36, color: "#3a3d46", marginTop: 18 }}>{track} · BitFlow</div>
        </div>
      </div>
    ),
    size,
  );
}
