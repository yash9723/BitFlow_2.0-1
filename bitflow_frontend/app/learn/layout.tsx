import AuthGate from "@/components/AuthGate";

export const metadata = {
  title: "Learning path",
  description: "A guided path of graded Verilog problems from beginner to advanced, with hints, waveforms and an AI tutor.",
};

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
