/**
 * scripts/projects.check.ts — self-check for saved projects: the version rule and save checks
 * (lib/projects.ts) always; and, with BITFLOW_URL set to a running local stack, the API
 * (app/api/projects) end to end with two throwaway accounts: create, autosaves sharing a
 * version, named versions, rename, history, another user's 404s, bad saves, the version cap
 * and delete.
 *   npx tsx scripts/projects.check.ts
 *   BITFLOW_URL=http://127.0.0.1:3100 npx tsx scripts/projects.check.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { COALESCE_MS, MAX_VERSIONS, projectContent, projectName, versionAction, type ProjectContent } from "@/lib/projects";

const base: ProjectContent = { designCode: "module a; endmodule", testbenchCode: "module tb; endmodule", files: null, designLanguage: "verilog", testbenchLanguage: "verilog", pins: null };
const t0 = new Date("2026-01-01T10:00:00Z");
const latest = (over: Partial<ProjectContent & { message: string | null; createdAt: Date }> = {}) => ({ ...base, message: null, createdAt: t0, ...over });
const changed = { ...base, designCode: "module b; endmodule" };

assert.equal(versionAction(null, base, null), "create", "the first save makes a version");
assert.equal(versionAction(latest(), base, null), "none", "no change, no version");
assert.equal(versionAction(latest(), base, "Saved"), "update", "naming the newest unnamed version");
assert.equal(versionAction(latest({ message: "Saved" }), base, "Saved"), "none");
assert.equal(versionAction(latest(), changed, null, t0.getTime() + COALESCE_MS - 1), "update", "autosaves close together share a version");
assert.equal(versionAction(latest(), changed, null, t0.getTime() + COALESCE_MS), "create", "an autosave later starts a new one");
assert.equal(versionAction(latest({ message: "Created" }), changed, null, t0.getTime() + 1000), "create", "a named version is never overwritten");
assert.equal(versionAction(latest(), changed, "Saved", t0.getTime() + 1000), "create", "a named save is its own version");

const ok = (b: object) => { const r = projectContent(b); assert.ok("content" in r, JSON.stringify(r)); return r.content; };
const bad = (b: object, status: number) => { const r = projectContent(b); assert.ok("error" in r && r.status === status, JSON.stringify(r)); };
assert.equal(ok({ designCode: "x", testbenchCode: "y" }).files, null);
assert.equal(ok({ designCode: "x", testbenchCode: "y", files: [{ name: "alu.v", content: "z" }] }).files, '[{"name":"alu.v","content":"z"}]');
assert.equal(ok({ designCode: "x", testbenchCode: "y", pins: { "icestick:blinky": "set_io clk 21" } }).pins, '{"icestick:blinky":"set_io clk 21"}');
bad({ designCode: "x" }, 400);
bad({ designCode: "x", testbenchCode: "y", designLanguage: "cobol" }, 400);
bad({ designCode: "x", testbenchCode: "y", files: [{ name: "../evil.v", content: "" }] }, 400);
bad({ designCode: "x".repeat(129 * 1024), testbenchCode: "y" }, 413);
bad({ designCode: "x", testbenchCode: "y", files: Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.v`, content: "x".repeat(110 * 1024) })) }, 413);
bad({ designCode: "x", testbenchCode: "y", pins: { "no key": "x" } }, 400);
assert.equal(projectName("  My CPU  ", ""), "My CPU");
assert.equal(projectName("", "module counter (input clk);"), "counter");
assert.equal(projectName(undefined, ""), "Untitled project");
console.log("version rule + save checks: ok");

// ── The API, end to end ─────────────────────────────────────────────────────

const URL_ = process.env.BITFLOW_URL;

function client() {
  let cookie = "";
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(URL_ + path, {
      method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}
async function signedIn() {
  const call = client();
  const { data } = await call("GET", "/api/auth/register");
  await new Promise((r) => setTimeout(r, 3200));   // the sign-up form's minimum time (lib/bot-check.ts)
  const rnd = crypto.randomBytes(5).toString("hex");
  const r = await call("POST", "/api/auth/register", { username: `proj${rnd}`, password: `Pw!${crypto.randomBytes(9).toString("hex")}`, role: "STUDENT", formToken: data.formToken });
  assert.ok(r.status < 300, `register: ${r.status} ${JSON.stringify(r.data)}`);
  return call;
}

async function api() {
  if (!URL_) return console.log("API: skipped (set BITFLOW_URL to a running local stack)");
  const [a, b] = await Promise.all([signedIn(), signedIn()]);
  const save = { designCode: "module counter; endmodule", testbenchCode: "module tb; endmodule", files: [{ name: "alu.v", content: "module alu; endmodule" }],
                 designLanguage: "verilog", testbenchLanguage: "verilog", pins: { "icestick:counter": "set_io clk 21\n" } };

  let r = await a("POST", "/api/projects", save);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const id = r.data.project.id;
  assert.equal(r.data.project.name, "counter", "named after the first module");
  r = await a("GET", "/api/projects");
  assert.deepEqual(r.data.projects.map((p: { id: string; versions: number }) => [p.id, p.versions]), [[id, 1]]);

  const step = (n: number, extra = {}) => a("PATCH", `/api/projects/${id}`, { ...save, designCode: `module counter; // ${n}\nendmodule`, ...extra });
  assert.equal((await step(1)).data.version, "create", "after the named first version, an autosave starts a new one");
  assert.equal((await step(2)).data.version, "update", "the next autosave shares it");
  assert.equal((await step(3, { message: "Works now" })).data.version, "create");
  assert.equal((await step(3)).data.version, "none", "unchanged");
  r = await a("PATCH", `/api/projects/${id}`, { name: "My counter" });
  assert.equal(r.data.project.name, "My counter");

  r = await a("GET", `/api/projects/${id}/versions`);
  assert.deepEqual(r.data.versions.map((v: { message: string | null }) => v.message), ["Works now", null, "Created"]);
  const oldest = r.data.versions[2].id;
  r = await a("GET", `/api/projects/${id}/versions?v=${oldest}`);
  assert.equal(r.data.version.designCode, save.designCode, "the first version keeps the first content");
  assert.deepEqual(r.data.version.files, save.files);
  assert.deepEqual(r.data.version.pins, save.pins);
  r = await a("GET", `/api/projects/${id}`);
  assert.equal(r.data.project.name, "My counter");
  assert.ok(r.data.project.designCode.includes("// 3"));
  assert.equal(r.data.project.ownerId, undefined, "the owner id isn't sent");

  // Another user sees nothing of it.
  for (const [method, path, body] of [["GET", `/api/projects/${id}`], ["PATCH", `/api/projects/${id}`, save], ["DELETE", `/api/projects/${id}`],
                                      ["GET", `/api/projects/${id}/versions`], ["GET", `/api/projects/${id}/versions?v=${oldest}`]] as const) {
    assert.equal((await b(method, path, body)).status, 404, `${method} ${path} as another user`);
  }
  assert.deepEqual((await b("GET", "/api/projects")).data.projects, []);
  assert.equal((await client()("GET", "/api/projects")).status, 401, "signed out");

  // Bad saves are refused and change nothing.
  assert.equal((await a("PATCH", `/api/projects/${id}`, { ...save, files: [{ name: "../x.v", content: "" }] })).status, 400);
  assert.equal((await a("PATCH", `/api/projects/${id}`, { ...save, designCode: "x".repeat(130 * 1024) })).status, 413);

  // The newest MAX_VERSIONS are kept.
  for (let n = 0; n < MAX_VERSIONS + 2; n++) await step(100 + n, { message: `v${n}` });
  r = await a("GET", `/api/projects/${id}/versions`);
  assert.equal(r.data.versions.length, MAX_VERSIONS);
  assert.equal(r.data.versions[0].message, `v${MAX_VERSIONS + 1}`);

  assert.equal((await a("DELETE", `/api/projects/${id}`)).status, 200);
  assert.equal((await a("GET", `/api/projects/${id}`)).status, 404);
  assert.equal((await a("GET", `/api/projects/${id}/versions`)).status, 404);
  console.log("API: ok");
}

api().then(() => console.log("projects: all checks passed"), (e) => { console.error(e); process.exit(1); });
