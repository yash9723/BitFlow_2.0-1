/**
 * app/colleges/page.tsx — BitFlow for colleges: what a department gets, the free
 * one-semester pilot, and the pilot request form (components/PilotForm.tsx). Public.
 */

import Link from "next/link";
import PilotForm from "@/components/PilotForm";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { SITE_NAME, pageMeta } from "@/lib/site";

export const metadata = pageMeta("/colleges", "For colleges",
  `Run your HDL and digital design lab on ${SITE_NAME}: Verilog and VHDL in the browser, auto-graded assignments, ` +
  "marks export and copy checks. Free one-semester pilot for engineering departments.");

const FEATURES: { title: string; body: string }[] = [
  { title: "No installs, any laptop",
    body: "Students write and simulate Verilog, SystemVerilog and VHDL in the browser, with waveforms. Nothing to license or install in the lab." },
  { title: "Auto-graded assignments",
    body: "Pick problems from the bank, set a due date and share a join code. Every submission is graded against hidden tests on the server." },
  { title: "Marks export for your register",
    body: "A progress grid for the whole class, with roll numbers, downloads as a CSV for internal assessment." },
  { title: "Who is stuck, and who copied",
    body: "Class analytics show which problems students fail, the test they fail most, and pairs of designs that look copied." },
  { title: "Theory with live circuits",
    body: "Academy chapters from number systems to FSMs and memory, with interactive circuits, K-maps and timing diagrams." },
  { title: "Placement ready",
    body: "VLSI interview prep with timed mock interviews, contests between colleges, and certificates students can share." },
];

const STEPS: [string, string][] = [
  ["Request a pilot", "Tell us about your department below. We reply within two working days."],
  ["Set up together", "On a short call we create your class, map assignments to your syllabus and run a demo lab."],
  ["Teach for a semester", "Free for one semester and one department. We help when anything gets in the way."],
  ["Decide with data", "At the end you get a report on usage and results, and a department plan if you want to continue."],
];

export default function CollegesPage() {
  return (
    <main className="min-h-screen bg-void text-bright">
      <SiteHeader />

      <section className="max-w-5xl mx-auto px-5 pt-14 pb-10 space-y-5">
        <p className="text-[11px] tracking-[0.2em] uppercase text-phosphor font-semibold">For colleges</p>
        <h1 className="font-display text-3xl md:text-4xl font-bold leading-tight max-w-3xl">
          Run your HDL lab in the browser, with grading done for you
        </h1>
        <p className="text-[15px] text-ghost leading-relaxed max-w-2xl">
          {SITE_NAME} gives ECE, EEE and VLSI departments a complete digital design lab: simulation, graded
          assignments, analytics and marks export. Students always use it free. Departments can try it free
          for one semester.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <a href="#pilot" className="px-5 py-2.5 rounded-lg bg-phosphor text-void text-[12px] font-bold tracking-wider uppercase hover:bg-phosphor-glow">
            Request a free pilot
          </a>
          <Link href="/problems" className="px-5 py-2.5 rounded-lg border border-rim text-pale text-[12px] font-bold tracking-wider uppercase hover:border-phosphor/60">
            See the problems
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-5 py-10">
        <h2 className="font-display text-xl font-bold mb-5">What your department gets</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-rim/60 bg-pit p-5 space-y-2">
              <h3 className="text-[15px] font-semibold text-bright">{f.title}</h3>
              <p className="text-[13px] text-ghost leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-5 py-10">
        <h2 className="font-display text-xl font-bold mb-5">How the pilot works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="rounded-xl border border-rim/60 bg-pit p-5 space-y-2">
              <span className="text-phosphor font-mono text-[12px]">0{i + 1}</span>
              <h3 className="text-[15px] font-semibold text-bright">{title}</h3>
              <p className="text-[13px] text-ghost leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="max-w-5xl mx-auto px-5 py-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-rim/60 bg-pit p-5 space-y-2">
          <h2 className="font-display text-lg font-bold">Students</h2>
          <p className="text-[13px] text-ghost leading-relaxed">
            Free, always. Students sign up with a username, join your class with a code and keep their progress
            after the course ends. Under-18 accounts need a parent&apos;s consent, as the DPDP Act requires.
          </p>
        </div>
        <div className="rounded-xl border border-rim/60 bg-pit p-5 space-y-2">
          <h2 className="font-display text-lg font-bold">Departments</h2>
          <p className="text-[13px] text-ghost leading-relaxed">
            After the pilot, a yearly department plan covers all your classes, the department dashboard, faculty
            training and priority support. We invoice in rupees, and purchase orders are fine.
          </p>
        </div>
      </section>

      <section id="pilot" className="max-w-2xl mx-auto px-5 py-14 space-y-5 scroll-mt-20">
        <div className="space-y-2">
          <h2 className="font-display text-2xl font-bold">Request a free pilot</h2>
          <p className="text-[14px] text-ghost leading-relaxed">
            Faculty, HODs and lab in-charges: tell us about your department. Students who want {SITE_NAME} at their
            college can send this to a teacher, or <Link href="/contact" className="text-phosphor hover:underline">write to us</Link>.
          </p>
        </div>
        <PilotForm />
      </section>

      <SiteFooter />
    </main>
  );
}
