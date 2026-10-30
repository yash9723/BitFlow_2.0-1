import { GATED } from "@/lib/site";
import AuthGate from "@/components/AuthGate";

export const metadata = {
  ...GATED,
  title: "Academy",
  description: "Digital electronics from your first bit to the university and GATE syllabus, with circuits you can click, worked examples and quizzes.",
};

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
