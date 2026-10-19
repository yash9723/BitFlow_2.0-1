/**
 * app/(legal)/privacy/page.tsx — privacy policy. Keep it in step with what
 * the code actually stores (prisma/schema.prisma, lib/auth-utils.ts,
 * app/api/analytics, lib/ai-providers.ts).
 */

import { OPERATOR, SITE_NAME } from "@/lib/site";

export const metadata = {
  title: "Privacy policy",
  description: `What ${SITE_NAME} stores about you, why, and how to have it deleted.`,
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="text-ghost text-[12px]">Last updated 19 October 2026</p>

      <p>
        {SITE_NAME} is run by {OPERATOR} (&quot;we&quot;). We collect as little as we can: there are no
        advertising or tracking cookies, and we never sell your data.
      </p>

      <h2>What we store</h2>
      <ul>
        <li><strong>Your account:</strong> your username and a salted hash of your password (never the password itself), plus an optional one-time recovery code, also stored only as a hash. We don&apos;t ask for your email or real name.</li>
        <li><strong>Your work:</strong> the Verilog code you run or submit, the results (pass/fail, test output, counterexamples), your lesson progress, XP, streaks, badges and contest scores.</li>
        <li><strong>Classes:</strong> if you join a class, its teachers see your username and your progress on the class&apos;s assignments.</li>
        <li><strong>Share links:</strong> a design you share is readable by anyone who has the link; ask us if you want one taken down.</li>
        <li><strong>Public leaderboard:</strong> your username, XP and number of solved problems.</li>
      </ul>

      <h2>Cookies and local storage</h2>
      <p>
        We set a single, strictly necessary cookie, <code>bitflow_session</code>, which keeps you signed in for up to
        a week. Your browser&apos;s local storage keeps editor drafts and panel sizes on your own device; it is never
        sent to us. Because nothing else is stored, there is no cookie banner.
      </p>

      <h2>Analytics</h2>
      <p>
        We count page views to see which pages are useful. Each view adds one to a daily counter for that page and the
        referring website&apos;s domain. We don&apos;t record your IP address, account, device or any identifier, and we
        don&apos;t use cookies for this. If your browser sends <em>Do Not Track</em> or <em>Global Privacy Control</em>,
        nothing is counted.
      </p>

      <h2>The AI assistant</h2>
      <p>
        When you use the AI assistant or &quot;Explain my failure&quot;, your question, your code and the relevant
        test results are sent to the AI provider we have configured (such as OpenAI, Google, Anthropic or Groq) to
        produce an answer. Nothing is sent unless you use these features. The provider handles the request under
        its own terms.
      </p>

      <h2>Server logs and security</h2>
      <p>
        Our servers keep short-lived technical logs (time, request path, errors) to keep the service running, and
        keep IP addresses in memory only briefly, for rate limiting. Traffic is encrypted with HTTPS and passwords
        are hashed with scrypt.
      </p>

      <h2>How long we keep it, and your choices</h2>
      <p>
        We keep your account and work until you ask us to delete them. You can change your password at any time
        from your profile. To get a copy of your data, or to have your account and everything linked to it
        deleted, contact us (below) with your username and we&apos;ll do it within 30 days.
      </p>

      <h2>Children</h2>
      <p>{SITE_NAME} is meant for students. If you are under 13, use it only with a parent&apos;s, guardian&apos;s or teacher&apos;s permission.</p>

      <h2>Changes</h2>
      <p>If this policy changes, we&apos;ll update the date above. Significant changes will also be announced on the site.</p>
    </>
  );
}
