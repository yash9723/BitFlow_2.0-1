export const metadata = {
  title: { absolute: "VLSI roadmap · BitFlow" },   // the parent layout sets a plain title, which drops the root template
  description: "A roadmap of VLSI and digital design skills, from Verilog basics to verification, synthesis and FPGA flows, with the Academy lessons for each.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
