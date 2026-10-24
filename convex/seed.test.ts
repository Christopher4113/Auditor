// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterAll, beforeAll, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { FunctionArgs } from "convex/server";
import schema from "./schema";
import { internal } from "./_generated/api";
import { matchBatch } from "./agent/matcher";

const modules = import.meta.glob("./**/*.ts");
let directory: string;
let seed: FunctionArgs<typeof internal.seed.load>;
beforeAll(() => {
  directory = mkdtempSync(resolve(tmpdir(), "auditor-seed-"));
  const output = resolve(directory, "seed.json");
  execFileSync("uv", ["run", "--locked", "generate.py", "--out", output], { cwd: resolve("datagen") });
  seed = JSON.parse(readFileSync(output, "utf8"));
});
afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

it("loads the actual Phase 2 generator output without dropping evidence or dates", async () => {
  const t = convexTest(schema, modules);
  const result = await t.mutation(internal.seed.load, seed);
  expect(result.bankTransactions).toBe(368);
  expect(result.journalEntries).toBe(388);
  const data = await t.run(async (ctx) => ({
    books: await ctx.db.query("journalEntries").take(1000),
    contracts: await ctx.db.query("contracts").take(100),
    answers: await ctx.db.query("answerKey").take(100),
    decisions: await ctx.db.query("decisions").take(100),
  }));
  expect(data.books.filter((row) => row.source === "import")).toHaveLength(387);
  expect(data.contracts.flatMap((row) => row.documents ?? [])).toHaveLength(10);
  expect(data.contracts.flatMap((row) => row.clauses).find((row) => row.id === "brightwater-amendment-1")?.effectiveDate).toBe("2026-08-10");
  expect(data.answers).toHaveLength(11);
  expect(new Set(data.answers.map((row) => row.breakNumber))).toEqual(new Set([1,2,3,4,5,6]));
  expect(data.decisions).toHaveLength(0);
});

it("still loads the original ten-transaction Phase 1 sample", async () => {
  const t = convexTest(schema, modules);
  const sample = JSON.parse(readFileSync(resolve("datagen/sample.seed.json"), "utf8"));
  expect(await t.mutation(internal.seed.load, sample)).toEqual({ entity: seed.entity, bankTransactions: 10, journalEntries: 1 });
});

it("rejects unbalanced imported books without replacing existing data", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.load, seed);
  const corrupt = structuredClone(seed);
  corrupt.ledgerEntries![0].lines[0].debit += 1;
  await expect(t.mutation(internal.seed.load, corrupt)).rejects.toThrow();
  expect((await t.run(async (ctx) => ctx.db.query("bankTransactions").take(1000))).length).toBe(368);
});

it("matches routine imported bank entries while preserving the planted cash mismatches", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.load, seed);
  const data = await t.run(async (ctx) => ({
    books: await ctx.db.query("journalEntries").take(1000),
    banks: await ctx.db.query("bankTransactions").take(1000),
  }));
  const result = matchBatch(data.banks, data.books);
  const unmatched = data.banks.filter((row) => result.unmatchedIds.includes(row._id)).map((row) => row.txnId).sort();
  expect(unmatched).toEqual(["bank-apex-refund", "bank-artist-refund", "bank-stripe-20260710", "bank-stripe-20260814", "bank-stripe-20260911"]);
});

it("re-seeds only the target entity and remains idempotent", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => { await ctx.db.insert("accounts", { entity: "unrelated", code: "1000", name: "Keep", type: "asset" }); });
  await t.mutation(internal.seed.load, seed);
  await t.mutation(internal.seed.load, seed);
  const accounts = await t.run(async (ctx) => ctx.db.query("accounts").take(100));
  expect(accounts.filter((row) => row.entity === seed.entity)).toHaveLength(27);
  expect(accounts.filter((row) => row.entity === "unrelated")).toHaveLength(1);
});

it("contract reads hide future amendments and documents from July", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.load, seed);
  const july = await t.query(internal.agent.findContract, { entity: seed.entity, counterparty: "Brightwater Beverage", asOf: "2026-07-31" });
  expect(july?.flatMap((row) => row.clauses).some((row) => row.id === "brightwater-amendment-1")).toBe(false);
  expect(july?.flatMap((row) => row.documents ?? [])).toHaveLength(0);
  const august = await t.query(internal.agent.findContract, { entity: seed.entity, counterparty: "Brightwater Beverage", asOf: "2026-08-31" });
  expect(august?.flatMap((row) => row.clauses).some((row) => row.id === "brightwater-amendment-1")).toBe(true);
});

it("ledger investigation returns relevant raw books within the close period", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.load, seed);
  const entries = await t.query(internal.agent.readLedger, { entity: seed.entity, period: "2026-08", counterparty: "Apex Staging" });
  expect(entries).toHaveLength(1);
  expect(entries[0].entryId).toBe("JE-bank-apex-deposit");
  expect(entries[0].period).toBe("2026-08");
});
