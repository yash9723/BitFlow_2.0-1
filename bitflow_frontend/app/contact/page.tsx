/** app/contact/page.tsx — contact form (components/ContactForm.tsx → POST /api/contact). Public. */

import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import ContactForm from "@/components/ContactForm";
import SiteFooter from "@/components/SiteFooter";
import { SITE_NAME, pageMeta } from "@/lib/site";

export const metadata = pageMeta("/contact", "Contact",
  `Get in touch with the ${SITE_NAME} team: questions, bug reports, classroom use and partnerships.`);

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-void text-bright">
      <nav className="flex items-center justify-between h-14 px-5 sm:px-6 border-b border-rim/50" aria-label="Main">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/bitflow_logo_64.png" alt="" width={28} height={28} className="w-7 h-7 object-contain" priority />
          <span className="font-display font-bold text-lg">{SITE_NAME}</span>
        </Link>
        <div className="flex gap-5 text-[12px]">
          <Link href="/about" className="text-ghost hover:text-bright">About</Link>
          <Link href="/studio" className="text-ghost hover:text-bright">Studio</Link>
        </div>
      </nav>
      <section className="max-w-2xl mx-auto px-5 py-14 space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold">Contact us</h1>
          <p className="text-[14px] text-ghost leading-relaxed">
            Questions about {SITE_NAME}, a bug to report, using it with a class, or an idea for a feature: send us a message
            and we&apos;ll reply by email.
          </p>
        </div>
        <Suspense fallback={null}><ContactForm /></Suspense>
        <p className="text-[12px] text-dim leading-relaxed">
          Requests about your personal data (a copy, a correction, deletion, or a complaint) go to the {SITE_NAME} Grievance Officer
          through this form: choose &ldquo;My personal data&rdquo;. We answer within 90 days. See the <Link href="/privacy" className="text-phosphor hover:underline">privacy notice</Link>.
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}
