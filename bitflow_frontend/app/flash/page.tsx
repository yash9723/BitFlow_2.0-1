/**
 * app/flash/page.tsx — program a real FPGA board over USB from the browser
 * (components/FlashTool.tsx). Public. Cross-origin isolated (next.config.js headers) so
 * openFPGALoader's WebAssembly threads can share memory.
 */
import Image from "next/image";
import Link from "next/link";
import FlashTool from "@/components/FlashTool";
import SiteFooter from "@/components/SiteFooter";
import { SITE_NAME, pageMeta } from "@/lib/site";

export const metadata = pageMeta("/flash", "Flash an FPGA board",
  "Program an iCEstick, iCEBreaker, ULX3S, OrangeCrab, Tang Nano or Digilent board straight from your browser over USB, with openFPGALoader. Nothing to install.");

export default function FlashPage() {
  return (
    <main className="min-h-screen bg-void text-bright">
      <nav className="flex items-center justify-between px-6 py-3 border-b border-rim/50" aria-label="Main">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/bitflow_logo_64.png" alt="" width={28} height={28} className="w-7 h-7 object-contain" priority />
          <span className="font-display font-bold text-lg">{SITE_NAME}</span>
        </Link>
        <div className="flex gap-5 text-[12px]">
          <Link href="/sandbox" className="text-ghost hover:text-bright">Sandbox</Link>
          <Link href="/studio" className="text-ghost hover:text-bright">Studio</Link>
        </div>
      </nav>
      <section className="max-w-3xl mx-auto px-5 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold">Flash an FPGA board</h1>
          <p className="text-[14px] text-ghost leading-relaxed">
            Plug the board in over USB, pick its bitstream and program it, right from the browser. Build the bitstream in
            the Sandbox (Synth → Bitstream) and it arrives here, or use one you built yourself.
          </p>
        </div>
        <FlashTool />
      </section>
      <SiteFooter />
    </main>
  );
}
