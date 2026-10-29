/**
 * app/lab/credits/page.tsx — who made the Board Lab's 3D models and under what licence
 * (public/models/CREDITS.json, written by scripts/board-models.mjs).
 */
import Link from "next/link";
import type { Metadata } from "next";
import credits from "@/public/models/CREDITS.json";
import { pageMeta } from "@/lib/site";

export const metadata: Metadata = pageMeta("/lab/credits", "Board Lab credits", "The 3D models in the BitFlow Board Lab, who made them and their licences.");

const LICENCE_FILES: Record<string, string> = { ulx3s: "/models/ulx3s.LICENSE.txt", orangecrab: "/models/orangecrab.LICENSE.txt" };

export default function LabCredits() {
  return (
    <div className="max-w-3xl space-y-5">
      <nav className="font-mono text-[11px] text-dim"><Link href="/lab" className="hover:text-bright">Board Lab</Link> <span aria-hidden>/</span> Credits</nav>
      <h1 className="font-serif text-[26px] text-bright">3D model credits</h1>
      <p className="text-[13px] text-ghost leading-relaxed">
        The real boards in the Board Lab are drawn from their makers&apos; own open-hardware KiCad designs, exported to 3D. The lab board and the
        Tang Nano 9K are built by BitFlow in code. The microcontrollers are from Sketchfab, used under their Creative Commons Attribution licences.
      </p>
      <ul className="space-y-3">
        {credits.map((c) => (
          <li key={c.id} className="rounded-lg border border-rim bg-pit/40 p-3 text-[13px] text-pale leading-relaxed">
            {c.credit}
            {LICENCE_FILES[c.id] && <> <a href={LICENCE_FILES[c.id]} className="text-info hover:underline">Licence text</a></>}
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-dim">
        3D parts not drawn by the board makers come from the KiCad 3D model library (gitlab.com/kicad/libraries/kicad-packages3D, CC-BY-SA 4.0 with the KiCad libraries exception).
      </p>
    </div>
  );
}
