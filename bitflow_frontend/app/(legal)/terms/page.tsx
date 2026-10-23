/**
 * app/(legal)/terms/page.tsx — terms of use.
 */

import Link from "next/link";
import { OPERATOR, SITE_NAME } from "@/lib/site";

export const metadata = {
  title: "Terms of use",
  description: `The rules for using ${SITE_NAME}: your account, your code, fair use of the simulators and contests.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of use</h1>
      <p className="text-ghost text-[12px]">Last updated 19 October 2026</p>

      <p>
        These terms cover your use of {SITE_NAME}, run by {OPERATOR}. By creating an account or using the site you
        agree to them. Our <Link href="/privacy">privacy policy</Link> explains what data we keep.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your password and recovery code safe; you are responsible for what happens under your account.</li>
        <li>One person per account. Don&apos;t impersonate others or choose an offensive username; we may rename or remove such accounts.</li>
      </ul>

      <h2>Your code</h2>
      <p>
        You own the code you write. You give us permission to store it, compile and simulate it, and show it back to
        you, to teachers of classes you join, and to anyone you send a share link to. Lesson text, problems, test
        benches and reference solutions belong to {OPERATOR}; don&apos;t copy or republish them in bulk.
      </p>

      <h2>Fair use</h2>
      <ul>
        <li>The simulators, synthesis tools and AI assistant are for learning hardware design. Don&apos;t use them to attack, overload or probe the service, mine cryptocurrency, or run anything unrelated.</li>
        <li>Don&apos;t try to read other users&apos; data, hidden tests or reference solutions, or get around rate limits.</li>
        <li>Contests are individual: don&apos;t share solutions while a contest is running or use multiple accounts.</li>
      </ul>
      <p>We may limit, suspend or remove accounts that break these rules.</p>

      <h2>AI answers</h2>
      <p>The AI assistant can be wrong. Check its suggestions before relying on them, especially for real hardware.</p>

      <h2>No warranty</h2>
      <p>
        {SITE_NAME} is provided free and &quot;as is&quot;. Simulation and synthesis results are for education and
        may differ from real tools or devices. We don&apos;t guarantee the service will always be available or that
        your data can never be lost, so keep copies of work that matters. To the extent the law allows, we aren&apos;t
        liable for indirect losses from using the site.
      </p>

      <h2>Changes and ending</h2>
      <p>
        We may update these terms; the date above shows the latest version, and continuing to use the site means you
        accept it. You can stop using {SITE_NAME} at any time and ask us to delete your account.
      </p>
    </>
  );
}
