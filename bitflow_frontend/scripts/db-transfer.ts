/**
 * scripts/db-transfer.ts — copy all data between databases (e.g. SQLite → Postgres).
 *
 *   npm run db:export -- /app/data/bitflow-export.json     (any DATABASE_URL)
 *   npm run db:import -- /app/data/bitflow-export.json     (into a fresh database)
 *
 * Export writes every table to one JSON file, parents before children. Import
 * refuses a database that already has users; otherwise it replaces whatever is
 * there (on a fresh database that is only the seeded problems, which the file
 * has too, with the ids its submissions point at), all in one transaction, then
 * checks every table's row count against the file. The model list and the
 * foreign-key order come from the Prisma schema, so new tables are included
 * automatically. Run inside the frontend container (see "Moving to Postgres" in
 * .env.example).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type Model = (typeof Prisma.dmmf.datamodel.models)[number];
const FORMAT = "bitflow-db-export";
const PAGE = 1000;

const delegateName = (m: Model) => m.name[0].toLowerCase() + m.name.slice(1);
const delegate = (client: unknown, m: Model) => (client as Record<string, any>)[delegateName(m)];

/** Models ordered so each comes after every model its foreign keys point to. */
function fkOrder(): Model[] {
  const models = Prisma.dmmf.datamodel.models;
  const deps = new Map(models.map((m) => [
    m.name,
    new Set(m.fields.filter((f) => f.relationFromFields?.length).map((f) => f.type).filter((t) => t !== m.name)),
  ]));
  const out: Model[] = [];
  const done = new Set<string>();
  while (out.length < models.length) {
    const next = models.find((m) => !done.has(m.name) && [...deps.get(m.name)!].every((d) => done.has(d)));
    if (!next) throw new Error("Circular foreign keys between models; can't order the import.");
    out.push(next);
    done.add(next.name);
  }
  return out;
}

async function exportTo(file: string) {
  const models: Record<string, unknown[]> = {};
  for (const m of fkOrder()) {
    const pk = m.fields.find((f) => f.isId)!.name;
    const rows: Record<string, unknown>[] = [];
    for (let cursor: unknown = undefined; ;) {
      const page = await delegate(prisma, m).findMany({
        take: PAGE, orderBy: { [pk]: "asc" }, ...(cursor === undefined ? {} : { skip: 1, cursor: { [pk]: cursor } }),
      });
      rows.push(...page);
      if (page.length < PAGE) break;
      cursor = page[page.length - 1][pk];
    }
    models[m.name] = rows;
    console.log(`${m.name.padEnd(14)} ${rows.length}`);
  }
  writeFileSync(file, JSON.stringify({ format: FORMAT, version: 1, exportedAt: new Date().toISOString(), models }));
  console.log(`\nExported to ${file}`);
}

async function importFrom(file: string) {
  const dump = JSON.parse(readFileSync(file, "utf8"));
  if (dump?.format !== FORMAT || typeof dump.models !== "object") throw new Error(`${file} is not a BitFlow export.`);
  if (await prisma.user.count() > 0) {
    throw new Error("This database already has users. Import only into a fresh database, so nothing is overwritten.");
  }

  const order = fkOrder();
  await prisma.$transaction(async (tx) => {
    for (const m of [...order].reverse()) await delegate(tx, m).deleteMany();
    for (const m of order) {
      const dates = m.fields.filter((f) => f.type === "DateTime").map((f) => f.name);
      const rows = ((dump.models[m.name] ?? []) as Record<string, unknown>[]).map((r) => {
        const row = { ...r };
        for (const d of dates) if (typeof row[d] === "string") row[d] = new Date(row[d] as string);
        return row;
      });
      for (let i = 0; i < rows.length; i += 500) await delegate(tx, m).createMany({ data: rows.slice(i, i + 500) });
    }
  }, { maxWait: 60_000, timeout: 30 * 60_000 });

  let mismatches = 0;
  for (const m of order) {
    const want = (dump.models[m.name] ?? []).length;
    const got = await delegate(prisma, m).count();
    if (got !== want) mismatches++;
    console.log(`${m.name.padEnd(14)} ${String(got).padStart(7)} ${got === want ? "ok" : `MISMATCH (file has ${want})`}`);
  }
  if (mismatches) throw new Error(`${mismatches} table(s) don't match the export.`);
  console.log(`\nImported ${file}`);
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  if (!file || (mode !== "export" && mode !== "import")) {
    console.error("usage: npx tsx scripts/db-transfer.ts export|import <file.json>");
    process.exit(2);
  }
  await (mode === "export" ? exportTo(file) : importFrom(file));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
