/**
 * lib/announcements.ts — what students are told about each update: post kinds, validation, order
 * and the unread count. Release posts live in content/announcements.ts and ship with the feature;
 * admins can also post from the console. Not for breach notices: those use components/SiteNotice.tsx.
 * Self-check: scripts/announcements.check.ts.
 */

export const ANNOUNCEMENT_KINDS = {
  release: "Release",
  feature: "New feature",
  improvement: "Improvement",
  fix: "Fix",
} as const;
export type AnnouncementKind = keyof typeof ANNOUNCEMENT_KINDS;

export const MAX_TITLE = 120;
export const MAX_BODY = 4000;

export interface AnnouncementPost {
  id: string;
  title: string;
  /** Paragraphs split by a blank line, "- " bullets, `code`. Always rendered as text, never HTML. */
  body: string;
  kind: string;
  version?: string | null;
  pinned?: boolean;
  publishedAt: Date | string;
}

const time = (d: Date | string) => new Date(d).getTime();

/** Why this post can't be stored, or null. */
export function announcementProblem(p: { title?: unknown; body?: unknown; kind?: unknown }): string | null {
  if (typeof p.title !== "string" || !p.title.trim() || p.title.length > MAX_TITLE) return `Write a title of 1 to ${MAX_TITLE} characters.`;
  if (typeof p.body !== "string" || !p.body.trim() || p.body.length > MAX_BODY) return `Write a post of 1 to ${MAX_BODY} characters.`;
  if (typeof p.kind !== "string" || !Object.keys(ANNOUNCEMENT_KINDS).includes(p.kind)) return "Unknown kind of post.";
  return null;
}

export const isPublished = (p: { publishedAt: Date | string }, now: Date = new Date()) => time(p.publishedAt) <= now.getTime();

/** Pinned first, then newest first. */
export const sortAnnouncements = <T extends { pinned?: boolean; publishedAt: Date | string }>(posts: T[]): T[] =>
  [...posts].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || time(b.publishedAt) - time(a.publishedAt));

/** Posted since the learner last opened the page; someone who has never opened it has every post to read. */
export const isUnread = (p: { publishedAt: Date | string }, seenAt: Date | string | null | undefined) =>
  !seenAt || time(p.publishedAt) > time(seenAt);

/** What the bell shows. */
export const badgeText = (unread: number) => (unread > 9 ? "9+" : String(unread));

/** A post's blocks, for rendering as text. */
export function bodyBlocks(body: string): ({ type: "p"; text: string } | { type: "ul"; items: string[] })[] {
  return body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((block) => {
    const lines = block.split("\n").map((l) => l.trim());
    return lines.every((l) => l.startsWith("- "))
      ? { type: "ul" as const, items: lines.map((l) => l.slice(2)) }
      : { type: "p" as const, text: lines.join(" ") };
  });
}
