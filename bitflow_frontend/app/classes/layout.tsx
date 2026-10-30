import SiteHeader from "@/components/SiteHeader";
import AuthGate from "@/components/AuthGate";

export const metadata = { title: "Classes", robots: { index: false } };

export default function ClassesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="min-h-screen bg-void text-bright">
        <SiteHeader />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
      </div>
    </AuthGate>
  );
}
