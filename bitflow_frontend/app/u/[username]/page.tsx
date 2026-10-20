/**
 * app/u/[username]/page.tsx — public profile. Only for learners who switched
 * "Public profile" on; anyone else gets the same 404 as a nonexistent user, so
 * private accounts can't be discovered here.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProfileView from "@/components/ProfileView";
import { prisma } from "@/lib/prisma";
import { profileStats } from "@/lib/profile";

export const dynamic = "force-dynamic";

type Props = { params: { username: string } };

async function publicUserId(username: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { username: decodeURIComponent(username) },
    select: { id: true, publicProfile: true },
  });
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
  const id = await publicUserId(params.username);
  const data = id ? await profileStats(id) : null;
  if (!data) notFound();
  // The internal id stays on the server.
  return <ProfileView data={{ ...data, user: { ...data.user, id: "" } }} own={false} />;
}
