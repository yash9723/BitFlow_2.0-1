/** scripts/share.check.ts — lib/share.ts (what a share may contain) and the framing rules in next.config.js (only /embed/* may be framed). */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { embedSnippet, fileNames, firstUnit, MAX_FILES, MAX_SOURCE_CHARS, parseFiles, parseShare, runsInBrowser } from "../lib/share";

const ok = (body: unknown, title?: string) => {
  const r = parseShare(body, title);
  assert.ok("content" in r, `expected ok: ${JSON.stringify(r)}`);
  return r.content;
};
const bad = (body: unknown, status: number) => {
  const r = parseShare(body);
  assert.ok("error" in r && r.status === status, `expected ${status}: ${JSON.stringify(r).slice(0, 200)}`);
};

// ── Bodies ──
const v = ok({ designCode: "module counter(input clk); endmodule", testbenchCode: "" });
assert.equal(v.title, "counter", "title from the first module");
assert.deepEqual([v.designLang, v.tbLang, v.kind, v.public, v.projectId], ["verilog", "verilog", "sandbox", false, null], "defaults");
assert.equal(ok({ designCode: "entity alu is end;", testbenchCode: "", designLanguage: "vhdl", testbenchLanguage: "vhdl" }).title, "alu", "VHDL entity title");
assert.equal(ok({ designCode: "module m; endmodule", testbenchCode: "import cocotb", testbenchLanguage: "python" }).tbLang, "python", "cocotb testbench");
assert.equal(ok({ designCode: "x", testbenchCode: "", title: "  My ALU  " }).title, "My ALU", "given title, trimmed");
assert.equal(ok({ designCode: "x", testbenchCode: "", title: "t".repeat(200) }).title.length, 80, "title capped");
assert.equal(ok({ designCode: "{}", testbenchCode: "", kind: "circuit" }, "half_adder").title, "half_adder", "a circuit is titled by its module");
assert.equal(ok({ designCode: "x", testbenchCode: "", public: true }).public, true, "public only when asked");
assert.equal(ok({ designCode: "x", testbenchCode: "", public: "yes" }).public, false, "public must be true");
assert.equal(ok({ designCode: "x", testbenchCode: "", projectId: "3f2c-ab_9" }).projectId, "3f2c-ab_9", "project id kept");
assert.equal(ok({ designCode: "x", testbenchCode: "", projectId: "../../etc" }).projectId, null, "odd project id dropped");
assert.equal(ok({ designCode: "x", testbenchCode: "", files: [{ name: "alu.v", content: "module alu; endmodule" }] }).files.length, 1, "extra Verilog file");

bad({}, 400);
bad({ designCode: "   ", testbenchCode: "" }, 400);
bad({ designCode: "x" }, 400);
bad({ designCode: "x".repeat(MAX_SOURCE_CHARS + 1), testbenchCode: "" }, 413);
bad({ designCode: "x", testbenchCode: "", files: [{ name: "../evil.v", content: "" }] }, 400);
bad({ designCode: "x", testbenchCode: "", files: [{ name: "a.v", content: "" }, { name: "a.v", content: "" }] }, 400);
bad({ designCode: "x", testbenchCode: "", files: Array.from({ length: MAX_FILES + 1 }, (_, i) => ({ name: `m${i}.v`, content: "" })) }, 413);
bad({ designCode: "x", testbenchCode: "", testbenchLanguage: "vhdl" }, 400);                       // a VHDL testbench needs a VHDL design
bad({ designCode: "x", testbenchCode: "", kind: "circuit", designLanguage: "vhdl" }, 400);          // circuits are Verilog
bad({ designCode: "x", testbenchCode: "", designLanguage: "vhdl", files: [{ name: "a.v", content: "" }] }, 400);

// ── Names, files, embeds ──
assert.deepEqual(fileNames("verilog", "verilog"), { design: "design.v", testbench: "tb.v" });
assert.deepEqual(fileNames("vhdl", "vhdl"), { design: "design.vhd", testbench: "tb.vhd" });
assert.deepEqual(fileNames("verilog", "python"), { design: "design.v", testbench: "test_tb.py" });
assert.deepEqual(parseFiles('[{"name":"a.v","content":"x"},{"name":3},"junk"]'), [{ name: "a.v", content: "x" }], "malformed stored files dropped");
assert.deepEqual(parseFiles("not json"), []);
assert.deepEqual(parseFiles(null), []);
assert.equal(firstUnit("// none"), undefined);
assert.ok(runsInBrowser({ kind: "sandbox", designLang: "verilog", tbLang: "verilog" }));
assert.ok(!runsInBrowser({ kind: "sandbox", designLang: "vhdl", tbLang: "vhdl" }), "VHDL runs on the server");
assert.ok(!runsInBrowser({ kind: "sandbox", designLang: "verilog", tbLang: "python" }), "cocotb runs on the server");
assert.ok(!runsInBrowser({ kind: "circuit", designLang: "verilog", tbLang: "verilog" }));
const snip = embedSnippet("https://bitflowvlsi.tech", "k3Fq9xZp", 'A "quoted" <b>title</b> & more');
assert.match(snip, /^<iframe src="https:\/\/bitflowvlsi\.tech\/embed\/k3Fq9xZp"/);
assert.doesNotMatch(snip.match(/title="([^"]*)"/)![1], /[<>&]/, "title attribute escaped");

// ── Framing: everything denies it except /embed/* ──
(async () => {
  const config = createRequire(import.meta.url)("../next.config.js");
  const rules: { source: string; headers: { key: string; value: string }[] }[] = await config.headers();
  const toRegex = (src: string) => new RegExp("^" + src.replace(/:path\*/g, ".*") + "$");
  const headersFor = (path: string) => rules.filter((r) => toRegex(r.source).test(path)).flatMap((r) => r.headers);
  const csp = (path: string) => headersFor(path).filter((h) => h.key === "Content-Security-Policy").map((h) => h.value);
  const xfo = (path: string) => headersFor(path).filter((h) => h.key === "X-Frame-Options").map((h) => h.value);

  for (const p of ["/", "/sandbox", "/s/k3Fq9xZp", "/explore", "/api/share", "/embedded", "/embed"]) {
    assert.deepEqual(xfo(p), ["DENY"], `${p}: X-Frame-Options DENY`);
    assert.equal(csp(p).length, 1, `${p}: one CSP`);
    assert.match(csp(p)[0], /frame-ancestors 'none'/, `${p}: not frameable`);
  }
  assert.deepEqual(xfo("/embed/k3Fq9xZp"), [], "/embed/*: no X-Frame-Options");
  assert.equal(csp("/embed/k3Fq9xZp").length, 1, "/embed/*: one CSP");
  assert.match(csp("/embed/k3Fq9xZp")[0], /frame-ancestors \*/, "/embed/*: frameable by any site");
  assert.match(csp("/embed/k3Fq9xZp")[0], /default-src 'self'/, "/embed/*: the rest of the CSP is unchanged");

  console.log("share: all checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
