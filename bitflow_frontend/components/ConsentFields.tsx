"use client";
/**
 * components/ConsentFields.tsx — month and year of birth plus acceptance of the privacy
 * notice (DPDP; lib/privacy.ts). Used by the sign-up form and the consent prompt for
 * existing accounts (components/ConsentGate.tsx).
 */
import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { isMinor } from "@/lib/privacy";

export interface ConsentValue { birthYear?: number; birthMonth?: number; consent: boolean }

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const field = "w-full bg-void border border-rim rounded-lg px-2 py-2 text-[13px] text-pale focus:outline-none focus:border-phosphor/60";

export default function ConsentFields({ value, onChange, askBirth = true }: { value: ConsentValue; onChange: Dispatch<SetStateAction<ConsentValue>>; askBirth?: boolean }) {
  const thisYear = new Date().getUTCFullYear();
  const years = Array.from({ length: 100 }, (_, i) => thisYear - 5 - i);
  const minor = !!value.birthYear && !!value.birthMonth && isMinor(value);
  return (
    <div className="space-y-3 text-left">
      {askBirth && (
        <fieldset className="space-y-1">
          <legend className="text-[11px] text-ghost mb-1">Month and year of birth <span className="text-dim">(only these, to know if a parent must agree)</span></legend>
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Birth month" className={field} value={value.birthMonth ?? ""} required
                    onChange={(e) => { const m = e.target.value ? Number(e.target.value) : undefined; onChange((v) => ({ ...v, birthMonth: m })); }}>
              <option value="">Month</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select aria-label="Birth year" className={field} value={value.birthYear ?? ""} required
                    onChange={(e) => { const y = e.target.value ? Number(e.target.value) : undefined; onChange((v) => ({ ...v, birthYear: y })); }}>
              <option value="">Year</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {minor && (
            <p className="text-[11px] text-warn leading-relaxed">
              You&apos;re under 18, so a parent or guardian needs to agree. After signing up you&apos;ll get a link to send them.
              Until then you can practise, but nothing is shared, and the AI tutor stays off.
            </p>
          )}
        </fieldset>
      )}
      <label className="flex items-start gap-2 text-[12px] text-ghost leading-relaxed">
        <input type="checkbox" className="accent-phosphor mt-0.5" checked={value.consent} required
               onChange={(e) => { const c = e.target.checked; onChange((v) => ({ ...v, consent: c })); }} />
        <span>
          I have read the <Link href="/privacy" target="_blank" className="text-phosphor hover:underline">privacy notice</Link> and
          agree that BitFlow uses my account and learning data as it describes, to run my account and grade my work.
          I can withdraw this any time by deleting my account.
        </span>
      </label>
    </div>
  );
}
