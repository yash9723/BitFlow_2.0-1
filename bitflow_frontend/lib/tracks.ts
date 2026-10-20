/**
 * lib/tracks.ts — certificate tracks. A learner who has solved every problem in
 * a track can claim its certificate (POST /api/certificates), which gets a
 * public, verifiable page at /c/<id>.
 */

import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface Track {
  id:          string;
  name:        string;          // printed on the certificate
  description: string;
  where:       Prisma.QuestionWhereInput;
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
];

export const trackById = (id: string) => TRACKS.find((t) => t.id === id);

export interface TrackProgress {
  id: string; name: string; description: string;
  solved: number; total: number; complete: boolean;
  certificateId: string | null;
}

/** Progress on every non-empty track, with the certificate id if already claimed. */
export async function trackProgress(userId: string): Promise<TrackProgress[]> {
  const [rows, certs] = await Promise.all([
    Promise.all(TRACKS.map(async (t) => {
      const [total, solved] = await Promise.all([
        prisma.question.count({ where: t.where }),
        prisma.userProgress.count({ where: { userId, solved: true, question: t.where } }),
      ]);
      return { t, total, solved };
    })),
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
    select: { id: true, track: true, issuedAt: true, user: { select: { username: true } } },
  });
  const track = cert && trackById(cert.track);
  if (!cert || !track) return null;
  const problems = await prisma.question.count({ where: track.where });
  return { id: cert.id, issuedAt: cert.issuedAt, username: cert.user.username, track, problems };
}

/** Short, unguessable id for the public certificate URL. */
export function newCertificateId(): string {
  return crypto.randomBytes(9).toString("base64url");   // 12 chars
}
