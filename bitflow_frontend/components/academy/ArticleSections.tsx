import type { AcademySection } from "@/lib/academy-types";
import ChapterBlock from "@/components/academy/ChapterBlocks";

interface Props {
  sections: AcademySection[];
}

export default function ArticleSections({ sections }: Props) {
  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <article key={section.id} id={section.id} className="scroll-mt-28 space-y-4">
          <h2 className="font-display text-[19px] font-bold text-bright flex flex-wrap items-center gap-2">
            {section.heading}
            {section.level === "gate" && <span className="font-mono text-[9px] font-normal px-2 py-0.5 rounded border border-warn/30 bg-warn/10 text-warn uppercase tracking-wider">GATE: fine to skip at first</span>}
          </h2>
          {section.blocks.map((block, i) => <ChapterBlock key={i} block={block} />)}
        </article>
      ))}
    </div>
  );
}
