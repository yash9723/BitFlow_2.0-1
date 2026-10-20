"use client";
/**
 * components/CertificateActions.tsx — buttons under a certificate (/c/<id>):
 * print / save as PDF, copy the verification link, add to LinkedIn.
 */

import { useState } from "react";

export default function CertificateActions({ url, id, trackName, issued }: { url: string; id: string; trackName: string; issued: string }) {
  const [copied, setCopied] = useState(false);
  const d = new Date(issued);
  // LinkedIn's "Add licence or certification" form, prefilled
  const linkedIn = "https://www.linkedin.com/profile/add?" + new URLSearchParams({
    startTask:        "CERTIFICATION_NAME",
    name:             `${trackName} (BitFlow)`,
    organizationName: "BitFlow",
    issueYear:        String(d.getUTCFullYear()),
    issueMonth:       String(d.getUTCMonth() + 1),
    certUrl:          url,
    certId:           id,
  });

  const btn = "px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors";
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <a href={linkedIn} target="_blank" rel="noopener noreferrer" className={`${btn} bg-[#0a66c2] text-white hover:bg-[#0958a8]`}>
        Add to LinkedIn
      </a>
      <button onClick={() => window.print()} className={`${btn} bg-phosphor text-void hover:bg-phosphor-glow`}>
        Print / Save as PDF
      </button>
      <button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className={`${btn} border border-rim text-pale hover:text-bright`}>
        {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
