// The admin console is checked here, on the server, before any of it renders: signed-out
// visitors go to sign-in, signed-in non-admins to their dashboard. (Every /api/admin route
// checks again; this keeps the console's UI away from everyone else.)
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") redirect("/dashboard");
  return children;
}
