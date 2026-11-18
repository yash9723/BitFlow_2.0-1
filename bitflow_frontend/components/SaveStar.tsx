"use client";
/** components/SaveStar.tsx — star a problem or article (lib/saved.ts; this browser only). */
import { toggleSaved, useSaved, type SavedKind } from "@/lib/saved";

export default function SaveStar({ kind, id, title, className = "" }: { kind: SavedKind; id: string; title: string; className?: string }) {
  const on = useSaved(kind).includes(id);
  return (
    <button type="button" onClick={() => toggleSaved(kind, id)} aria-pressed={on}
            aria-label={on ? `Remove ${title} from saved` : `Save ${title}`} title={on ? "Saved on this device" : "Save on this device"}
            className={`sig-press leading-none ${on ? "text-warn" : "text-dim hover:text-pale"} ${className}`}>
      {on ? "★" : "☆"}
    </button>
  );
}
