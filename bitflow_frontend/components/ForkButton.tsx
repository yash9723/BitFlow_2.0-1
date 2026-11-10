"use client";
/**
 * components/ForkButton.tsx — "Fork into my projects" for a shared design (/s/[id]), or "Open in Sandbox"
 * for a Studio tool's output.
 *
 * With a shareId, signed in: POST /api/share/[id]/fork saves it as a new project of yours (crediting the
 * original), and the Sandbox opens with that project as the current one, so autosave keeps it. Signed out,
 * or without a shareId: the code is copied into the Sandbox editors only, not saved as a project.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DESIGN_LANGUAGE_KEY, DESIGN_STORAGE_KEY, EXTRA_FILES_KEY, TESTBENCH_LANGUAGE_KEY, TESTBENCH_STORAGE_KEY } from "@/hooks/useSimulation";
import { CURRENT_KEY } from "@/components/ProjectsMenu";

interface Content {
  designCode: string; testbenchCode: string; files: { name: string; content: string }[];
  designLanguage: string; testbenchLanguage: string;
}

/** Put the code in the Sandbox's editors; `project` becomes the open project (null: none, so nothing autosaves over another). */
function toSandbox(c: Content, project: { id: string; name: string } | null): boolean {
  try {
    localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(c.designCode));
    localStorage.setItem(TESTBENCH_STORAGE_KEY, JSON.stringify(c.testbenchCode));
    localStorage.setItem(EXTRA_FILES_KEY, JSON.stringify(c.files));
    localStorage.setItem(DESIGN_LANGUAGE_KEY, JSON.stringify(c.designLanguage));
    localStorage.setItem(TESTBENCH_LANGUAGE_KEY, JSON.stringify(c.testbenchLanguage));
    if (project) localStorage.setItem(CURRENT_KEY, JSON.stringify(project)); else localStorage.removeItem(CURRENT_KEY);
    return true;
  } catch {
    window.alert("Your browser blocked saving to local storage, so the design can't be opened in the Sandbox.");
    return false;
  }
}

export default function ForkButton({
  designCode, testbenchCode, files = [], designLanguage = "verilog", testbenchLanguage = "verilog", shareId,
  label, confirmText = "Open this design in your Sandbox? It replaces the code currently in your Sandbox editors.",
}: {
  designCode: string; testbenchCode: string; files?: { name: string; content: string }[];
  designLanguage?: string; testbenchLanguage?: string; shareId?: string;
  label?: string; confirmText?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const local: Content = { designCode, testbenchCode, files, designLanguage, testbenchLanguage };

  const copyOnly = () => { if (toSandbox(local, null)) router.push("/sandbox"); };

  const fork = async () => {
    if (!shareId) { if (window.confirm(confirmText)) copyOnly(); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/share/${shareId}/fork`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        if (window.confirm("Sign in to fork this into your projects. Open it in your Sandbox without saving it? It replaces the code in your Sandbox editors.")) copyOnly();
        return;
      }
      if (!res.ok) throw new Error(data.error ?? `Fork failed (${res.status}).`);
      if (toSandbox(data.content, data.project)) router.push("/sandbox");
    } catch (err) {
      window.alert((err as Error).message || "Fork failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={fork} disabled={busy}
            className="px-4 py-2 rounded-lg border border-phosphor/40 bg-phosphor/10 text-phosphor font-mono text-[12px] font-semibold hover:bg-phosphor/20 transition-colors disabled:opacity-50">
      {busy ? "Forking…" : label ?? (shareId ? "Fork into my projects" : "Open in my Sandbox")}
    </button>
  );
}
