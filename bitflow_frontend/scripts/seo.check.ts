/**
 * scripts/seo.check.ts — tests what search engines and AI assistants are told about the site
 * (npx tsx scripts/seo.check.ts): sitemap, robots.txt, llms.txt, per-page metadata, and that the public
 * Academy is not behind sign-in.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sitemap from "../app/sitemap";
import robots from "../app/robots";
import { GET as llms } from "../app/llms.txt/route";
import manifest from "../app/manifest";
import { ACADEMY_TOPIC_META } from "../lib/academy-meta";
import { LESSONS } from "../lib/lab/lessons";
import { STUDIO_TOOLS } from "../lib/studio/tools";
import { ARTICLES } from "../lib/articles";
import { HOME_FAQ } from "../lib/home-faq";
import { homePath } from "../lib/home-path";
import { AI_CRAWLERS, PRIVATE_PATHS, SITE_URL, jsonLd, pageMeta } from "../lib/site";

let n = 0;
const ok = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { n++; console.log("ok  ", name); });

(async () => {
  const entries = await sitemap();
  const urls = entries.map((e) => e.url);
  const paths = urls.map((u) => u.slice(SITE_URL.length) || "/");

  await ok("sitemap lists every Academy chapter, Lab lesson and Studio tool once", () => {
    assert.equal(new Set(urls).size, urls.length, "duplicate sitemap entries");
    for (const t of ACADEMY_TOPIC_META) assert.ok(paths.includes(`/academy/${t.slug}`), `missing /academy/${t.slug}`);
    for (const l of LESSONS) assert.ok(paths.includes(`/lab/${l.slug}`), `missing /lab/${l.slug}`);
    for (const t of STUDIO_TOOLS) assert.ok(paths.includes(t.href), `missing ${t.href}`);
    assert.ok(paths.includes("/academy") && paths.includes("/"));
  });

  await ok("sitemap has no private, sign-in or duplicate-content pages", () => {
    for (const p of paths) {
      assert.ok(!PRIVATE_PATHS.some((x) => p === x.replace(/\/$/, "") || p.startsWith(x)), `private path in sitemap: ${p}`);
      assert.ok(p !== "/login", "sign-in page in sitemap");
    }
    for (const e of entries) assert.ok(!("lastModified" in e), "lastmod must be real or absent, never 'now'");
  });

  await ok("robots.txt blocks private paths for everyone, including each AI crawler, and names the sitemap", () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const agents = (rule: (typeof rules)[number]) => ([] as string[]).concat(rule.userAgent ?? []);
    for (const bot of AI_CRAWLERS) {
      const rule = rules.find((x) => agents(x).includes(bot));
      assert.ok(rule, `${bot} has no rule`);
      for (const p of PRIVATE_PATHS) assert.ok(([] as string[]).concat(rule!.disallow ?? []).includes(p), `${bot} may fetch ${p}`);
    }
    const star = rules.find((x) => agents(x).includes("*"))!;
    for (const p of PRIVATE_PATHS) assert.ok(([] as string[]).concat(star.disallow ?? []).includes(p));
    assert.equal(r.sitemap, `${SITE_URL}/sitemap.xml`);
  });

  await ok("llms.txt lists the public sections and every Academy chapter, and no private page", async () => {
    const res = llms();
    assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
    const text = await res.text();
    assert.ok(text.startsWith("# BitFlow"));
    for (const t of ACADEMY_TOPIC_META) assert.ok(text.includes(`${SITE_URL}/academy/${t.slug})`), `llms.txt misses ${t.slug}`);
    for (const t of STUDIO_TOOLS) assert.ok(text.includes(`${SITE_URL}${t.href})`));
    for (const p of PRIVATE_PATHS) {   // "/s/" must not match "/studio": the path ends at a "/" or the closing ")"
      const re = new RegExp(`${(SITE_URL + p.replace(/\/$/, "")).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[/)]`);
      assert.ok(!re.test(text), `llms.txt lists private ${p}`);
    }
  });

  await ok("pageMeta gives each page its own canonical, title and social preview", () => {
    const m = pageMeta("/academy/gates", "Logic Gates", "AND, OR, NOT.");
    assert.equal(m.alternates.canonical, "/academy/gates");
    assert.equal(m.openGraph.url, "/academy/gates");
    assert.equal(m.openGraph.title, "Logic Gates · BitFlow");
    assert.equal(m.twitter.title, m.openGraph.title);
    assert.equal(m.openGraph.description, "AND, OR, NOT.");
  });

  await ok("jsonLd cannot close its <script> tag", () => {
    assert.ok(!jsonLd({ a: "</script><b>" }).includes("<"));
  });

  await ok("manifest names the site", () => {
    const m = manifest();
    assert.equal(m.short_name, "BitFlow");
    assert.ok(m.icons?.length);
  });

  await ok("the Academy chapter pages are public (not behind sign-in, not noindex)", () => {
    const dir = path.join(__dirname, "..", "app", "academy");
    const files: string[] = [];
    const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) && files.push(path.join(d, e.name))));
    walk(dir);
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      assert.ok(!/AuthGate/.test(src), `${path.relative(dir, f)} is behind sign-in`);
      assert.ok(!/\bGATED\b/.test(src), `${path.relative(dir, f)} is marked noindex`);
    }
    const hub = fs.readFileSync(path.join(__dirname, "..", "components", "academy", "AcademyHub.tsx"), "utf8");
    assert.ok(!/AuthGate/.test(hub), "the Academy hub is behind sign-in");
  });

  await ok("every route that runs code on the simulators requires a session", () => {
    for (const r of ["simulate", "formal", "synthesize", "style", "asic"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", "app", "api", r, "route.ts"), "utf8");
      assert.ok(/if \(!user\) return signInRequired\(\)/.test(src), `/api/${r} accepts guests`);
    }
  });

  await ok("heavy simulator jobs share one per-user budget (formal, ASIC, FPGA, Verilator/VHDL/Python runs); plain Icarus runs do not", () => {
    const read = (r: string) => fs.readFileSync(path.join(__dirname, "..", "app", "api", r, "route.ts"), "utf8");
    for (const r of ["formal", "asic", "synthesize", "simulate"]) assert.ok(/heavyBudget\(request, user\.id\)/.test(read(r)), `/api/${r} skips the shared heavy budget`);
    assert.ok(/jobClass\("\/simulate", body\) === "heavy"/.test(read("simulate")), "/api/simulate must only count heavy runs");
    assert.ok(/board === true \|\| body\.fpga[\s\S]{0,200}heavyBudget/.test(read("synthesize")), "plain synthesis is light: only the FPGA/board branch counts");
  });

  await ok("every article is in the sitemap and llms.txt, with a unique title and description and links that resolve", async () => {
    assert.ok(paths.includes("/articles"));
    const text = await llms().text();
    const known = new Set(paths);
    assert.equal(new Set(ARTICLES.map((a) => a.slug)).size, ARTICLES.length, "duplicate slugs");
    assert.equal(new Set(ARTICLES.map((a) => a.title)).size, ARTICLES.length, "duplicate titles");
    assert.equal(new Set(ARTICLES.map((a) => a.description)).size, ARTICLES.length, "duplicate descriptions");
    for (const a of ARTICLES) {
      assert.ok(known.has(`/articles/${a.slug}`), `${a.slug} missing from the sitemap`);
      assert.ok(text.includes(`${SITE_URL}/articles/${a.slug})`), `${a.slug} missing from llms.txt`);
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(a.published) && !Number.isNaN(Date.parse(a.published)), `${a.slug}: published must be a real date`);
      assert.ok(a.title.length <= 70 && a.description.length >= 60 && a.description.length <= 200, `${a.slug}: title/description length`);
      assert.ok(a.sections.length >= 3, `${a.slug}: too thin`);
      for (const f of a.faq ?? []) assert.ok(f.q.endsWith("?") && f.a.length > 30, `${a.slug}: weak FAQ entry`);
      for (const r of a.related) assert.ok(known.has(r.href) || r.href.startsWith("/academy/") || r.href === "/flash", `${a.slug}: related link ${r.href} is not a public page`);
    }
  });

  await ok("the learning path on the landing page points at public pages and uses real counts", () => {
    const path = homePath({ chapters: ACADEMY_TOPIC_META.length, lessons: LESSONS.length, problems: 133 });
    assert.equal(path.length, 5);
    assert.ok(path[0].body.includes(`${ACADEMY_TOPIC_META.length} chapters`) && path[1].body.includes(`${LESSONS.length} hands-on lessons`) && path[2].body.includes("133 graded"));
    assert.ok(!homePath({ chapters: 20, lessons: 30, problems: null })[2].body.match(/\d+ graded/), "an unknown problem count must not be shown");
    for (const st of path) assert.ok(st.href.startsWith("/"));
  });

  await ok("the AI tutor route needs a sign-in, keeps per-user and site-wide daily caps, and never puts a key in a URL", () => {
    const route = fs.readFileSync(path.join(__dirname, "..", "app", "api", "ai", "chat", "route.ts"), "utf8");
    const prov = fs.readFileSync(path.join(__dirname, "..", "lib", "ai-providers.ts"), "utf8");
    assert.ok(/getSessionUser\(\)[\s\S]{0,200}status: 401/.test(route), "the tutor must reject guests");
    assert.ok(/prefix: "ai-day"/.test(route) && /prefix: "ai-global"/.test(route) && /AI_GLOBAL_PER_DAY/.test(route), "per-user and site-wide daily caps");
    assert.ok(!/[?&]key=\$\{/.test(prov), "an API key in a URL ends up in logs: send it in a header");
    assert.ok(/x-goog-api-key/.test(prov));
  });

  await ok("landing FAQ: complete answers, and the chapter count it states is the real one", () => {
    assert.ok(HOME_FAQ.length >= 5);
    for (const f of HOME_FAQ) assert.ok(f.q.endsWith("?") && f.a.length > 40, `weak FAQ entry: ${f.q}`);
    assert.ok(HOME_FAQ.some((f) => f.a.includes(`${ACADEMY_TOPIC_META.length} chapters`)));
    assert.equal(new Set(HOME_FAQ.map((f) => f.q)).size, HOME_FAQ.length);
  });

  console.log(`\n${n} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
