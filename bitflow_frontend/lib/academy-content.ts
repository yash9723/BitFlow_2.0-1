/**
 * lib/academy-content.ts — Digital Electronics Academy chapters and lookup helpers.
 *
 * Every chapter's text and circuits load with this module, so it is for the server: the chapter
 * page, lessons and certificates. Client pages that list chapters use lib/academy-meta.ts
 * (scripts/academy.check.ts enforces this and keeps the two in step).
 */

import type { AcademyTopic } from "./academy-types";

import whatIsDigital    from "@/content/what-is-digital/chapter";
import numberSystems    from "@/content/number-systems/chapter";
import binaryArithmetic from "@/content/binary-arithmetic/chapter";
import codes            from "@/content/codes/chapter";
import gates            from "@/content/gates/chapter";
import booleanAlgebra   from "@/content/boolean-algebra/chapter";
import karnaughMaps     from "@/content/karnaugh-maps/chapter";
import quineMcCluskey   from "@/content/quine-mccluskey/chapter";
import logicFamilies    from "@/content/logic-families/chapter";
import addersComparators from "@/content/adders-comparators/chapter";
import combinational    from "@/content/combinational/chapter";
import arithmeticCircuits from "@/content/arithmetic-circuits/chapter";
import sequential       from "@/content/sequential/chapter";
import registers        from "@/content/registers/chapter";
import counters         from "@/content/counters/chapter";
import fsms             from "@/content/fsms/chapter";

import timing           from "@/content/timing/index.json";
import memory           from "@/content/memory/index.json";

const RAW_TOPICS: AcademyTopic[] = [
  whatIsDigital,
  numberSystems,
  binaryArithmetic,
  codes,
  gates,
  booleanAlgebra,
  karnaughMaps,
  quineMcCluskey,
  logicFamilies,
  addersComparators,
  combinational,
  arithmeticCircuits,
  sequential,
  registers,
  counters,
  timing,
  fsms,
  memory,
] as unknown as AcademyTopic[];

/** All topics sorted by curriculum order */
export const ACADEMY_TOPICS: AcademyTopic[] = [...RAW_TOPICS].sort(
  (a, b) => a.order - b.order
);

export function getTopicBySlug(slug: string): AcademyTopic | undefined {
  return ACADEMY_TOPICS.find((t) => t.slug === slug);
}

export function getTopicSlugs(): string[] {
  return ACADEMY_TOPICS.map((t) => t.slug);
}

export function getNextTopic(slug: string): AcademyTopic | undefined {
  const idx = ACADEMY_TOPICS.findIndex((t) => t.slug === slug);
  if (idx < 0 || idx >= ACADEMY_TOPICS.length - 1) return undefined;
  return ACADEMY_TOPICS[idx + 1];
}

export function getPrevTopic(slug: string): AcademyTopic | undefined {
  const idx = ACADEMY_TOPICS.findIndex((t) => t.slug === slug);
  if (idx <= 0) return undefined;
  return ACADEMY_TOPICS[idx - 1];
}
