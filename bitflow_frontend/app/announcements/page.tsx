/**
 * app/announcements/page.tsx — every update BitFlow rolls out, newest first, under the 3.0 APEX
 * hero. Public; signed-in learners also see what's new since their last visit (lib/announcements.ts).
 * The title and the fire stay put while the posts scroll up over them, and scrolling turns the page green and iron.
 * The theme is scoped to `.apex` (app/globals.css): the rest of the site keeps its own colours.
 */
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PixelFire from "@/components/PixelFire";
import ScrollUnlock from "@/components/ScrollUnlock";
import { rich } from "@/components/lab/rich";
import { ANNOUNCEMENT_KINDS, bodyBlocks, isUnread, type AnnouncementKind } from "@/lib/announcements";
import { publishedAnnouncements, seenAt } from "@/lib/announcements-server";
import { getSessionUser } from "@/lib/auth-utils";
import { pixel } from "@/lib/fonts";
import { pageMeta } from "@/lib/site";
import MarkSeen from "./MarkSeen";

export const dynamic = "force-dynamic";
export const metadata = pageMeta("/announcements", "Announcements: BitFlow 3.0 APEX",
  "What's new on BitFlow: every new feature, improvement and fix, as it ships.");

const dateText = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export default async function AnnouncementsPage() {
  const [posts, user] = await Promise.all([publishedAnnouncements().catch(() => []), getSessionUser()]);
  const seen = user ? await seenAt(user.id) : null;

  return (
    <div className="apex min-h-screen flex flex-col">
      <ScrollUnlock />
      <SiteHeader />
      {user && <MarkSeen />}

      <div aria-hidden className="apex-doom" />
      <header className="apex-stage">
        <div className="apex-recede max-w-3xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16">
          <p className="apex-eyebrow">Announcements</p>
          <h1 className={`${pixel.className} leading-[0.9] tracking-wide mt-4 text-[72px] sm:text-[120px]`}>
            <span className="apex-silver">BitFlow 3.0</span>{" "}
            <span className="apex-flame">APEX</span>
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed apex-steel">
            Every new feature, improvement and fix, posted here as it ships.
          </p>
        </div>
      </header>

      <main className="apex-feed flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 space-y-10">
        {posts.length === 0 && <p className="apex-steel text-sm">Nothing posted yet.</p>}
        {posts.map((p) => {
          const fresh = !!user && isUnread(p, seen);
          return (
            <article key={p.id} className={`apex-card ${p.pinned ? "apex-card-pinned" : ""} p-5 sm:p-6`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]">
                <span className="apex-kind">{ANNOUNCEMENT_KINDS[p.kind as AnnouncementKind] ?? p.kind}{p.version ? ` ${p.version}` : ""}</span>
                {fresh && <span className="apex-new">New</span>}
                <time dateTime={p.publishedAt.toISOString()} className="apex-steel ml-auto">{dateText(p.publishedAt)}</time>
              </div>
              <h2 className="mt-3 text-xl sm:text-2xl font-display font-bold apex-bright">{p.title}</h2>
              <div className="mt-3 space-y-3 text-[14.5px] leading-relaxed">
                {bodyBlocks(p.body).map((b, i) => b.type === "p"
                  ? <p key={i}>{rich(b.text)}</p>
                  : <ul key={i} className="apex-list space-y-1.5">{b.items.map((item, k) => <li key={k}>{rich(item)}</li>)}</ul>)}
              </div>
            </article>
          );
        })}
      </main>

      <PixelFire stoked className="apex-pixelfire-dock" />
      <div className="apex-footer"><SiteFooter /></div>
    </div>
  );
}
