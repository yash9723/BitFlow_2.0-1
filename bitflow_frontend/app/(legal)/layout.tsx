/**
 * app/(legal)/layout.tsx — shared chrome for /privacy and /terms: a slim
 * header, readable prose column and the operator/contact footer.
 */

import Image from "next/image";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { CONTACT_EMAIL, OPERATOR, SITE_NAME } from "@/lib/site";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-void text-bright">
      <nav className="flex items-center justify-between h-14 px-5 sm:px-6 border-b border-rim/50">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/bitflow_logo_64.png" alt="" width={28} height={28} className="w-7 h-7 object-contain" priority />
          <span className="font-display font-bold text-lg">{SITE_NAME}</span>
        </Link>
        <div className="flex gap-5 text-[12px]">
          <Link href="/privacy" className="text-ghost hover:text-bright">Privacy</Link>
          <Link href="/terms" className="text-ghost hover:text-bright">Terms</Link>
          <Link href="/contact" className="text-ghost hover:text-bright">Contact</Link>
        </div>
      </nav>
      <article className="max-w-2xl mx-auto px-5 py-14 text-[14px] leading-relaxed text-pale
                          [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-bright [&_h1]:mb-2
                          [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-bright [&_h2]:mt-10 [&_h2]:mb-3
                          [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:mb-3
                          [&_a]:text-phosphor [&_a:hover]:underline [&_strong]:text-bright">
        {children}
        <h2>Contact</h2>
        <p>
          {SITE_NAME} is operated by {OPERATOR}.{" "}
          {CONTACT_EMAIL
            ? <>Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</>
            : <>Write to us with the <Link href="/contact">contact form</Link>.</>}
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
