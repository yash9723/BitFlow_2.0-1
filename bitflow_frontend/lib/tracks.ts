/**
 * lib/tracks.ts — certificate tracks. A learner who has solved every problem in
 * a track (or finished every lesson of a lesson track) can claim its certificate
 * (POST /api/certificates), which gets a public page at /c/<id>.
 */

import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PRIVACY_SELECT, publicName } from "@/lib/privacy";
import { lessonSlugs, type LessonKind } from "@/lib/lessons";

export interface Track {
  id:          string;
  name:        string;          // printed on the certificate
  description: string;
  /** The track's problems, graded on the server. */
  where?:      Prisma.QuestionWhereInput;
  /** Or a lesson track: every Board Lab lesson or Academy chapter, checked in the learner's browser. */
  lessons?:    LessonKind;
}

export const TRACKS: Track[] = [
  { id: "beginner",     name: "Verilog Beginner",      description: "Gates, buses, combinational logic and first sequential circuits.",
    where: { learningLevel: "Verilog Beginner" } },
  { id: "intermediate", name: "Verilog Intermediate",  description: "Counters, shift registers, state machines and memories.",
    where: { learningLevel: "Verilog Intermediate" } },
  { id: "advanced",     name: "Verilog Advanced",      description: "Pipelines, protocols, arithmetic units and larger designs.",
    where: { learningLevel: "Verilog Advanced", NOT: { category: "riscv" } } },
  { id: "verification", name: "Hardware Verification", description: "Writing testbenches that catch real bugs.",
    where: { problemType: "testbench" } },
  { id: "riscv",        name: "RISC-V CPU Design",     description: "A working single-cycle RV32I processor, built module by module.",
    where: { category: "riscv" } },
  { id: "board-lab",           name: "Board Lab",           description: "From a first LED to serial links, sound, displays and real-world interfaces on an FPGA board.",
    lessons: "lab" },
  { id: "digital-electronics", name: "Digital Electronics", description: "The Digital Electronics Academy, every chapter's quiz passed.",
    lessons: "academy" },
];

export const trackById = (id: string) => TRACKS.find((t) => t.id === id);

/** How far a learner is on a track: problems solved, or lessons finished. */
export async function trackCounts(t: Track, userId: string): Promise<{ total: number; solved: number }> {
  if (t.lessons) {
    const slugs = lessonSlugs(t.lessons);
    const solved = await prisma.lessonProgress.count({ where: { userId, kind: t.lessons, done: true, slug: { in: slugs } } });
    return { total: slugs.length, solved };
  }
  const [total, solved] = await Promise.all([
    prisma.question.count({ where: t.where }),
    prisma.userProgress.count({ where: { userId, solved: true, question: t.where } }),
  ]);
  return { total, solved };
}

export interface TrackProgress {
  id: string; name: string; description: string;
  solved: number; total: number; complete: boolean;
  certificateId: string | null;
}

/** Progress on every non-empty track, with the certificate id if already claimed. */
export async function trackProgress(userId: string): Promise<TrackProgress[]> {
  const [rows, certs] = await Promise.all([
    Promise.all(TRACKS.map(async (t) => ({ t, ...(await trackCounts(t, userId)) }))),
    prisma.certificate.findMany({ where: { userId }, select: { id: true, track: true } }),
  ]);
  return rows
    .filter((r) => r.total > 0)
    .map(({ t, total, solved }) => ({
      id: t.id, name: t.name, description: t.description,
      solved, total, complete: solved >= total,
      certificateId: certs.find((c) => c.track === t.id)?.id ?? null,
    }));
}

/** A claimed certificate as shown on /c/<id>, or null. */
export async function certificateById(id: string) {
  const cert = await prisma.certificate.findUnique({
    where: { id },
    select: { id: true, track: true, issuedAt: true, user: { select: { id: true, username: true, ...PRIVACY_SELECT } } },
  });
  const track = cert && trackById(cert.track);
  if (!cert || !track) return null;
  const problems = track.lessons ? lessonSlugs(track.lessons).length : await prisma.question.count({ where: track.where });
  // The page is public: an under-18 learner's certificate doesn't show their username.
  return { id: cert.id, issuedAt: cert.issuedAt, username: publicName(cert.user), track, problems };
}

/** Short, unguessable id for the public certificate URL. */
export function newCertificateId(): string {
  return crypto.randomBytes(9).toString("base64url");   // 12 chars
}
