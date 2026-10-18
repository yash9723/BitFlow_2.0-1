/**
 * lib/vcd-parser.ts — VCD (Value Change Dump) parser
 *
 * Converts raw VCD text (from Icarus Verilog) into a structured data
 * format that the WaveformPanel component can render.
 *
 * VCD format reference (IEEE Std 1364):
 *   • Header section: $timescale, $scope, $var, $upscope, $enddefinitions
 *   • Body section:   #<time>, value changes (scalar: "0!", vector: "b0011 #")
 *
 * This parser is intentionally minimal — it handles the subset of VCD that
 * Icarus Verilog actually emits. No external dependencies.
 *
 * Usage:
 *   const text = atob(response.waveform.vcd_base64);
 *   const parsed = parseVcd(text);
 *   // parsed.signals, parsed.maxTime, parsed.timescale
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types — exported so components can import them
// ─────────────────────────────────────────────────────────────────────────────

/** A single value change event on a signal. */
export interface VcdChange {
  /** Simulation time (in the units of the $timescale directive). */
  time: number;
  /**
   * Signal value as a string:
   *   1-bit:  '0' | '1' | 'x' | 'z'
   *   multi:  binary string e.g. '0011' | 'xxxx'
   */
  value: string;
}

/** One signal/variable declared in the VCD header. */
export interface VcdSignal {
  /** VCD identifier code (single or multi-char, e.g. '!' or '#'). */
  id: string;
  /** Human-readable signal name (from $var declaration). */
  name: string;
  /** Bit width: 1 for scalar wires, >1 for buses. */
  width: number;
  /** Verilog type string: 'wire' | 'reg' | 'integer' | … */
  type: string;
  /** Chronologically ordered list of value changes. */
  changes: VcdChange[];
}

/** Complete parsed result returned by parseVcd(). */
export interface ParsedVcd {
  /** The $timescale value as a string, e.g. '1ns', '1 ps'. */
  timescale: string;
  /** All signals declared in the VCD, in declaration order. */
  signals: VcdSignal[];
  /** Highest timestamp seen in the file (useful for axis scaling). */
  maxTime: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a raw VCD text string into a ParsedVcd object.
 *
 * @param text — raw VCD file content (decoded from base64).
 * @param scope — optional dotted scope (e.g. "tb.dut"): keep only signals
 *   declared inside it, named relative to it ("q", "u_sub.q").
 * @returns ParsedVcd — structured signal data ready for rendering.
 *
 * Never throws: parse errors are logged as warnings and the parser
 * continues best-effort, returning whatever it has collected so far.
 */
export function parseVcd(text: string, scope?: string): ParsedVcd {
  // ── Tokenise ──────────────────────────────────────────────────────────────
  // Split on any whitespace. Filter empties. This handles both Windows (\r\n)
  // and Unix (\n) line endings automatically.
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  let i = 0;

  // ── State ─────────────────────────────────────────────────────────────────
  const signals = new Map<string, VcdSignal>(); // id → signal
  let timescale = "1ns";
  let currentTime = 0;
  let maxTime = 0;
  const scopeStack: string[] = [];

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Consume tokens until (and including) the next '$end', return consumed. */
  function consumeBlock(): string[] {
    const parts: string[] = [];
    while (i < tokens.length && tokens[i] !== "$end") {
      parts.push(tokens[i++]);
    }
    if (i < tokens.length) i++; // consume '$end'
    return parts;
  }

  /** Record a value change on a signal identified by `id`. */
  function recordChange(id: string, value: string): void {
    const sig = signals.get(id);
    if (!sig) return; // unknown identifier — ignore

    // Avoid duplicate entries at the exact same timestamp
    // (the $dumpvars section and #0 both emit initial values)
    const last = sig.changes[sig.changes.length - 1];
    if (last && last.time === currentTime && last.value === value) return;

    sig.changes.push({ time: currentTime, value });
    if (currentTime > maxTime) maxTime = currentTime;
  }

  // ── Header parsing ────────────────────────────────────────────────────────
  // Process $keyword ... $end blocks until $enddefinitions
  while (i < tokens.length) {
    const tok = tokens[i++];

    if (tok === "$timescale") {
      const parts = consumeBlock();
      timescale = parts.join(" ").trim();
      continue;
    }

    if (tok === "$var") {
      // Format: $var <type> <width> <id> <name> [<bit_range>] $end
      //  e.g.  $var wire 4 # count $end
      //        $var reg  1 ! clk $end
      //        $var wire 8 $ data [7:0] $end     ← optional bit range
      const type  = tokens[i++] ?? "";
      const width = parseInt(tokens[i++] ?? "1", 10);
      const id    = tokens[i++] ?? "";
      let   name  = tokens[i++] ?? "";

      // Strip embedded bit-range if name includes it: "count[3:0]" → "count"
      name = name.replace(/\[.*\]$/, "");

      // Skip optional separate bit-range token: [7:0]
      if (tokens[i]?.startsWith("[") && tokens[i] !== "$end") i++;

      // Consume $end
      if (tokens[i] === "$end") i++;

      const path = scopeStack.join(".");
      if (scope !== undefined) {
        if (path !== scope && !path.startsWith(scope + ".")) continue;
        const rel = path.slice(scope.length + 1);
        if (rel) name = `${rel}.${name}`;
      }
      if (id && name) {
        signals.set(id, { id, name, width: isNaN(width) ? 1 : width, type, changes: [] });
      }
      continue;
    }

    if (tok === "$scope") {
      const parts = consumeBlock();          // e.g. ["module", "dut"]
      scopeStack.push(parts[1] ?? "");
      continue;
    }
    if (tok === "$upscope") {
      consumeBlock();
      scopeStack.pop();
      continue;
    }

    if (tok === "$enddefinitions") {
      consumeBlock(); // consume the $end that follows
      break;          // everything after this is value-change data
    }

    // $date, $version, $comment — consume and skip
    if (
      tok === "$date"    || tok === "$version" || tok === "$comment"
    ) {
      consumeBlock();
      continue;
    }

    // Ignore unrecognised header tokens
  }

  // ── Body parsing ──────────────────────────────────────────────────────────
  // Everything after $enddefinitions $end is value-change data.
  while (i < tokens.length) {
    const tok = tokens[i++];

    // ── Timestamp marker: #<number> ─────────────────────────────────────────
    if (tok.startsWith("#")) {
      const t = parseInt(tok.slice(1), 10);
      if (!isNaN(t)) {
        currentTime = t;
        if (t > maxTime) maxTime = t;
      }
      continue;
    }

    // ── Section keywords — skip content ─────────────────────────────────────
    if (
      tok === "$dumpvars" || tok === "$dumpall" ||
      tok === "$dumpon"   || tok === "$dumpoff"
    ) {
      // Do NOT call consumeBlock() here — the values *inside* dumpvars are
      // real initial value assignments, not metadata to skip.
      // We just ignore the keyword itself and let the value-change logic below
      // handle the individual value tokens.
      continue;
    }

    if (tok === "$end") continue; // end of dumpvars block

    // ── Vector value change: b<binary_value> <id> ───────────────────────────
    // e.g. "b0011 #"  or  "bxxxx $"
    if (tok[0] === "b" || tok[0] === "B") {
      const value = tok.slice(1); // binary string: "0011"
      const id    = tokens[i++]; // next token is the identifier
      if (id) recordChange(id, value);
      continue;
    }

    // ── Real value change: r<value> <id> ────────────────────────────────────
    // Icarus emits these for `real` typed variables. We store as-is.
    if (tok[0] === "r" || tok[0] === "R") {
      const value = tok.slice(1);
      const id    = tokens[i++];
      if (id) recordChange(id, value);
      continue;
    }

    // ── Scalar value change: <value><id> ────────────────────────────────────
    // All in one token, e.g. "0!" "1#" "x$" "z%"
    // Value is the first character, identifier is the rest.
    if ("01xzXZ".includes(tok[0])) {
      const value = tok[0].toLowerCase(); // normalise X→x, Z→z
      const id    = tok.slice(1);         // may be multi-char: "0!!" etc.
      if (id) recordChange(id, value);
      continue;
    }

    // Everything else: ignore (unrecognised token)
  }

  return {
    timescale,
    signals: Array.from(signals.values()),
    maxTime,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering helpers (used by WaveformPanel, exported for testability)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a binary value string from VCD to a hex display label.
 *
 * Examples:
 *   "0000"  → "0"
 *   "1010"  → "A"
 *   "xxxx"  → "x"
 *   "00001111" → "F"
 *
 * @param binStr — raw binary string from VcdChange.value
 */
export function binToHex(binStr: string): string {
  if (!binStr) return "?";
  // If all bits are x or z, return the char directly
  if (/^[xX]+$/.test(binStr)) return "x";
  if (/^[zZ]+$/.test(binStr)) return "z";
  // Mixed x/z with defined bits — show as 'X'
  if (/[xXzZ]/.test(binStr)) return "X";
  try {
    const n = parseInt(binStr, 2);
    return isNaN(n) ? "?" : n.toString(16).toUpperCase();
  } catch {
    return "?";
  }
}

/**
 * Compute a "nice" time step for axis tick marks.
 * Targets ~6–10 ticks across the full time range.
 *
 * @param maxTime — highest timestamp in the VCD file.
 */
export function niceTimeStep(maxTime: number): number {
  if (maxTime <= 0) return 10;
  const rough = maxTime / 8;
  if (rough <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalised = rough / magnitude;
  if (normalised < 1.5) return magnitude;
  if (normalised < 3.5) return 2 * magnitude;
  if (normalised < 7.5) return 5 * magnitude;
  return 10 * magnitude;
}
