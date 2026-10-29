/**
 * app/(legal)/privacy/page.tsx — privacy notice under India's Digital Personal Data Protection
 * Act 2023 and DPDP Rules 2025. Keep it in step with what the code actually stores
 * (prisma/schema.prisma, lib/privacy.ts, lib/auth-utils.ts, app/api/analytics,
 * components/Analytics.tsx, app/api/contact, lib/ai-providers.ts). A material change needs
 * a new CONSENT_VERSION in lib/privacy.ts so everyone is asked again.
 */

import Link from "next/link";
import { OPERATOR, SITE_NAME } from "@/lib/site";
import { CONSENT_VERSION, GRIEVANCE_DAYS } from "@/lib/privacy";

export const metadata = {
  title: "Privacy notice",
  description: `What ${SITE_NAME} keeps about you, why, for how long, and your rights under India's DPDP Act.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy notice</h1>
      <p className="text-ghost text-[12px]">Version {CONSENT_VERSION} · last updated 30 October 2026</p>

      <p>
        {SITE_NAME} is run by {OPERATOR} (&quot;we&quot;), the Data Fiduciary for your personal data under India&apos;s Digital
        Personal Data Protection Act, 2023 (&quot;DPDP Act&quot;). We collect as little as we can, there are no advertising cookies,
        and we never sell your data. When you create an account you agree to the processing described here; you can
        withdraw that agreement at any time by deleting your account.
      </p>

      <h2>What we keep, and why</h2>
      <ul>
        <li><strong>Account:</strong> your username, a salted hash of your password (never the password itself), an optional
          recovery code (also only a hash), and your <em>month and year</em> of birth. <em>Why:</em> to sign you in, and to know
          whether a parent must agree (under 18). We don&apos;t ask for your email, phone or real name.</li>
        <li><strong>Your work:</strong> the code you run or submit and its results (pass/fail, test output, counterexamples,
          gate counts), lesson progress, XP, streaks, badges, certificates and contest scores. <em>Why:</em> to grade your work,
          save your progress and show it back to you.</li>
        <li><strong>Projects and share links:</strong> designs you save, with their history. A design you share is readable by
          anyone with the link.</li>
        <li><strong>Classes:</strong> if you join a class, its teachers see your username and your progress on the class&apos;s
          assignments.</li>
        <li><strong>Public boards:</strong> the leaderboard, contest standings and smallest-design boards show your username and
          scores. Students under 18 appear as &quot;Student&quot; with a short code instead.</li>
        <li><strong>Public profile (off by default, never for under-18s):</strong> if you switch it on, anyone can see your stats
          and badges at its link.</li>
        <li><strong>Comments</strong> you post on solved problems, visible to other solvers.</li>
        <li><strong>Consent records:</strong> when you accepted this notice and, for under-18 accounts, the parent&apos;s name,
          relationship, choices and a keyed hash of their IP address, as evidence of consent.</li>
        <li><strong>Your nominee</strong>, if you name one (below).</li>
        <li><strong>Contact form:</strong> your name, email, subject and message, so we can reply.</li>
      </ul>

      <h2>Who processes it for us</h2>
      <p>
        We use these service providers (Data Processors), only to run {SITE_NAME}: <strong>Vercel</strong> (website hosting),
        <strong> Render</strong> (the simulator that runs your code), <strong>Neon</strong> (the database), <strong>GitHub</strong>
        (encrypted backups), and, only if you use the AI tutor, the configured AI provider (such as OpenAI, Google, Anthropic or
        Groq). Some of them process data outside India, which the DPDP Act allows except to countries the Government restricts.
      </p>

      <h2>Cookies, analytics and the AI tutor</h2>
      <p>
        One strictly necessary cookie, <code>bitflow_session</code>, keeps you signed in for up to a week. Local storage keeps
        editor drafts on your own device. We count page views with a daily counter per page that stores no IP address,
        account or identifier, and nothing is counted if your browser sends Do Not Track or Global Privacy Control.
        Google Analytics 4 runs only if you accept it in the cookie banner (anonymised IP, no advertising); &quot;Cookie
        settings&quot; at the bottom of the page changes your choice, and declining is as easy as accepting.
      </p>
      <p>
        When you use the AI tutor or &quot;Explain my failure&quot;, your question, your code and the test results are sent to the
        AI provider to produce an answer. Your username is not sent. Nothing is sent unless you use these features.
      </p>

      <h2>Children (under 18)</h2>
      <p>
        Under the DPDP Act a parent or legal guardian must consent for anyone under 18. When an under-18 student signs up, they
        get a link to send their parent, who reads this notice and consents on their own device; the parent can come back to the
        same link to change their choices or withdraw consent, which deletes the account. Until a parent consents the student can
        practise, but can&apos;t join a class or use the AI tutor. For every under-18 account, always: no analytics or tracking of
        any kind, no public profile, no username on public boards, and no comments; the AI tutor only if the parent allows it.
        The parent&apos;s identity is declared, not verified with documents; if you believe a child is using {SITE_NAME} without a
        parent&apos;s consent, tell us through the grievance form and we will act on it.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account and work: until you delete your account (or a parent withdraws consent). Deletion is immediate and removes
          everything linked to the account.</li>
        <li>Logs: error logs and an audit trail of privacy-related actions (consents, exports, deletions, admin changes) are kept for
          one year, as the DPDP Rules require, then deleted. After an account is deleted, the audit trail keeps only that it happened.</li>
        <li>Rate-limit counters: deleted within an hour after they expire.</li>
        <li>Contact messages: deleted one year after we resolve them.</li>
        <li>Encrypted database backups: 14 days.</li>
      </ul>

      <h2>Your rights</h2>
      <ul>
        <li><strong>Access:</strong> download everything we keep about you, including a summary of how it is processed, from
          your profile (&quot;Your data&quot; → Download my data).</li>
        <li><strong>Correction and erasure:</strong> fix or remove things yourself where the profile allows, delete your account
          from your profile, or ask us through the grievance form (for example to correct your month or year of birth).</li>
        <li><strong>Withdraw consent:</strong> delete your account at any time; it is as easy as giving consent.</li>
        <li><strong>Nominate someone</strong> to exercise these rights if you die or can&apos;t act yourself: profile → &quot;Your data&quot; → Nominee.</li>
        <li><strong>Grievances:</strong> write to the {SITE_NAME} Grievance Officer through the{" "}
          <Link href="/contact?kind=grievance">grievance form</Link> (choose &quot;My personal data&quot;). We answer within {GRIEVANCE_DAYS} days.</li>
        <li><strong>Complain to the Data Protection Board of India</strong> if you are not satisfied with our answer.</li>
      </ul>

      <h2>Security and breaches</h2>
      <p>
        Traffic is encrypted with HTTPS, passwords are hashed with scrypt, the database can only be opened with credentials that
        only our servers hold, and backups are encrypted. If a personal-data breach happens, we will tell the Data Protection Board and everyone affected
        without delay, and within 72 hours, with a notice on the site (we don&apos;t have your email) explaining what happened, what
        data was involved, what we are doing and what you can do.
      </p>

      <h2>Changes</h2>
      <p>
        If this notice changes in a way that matters, we update the version above and ask you to read and accept it again the next
        time you visit.
      </p>
    </>
  );
}
