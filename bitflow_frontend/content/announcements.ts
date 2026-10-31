/**
 * content/announcements.ts — release posts, shown on /announcements. prisma/seed.ts copies them to
 * the database on deploy, so a post goes live with its feature.
 *
 * Every push of something students can see adds a post here. Say only what really shipped, in plain
 * words, and keep each id forever: it's how the seed finds the post again.
 */
import type { AnnouncementPost } from "../lib/announcements";

export const RELEASE_POSTS: (AnnouncementPost & { publishedAt: string })[] = [
  {
    id: "bitflow-3-apex",
    kind: "release",
    version: "3.0",
    pinned: true,
    publishedAt: "2026-10-31T12:00:00+05:30",
    title: "BitFlow 3.0 APEX is here",
    body: `The biggest update so far, built to take you from your first logic gate to interview-ready digital design.

- A new 20-chapter Academy with interactive animations, live circuits and practice questions
- A professional circuit Studio with graded challenges
- Interview prep with timed mock interviews
- 15 new Arena problems
- Board Lab checks on your real FPGA board, plus a waveform view
- Your Lab and Academy progress now saved to your account

Every update from here on is posted on this page, so watch the bell at the top of the site.`,
  },
  {
    id: "interview-prep",
    kind: "feature",
    publishedAt: "2026-10-31T11:00:00+05:30",
    title: "Interview prep and timed mock interviews",
    body: `Open Interview in the menu to practise by topic: state machines, arithmetic, timing and CDC, memories, protocols and verification, or start with the Top 25.

Ready to test yourself? A mock interview gives you one easy, one medium and one hard problem in 45 minutes. The AI tutor, hints and editorials stay closed until it ends, and you get a report with what you solved, when, your Submits and your gate count.

The Arena also has 15 new problems across Combinational, Sequential and Protocol, including a UART transmitter, an APB slave and a pulse crossing clock domains.`,
  },
  {
    id: "board-lab-check-on-board",
    kind: "feature",
    publishedAt: "2026-10-31T10:00:00+05:30",
    title: "Check your design on a real board",
    body: `Serial lessons in the Board Lab now have Check on my board. After you flash a lesson, BitFlow talks to your board over USB, sends the lesson's test text and checks the reply. A pass shows as Verified on hardware. It needs Chrome or Edge.

This check is brand new, so if your board behaves differently, please tell us through the Contact page.

Every Lab lesson also has a Waveform tab: record your design's ports as it runs, look at them in the viewer, or download a VCD file.`,
  },
  {
    id: "academy-20-chapters",
    kind: "feature",
    publishedAt: "2026-10-31T09:00:00+05:30",
    title: "A new Digital Electronics Academy, 20 chapters",
    body: `The Academy has been rewritten from the ground up, starting at "what is digital?" and going through number systems, Karnaugh maps, adders, flip-flops, state machines, timing, memories, ADC and DAC, and on to Verilog.

Chapters now have step-through animations, live circuits you can play with, K-maps, timing diagrams and practice questions.`,
  },
  {
    id: "studio-professional",
    kind: "feature",
    publishedAt: "2026-10-30T18:00:00+05:30",
    title: "A far more capable circuit Studio",
    body: `- Turn a K-map into a circuit and a circuit back into a K-map
- 13 new circuit parts, rotate and flip, auto-routing, tunnels and IEC symbols
- A timing panel, and FSM tools that minimise states and use Gray encoding
- Save circuits to your account and share them by link
- Graded circuit challenges
- VCD files you can download`,
  },
  {
    id: "progress-and-navigation",
    kind: "improvement",
    publishedAt: "2026-10-30T12:00:00+05:30",
    title: "Your progress follows you, and the site is easier to get around",
    body: `Board Lab and Academy progress is now saved to your account, so it follows you between devices.

The site also has one menu on every page, and a new Problems page lists everything in one place, with search and filters.`,
  },
];
