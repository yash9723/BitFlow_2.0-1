/**
 * app/flash/page.tsx — program a real FPGA board over USB from the browser
 * (components/FlashTool.tsx) and talk to its serial port (components/SerialMonitor.tsx). Public. Cross-origin isolated (next.config.js headers) so
 * openFPGALoader's WebAssembly threads can share memory.
 */
import Image from "next/image";
import Link from "next/link";
import FlashTool from "@/components/FlashTool";
import SerialMonitor from "@/components/SerialMonitor";
import SiteFooter from "@/components/SiteFooter";
import { SITE_NAME, pageMeta } from "@/lib/site";
import SiteHeader from "@/components/SiteHeader";

export const metadata = pageMeta("/flash", "Flash an FPGA board",
  "Program an iCEstick, iCEBreaker, ULX3S, OrangeCrab, Tang Nano or Digilent board straight from your browser over USB, with openFPGALoader. Nothing to install.");

export default function FlashPage() {
  return (
    <main className="min-h-screen bg-void text-bright">
      <SiteHeader />
      <section className="max-w-3xl mx-auto px-5 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold">Flash an FPGA board</h1>
          <p className="text-[14px] text-ghost leading-relaxed">
            Plug the board in over USB, pick its bitstream and program it, right from the browser. Build the bitstream in
            the Sandbox (Synth → Bitstream) and it arrives here, or use one you built yourself.
          </p>
        </div>
        <FlashTool />
        <div className="space-y-3 border-t border-rim/50 pt-8">
          <h2 className="font-display text-xl font-bold">Serial monitor</h2>
          <p className="text-[13px] text-ghost leading-relaxed">
            Talk to your design&apos;s UART once it runs on the board: what it sends on tx appears here, and what you type goes to rx.
          </p>
          <SerialMonitor />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
