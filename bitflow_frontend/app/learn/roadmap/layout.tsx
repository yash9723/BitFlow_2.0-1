export const metadata = {
  title: { absolute: "Learning roadmap · BitFlow" },   // the parent layout sets a plain title, which drops the root template
  description: "The whole Verilog learning path on one map: every module from logic gates to a RISC-V CPU, and what each one unlocks.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
