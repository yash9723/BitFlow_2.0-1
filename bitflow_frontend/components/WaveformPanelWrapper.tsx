"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import type { SimulateResponse } from "@/lib/types";
import { parseVcd } from "@/lib/vcd-parser";
import WaveformPanel from "./WaveformPanel";
interface Props {
  vcdBase64: string;
  result: SimulateResponse;
}

export function WaveformPanelWrapper({ vcdBase64, result }: Props) {
  const page = usePathname();
  // Parse VCD from base64 — memoized so it only runs once per base64 change
  const parsedVcd = useMemo(() => {
    try {
      // Decode base64 → binary string → text
      const binary = atob(vcdBase64);
      const vcdText = new TextDecoder().decode(
        new Uint8Array(binary.split('').map(c => c.charCodeAt(0)))
      );
      // Parse VCD text
      return parseVcd(vcdText);
    } catch (err) {
      console.error("Failed to parse VCD:", err);
      return null;
    }
  }, [vcdBase64]);

  // Only render WaveformPanel if parsing succeeded
  if (!parsedVcd) {
    return (
      <div className="flex items-center justify-center h-full bg-pit">
        <p className="font-mono text-[11px] text-dim/50">Failed to parse waveform</p>
      </div>
    );
  }

  return <WaveformPanel parsedVcd={parsedVcd} result={result} viewKey={page} />;
}