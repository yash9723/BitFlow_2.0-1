import { pageMeta } from "@/lib/site";

export const metadata = {
  ...pageMeta("/academy/roadmap", "VLSI roadmap",
    "A roadmap of VLSI and digital design skills, from Verilog basics to verification, synthesis and FPGA flows, with the Academy lessons for each."),
  title: { absolute: "VLSI roadmap · BitFlow" },   // the academy layout's template would say "BitFlow Academy"
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
