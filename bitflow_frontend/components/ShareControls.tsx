"use client";
/**
 * components/ShareControls.tsx — on a shared design's page (/s/[id]): "Embed" copies an <iframe> for a
 * course site (Verilog designs, which run in the viewer's browser); the owner can also rename it and list it
 * on /explore (PATCH /api/share/[id]). The link itself never changes.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { embedSnippet } from "@/lib/share";

const btn = "px-3 py-1.5 rounded-lg border border-rim text-[11px] font-mono text-pale hover:border-phosphor/50 hover:text-phosphor transition-colors disabled:opacity-50";

export default function ShareControls({ id, title, isOwner, isPublic, embeddable }: {
  id: string; title: string; isOwner: boolean; isPublic: boolean; embeddable: boolean;
}) {
  const router = useRouter();
  const [listed, setListed] = useState(isPublic);
  const [busy, setBusy] = useState(false);

  const patch = async (body: { title?: string; public?: boolean }) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/share/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Couldn't save (${res.status}).`);
      setListed(data.public);
      router.refresh();
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const embed = async () => {
    const snippet = embedSnippet(window.location.origin, id, title);
    const copied = await navigator.clipboard?.writeText(snippet).then(() => true, () => false);
    window.prompt(copied ? "Embed code copied. Paste it into your page or course site:" : "Copy this embed code into your page or course site:", snippet);
  };

  const rename = () => {
    const t = window.prompt("Rename this design:", title)?.trim();
    if (t && t !== title) patch({ title: t });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {embeddable && <button className={btn} onClick={embed}>&lt;/&gt; Embed</button>}
      {isOwner && <button className={btn} onClick={rename} disabled={busy}>Rename</button>}
      {isOwner && (
        <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rim text-[11px] font-mono text-pale cursor-pointer">
          <input type="checkbox" checked={listed} disabled={busy} onChange={(e) => patch({ public: e.target.checked })} className="accent-phosphor" />
          Listed on Explore
        </label>
      )}
    </div>
  );
}
