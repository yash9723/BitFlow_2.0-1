import AuthGate from "@/components/AuthGate";

export const metadata = {
  title: "Arena",
  description: "Verilog practice problems by topic (combinational, sequential, FSMs, verification) graded against hidden tests.",
};

export default function ArenaLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
