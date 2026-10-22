/**
 * app/u/[username]/page.tsx — public profile. Only for learners who switched
 * "Public profile" on; anyone else gets the same 404 as a nonexistent user, so
 * private accounts can't be discovered here.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import ProfileView from "@/components/ProfileView";
import { getSessionUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { profileStats } from "@/lib/profile";

export const dynamic = "force-dynamic";

type Props = { params: { username: string } };

// cache(): the metadata and the page both look the user up; one query per request
const findUser = cache((username: string) => prisma.user.findUnique({
  where: { username: decodeURIComponent(username) },
  select: { id: true, publicProfile: true },
}));

async function publicUserId(username: string): Promise<string | null> {
  const user = await findUser(username);
  return user?.publicProfile ? user.id : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = await publicUserId(params.username);
  if (!id) return { title: "Profile not found", robots: { index: false } };
  const name = decodeURIComponent(params.username);
  return {
    title: `${name}'s profile`,
    description: `${name}'s Verilog and digital design progress on BitFlow: problems solved, badges and certificates.`,
  };
}

export default async function PublicProfilePage({ params }: Props) {
  // Your own private profile: say why it's hidden instead of a bare 404 (others still get the 404)
  const owner = await findUser(params.username);
  if (owner && !owner.publicProfile && (await getSessionUser())?.id === owner.id) {
    return (
      <main className="min-h-screen bg-void flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3 font-mono">
          <h1 className="text-bright text-lg">Your profile is private</h1>
          <p className="text-ghost text-sm">
            Only you can see this message. To share this link, turn on &quot;Public profile&quot; in your{" "}
            <Link href="/profile" className="text-info hover:underline">profile settings</Link>.
          </p>
        </div>
      </main>
    );
  }
  const id = await publicUserId(params.username);
  const data = id ? await profileStats(id) : null;
  if (!data) notFound();
  // The internal id stays on the server.
  return <ProfileView data={{ ...data, user: { ...data.user, id: "" } }} own={false} />;
}
