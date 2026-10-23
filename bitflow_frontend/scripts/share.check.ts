/** scripts/share.check.ts — self-check for lib/studio/share.ts (npx tsx scripts/share.check.ts). */
import assert from "node:assert/strict";
import { MAX_SHARE_CHARS, decodeShare, encodeShare } from "../lib/studio/share";
import { CIRCUIT_EXAMPLES } from "../lib/studio/circuit";
import { FSM_EXAMPLES } from "../lib/studio/fsm";
import { SHARE_KEYS, STUDIO_TOOLS } from "../lib/studio/tools";

(async () => {
  const keys = ["bitflow_studio_fsm", "bitflow_studio_logic_form"];
  const drafts = { bitflow_studio_fsm: FSM_EXAMPLES[0].model, bitflow_studio_logic_form: "pos" };
  const code = await encodeShare(drafts);
  assert.match(code, /^[A-Za-z0-9_-]+$/, "URL-safe");
  assert.deepEqual(await decodeShare(code, keys), drafts, "round trip");
  // only the page's own keys are written: a link can't set another tool's (or the app's) storage
  assert.deepEqual(await decodeShare(code, ["bitflow_studio_fsm"]), { bitflow_studio_fsm: FSM_EXAMPLES[0].model });
  assert.equal(await decodeShare(code, ["bitflow_session"]), null);
  // damaged links are refused, not thrown
  assert.equal(await decodeShare(code.slice(0, -6), keys), null);
  assert.equal(await decodeShare("not base64!", keys), null);
  assert.equal(await decodeShare(await encodeShare([1, 2] as unknown as Record<string, unknown>), keys), null, "not an object");
  // real designs fit comfortably
  for (const { label, circuit } of CIRCUIT_EXAMPLES) {
    const n = (await encodeShare({ bitflow_studio_circuit: circuit })).length;
    assert.ok(n < MAX_SHARE_CHARS / 2, `${label}: ${n} chars`);
  }
  // every shared key belongs to a real tool page and is that tool's own
  for (const [path, ks] of Object.entries(SHARE_KEYS)) {
    assert.ok(STUDIO_TOOLS.some((t) => t.href === path), path);
    for (const k of ks) assert.match(k, /^bitflow_studio_/, k);
  }
  console.log("share: all checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
