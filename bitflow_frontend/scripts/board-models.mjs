#!/usr/bin/env node
/**
 * scripts/board-models.mjs — build the Board Lab's real-board 3D models (public/models/) from
 * the boards' own open KiCad files, and the microcontroller models from Sketchfab downloads.
 * Dev-time only, on Linux/WSL with git, curl, unzip, kicad-cli (KiCad 9) and npx:
 *
 *   node scripts/board-models.mjs <work dir> [sketchfab zip dir]
 *
 * For each board: clone it, point its 3D model paths at a local folder, fetch the KiCad
 * library parts it uses (STEP, from gitlab.com/kicad/libraries/kicad-packages3D), export a GLB
 * with kicad-cli, compress it with gltf-transform, and write <board>.json: the board's outline
 * and where its LEDs and buttons are (from the footprints), so the lab lights the real ones.
 * Sketchfab zips (glTF downloads) are unpacked and compressed the same way.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../public/models");
const [work, sketchfab] = process.argv.slice(2).map((p) => p && resolve(p));
if (!work) { console.error("usage: node scripts/board-models.mjs <work dir> [sketchfab zip dir]"); process.exit(1); }
const LIB3D = join(work, "3d");
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 }).toString();
const GLTF = ["-y", "@gltf-transform/cli@4.1.1"];

/** Boards: repo, board file, licence file, and which footprint is which lab part (led[i], btn[i]). */
const BOARDS = [
  {
    id: "ulx3s", repo: "https://github.com/emard/ulx3s", pcb: "ulx3s.kicad_pcb", licence: "LICENSE.md",
    credit: "ULX3S by EMARD and Radiona (radiona.org/ulx3s), MIT-style licence; the EMARD, RADIONA and FER logos are kept as on the board.",
    leds: ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"], buttons: ["B1", "B2", "B3", "B4", "B5", "B6"],
    // The design's own parts are VRML only (kicad-cli reads STEP): use the KiCad library's equivalents.
    substitute: [
      [/\$\{KIPRJMOD\}\/footprints\/pushbutton\/PTS645\.3dshapes\/PTS645\.wrl/g, "lib:Button_Switch_SMD.3dshapes/SW_SPST_PTS645Sx43SMTR92"],
      [/\.\/footprints\/sdram\/TSOP54\.3dshapes\/TSOP54\.wrl/g, "lib:Package_SO.3dshapes/TSOP-II-54_22.2x10.16mm_P0.8mm"],
      [/\.\/footprints\/micro-sd\/micro-sd-schd3a0100\.3dshapes\/SCHD3A0100\.wrl/g, "lib:Connector_Card.3dshapes/microSD_HC_Hirose_DM3AT-SF-PEJM5"],
      [/\.\/footprints\/esp32\/ESP32\.3dshapes\/ESP32-WROVER\.wrl/g, "lib:RF_Module.3dshapes/ESP32-WROOM-32"],
      [/\.\/footprints\/dipswitch\/dipswitch_smd\.3dshapes\/dipswitch_smd\.wrl/g, "lib:Button_Switch_SMD.3dshapes/SW_DIP_SPSTx04_Slide_6.7x11.72mm_W8.61mm_P2.54mm_LowProfile"],
      [/\$\{KIPRJMOD\}\/footprints\/hdmi-d\/hdmi-d\.3dshapes\/10029449-111RLF\.wrl/g, "lib:Connector_Video.3dshapes/HDMI_Micro-D_Molex_46765-0xxx"],
      [/\$\{KIPRJMOD\}\/footprints\/battery\/keystone3000tr\.3dshapes\/keystone3000tr\.wrl/g, "lib:Battery.3dshapes/BatteryHolder_Keystone_3000_1x12mm"],
    ],
    // One 4-way DIP switch, turned 90°: its switches are 2.54 mm apart along the board's x.
    switches: [{ ref: "SW1", count: 4, dx: 2.54 }],
  },
  {
    id: "orangecrab", repo: "https://github.com/orangecrab-fpga/orangecrab-hardware", pcb: "hardware/orangecrab_r0.2.1/OrangeCrab.kicad_pcb",
    licence: "LICENCE-CERN-OHL", submodules: ["lib/gkl"], fixPaths: [["/home/greg/projects/OrangeCrab", "${REPO}"]],
    substitute: [[/\$\{KIPRJMOD\}\/3d\/csBGA285\.step/g, "repo:lib/gkl/packages3d/gkl_housings_bga.3dshapes/csBGA285.step"]],
    credit: "OrangeCrab r0.2.1 by Greg Davill (github.com/orangecrab-fpga), hardware licensed under CERN OHL v1.2.",
    rgb: "D1", buttons: ["SW1"],
  },
  {
    id: "icezum", repo: "https://github.com/FPGAwars/icezum", pcb: "src-kicad/icezum.kicad_pcb", licence: "LICENSE",
    credit: "Icezum Alhambra by Eladio Delgado and Juan González (Obijuan), FPGAwars (github.com/FPGAwars/icezum), GPL-3.0.",
    leds: ["LD0", "LD1", "LD2", "LD3", "LD4", "LD5", "LD6", "LD7"], buttons: ["SW1", "SW2"],
  },
  {
    id: "tinyfpga-bx", repo: "https://github.com/tinyfpga/TinyFPGA-BX", pcb: "board/TinyFPGA-BX.kicad_pcb", licence: "LICENSE",
    credit: "TinyFPGA BX by Luke Valenty (github.com/tinyfpga/TinyFPGA-BX), CERN OHL v1.2.",
    leds: ["D2"], buttons: [],   // D1 is the power LED; SW1 resets into the bootloader
  },
  {
    id: "fomu", repo: "https://github.com/im-tomu/fomu-hardware", pcb: "archive/pvt/pcb/tomu-fpga.kicad_pcb", licence: "LICENSE",
    credit: "Fomu (PVT) by the Tomu project (github.com/im-tomu/fomu-hardware), CC BY-SA 4.0.",
    rgb: "U10", buttons: [],
  },
];

/**
 * Old or project-local part models (VRML, or KiCad 4 library names) → today's KiCad library STEP
 * model of the same package, by file name. kicad-cli's GLB export only reads STEP.
 */
const EQUIVALENTS = {
  C_0201_0603Metric: "Capacitor_SMD.3dshapes/C_0201_0603Metric", R_0201_0603Metric: "Resistor_SMD.3dshapes/R_0201_0603Metric",
  L_0201_0603Metric: "Inductor_SMD.3dshapes/L_0201_0603Metric", C_0402_1005Metric: "Capacitor_SMD.3dshapes/C_0402_1005Metric",
  C_0402: "Capacitor_SMD.3dshapes/C_0402_1005Metric", R_0402: "Resistor_SMD.3dshapes/R_0402_1005Metric",
  C_0603: "Capacitor_SMD.3dshapes/C_0603_1608Metric", C_1206: "Capacitor_SMD.3dshapes/C_1206_3216Metric",
  L_0603: "Inductor_SMD.3dshapes/L_0603_1608Metric", L_0805: "Inductor_SMD.3dshapes/L_0805_2012Metric",
  LED_0603: "LED_SMD.3dshapes/LED_0603_1608Metric", LED_0603_white: "LED_SMD.3dshapes/LED_0603_1608Metric",
  "SOT23-3": "Package_TO_SOT_SMD.3dshapes/SOT-23", "SOT-23-5": "Package_TO_SOT_SMD.3dshapes/SOT-23-5",
  "SC-70-5": "Package_TO_SOT_SMD.3dshapes/SOT-353_SC-70-5", "SOT-563": "Package_TO_SOT_SMD.3dshapes/SOT-563",
  "SOD-323": "Diode_SMD.3dshapes/D_SOD-323", "DO-214AC": "Diode_SMD.3dshapes/D_SMA",
  "SOIC-8_3.9x4.9mm_Pitch1.27mm": "Package_SO.3dshapes/SOIC-8_3.9x4.9mm_P1.27mm",
  "MSOP-8_3x3mm_Pitch0.65mm": "Package_SO.3dshapes/MSOP-8_3x3mm_P0.65mm",
  "TQFP-144-iCE40": "Package_QFP.3dshapes/TQFP-144_20x20mm_P0.5mm", "FTDI_QFN-64": "Package_DFN_QFN.3dshapes/QFN-64-1EP_9x9mm_P0.5mm_EP4.1x4.1mm",
  "UCBGA-81_9x9_4x4mm_Pitch0.4mm": "Package_BGA.3dshapes/BGA-81_4.496x4.377mm_Layout9x9_P0.4mm_Ball0.25mm_Pad0.2mm_NSMD",
  "USB-micro-B": "Connector_USB.3dshapes/USB_Micro-B_Molex_47346-0001", "USB-Micro": "Connector_USB.3dshapes/USB_Micro-B_Molex_47346-0001",
  "jack-2.1mm": "Connector_BarrelJack.3dshapes/BarrelJack_Horizontal", Xtal_3_2x2_5: "Crystal.3dshapes/Crystal_SMD_3225-4Pin_3.2x2.5mm",
  "Xtal-3_2x2_5": "Crystal.3dshapes/Crystal_SMD_3225-4Pin_3.2x2.5mm",
  Oscillator_SMD_TCXO_G158: "Oscillator.3dshapes/Oscillator_SMD_TCXO_G158",
  "LED_WS2812B-PLCC4": "LED_SMD.3dshapes/LED_WS2812B_PLCC4_5.0x5.0mm_P3.2mm",
  WE_434331013822: "Button_Switch_SMD.3dshapes/SW_SPST_PTS645Sx43SMTR92", "sw-vert-tht-7.5x6x6.5": "Button_Switch_THT.3dshapes/SW_PUSH_6mm",
  "slide-sw-spdt-right-angle": "Button_Switch_SMD.3dshapes/SW_SPDT_PCM12",
  "Pin_Header_Straight_1x14_Pitch2.54mm": "Connector_PinHeader_2.54mm.3dshapes/PinHeader_1x14_P2.54mm_Vertical",
  "Pin_Header_Straight_2x08_Pitch2.54mm_SMD": "Connector_PinHeader_2.54mm.3dshapes/PinHeader_2x08_P2.54mm_Vertical_SMD",
  "Pin_Header_Straight_2x03_Pitch2.54mm_SMD": "Connector_PinHeader_2.54mm.3dshapes/PinHeader_2x03_P2.54mm_Vertical_SMD",
  ...Object.fromEntries([3, 4, 6, 8].flatMap((n) => ["", "-red", "-gray", "-cyan"].map((c) =>
    [`1x${n}-pin-header-2.54mm${c}`, `Connector_PinHeader_2.54mm.3dshapes/PinHeader_1x0${n}_P2.54mm_Vertical`]))),
  "2x4-pin-header-2.54mm-yellow": "Connector_PinHeader_2.54mm.3dshapes/PinHeader_2x04_P2.54mm_Vertical",
  "1x6-socket-header-2.54mm": "Connector_PinSocket_2.54mm.3dshapes/PinSocket_1x06_P2.54mm_Vertical",
  "1x8-socket-header-2.54mm": "Connector_PinSocket_2.54mm.3dshapes/PinSocket_1x08_P2.54mm_Vertical",
  "1x10-socket-header-2.54mm": "Connector_PinSocket_2.54mm.3dshapes/PinSocket_1x10_P2.54mm_Vertical",
};

/** Footprints of a .kicad_pcb (KiCad 5 or later): reference, position (mm), side. */
function footprints(text) {
  const out = [];
  for (const m of text.matchAll(/\((?:footprint|module) "?([^"\s]+)"?([\s\S]*?)\n  \)/g)) {
    const body = m[2];
    const at = /\(at ([\d.-]+) ([\d.-]+)(?: ([\d.-]+))?\)/.exec(body);
    const ref = /\(property "Reference" "([^"]+)"/.exec(body) ?? /\(fp_text reference "?([^"\s]+)"?/.exec(body);
    const layer = /\(layer "?([^")]+)"?\)/.exec(body);
    if (at && ref) out.push({ ref: ref[1], lib: m[1], x: +at[1], y: +at[2], back: layer?.[1] === "B.Cu" });
  }
  return out;
}

function fetchLibraryModels(text) {
  const wanted = new Set([...text.matchAll(/\$\{(?:KISYS3DMOD|KICAD\d*_3DMODEL_DIR)\}\/([^\s")]+?)\.(?:wrl|step)(?=[\s")])/g)].map((m) => m[1]));
  let got = 0;
  for (const m of wanted) {
    const file = join(LIB3D, `${m}.step`);
    if (existsSync(file)) continue;
    mkdirSync(dirname(file), { recursive: true });
    try { run("curl", ["-sfL", `https://gitlab.com/kicad/libraries/kicad-packages3D/-/raw/master/${m}.step`, "-o", file]); got++; }
    catch { console.warn(`  no library model for ${m}`); }
  }
  console.log(`  ${wanted.size} library parts, ${got} downloaded`);
}

const kb = (f) => `${Math.round(statSync(f).size / 1024)} KB`;
// --palette false: a palette texture loses the parts' colours in three.js.
const compress = (from, to) => run("npx", [...GLTF, "optimize", from, to, "--compress", "meshopt", "--palette", "false", "--texture-compress", "webp", "--texture-size", "1024", "--simplify-ratio", "0.5", "--simplify-error", "0.0005"]);

/**
 * The designs don't set a solder mask colour and kicad-cli exports it white: colour the board
 * like KiCad's own 3D viewer does (green mask, gold copper), before compressing.
 */
async function colourBoard(file) {
  const tools = join(work, "tools");
  if (!existsSync(join(tools, "node_modules/@gltf-transform/core"))) run("npm", ["install", "--silent", "--prefix", tools, "@gltf-transform/core@4.1.1"]);
  const { NodeIO } = await import(join(tools, "node_modules/@gltf-transform/core/dist/index.js"));
  const io = new NodeIO(), doc = await io.read(file);
  const set = (re, color, metal, rough) => doc.getRoot().listMeshes().filter((m) => re.test(m.getName())).forEach((m) =>
    m.listPrimitives().forEach((p) => p.getMaterial()?.setBaseColorFactor(color).setMetallicFactor(metal).setRoughnessFactor(rough).setAlphaMode("OPAQUE")));
  set(/soldermask/i, [0.04, 0.24, 0.12, 1], 0, 0.45);
  set(/_PCB$/i, [0.16, 0.2, 0.12, 1], 0, 0.8);
  set(/_(copper|pad|via)$/i, [0.83, 0.68, 0.32, 1], 0.85, 0.3);
  await io.write(file, doc);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(LIB3D, { recursive: true });
const credits = [];

for (const b of BOARDS) {
  console.log(`== ${b.id}`);
  const repo = join(work, b.id);
  if (!existsSync(repo)) run("git", ["clone", "-q", "--depth", "1", b.repo, repo]);
  for (const s of b.submodules ?? []) run("git", ["-C", repo, "submodule", "update", "--init", "--depth", "1", s]);
  const src = join(repo, b.pcb);
  let text = readFileSync(src, "utf8");
  text = text.replace(/\(model "?([^\s")]+)"?/g, (all, path) => {
    const lib = EQUIVALENTS[path.split(/[/\\]/).pop().replace(/\.(wrl|step|stp)$/i, "")];
    return lib ? `(model \${KISYS3DMOD}/${lib}.step` : all;
  });
  for (const [re, to] of b.substitute ?? []) {
    text = text.replace(re, to.startsWith("lib:") ? `\${KISYS3DMOD}/${to.slice(4)}.step` : join(repo, to.slice(5)));
  }
  fetchLibraryModels(text);
  // kicad-cli doesn't expand these in older board files, so write the paths out in full.
  // Only the STEP versions of library parts were fetched; kicad-cli's --subst-models doesn't find them here.
  text = text.replace(/(\$\{(?:KISYS3DMOD|KICAD\d*_3DMODEL_DIR)\}\/[^\s")]+?)\.wrl(?=[\s")])/g, "$1.step");
  text = text.replace(/\$\{(?:KISYS3DMOD|KICAD\d*_3DMODEL_DIR)\}/g, LIB3D);
  for (const [from, to] of b.fixPaths ?? []) text = text.split(from).join(to.replace("${REPO}", repo));
  const pcb = src.replace(/\.kicad_pcb$/, ".bitflow.kicad_pcb");   // next to the original, so ${KIPRJMOD} still works
  writeFileSync(pcb, text);

  const raw = join(work, `${b.id}.raw.glb`), glb = join(OUT, `${b.id}.glb`);
  run("kicad-cli", ["pcb", "export", "glb", "-f", "--subst-models", "--include-tracks", "--include-pads", "--include-silkscreen", "--include-soldermask", "-o", raw, pcb]);
  await colourBoard(raw);
  compress(raw, glb);
  console.log(`  ${kb(raw)} → ${kb(glb)}`);

  // kicad-cli writes metres in the board's own frame: x = board x, z = board y, y up.
  const fps = new Map(footprints(text).map((f) => [f.ref, f]));
  const at = (ref) => {
    const f = fps.get(ref);
    if (!f) throw new Error(`${b.id}: no footprint ${ref}`);
    return [f.x / 1000, f.y / 1000];
  };
  writeFileSync(join(OUT, `${b.id}.json`), JSON.stringify({
    leds: (b.leds ?? []).map(at), rgb: b.rgb ? at(b.rgb) : null, buttons: b.buttons.map(at),
    switches: (b.switches ?? []).flatMap(({ ref, count, dx }) => {
      const [x, z] = at(ref);
      return Array.from({ length: count }, (_, i) => [x + ((i - (count - 1) / 2) * dx) / 1000, z]);
    }),
  }));
  if (b.licence) copyFileSync(join(repo, b.licence), join(OUT, `${b.id}.LICENSE.txt`));
  credits.push({ id: b.id, credit: b.credit });
}

// Sketchfab downloads (glTF zips), credited per their CC Attribution licence.
const MCUS = [
  { id: "mcu-arduino-uno", zip: /arduino.?uno/i, credit: '"Arduino Uno" by kakaeka, sketchfab.com/3d-models/arduino-uno-775a2bf901a74fd190f175f5f0dcf2d0, CC Attribution 4.0' },
  { id: "mcu-esp32", zip: /esp32/i, credit: '"ESP32 WROOM 32 - Low Poly Photorealistic" by wojteX, sketchfab.com/3d-models/esp32-wroom-32-low-poly-photorealistic-af0851c326ef4cbaa42439f801acbe98, CC Attribution 4.0' },
  { id: "mcu-nodemcu", zip: /nodemcu|lolin/i, credit: '"LoLin NodeMcu V3" by Jamie Hamel-Smith (jamie3d), sketchfab.com/3d-models/lolin-nodemcu-v3-c93922b794cc421e88f3ecaad107d454, CC Attribution 4.0' },
];
if (sketchfab) {
  for (const m of MCUS) {
    const zip = readdirSync(sketchfab).find((f) => f.endsWith(".zip") && m.zip.test(f));
    if (!zip) { console.warn(`== ${m.id}: no zip matching ${m.zip} in ${sketchfab}`); continue; }
    console.log(`== ${m.id} (${zip})`);
    const dir = join(work, m.id);
    run("unzip", ["-oq", join(sketchfab, zip), "-d", dir]);
    const gltf = run("find", [dir, "-name", "*.gltf"]).trim().split("\n")[0];
    const glb = join(OUT, `${m.id}.glb`);
    compress(gltf, glb);
    console.log(`  → ${kb(glb)}`);
    credits.push({ id: m.id, credit: m.credit });
  }
}

writeFileSync(join(OUT, "CREDITS.json"), JSON.stringify(credits, null, 1));
console.log(`wrote ${OUT}`);
