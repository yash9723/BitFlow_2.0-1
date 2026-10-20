/**
 * app/c/[id]/page.tsx — a claimed certificate (lib/tracks.ts). Public by
 * design: the link is what learners share and what employers use to verify.
 * Printable (Save as PDF) and addable to LinkedIn.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CertificateActions from "@/components/CertificateActions";
import { certificateById } from "@/lib/tracks";
import { OPERATOR, SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await certificateById(params.id);
  if (!c) return { title: "Certificate not found", robots: { index: false } };
  return {
    title: `${c.track.name} certificate: ${c.username}`,
    description: `${c.username} completed the ${c.track.name} track on ${SITE_NAME} (${c.problems} problems), ${fmt(c.issuedAt)}.`,
    robots: { index: false },
  };
}

export default async function CertificatePage({ params }: Props) {
  const c = await certificateById(params.id);
  if (!c) notFound();
  const url = `${SITE_URL}/c/${c.id}`;

  return (
    <main className="min-h-screen bg-void text-bright flex flex-col items-center px-4 py-10 print:bg-white print:p-0">
      <style>{`@media print { @page { size: landscape; margin: 0; } .no-print { display: none !important; } body { background: #fff !important; } }`}</style>

      <article aria-label="Certificate"
               className="w-full max-w-3xl aspect-[1.414] bg-[#fbfaf6] text-[#16181d] rounded-xl shadow-2xl print:shadow-none print:rounded-none print:max-w-none print:w-screen print:h-screen p-3 sm:p-5">
        <div className="h-full border-2 border-[#00a85a] rounded-lg p-6 sm:p-10 flex flex-col items-center justify-between text-center">
          <div className="flex items-center gap-2">
            <img src="/bitflow_logo_64.png" alt="" width={28} height={28} className="w-7 h-7" />
            <span className="font-bold tracking-wide">{SITE_NAME}</span>
          </div>

          <div className="space-y-2 sm:space-y-4">
            <div className="text-[10px] sm:text-[12px] tracking-[0.3em] uppercase text-[#00a85a] font-semibold">Certificate of completion</div>
            <div className="text-[11px] sm:text-[13px] text-[#5b5f6b]">This certifies that</div>
            <h1 className="text-2xl sm:text-4xl font-bold break-all">{c.username}</h1>
            <p className="text-[11px] sm:text-[14px] text-[#3a3d46] max-w-lg mx-auto leading-relaxed">
              completed the <strong>{c.track.name}</strong> track on {SITE_NAME}, solving all {c.problems} problems,
              each graded against hidden tests. {c.track.description}
            </p>
          </div>

          <div className="w-full grid grid-cols-3 items-end text-[9px] sm:text-[11px] text-[#5b5f6b]">
            <div className="text-left">
              <div className="font-semibold text-[#16181d]">{fmt(c.issuedAt)}</div>
              <div>Date issued</div>
            </div>
            <div>
              <div className="font-semibold text-[#16181d]">{OPERATOR}</div>
              <div>Issuer</div>
            </div>
            <div className="text-right">
              <div className="font-mono font-semibold text-[#16181d]">{c.id}</div>
              <div>Certificate ID</div>
            </div>
          </div>
        </div>
      </article>

      <div className="no-print w-full max-w-3xl mt-6 space-y-4">
        <p className="text-[12px] text-ghost text-center">
          Verify this certificate at <span className="font-mono text-pale break-all">{url.replace(/^https?:\/\//, "")}</span>
        </p>
        <CertificateActions url={url} id={c.id} trackName={c.track.name} issued={c.issuedAt.toISOString()} />
        <p className="text-center text-[12px]">
          <Link href="/" className="text-phosphor hover:underline">Learn Verilog on {SITE_NAME}</Link>
        </p>
      </div>
    </main>
  );
}
