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
import { HOME_FAQ } from "../lib/home-faq";
import { AI_CRAWLERS, PRIVATE_PATHS, SITE_URL, jsonLd, pageMeta } from "../lib/site";

let n = 0;
const ok = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { n++; console.log("ok  ", name); });

(async () => {
  const urls = sitemap().map((e) => e.url);
  const paths = urls.map((u) => u.slice(SITE_URL.length) || "/");

  await ok("sitemap lists every Lab lesson and Studio tool once, and no signed-in Academy page", () => {
    assert.equal(new Set(urls).size, urls.length, "duplicate sitemap entries");
    assert.ok(!paths.some((p) => p.startsWith("/academy")), "Academy is behind sign-in; it must not be in the sitemap");
    for (const l of LESSONS) assert.ok(paths.includes(`/lab/${l.slug}`), `missing /lab/${l.slug}`);
    for (const t of STUDIO_TOOLS) assert.ok(paths.includes(t.href), `missing ${t.href}`);
    assert.ok(paths.includes("/"));
  });

  await ok("sitemap has no private, sign-in or duplicate-content pages", () => {
    for (const p of paths) {
      assert.ok(!PRIVATE_PATHS.some((x) => p === x.replace(/\/$/, "") || p.startsWith(x)), `private path in sitemap: ${p}`);
      assert.ok(p !== "/login", "sign-in page in sitemap");
    }
    for (const e of sitemap()) assert.ok(!("lastModified" in e), "lastmod must be real or absent, never 'now'");
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

  await ok("llms.txt lists the public sections and no signed-in or private page", async () => {
    const res = llms();
    assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
    const text = await res.text();
    assert.ok(text.startsWith("# BitFlow"));
    assert.ok(!text.includes("/academy/"), "llms.txt must not list signed-in Academy pages");
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

  await ok("the Academy is behind sign-in and kept out of search results", () => {
    const layout = fs.readFileSync(path.join(__dirname, "..", "app", "academy", "layout.tsx"), "utf8");
    assert.ok(/AuthGate/.test(layout) && /GATED/.test(layout), "the Academy layout must use AuthGate and GATED");
  });

  await ok("landing FAQ: complete answers, and the chapter count it states is the real one", () => {
    assert.ok(HOME_FAQ.length >= 5);
    for (const f of HOME_FAQ) assert.ok(f.q.endsWith("?") && f.a.length > 40, `weak FAQ entry: ${f.q}`);
    assert.ok(HOME_FAQ.some((f) => f.a.includes(`${ACADEMY_TOPIC_META.length} chapters`)));
    assert.equal(new Set(HOME_FAQ.map((f) => f.q)).size, HOME_FAQ.length);
  });

  console.log(`\n${n} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
