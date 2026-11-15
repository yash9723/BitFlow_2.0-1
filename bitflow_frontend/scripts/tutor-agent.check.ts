/**
 * scripts/tutor-agent.check.ts — tests the link between BitFlow and the tutor agent (npx tsx scripts/tutor-agent.check.ts):
 * the signed tokens, what the agent's tools can and cannot read, and that the tutor keeps answering when the agent is down.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { AGENT_AUDIENCE, bearer, signAgentToken, verifyAgentToken } from "../lib/agent-auth";
import { agentProvider, type AIProvider } from "../lib/ai-providers";
import { hintStatus, hintView, lastResultView, problemView, tutorMayRead, type QuestionRow } from "../lib/tutor-data";

const keys = () => crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const { privateKey: KEY } = keys();
const { privateKey: OTHER } = keys();
const SECRETS = ["HIDDEN-TB-SECRET", "HIDDEN-CASES-SECRET", "REFERENCE-SOLUTION-SECRET", "MUTANTS-SECRET", "EDITORIAL-SECRET", "WORKED-SOLUTION-SECRET", "STARTER-SECRET"];
let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log("ok  ", name); };

(async () => {
  await ok("a token names one student and one problem, and verifies", () => {
    const t = signAgentToken({ sub: "user-1", slug: "the-first-wire" }, KEY);
    assert.deepEqual(verifyAgentToken(t, KEY), { sub: "user-1", slug: "the-first-wire" });
  });

  await ok("forged, expired, mis-addressed and algorithm-swapped tokens are refused", () => {
    const good = signAgentToken({ sub: "u", slug: "s" }, KEY);
    assert.equal(verifyAgentToken(signAgentToken({ sub: "u", slug: "s" }, OTHER), KEY), null, "signed with another key");
    assert.equal(verifyAgentToken(good.slice(0, -4) + "AAAA", KEY), null, "tampered signature");
    assert.equal(verifyAgentToken(jwt.sign({ slug: "s" }, KEY, { algorithm: "ES256", subject: "u", issuer: "bitflow-frontend", audience: AGENT_AUDIENCE, expiresIn: -5 }), KEY), null, "expired");
    assert.equal(verifyAgentToken(jwt.sign({ slug: "s" }, KEY, { algorithm: "ES256", subject: "u", issuer: "bitflow-frontend", audience: "someone-else", expiresIn: 60 }), KEY), null, "wrong audience");
    assert.equal(verifyAgentToken(jwt.sign({ slug: "s" }, KEY, { algorithm: "ES256", subject: "u", issuer: "not-bitflow", audience: AGENT_AUDIENCE, expiresIn: 60 }), KEY), null, "wrong issuer");
    const pub = crypto.createPublicKey(KEY).export({ type: "spki", format: "pem" }).toString();
    assert.equal(verifyAgentToken(jwt.sign({ slug: "s" }, pub, { algorithm: "HS256", subject: "u", issuer: "bitflow-frontend", audience: AGENT_AUDIENCE, expiresIn: 60 }), KEY), null, "HS256 signed with the public key");
    assert.equal(verifyAgentToken(jwt.sign({}, KEY, { algorithm: "ES256", subject: "u", issuer: "bitflow-frontend", audience: AGENT_AUDIENCE, expiresIn: 60 }), KEY), null, "no problem named");
    assert.equal(verifyAgentToken(null, KEY), null); assert.equal(verifyAgentToken("", KEY), null); assert.equal(verifyAgentToken("a.b.c", KEY), null);
    assert.equal(bearer("Bearer abc.def.ghi"), "abc.def.ghi"); assert.equal(bearer("Basic abc"), null); assert.equal(bearer(null), null);
  });

  const q: QuestionRow = {
    title: "Counter", difficulty: "Easy", category: "Sequential", statement: "# Counter\nCount up.", constraints: JSON.stringify(["no latches"]),
    examples: JSON.stringify([{ input: "rst=1", output: "q=0", explanation: "reset" }]),
    hints: JSON.stringify([{ tier: 1, content: "Think about the clock edge." }, { tier: 2, content: "Use nonblocking assignments." }, { tier: 3, content: "Reset first, then increment." }]),
    hiddenTestbench: SECRETS[0], hiddenTestcases: SECRETS[1], referenceSolution: SECRETS[2], mutants: SECRETS[3], editorial: SECRETS[4], solutionExplanation: SECRETS[5], starterCode: SECRETS[6],
  };
  const last = { accepted: false, numTestsPassed: 1, numTestsTotal: 4, testcaseResults: JSON.stringify([{ passed: false, description: "count wraps", actual: "q=15" }]), simStdout: "q=15", counterexample: "t | q (yours) | q (expected)\n3 | 15 | 0" };

  await ok("no tool can return a withheld field, whatever the question row holds", () => {
    const all = [problemView(q), lastResultView(last), hintStatus(q, [1, 2, 3]), ...[1, 2, 3].map((t) => { const h = hintView(q, [1, 2, 3], t); return h.ok ? h.text : h.reason; })].join("\n");
    for (const s of SECRETS) assert.ok(!all.includes(s), `${s} leaked`);
    assert.ok(all.includes("Count up.") && all.includes("rst=1") && all.includes("count wraps") && all.includes("no latches"), "the allowed content is there");
  });

  await ok("a hint is given only for a tier the student has already unlocked", () => {
    assert.deepEqual(hintView(q, [1], 1), { ok: true, text: "Think about the clock edge." });
    const locked = hintView(q, [1], 3); assert.equal(locked.ok, false); assert.ok(!JSON.stringify(locked).includes("Reset first"), "locked text must not appear even in the refusal");
    assert.equal(hintView(q, [], 1).ok, false);
    assert.equal(hintView(q, [1, 2, 3], 4).ok, false); assert.equal(hintView(q, [1, 2, 3], NaN).ok, false);
    assert.equal(hintStatus(q, [2]), "tier 1: locked, tier 2: unlocked, tier 3: locked");
    assert.equal(hintStatus({ ...q, hints: "[]" }, []), "no hints for this problem");
  });

  await ok("only a live, ordinary problem can be read (not archived, not a find-the-bug follow-up)", () => {
    assert.equal(tutorMayRead({ archived: false, unlockAfter: null }), true);
    assert.equal(tutorMayRead({ archived: true, unlockAfter: null }), false);
    assert.equal(tutorMayRead({ archived: false, unlockAfter: "parent" }), false);
    assert.equal(tutorMayRead(null), false);
  });

  await ok("the tutor keeps answering when the agent is missing, slow or broken", async () => {
    const calls: string[] = [];
    const plain: AIProvider = { name: "plain", async chat() { calls.push("plain"); return { content: "plain answer", tokensUsed: 1, provider: "plain" }; } };
    const agent = agentProvider(plain), msgs = [{ role: "user" as const, content: "help" }];
    const meta = { userId: "u1", problemSlug: "counter" };
    const realFetch = globalThis.fetch;
    process.env.AGENT_JWT_PRIVATE_KEY = KEY;
    try {
      delete process.env.AGENT_URL;
      assert.equal((await agent.chat(msgs, "sys", meta)).provider, "plain", "no AGENT_URL");
      process.env.AGENT_URL = "https://agent.example/";
      assert.equal((await agent.chat(msgs, "sys", { userId: "u1" })).provider, "plain", "no problem (the Sandbox) goes to the plain provider");
      let seen: { url: string; auth: string; body: any } | null = null;
      globalThis.fetch = (async (url: any, init: any) => { seen = { url: String(url), auth: init.headers.Authorization, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ content: "agent answer", tokens_used: 42 }), { status: 200 }); }) as any;
      const r = await agent.chat(msgs, "sys prompt", meta);
      assert.equal(r.provider, "agent"); assert.equal(r.content, "agent answer"); assert.equal(r.tokensUsed, 42);
      assert.equal(seen!.url, "https://agent.example/chat"); assert.equal(seen!.body.system_prompt, "sys prompt");
      assert.deepEqual(verifyAgentToken(seen!.auth.replace("Bearer ", ""), KEY), { sub: "u1", slug: "counter" }, "the token is scoped to this student and problem");
      assert.ok(!JSON.stringify(seen!.body).includes("u1"), "the user id is not in the body sent to the agent");
      globalThis.fetch = (async () => new Response("boom", { status: 500 })) as any;
      assert.equal((await agent.chat(msgs, "s", meta)).provider, "plain", "agent 500");
      globalThis.fetch = (async () => { throw new Error("network down"); }) as any;
      assert.equal((await agent.chat(msgs, "s", meta)).provider, "plain", "agent unreachable");
      globalThis.fetch = (async () => new Response(JSON.stringify({ content: "  " }), { status: 200 })) as any;
      assert.equal((await agent.chat(msgs, "s", meta)).provider, "plain", "agent returned nothing");
    } finally { globalThis.fetch = realFetch; delete process.env.AGENT_URL; delete process.env.AGENT_JWT_PRIVATE_KEY; }
    assert.equal(calls.length, 5);
  });

  await ok("the tool route verifies the token, rate-limits, re-checks guardian permission and reads only allow-listed fields", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "app", "api", "ai", "tools", "[tool]", "route.ts"), "utf8");
    assert.ok(/verifyAgentToken\(bearer\(/.test(src) && /status: 401/.test(src), "token required");
    assert.ok(/prefix: "ai-tool"/.test(src), "rate limited");
    assert.ok(/canUseAi\(/.test(src), "guardian permission checked again");
    assert.ok(/tutorMayRead\(/.test(src));
    for (const bad of ["hiddenTestbench", "hiddenTestcases", "referenceSolution", "mutants", "editorial", "solutionExplanation", "starterCode"]) assert.ok(!src.includes(bad), `the tool route must not select ${bad}`);
  });

  console.log(`\n${n} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
