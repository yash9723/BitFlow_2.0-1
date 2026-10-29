/**
 * app/lab/page.tsx — the Board Lab: hands-on lessons on a 3D FPGA board (lib/lab/lessons.ts).
 */
import Link from "next/link";
import type { Metadata } from "next";
import { LESSONS } from "@/lib/lab/lessons";
import { SITE_URL, jsonLd, pageMeta } from "@/lib/site";
import { LabCount, LabDone } from "@/components/lab/LabProgress";

const TITLE = "Board Lab: learn FPGAs on a 3D board";
const DESCRIPTION =
  `${LESSONS.length} free hands-on lessons: write Verilog, watch it run on a 3D FPGA board in your browser, get it checked, then put it on a real Tang Nano, ULX3S or OrangeCrab.`;
export const metadata: Metadata = pageMeta("/lab", TITLE, DESCRIPTION);

const PARTS: [RegExp, string][] = [[/^led$/, "LEDs"], [/^btn$/, "buttons"], [/^sw$/, "switches"], [/^(hex|seg)/, "display"], [/^rgb$/, "RGB LED"], [/^(tx|rx)$/, "serial"], [/^buzz$/, "buzzer"], [/^servo$/, "servo"], [/^sr_clk$/, "shift register"], [/^row$/, "keypad"], [/^clk$/, "clock"]];
const parts = (ports: string[]) => PARTS.filter(([re]) => ports.some((p) => re.test(p))).map(([, label]) => label);

export default function LabIndex() {
  const schema = {
    "@context": "https://schema.org", "@type": "Course", name: "BitFlow Board Lab", description: DESCRIPTION,
    url: `${SITE_URL}/lab`, isAccessibleForFree: true, educationalLevel: "Beginner", inLanguage: "en",
    provider: { "@type": "Organization", name: "BitFlow", url: SITE_URL },
    hasCourseInstance: { "@type": "CourseInstance", courseMode: "online" },
    hasPart: LESSONS.map((l, i) => ({ "@type": "LearningResource", position: i + 1, name: l.title, description: l.summary, url: `${SITE_URL}/lab/${l.slug}` })),
  };
  return (
    <div className="space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div className="space-y-3 max-w-2xl">
          <span className="inline-block font-mono text-[10px] text-phosphor uppercase tracking-widest border border-phosphor/25 bg-phosphor/10 px-3 py-1 rounded-full">Board Lab</span>
          <h1 className="font-serif text-[30px] sm:text-[34px] text-bright leading-tight">Build real hardware, one LED at a time.</h1>
          <p className="text-[14px] text-ghost leading-relaxed">
            Write Verilog and watch it run on a 3D FPGA board, right here in your browser: LEDs, buttons, switches, a 7-segment display, an RGB LED and a serial port.
            Each lesson checks your design, and when it works you can put it on a real board with one click.
          </p>
        </div>
        <LabCount total={LESSONS.length} />
      </section>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {LESSONS.map((l, i) => (
          <li key={l.slug}>
            <Link href={`/lab/${l.slug}`}
                  className="group flex flex-col h-full gap-2 rounded-lg border border-rim bg-pit/40 p-4 hover:border-phosphor/40 hover:bg-pit/70 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-dim">Lesson {i + 1}</span>
                <LabDone slug={l.slug} />
              </div>
              <h2 className="text-[15px] font-semibold text-bright group-hover:text-phosphor transition-colors">{l.title}</h2>
              <p className="text-[12px] text-ghost leading-relaxed flex-1">{l.summary}</p>
              <p className="font-mono text-[10px] text-dim">{parts(Object.keys(l.ports)).join(" · ")}</p>
            </Link>
          </li>
        ))}
      </ol>

      <section className="rounded-lg border border-rim bg-pit/30 p-4 sm:p-5 grid gap-4 sm:grid-cols-3 text-[12px] text-ghost leading-relaxed">
        <div><h2 className="font-mono text-[10px] text-dim uppercase tracking-widest mb-1">Runs for real</h2>Your Verilog is synthesized to gates in your browser and simulated cycle by cycle. Nothing is faked or pre-recorded.</div>
        <div><h2 className="font-mono text-[10px] text-dim uppercase tracking-widest mb-1">Checked for you</h2>Each lesson drives your design like a test bench would and tells you which goal failed and why.</div>
        <div><h2 className="font-mono text-[10px] text-dim uppercase tracking-widest mb-1">Then on a real board</h2>Build for a Tang Nano 9K, iCEstick or iCEBreaker and program it from the <Link href="/flash" className="text-info hover:underline">flasher</Link>. No toolchain to install.</div>
      </section>
    </div>
  );
}
