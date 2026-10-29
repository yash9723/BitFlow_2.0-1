/**
 * lib/save-submission.ts
 *
 * Fire-and-forget submission saver.
 * Called by useArenaProblem and useProblem after every run/submit.
 *
 * This function:
 * • POSTs to /api/submissions
 * • Never throws (logs warnings instead)
 * • Never blocks the UI
 * • Captures full code + results for LLM training
 */

export interface SaveSubmissionPayload {
  userId?:            string | null;
  problemSlug:        string;
  designCode:         string;
  testbenchCode:      string;
  submissionType:     "RUN" | "SUBMIT";
  simStatus:          "SUCCESS" | "COMPILE_ERROR" | "RUNTIME_ERROR" | "TIMEOUT";
  simStdout?:         string | null;
  simStderr?:         string | null;
  simExitCode?:       number | null;
  durationMs?:        number | null;
  testcaseResults?:   Array<{
    id:          string;
    description: string;
    passed:      boolean;
    expected:    string;
    actual?:     string | null;
  }>;
  waveformVcd?:       string | null;
  xpEarned?:          number;
  accepted?:          boolean;
  /** Language of the code the learner wrote (VHDL design, cocotb testbench). */
  language?:          "verilog" | "vhdl" | "python";
}

/**
 * Save a submission result to the database.
 * Fire-and-forget: logs errors but never throws or blocks.
 */
export async function saveSubmission(
  payload: SaveSubmissionPayload
): Promise<void> {
  try {
    const response = await fetch("/api/submissions", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) return; // guests' runs are not stored
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.warn(
        "[saveSubmission] API error:",
        response.status,
        error?.error || error?.details || ""
      );
      return;
    }

    const data = await response.json();
    console.debug("[saveSubmission] saved:", {
      id:         data.submission?.id,
      attempt:    data.submission?.attemptNumber,
      accepted:   data.submission?.accepted,
      xpEarned:   data.submission?.xpEarned,
    });

  } catch (err) {
    // Network error or JSON parse error — never crash the UI
    console.warn(
      "[saveSubmission] network error:",
      err instanceof Error ? err.message : String(err)
    );
  }
}