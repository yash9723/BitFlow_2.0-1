"use client";
/**
 * components/HomePage.tsx — the landing page (mounted by app/page.tsx, which also owns its metadata and
 * structured data). Top to bottom: the bench (a Verilog module beside the waveform it produces), what you
 * work with, the learning path, the Academy's topics as the pins of a chip, questions, and the way in.
 * The path and the questions come from lib/home-path.ts and lib/home-faq.ts, which also feed the page's
 * structured data, so keep rendering every item of both.
 */

import { HOME_FAQ } from "@/lib/home-faq";
import { type HomeFacts, homePath } from "@/lib/home-path";
import { SITE_TAGLINE } from "@/lib/site";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteLinks } from "@/components/SiteFooter";
import { useAuth } from "@/hooks/useAuth";
import AsciiChips from "@/components/AsciiChips";

const NAV_LINKS = [
  { label: "Sandbox IDE", href: "/sandbox" },
  { label: "Learning", href: "/learn" },
  { label: "Academy", href: "/academy" },
  { label: "Arena", href: "/arena" },
  { label: "About", href: "/about" },
];

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-phosphor";
const PRIMARY = `inline-block px-6 py-3 rounded-md bg-phosphor text-void text-body font-semibold hover:bg-phosphor-glow transition-colors ${FOCUS}`;

/* ── The bench: three small modules, each with the waveform it produces ───────────────────────────── */

interface Signal {
  name: string;
  /** clk is drawn as a clock; inputs are what you drive, outputs what the module answers with. */
  role: "clk" | "in" | "out";
  /** A multi-bit value, drawn as labelled cells instead of a high/low line. */
  bus?: boolean;
  /** One value per clock cycle. */
  v: number[];
}

const EXAMPLES: { tab: string; code: string; signals: Signal[] }[] = [
  {
    tab: "4-bit counter",
    code: `module counter(
  input            clk, rst,
  output reg [3:0] q
);
  always @(posedge clk)
    if (rst) q <= 0;
    else     q <= q + 1;
endmodule`,
    signals: [
      { name: "clk", role: "clk", v: [] },
      { name: "rst", role: "in", v: [1, 0, 0, 0, 0, 0, 0, 0] },
      { name: "q[3:0]", role: "out", bus: true, v: [0, 1, 2, 3, 4, 5, 6, 7] },
    ],
  },
  {
    tab: "2-to-1 mux",
    code: `module mux2(
  input  a, b, sel,
  output y
);
  assign y = sel ? b : a;
endmodule`,
    signals: [
      { name: "a", role: "in", v: [0, 1, 1, 0, 1, 0, 0, 1] },
      { name: "b", role: "in", v: [1, 1, 0, 0, 1, 1, 0, 0] },
      { name: "sel", role: "in", v: [0, 0, 0, 0, 1, 1, 1, 1] },
      { name: "y", role: "out", v: [0, 1, 1, 0, 1, 1, 0, 0] },
    ],
  },
  {
    tab: "Rising-edge detector",
    code: `module rise(
  input  clk, d,
  output pulse
);
  reg q;
  always @(posedge clk) q <= d;
  assign pulse = d & ~q;
endmodule`,
    signals: [
      { name: "clk", role: "clk", v: [] },
      { name: "d", role: "in", v: [0, 0, 1, 1, 1, 0, 1, 1] },
      { name: "q", role: "out", v: [0, 0, 0, 1, 1, 1, 0, 1] },
      { name: "pulse", role: "out", v: [0, 0, 1, 0, 0, 0, 1, 0] },
    ],
  },
];

const CODE_TOKEN = /(\b(?:module|endmodule|input|output|reg|always|posedge|assign|if|else)\b|\b\d+\b)/;

/** Verilog with its keywords and numbers picked out. */
function Code({ source }: { source: string }) {
  return (
    <pre className="font-mono text-small leading-[1.7] text-pale overflow-x-auto">
      <code>
        {source.split(CODE_TOKEN).map((part, i) =>
          i % 2 === 0 ? part : <span key={i} className={/^\d/.test(part) ? "text-warn" : "text-phosphor"}>{part}</span>,
        )}
      </code>
    </pre>
  );
}

// Waveform geometry, in the SVG's own units.
const CYCLES = 8, CYCLE_W = 44, LEFT = 84, ROW = 38, HIGH = 9, LOW = 27;
const WAVE_W = LEFT + CYCLES * CYCLE_W + 10;
const level = (bit: number) => (bit ? HIGH : LOW);

/** A one-bit signal as a path: a clock ticks every cycle, anything else holds its value for the cycle. */
function trace({ role, v }: Signal) {
  let d = "";
  for (let i = 0; i < CYCLES; i++) {
    const x = LEFT + i * CYCLE_W, to = i ? "L" : "M";
    d += role === "clk"
      ? `${to}${x},${LOW} L${x},${HIGH} L${x + CYCLE_W / 2},${HIGH} L${x + CYCLE_W / 2},${LOW} L${x + CYCLE_W},${LOW} `
      : `${to}${x},${level(v[i])} L${x + CYCLE_W},${level(v[i])} `;
  }
  return d;
}

function Waveform({ signals, label }: { signals: Signal[]; label: string }) {
  const bottom = signals.length * ROW;
  return (
    <svg viewBox={`0 0 ${WAVE_W} ${bottom + 20}`} className="w-full min-w-[400px] h-auto font-mono" role="img" aria-label={label}>
      {Array.from({ length: CYCLES + 1 }, (_, i) => (
        <line key={i} x1={LEFT + i * CYCLE_W} x2={LEFT + i * CYCLE_W} y1={0} y2={bottom} stroke="#22232d" strokeDasharray="2 4" />
      ))}
      {signals.map((s, row) => {
        const color = s.role === "out" ? "#00e87a" : s.role === "clk" ? "#80839d" : "#b0b3cc";
        return (
          <g key={s.name} transform={`translate(0 ${row * ROW})`}>
            <text x={LEFT - 12} y={23} textAnchor="end" fontSize={12} fill={color}>{s.name}</text>
            {s.bus ? s.v.map((value, i) => {
              const x = LEFT + i * CYCLE_W, mid = (HIGH + LOW) / 2;
              return (
                <g key={i}>
                  <polygon
                    points={`${x},${mid} ${x + 5},${HIGH} ${x + CYCLE_W - 5},${HIGH} ${x + CYCLE_W},${mid} ${x + CYCLE_W - 5},${LOW} ${x + 5},${LOW}`}
                    fill="none" stroke={color} strokeWidth={1.5}
                  />
                  <text x={x + CYCLE_W / 2} y={mid + 4} textAnchor="middle" fontSize={11} fill={color}>{value.toString(16)}</text>
                </g>
              );
            }) : <path d={trace(s)} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />}
          </g>
        );
      })}
      {Array.from({ length: CYCLES }, (_, i) => (
        <text key={i} x={LEFT + (i + 0.5) * CYCLE_W} y={bottom + 15} textAnchor="middle" fontSize={10} fill="#80839d">{i}</text>
      ))}
      <line
        x1={LEFT} x2={LEFT} y1={0} y2={bottom} stroke="#00ff88" strokeWidth={1} opacity={0.7}
        className="animate-scan" style={{ ["--scan" as string]: `${CYCLES * CYCLE_W}px` }}
      />
    </svg>
  );
}

function Bench() {
  const [picked, setPicked] = useState(0);
  const example = EXAMPLES[picked];
  return (
    <div className="rounded-lg border border-rim bg-pit overflow-hidden">
      <div className="flex gap-1 border-b border-rim bg-shaft px-2 pt-2 overflow-x-auto">
        {EXAMPLES.map((e, i) => (
          <button
            key={e.tab}
            type="button"
            aria-pressed={i === picked}
            onClick={() => setPicked(i)}
            className={`shrink-0 px-4 py-2 rounded-t-md font-mono text-caption transition-colors ${FOCUS} ${
              i === picked ? "bg-pit text-bright border border-rim border-b-pit -mb-px" : "text-ghost hover:text-bright border border-transparent"
            }`}
          >
            {e.tab}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[5fr_7fr]">
        <div className="p-5 md:p-7 border-b lg:border-b-0 lg:border-r border-rim">
          <Code source={example.code} />
        </div>
        <div className="p-5 md:p-7 flex items-center overflow-x-auto">
          <Waveform signals={example.signals} label={`Waveform of the ${example.tab} over eight clock cycles`} />
        </div>
      </div>
    </div>
  );
}

/* ── What you work with ────────────────────────────────────────────────────────────────────────── */
const TOOLS = [
  {
    title: "A Verilog IDE in your browser",
    body: "Write, compile and simulate without leaving the page. There is no Vivado or ModelSim to install: open a problem and start typing.",
  },
  {
    title: "A waveform for every run",
    body: "Each simulation produces a waveform you can step through, so you can inspect signals and find the cycle where things went wrong.",
  },
  {
    title: "A path that builds on itself",
    body: "From number systems to state machines, each Academy chapter leans on the one before it, with problems tied to every concept.",
  },
];

/* ── The Academy's topics, as the eight pins of a chip (1 to 4 down the left, 5 to 8 up the right) ── */
const TOPICS = [
  { title: "Number systems", tags: "binary, hex, BCD" },
  { title: "Boolean algebra", tags: "K-maps, SOP, POS" },
  { title: "Logic gates", tags: "AND, OR, XOR" },
  { title: "Combinational logic", tags: "mux, decoder, adder" },
  { title: "Sequential logic", tags: "flip-flops, latches" },
  { title: "State machines", tags: "Mealy, Moore" },
  { title: "Memory", tags: "RAM, ROM, FIFO" },
  { title: "Timing", tags: "setup, hold, skew" },
];

function Pin({ n, side }: { n: number; side: "left" | "right" }) {
  const topic = TOPICS[n - 1];
  return (
    <li>
      <Link
        href="/academy"
        className={`group flex items-center gap-3 ${side === "left" ? "md:flex-row-reverse md:text-right" : ""} ${FOCUS}`}
      >
        <span aria-hidden className="h-2.5 w-6 shrink-0 bg-phosphor-dim group-hover:bg-phosphor-glow transition-colors" />
        <span className="font-mono text-caption text-dim w-4 shrink-0">{n}</span>
        <span>
          <span className="block text-lead text-bright group-hover:text-phosphor transition-colors">{topic.title}</span>
          <span className="block text-small text-ghost">{topic.tags}</span>
        </span>
      </Link>
    </li>
  );
}

function Pinout({ chapters }: { chapters: number }) {
  const pins = "flex flex-col justify-between gap-6 md:py-6";
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-y-6">
      <ol className={pins}>{[1, 2, 3, 4].map((n) => <Pin key={n} n={n} side="left" />)}</ol>
      <div aria-hidden className="hidden md:flex relative w-44 lg:w-56 flex-col items-center justify-center rounded-md border border-rim bg-shaft">
        <span className="absolute top-0 left-1/2 -translate-x-1/2 h-4 w-8 rounded-b-full border border-t-0 border-rim bg-void" />
        <span className="absolute top-5 left-4 h-2 w-2 rounded-full bg-warn" />
        <span className="font-pixel text-pixel-2 text-pale">ACADEMY</span>
        <span className="mt-2 font-mono text-caption text-dim">{chapters} chapters</span>
      </div>
      <ol start={5} className={`${pins} md:flex-col-reverse`}>{[5, 6, 7, 8].map((n) => <Pin key={n} n={n} side="right" />)}</ol>
    </div>
  );
}

/* ── Footer social links ──────────────────────────────────────────── */
const SOCIAL_LINKS = [
  {
    name: "WhatsApp",
    href: "https://chat.whatsapp.com/EDj3tTHgefx1BXI95E0bPF",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.48 1.32 5L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.02c-.24.68-1.4 1.3-1.93 1.36-.5.06-1.05.09-3.14-.65-2.64-1.02-4.34-3.7-4.47-3.87-.13-.17-1.07-1.42-1.07-2.71s.68-1.93.92-2.19c.24-.26.53-.32.7-.32.18 0 .35 0 .5.01.16.01.38-.06.6.46.24.56.8 1.95.87 2.09.07.14.11.31.02.5-.09.19-.13.31-.27.47-.13.16-.28.36-.4.48-.13.13-.27.28-.12.55.16.27.7 1.16 1.51 1.88 1.04.93 1.92 1.22 2.19 1.36.27.13.43.11.59-.07.16-.18.68-.79.86-1.06.18-.27.36-.22.6-.13.24.09 1.53.72 1.79.85.27.13.44.2.51.31.06.12.06.65-.18 1.33z" />
      </svg>
    ),
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/bitflow__official?igsh=MWxtZDA0aHpiZnByMw==",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/company/bitflow-vlsi-community/",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.45-2.14 2.94v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.59 0 4.25 2.37 4.25 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
      </svg>
    ),
  },
];

const WRAP = "max-w-[1200px] mx-auto px-6 md:px-10";
const H2 = "text-heading-sm md:text-heading text-balance text-bright";

export default function LandingPage({ facts }: { facts: HomeFacts }) {
  const path = homePath(facts);
  const { user, loading } = useAuth();   // the full page renders while loading so crawlers and link previews see it
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  if (user) {
    return (
      <div className="min-h-screen bg-void text-bright flex items-center justify-center">
        <span className="text-ghost text-sm">
          <span className="text-phosphor">►</span> booting bitflow
          <span className="animate-blink">_</span>
        </span>
      </div>
    );
  }

  // Only counts that were read: the problem count needs the database.
  const counts = [
    ...(facts.problems ? [`${facts.problems} practice problems`] : []),
    `${facts.chapters} Academy chapters`,
    `${facts.lessons} Board Lab lessons`,
  ].join(", ");

  return (
    <main className="min-h-screen bg-void text-bright font-ui overflow-x-hidden selection:bg-phosphor/30">
      <nav className="relative z-20 grid grid-cols-[1fr_auto_1fr] items-center px-6 py-4 border-b border-rim/50 bg-void/80 backdrop-blur-md">
        <Link href="/" className={`justify-self-start flex items-center gap-2 ${FOCUS}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bitflow_logo_64.png" alt="" className="w-8 h-8 object-contain" />
          <span className="font-bold text-lg text-bright">BitFlow</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-body text-ghost justify-self-center">
          {NAV_LINKS.map((link) => (
            <Link key={link.label} href={link.href} className={`hover:text-bright transition-colors ${FOCUS}`}>{link.label}</Link>
          ))}
        </div>
        <Link href="/login" className={`justify-self-end px-4 py-2 rounded-md border border-rim text-body text-pale hover:text-bright hover:border-muted transition-colors ${FOCUS}`}>
          Sign in
        </Link>
      </nav>

      {/* Hero: the claim, then the thing itself. Chips drift in the space to the right of the words and pass under the bench. */}
      <div className="relative">
        <AsciiChips className="absolute inset-0 opacity-60 [mask-image:linear-gradient(90deg,transparent_52%,black_76%)]" />
        <section className={`relative z-10 ${WRAP} pt-12 md:pt-16 pb-20`}>
          <h1 className="font-pixel text-pixel-3 sm:text-pixel-4 lg:text-pixel-6 text-bright max-w-[24ch]">
            {SITE_TAGLINE}.
          </h1>
          <div className="mt-8 flex flex-col gap-7">
            <p className="text-lead text-pretty text-pale max-w-[58ch]">
              BitFlow is an online Verilog and SystemVerilog simulator and learning platform for RTL design,
              verification and digital electronics: write, simulate and debug right in your browser, with nothing to install.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/login?mode=register" className={PRIMARY}>Create a free account</Link>
              <Link href="/sandbox" className={`text-body text-pale underline underline-offset-4 decoration-rim hover:text-bright hover:decoration-phosphor transition-colors ${FOCUS}`}>
                Open the sandbox
              </Link>
            </div>
          </div>
          <div className="mt-14">
            <Bench />
            <p className="mt-4 text-body text-ghost">
              Three small modules and what each one does over eight clock cycles. {counts}, all in the browser.
            </p>
          </div>
        </section>
      </div>

      <section className={`${WRAP} py-20 grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-x-16 gap-y-8 border-t border-rim/60`}>
        <h2 className={H2}>What you work with</h2>
        <dl className="divide-y divide-rim/60">
          {TOOLS.map((tool) => (
            <div key={tool.title} className="py-6 first:pt-0 last:pb-0 grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-x-10 gap-y-2">
              <dt className="text-subhead text-bright">{tool.title}</dt>
              <dd className="text-body text-ghost">{tool.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The path: where to start and where it leads. The same list is in the page's structured data (app/page.tsx). */}
      <section aria-labelledby="path-title" className={`${WRAP} py-20 border-t border-rim/60`}>
        <h2 id="path-title" className={H2}>From your first bit to a verified design</h2>
        <ol className="mt-12 grid grid-cols-1 md:grid-cols-5">
          {path.map((step, i) => (
            <li key={step.title} className="relative border-l md:border-l-0 md:border-t border-rim pl-6 md:pl-0 md:pr-6 pb-8 md:pb-0 md:pt-7">
              <span aria-hidden className="absolute -left-[5px] top-0 md:left-0 md:-top-[5px] h-[9px] w-[9px] bg-phosphor" />
              <Link href={step.href} className={`group block ${FOCUS}`}>
                <span className="font-mono text-caption text-dim">{i + 1}</span>
                <span className="block text-subhead text-bright mt-1 mb-2 group-hover:text-phosphor transition-colors">{step.title}</span>
                <span className="block text-body text-ghost">{step.body}</span>
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-body">
          <Link href="/academy/roadmap" className={`text-pale underline underline-offset-4 decoration-rim hover:text-bright hover:decoration-phosphor transition-colors ${FOCUS}`}>
            See the VLSI career roadmap
          </Link>
        </p>
      </section>

      <section aria-labelledby="topics-title" className={`${WRAP} py-20 border-t border-rim/60`}>
        <h2 id="topics-title" className={H2}>What the Academy covers</h2>
        <p className="mt-3 mb-10 text-body text-ghost max-w-[58ch]">Eight areas, in the order they build on each other. Every one opens the Academy.</p>
        <Pinout chapters={facts.chapters} />
      </section>

      {/* Questions people ask: the same list feeds the FAQPage data in app/page.tsx */}
      <section aria-labelledby="faq-title" className={`${WRAP} py-20 grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-x-16 gap-y-8 border-t border-rim/60`}>
        <h2 id="faq-title" className={H2}>Questions</h2>
        <div className="divide-y divide-rim/60 border-y border-rim/60">
          {HOME_FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className={`cursor-pointer list-none flex items-center justify-between gap-4 text-lead text-bright ${FOCUS}`}>
                {f.q}
                <span aria-hidden className="text-phosphor text-xl leading-none group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="mt-3 text-body text-pretty text-ghost max-w-[68ch]">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={`${WRAP} py-24 border-t border-rim/60`}>
        <h2 className="font-pixel text-pixel-3 sm:text-pixel-4 text-bright max-w-[14ch]">Ready to compile your first design?</h2>
        <p className="mt-6 mb-8 text-lead text-pretty text-pale max-w-[52ch]">
          Make an account and write Verilog in your browser. There is nothing to install and nothing to wait for.
        </p>
        <Link href="/login?mode=register" className={PRIMARY}>Create a free account</Link>
      </section>

      <footer className="border-t border-rim/50">
        <div className={`${WRAP} py-12 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-10`}>
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="text-body text-pale">Follow BitFlow</span>
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  className={`w-8 h-8 rounded-full border border-rim flex items-center justify-center text-bright hover:text-phosphor hover:border-phosphor/50 transition-colors ${FOCUS}`}
                >
                  {s.icon}
                </a>
              ))}
            </div>
            <p className="text-small text-ghost">© 2026 BitFlow. All rights reserved.</p>
            <p className="text-small text-ghost">
              Designed by{" "}
              <a href="https://www.linkedin.com/company/naviel-corporation/?viewAsMember=true" target="_blank" rel="noopener noreferrer" className={`text-phosphor hover:underline ${FOCUS}`}>
                NAVIEL Advanced Engineering &amp; Technology
              </a>
            </p>
          </div>
          <SiteLinks />
        </div>
      </footer>
    </main>
  );
}
