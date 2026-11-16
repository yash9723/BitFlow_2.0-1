// Metadata only: the page is a client component.
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta("/leaderboard", "Leaderboard", "Top BitFlow learners ranked by XP and Verilog problems solved. Earn XP from graded practice problems, Board Lab lessons, circuit challenges and contests.");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
