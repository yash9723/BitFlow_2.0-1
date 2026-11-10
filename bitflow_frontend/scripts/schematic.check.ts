/** scripts/schematic.check.ts — lib/hardware-diagrams.ts schematic layout on a two-module netlist shaped like Yosys' JSON. */
import assert from "node:assert/strict";
import { layoutSvg, nodesAtLine, parseSrc, schematicLayout, schematicModules, schematicSvg, type YosysNetlist } from "../lib/hardware-diagrams";

// top: input a[4], b[4], clk; output q[4]; alu u_alu (.x(a), .y(b), .s(sum)); always @(posedge clk) q <= sum;
const netlist: YosysNetlist = {
  modules: {
    alu: {
      ports: { x: { direction: "input", bits: [2, 3, 4, 5] }, y: { direction: "input", bits: [6, 7, 8, 9] }, s: { direction: "output", bits: [10, 11, 12, 13] } },
      cells: { "$add$design.v:3$1": { type: "$add", attributes: { src: "design.v:3.14-3.19" }, port_directions: { A: "input", B: "input", Y: "output" },
                                      connections: { A: [2, 3, 4, 5], B: [6, 7, 8, 9], Y: [10, 11, 12, 13] } } },
      netnames: { s: { bits: [10, 11, 12, 13], attributes: { src: "design.v:1.42-1.43" } } },
    },
    top: {
      attributes: { top: 1 },
      ports: { a: { direction: "input", bits: [2, 3, 4, 5] }, b: { direction: "input", bits: [6, 7, 8, 9] }, clk: { direction: "input", bits: [14] },
               q: { direction: "output", bits: [15, 16, 17, 18] } },
      cells: {
        "\\u_alu": { type: "alu", attributes: { src: "design.v:8.7-8.40" }, connections: { x: [2, 3, 4, 5], y: [6, 7, 8, 9], s: [10, 11, 12, 13] } },
        "$procdff$4": { type: "$dff", attributes: { src: "design.v:9.3-10.17|design.v:11.1-11.2" }, port_directions: { CLK: "input", D: "input", Q: "output" },
                        connections: { CLK: [14], D: [10, 11, 12, 13], Q: [15, 16, 17, 18] } },
      },
      netnames: { q: { bits: [15, 16, 17, 18], attributes: { src: "design.v:6.21-6.22" } } },
    },
  },
};

(async () => {
  assert.deepEqual(parseSrc("design.v:9.3-10.17|alu.v:4.1-4.9"), [{ file: "design.v", line: 9, endLine: 10 }, { file: "alu.v", line: 4, endLine: 4 }]);
  assert.deepEqual(parseSrc("design.v:7"), [{ file: "design.v", line: 7, endLine: 7 }]);
  assert.deepEqual(parseSrc(undefined), []);
  assert.deepEqual(schematicModules(netlist), { top: "top", names: ["top", "alu"] });

  const top = (await schematicLayout(netlist))!;
  assert.equal(top.module, "top");
  assert.equal(top.cells, 2);
  const byKind = (k: string) => top.nodes.filter((n) => n.kind === k);
  assert.equal(byKind("in").length, 3);
  assert.equal(byKind("out").length, 1);
  const inst = byKind("inst")[0];
  assert.equal(inst.module, "alu", "an instance of a netlist module can be drilled into");
  assert.equal(inst.label, "u_alu : alu");
  assert.equal(byKind("reg")[0].label, "dff");
  assert.ok(top.nodes.every((n) => n.w > 0 && n.h > 0 && Number.isFinite(n.x) && Number.isFinite(n.y)), "every node is placed");

  // Cross-probing: the dff covers lines 9-10 (and 11), the instance line 8, the q port line 6.
  assert.deepEqual(nodesAtLine(top, "design.v", 10), [byKind("reg")[0].id]);
  assert.deepEqual(nodesAtLine(top, "design.v", 8), [inst.id]);
  assert.deepEqual(nodesAtLine(top, "design.v", 6), [byKind("out")[0].id]);
  assert.deepEqual(nodesAtLine(top, "design.v", 99), []);

  // Nets: a → u_alu.x, b → u_alu.y, clk → dff, u_alu.s → dff.D, dff.Q → q; buses are wide, clk isn't.
  assert.equal(top.edges.length, 5);
  assert.equal(top.edges.filter((e) => e.wide).length, 4);
  assert.ok(top.edges.every((e) => e.sections.length > 0 && e.sections[0].length >= 2), "every net is routed");
  assert.equal(new Set(top.edges.map((e) => e.net)).size, 5, "each net has its own driver");

  // Drill into the alu: its own ports and the adder.
  const alu = (await schematicLayout(netlist, "alu"))!;
  assert.equal(alu.module, "alu");
  assert.deepEqual(alu.nodes.map((n) => n.kind).sort(), ["cell", "in", "in", "out"]);
  assert.equal(nodesAtLine(alu, "design.v", 3).length, 1);
  assert.equal(await schematicLayout(netlist, "nope"), null);

  // The static picture still renders, escaped.
  const svg = layoutSvg(top);
  assert.match(svg, /^<svg[^>]+width="\d+"/);
  assert.match(svg, /u_alu : alu/);
  assert.ok((await schematicSvg(netlist))?.startsWith("<svg"));
  const evil = JSON.parse(JSON.stringify(netlist).replace(/"a":/g, '"<script>":'));
  assert.doesNotMatch((await schematicSvg(evil))!, /<script>/, "names are escaped");

  console.log("schematic: all checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
