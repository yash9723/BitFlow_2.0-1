/**
 * app/lab/layout.tsx — the Board Lab's frame: header and page width. Public: lessons run in
 * the browser, so guests can use them and search engines can read them.
 */
import SiteHeader from "@/components/SiteHeader";

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-void text-bright flex flex-col">
      <SiteHeader />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  );
}
