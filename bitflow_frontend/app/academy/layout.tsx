import { GATED, pageMeta } from "@/lib/site";
import AuthGate from "@/components/AuthGate";

// The Academy is for signed-in learners. GATED keeps it out of search results (crawlers only see the sign-in redirect).
export const metadata = {
  ...pageMeta("/academy", "Academy",
    "Digital electronics from your first bit to the university and GATE syllabus, with circuits you can click, worked examples and quizzes."),
  ...GATED,
  // A string title in a layout drops the root template for its pages, so give the chapters their own.
  title: { default: "Academy · BitFlow", template: "%s · BitFlow Academy" },
};

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
