/**
 * lib/home-faq.ts — the landing page's questions and answers. One list feeds both the visible FAQ
 * (components/HomePage.tsx) and its FAQPage structured data (app/page.tsx), so what search and answer
 * engines read is exactly what visitors see. Keep every answer true of the shipped product: check it against
 * the README or the page it links to before changing it.
 */
import { ACADEMY_TOPIC_META } from "./academy-meta";
import { OPERATOR } from "./site";

export interface Faq { q: string; a: string }

export const HOME_FAQ: Faq[] = [
  {
    q: "What is BitFlow?",
    a: "BitFlow is an online Verilog and SystemVerilog simulator and learning platform. You write RTL in the browser, run it, and read the result as waveforms, with guided lessons, graded practice problems, synthesis diagrams and a virtual FPGA board alongside.",
  },
  {
    q: "Is BitFlow free?",
    a: "Creating an account is free. The Board Lab lessons and the Design Studio tools can be opened without signing in; a free account unlocks the Academy, graded problems, classes and contests, and saves your progress.",
  },
  {
    q: "Do I need to install a Verilog simulator?",
    a: "No. You write and run code in your browser. Simulation runs on BitFlow's servers using open-source tools: Icarus Verilog and Verilator for Verilog and SystemVerilog, GHDL for VHDL, and Yosys for synthesis.",
  },
  {
    q: "Can I learn digital electronics here if I am a beginner?",
    a: `Yes. The Academy has ${ACADEMY_TOPIC_META.length} chapters that start at what a bit is and go through logic gates, Boolean algebra, K-maps, counters and finite state machines to the university and GATE syllabus, each with circuits you can click, worked examples and a quiz.`,
  },
  {
    q: "Can I run my design on a real FPGA board?",
    a: "Yes. The Board Lab lessons run your Verilog on a 3D board in the browser first, and then show how to put the same design on supported boards such as the Tang Nano, ULX3S and OrangeCrab. The Flash page programs a supported board from the browser.",
  },
  {
    q: "Who builds BitFlow?",
    a: `BitFlow is built by ${OPERATOR}. The About page has the team and the story.`,
  },
];
