/**
 * lib/home-path.ts — the learning path shown on the landing page ("Your path") and described in its structured data.
 * One list feeds both, so what search and answer engines read is what visitors see. Counts are real: the caller passes
 * them in (app/page.tsx reads them), and a count that could not be read is simply left out of the sentence.
 */
export interface HomeFacts { chapters: number; lessons: number; problems: number | null }
export interface PathStep { title: string; body: string; href: string }

export function homePath({ chapters, lessons, problems }: HomeFacts): PathStep[] {
  return [
    { title: "Academy", href: "/academy", body: `Start from what a bit is. ${chapters} chapters take you through logic gates, Boolean algebra, K-maps, counters and state machines, with live circuits and animated walkthroughs of the Verilog.` },
    { title: "Board Lab", href: "/lab", body: `${lessons} hands-on lessons: write Verilog and watch it run on a 3D FPGA board in your browser, then put it on a real board.` },
    { title: "Practice problems", href: "/problems", body: `${problems ? `${problems} graded Verilog problems` : "Graded Verilog problems"}, from a single wire to a RISC-V processor. A free account lets you run and submit them.` },
    { title: "Arena and contests", href: "/arena", body: "Harder problems, contests and mock interviews, once the basics are solid." },
    { title: "Design Studio", href: "/studio", body: "Draw circuits, state machines and timing diagrams and get Verilog with a self-checking testbench. Free to use at any point on the path." },
  ];
}
