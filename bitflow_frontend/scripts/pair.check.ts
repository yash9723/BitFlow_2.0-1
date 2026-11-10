/**
 * scripts/pair.check.ts — pair mode (lib/pair.ts, lib/pair-binding.ts, lib/pair-server.ts) without a network:
 * two Yjs documents that pass updates to each other stand in for the sync server's room (tests/test_pair.py covers it), and a small fake of Monaco's
 * text model stands in for each person's editor.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { generateBackendJwt, generatePairJwt } from "../lib/jwt";
import * as Y from "yjs";
import { PAIR_KEYS, colorFor, cssString, inviteCode, parseInvite, safeColor, writeContent } from "../lib/pair";
import { bindEditor } from "../lib/pair-binding";
import { hashInvite, newInviteToken, roomFor } from "../lib/pair-server";

// ── Links and rooms ──
const pid = "0f1e2d3c-aaaa-bbbb-cccc-111122223333";
const token = newInviteToken();
assert.match(token, /^[A-Za-z0-9_-]{32}$/);
assert.deepEqual(parseInvite(inviteCode(pid, token)), { projectId: pid, token });
for (const bad of [null, "", pid, `${pid}.short`, `not-a-uuid.${token}`, `${pid}.${token}<x>`]) assert.equal(parseInvite(bad), null, String(bad));
assert.match(roomFor(pid, hashInvite(token)), new RegExp(`^${pid}\.[0-9a-f]{16}$`), "the room name api/routes/pair.py accepts");
assert.notEqual(roomFor(pid, hashInvite(token)), roomFor(pid, hashInvite(newInviteToken())), "a new link, a new room");
assert.equal(hashInvite("abc"), hashInvite("abc"));
assert.match(hashInvite(token), /^[0-9a-f]{64}$/);
assert.equal(cssString('a"b\\c'), '"a\\"b\\\\c"', "quotes and backslashes escaped");
assert.equal(cssString("x\ny"), '"x y"');
assert.equal(safeColor("#38bdf8"), "#38bdf8");
for (const bad of ["red", "#fff;}body{display:none", 3, null]) assert.equal(safeColor(bad), "#9ca3af");
assert.equal(colorFor(pid), colorFor(pid));
assert.match(colorFor(pid), /^#[0-9a-f]{6}$/);

// ── Two documents, wired like a room; `hold` queues updates to make edits concurrent ──
function pairOfDocs() {
  const a = new Y.Doc(), b = new Y.Doc();
  let queue: [Y.Doc, Uint8Array][] = [], hold = false;
  a.on("update", (u: Uint8Array, origin: unknown) => { if (origin !== "net") (hold ? queue.push([b, u]) : Y.applyUpdate(b, u, "net")); });
  b.on("update", (u: Uint8Array, origin: unknown) => { if (origin !== "net") (hold ? queue.push([a, u]) : Y.applyUpdate(a, u, "net")); });
  return { a, b, hold: () => { hold = true; }, flush: () => { hold = false; for (const [d, u] of queue) Y.applyUpdate(d, u, "net"); queue = []; } };
}

// ── The editor binding ──
class FakeModel {
  private subs: ((e: { changes: { rangeOffset: number; rangeLength: number; text: string }[] }) => void)[] = [];
  constructor(public value: string) {}
  getValue() { return this.value; }
  setValue(v: string) { this.edit(0, this.value.length, v); }
  setEOL() {}
  getOffsetAt(p: { lineNumber: number; column: number }) {
    const lines = this.value.split("\n");
    return lines.slice(0, p.lineNumber - 1).reduce((n, l) => n + l.length + 1, 0) + p.column - 1;
  }
  getPositionAt(offset: number) {
    const before = this.value.slice(0, Math.min(offset, this.value.length)).split("\n");
    return { lineNumber: before.length, column: before[before.length - 1].length + 1 };
  }
  applyEdits(edits: { range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string }[]) {
    for (const { range: r, text } of edits) {
      const s = this.getOffsetAt({ lineNumber: r.startLineNumber, column: r.startColumn });
      const e = this.getOffsetAt({ lineNumber: r.endLineNumber, column: r.endColumn });
      this.edit(s, e - s, text);
    }
  }
  /** What typing does: change the text, then tell the listeners. */
  edit(offset: number, length: number, text: string) {
    this.value = this.value.slice(0, offset) + text + this.value.slice(offset + length);
    for (const f of this.subs) f({ changes: [{ rangeOffset: offset, rangeLength: length, text }] });
  }
  onDidChangeContent(f: (typeof this.subs)[number]) { this.subs.push(f); return { dispose: () => { this.subs = this.subs.filter((g) => g !== f); } }; }
}
const noop = { dispose() {} };
const fakeEditor = (model: FakeModel) => ({
  getModel: () => model, getSelection: () => null, setSelection() {}, hasTextFocus: () => false,
  onDidChangeCursorSelection: () => noop, onDidFocusEditorText: () => noop,
  createDecorationsCollection: () => ({ set() {}, clear() {} }),
});
class Range { constructor(public startLineNumber: number, public startColumn: number, public endLineNumber: number, public endColumn: number) {} }
const monaco = {
  Range, Selection: { createWithDirection: () => ({}) }, SelectionDirection: { RTL: 1 },
  editor: { EndOfLineSequence: { LF: 0 }, TrackedRangeStickiness: { NeverGrowsWhenTypingAtEdges: 1 } },
} as never;

{
  const net = pairOfDocs();
  const ta = net.a.getText("t"), tb = net.b.getText("t");
  ta.insert(0, "module m;\nendmodule\n");
  const ma = new FakeModel("stale"), mb = new FakeModel("");
  const unA = bindEditor(monaco, ta, fakeEditor(ma) as never, null);
  const unB = bindEditor(monaco, tb, fakeEditor(mb) as never, null);
  assert.equal(ma.getValue(), "module m;\nendmodule\n", "binding gives the editor the shared text");
  assert.equal(mb.getValue(), ma.value);

  ma.edit(ma.getOffsetAt({ lineNumber: 1, column: 9 }), 0, "_x");
  assert.equal(mb.getValue(), "module m_x;\nendmodule\n", "A types, B sees it");
  mb.edit(mb.value.indexOf("endmodule"), 0, "  wire w;\n");
  assert.equal(ma.getValue(), "module m_x;\n  wire w;\nendmodule\n", "B types on another line, A sees it");

  net.hold();   // both type at once
  ma.edit(0, 0, "// A\n");
  mb.edit(mb.value.length, 0, "// B\n");
  mb.edit(mb.value.indexOf("w;"), 1, "q");
  net.flush();
  assert.equal(ma.getValue(), mb.value, "concurrent edits converge");
  assert.equal(ma.getValue(), "// A\nmodule m_x;\n  wire q;\nendmodule\n// B\n");
  assert.equal(ta.toString(), ma.getValue(), "editor and document agree");

  mb.edit(0, mb.value.indexOf("module"), "");
  assert.equal(ma.getValue(), "module m_x;\n  wire q;\nendmodule\n// B\n", "a remote delete");
  unA(); unB();
  mb.edit(0, 0, "x");
  assert.notEqual(ma.value[0], "x", "unbound editors stop syncing");
}

// ── Writing the editors into the document (hooks/usePair.ts) ──
{
  const net = pairOfDocs();
  const side = (doc: Y.Doc) => ({ Y, doc, files: doc.getMap<Y.Text>("files"), meta: doc.getMap<unknown>("meta") });
  const A = side(net.a), B = side(net.b);
  const base = { designCode: "module d;\nendmodule\n", testbenchCode: "module tb;\nendmodule\n", files: [{ name: "alu.v", content: "module alu;\nendmodule\n" }],
                 designLanguage: "verilog" as const, testbenchLanguage: "verilog" as const };
  const text = (s: typeof A, k: string) => s.files.get(k)?.toString();
  const seen = new Map<string, string[]>();
  const record = () => { A.files.forEach((t, k) => seen.set(k, [...(seen.get(k) ?? []), t.toString()])); seen.set("#meta", [JSON.stringify([A.meta.get("designLanguage"), A.meta.get("testbenchLanguage"), A.meta.get("order")])]); };

  writeContent(A, base, null, true, seen);   // the owner opens the room
  record();
  assert.equal(text(B, PAIR_KEYS.design), base.designCode);
  assert.equal(text(B, PAIR_KEYS.file("alu.v")), base.files[0].content);
  assert.deepEqual(B.meta.get("order"), ["alu.v"]);
  const prev = new Set([PAIR_KEYS.design, PAIR_KEYS.testbench, PAIR_KEYS.file("alu.v")]);

  B.files.get(PAIR_KEYS.design)!.insert(0, "// partner\n");   // the partner types; A's editors haven't caught up
  writeContent(A, base, prev, false, seen);
  assert.equal(text(A, PAIR_KEYS.design), "// partner\n" + base.designCode, "a stale value the document held isn't written back");

  writeContent(A, { ...base, testbenchCode: "module tb2;\nendmodule\n" }, prev, false, seen);   // a template, here
  assert.equal(text(B, PAIR_KEYS.testbench), "module tb2;\nendmodule\n", "a change made here goes in");

  B.files.set(PAIR_KEYS.file("regs.v"), new Y.Text("module regs;\nendmodule\n"));   // the partner adds a file
  writeContent(A, base, prev, false, seen);
  assert.ok(A.files.has(PAIR_KEYS.file("regs.v")), "a file the partner just added isn't deleted by stale editors");

  B.files.delete(PAIR_KEYS.file("alu.v"));   // the partner deletes one
  writeContent(A, base, prev, false, seen);
  assert.ok(!A.files.has(PAIR_KEYS.file("alu.v")), "a file the partner deleted isn't put back");

  const prev2 = new Set([...prev, PAIR_KEYS.file("regs.v")]);
  writeContent(A, { ...base, files: [] }, prev2, false, seen);   // deleted here
  assert.ok(!B.files.has(PAIR_KEYS.file("regs.v")), "a file deleted here goes");

  writeContent(A, { ...base, files: [], designLanguage: "vhdl" as never, testbenchLanguage: "vhdl" }, prev, false, seen);
  assert.equal(B.meta.get("designLanguage"), "vhdl", "the language goes in");
  assert.deepEqual(B.meta.get("order"), []);

  writeContent(B, { ...base, files: [] }, null, true, new Map());   // force: exactly this content
  assert.deepEqual([...A.files.keys()].sort(), [PAIR_KEYS.design, PAIR_KEYS.testbench]);
  assert.equal(text(A, PAIR_KEYS.design), base.designCode);
}

// ── Room tokens, signed the way production signs (lib/jwt.ts) ──
{
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const saved = process.env.JWT_PRIVATE_KEY;
  process.env.JWT_PRIVATE_KEY = pem.replace(/\n/g, "\\n");   // as an env var holds it: newlines as a literal \n
  try {
    const room = roomFor(pid, hashInvite(token));
    const claims = jwt.verify(generatePairJwt(room, new Date(Date.now() + 3600_000)), publicKey, { algorithms: ["ES256"], audience: "bitflow-pair" }) as jwt.JwtPayload;
    assert.equal(claims.room, room, "an ES256 pair token for exactly this room");
    assert.throws(() => jwt.verify(generateBackendJwt(), publicKey, { algorithms: ["ES256"], audience: "bitflow-pair" }), "a simulate token isn't a pair token");
  } finally { if (saved === undefined) delete process.env.JWT_PRIVATE_KEY; else process.env.JWT_PRIVATE_KEY = saved; }
}

console.log("pair: all checks passed");
