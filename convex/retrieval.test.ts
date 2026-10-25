// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const sample = JSON.parse(readFileSync(resolve("datagen/sample.seed.json"), "utf8"));
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("RETRIEVAL_URL", "");
  vi.stubEnv("RETRIEVAL_API_KEY", "");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function seeded() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.load, sample);
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  return t;
}
function sidecar(response: unknown) {
  vi.stubEnv("RETRIEVAL_URL", "http://sidecar.test");
  vi.stubEnv("RETRIEVAL_API_KEY", "test-service-token");
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(response)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("C4 query forwards entity/date, shared auth and trace headers", async () => {
  const t = convexTest(schema, modules);
  const mock = sidecar([]);
  expect(await t.action(internal.retrieval.query, { collection: "policy", text: "fees", entity: sample.entity,
    asOf: "2026-07-31", traceId: "T-test" })).toEqual([]);
  const [url, init] = mock.mock.calls[0];
  expect(url).toBe("http://sidecar.test/query");
  expect(JSON.parse(init.body)).toMatchObject({ entity: sample.entity, asOf: "2026-07-31", k: 5 });
  expect(init.headers.Authorization).toBe("Bearer test-service-token");
  expect(init.headers["X-Trace-Id"]).toBe("T-test");
});

it("C4 stats selects its return fields from the richer sidecar response", async () => {
  const t = convexTest(schema, modules);
  const mock = sidecar({ backend: "moss", ready: true, documents: 21, retrievals: 4,
    medianLatencyMs: 3.44, tokensUsed: 100, tokensFullContext: 200, tokenCounting: "estimate_chars_div_4" });
  expect(await t.action(internal.retrieval.stats, {})).toEqual({ retrievals: 4, medianLatencyMs: 3.44, tokensUsed: 100, tokensFullContext: 200 });
  expect(mock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-service-token");
});

it("C4 bootstrap preserves amendment dates and batches all clauses in one write", async () => {
  const t = await seeded();
  const chunks = await t.query(internal.retrieval.loadClauses, { entity: sample.entity });
  expect(chunks).toHaveLength(21);
  expect(chunks.find((c) => c.id === "brightwater-amendment-1")?.meta.effectiveDate).toBe("2026-08-10");
  expect(chunks.find((c) => c.id === "apex-9.4")?.meta.title).toContain("Apex Staging");
  const mock = sidecar({ ok: true, documents: 21, indexed: 21 });
  await t.action(internal.retrieval.indexEntity, { entity: sample.entity });
  expect(mock).toHaveBeenCalledTimes(1);
  expect(mock.mock.calls[0][0]).toBe("http://sidecar.test/index/batch");
  expect(JSON.parse(mock.mock.calls[0][1].body).chunks).toHaveLength(21);
});

it("C4 reviewed-decision publication carries simulated date and full precedent scope", async () => {
  const t = await seeded();
  const decisionId = await t.run(async (ctx) => {
    const bank = (await ctx.db.query("bankTransactions").take(1))[0];
    const breakId = await ctx.db.insert("breaks", { entity: sample.entity, period: "2026-07", breakId: "B-test",
      bankTransactionId: bank._id, kind: "deposit_shortfall", description: "test fixture", status: "resolved" });
    const proposalId = await ctx.db.insert("proposals", { entity: sample.entity, period: "2026-07", proposalId: "P-test",
      breakId, lines: [{ account: "5050", debit: 900000, credit: 0 }, { account: "1100", debit: 0, credit: 900000 }],
      reason: "test fixture", citations: [], status: "approved", revision: 1, correctionsApplied: [], proposedBy: "agent" });
    return await ctx.db.insert("decisions", { entity: sample.entity, period: "2026-07", decisionId: "D-test",
      proposalId, reviewer: "human", outcome: "approved", reason: "Test-only human decision fixture", rulesRun: [], citations: [],
      precedentScope: { breakKind: "deposit_shortfall", policyClause: "policy-5.1" } });
  });
  const chunk = await t.query(internal.retrieval.loadDecision, { decisionId });
  expect(chunk?.meta.effectiveDate).toBe("2026-07-31");
  expect(JSON.parse(chunk!.meta.scope)).toEqual({ breakKind: "deposit_shortfall", policyClause: "policy-5.1" });
  const mock = sidecar({ ok: true, id: "D-test" });
  await t.action(internal.retrieval.indexDecision, { decisionId });
  const sent = JSON.parse(mock.mock.calls[0][1].body);
  expect(sent.meta.reviewer).toBe("human");
  expect(sent.meta.effectiveDate).toBe("2026-07-31");
});

it("C4 correction publication supplies its period's effective date", async () => {
  const t = await seeded();
  const correctionId = await t.run(async (ctx) => ctx.db.insert("corrections", { entity: sample.entity, period: "2026-07",
    correctionId: "C-test", kind: "human_rejection", scope: "duplicate payable", instruction: "Void it", appliedBy: [] }));
  const mock = sidecar({ ok: true, id: "C-test" });
  await t.action(internal.retrieval.indexCorrection, { correctionId });
  expect(JSON.parse(mock.mock.calls[0][1].body).meta.effectiveDate).toBe("2026-07-31");
});

it("A6 seed reset replaces only the requested entity and forwards service authentication", async () => {
  const t = await seeded();
  const mock = sidecar({ ok: true, entity: sample.entity, documents: 21, deleted: 1 });
  expect(await t.action(internal.retrieval.resetEntity, { entity: sample.entity })).toEqual({ ok: true });
  const [url, init] = mock.mock.calls[0];
  expect(url).toBe("http://sidecar.test/reindex-all");
  const body = JSON.parse(init.body);
  expect(body.entity).toBe(sample.entity);
  expect(body.chunks).toHaveLength(21);
  expect(body.chunks.every((c: {collection: string}) => c.collection === "policy" || c.collection === "contracts")).toBe(true);
  expect(init.headers.Authorization).toBe("Bearer test-service-token");
});

it("A6 reset records a failure instead of claiming stale memory was removed", async () => {
  const t = await seeded();
  expect(await t.action(internal.retrieval.resetEntity, { entity: sample.entity })).toEqual({ ok: false });
  const rows = await t.run(ctx => ctx.db.query("auditLog").take(100));
  expect(rows.some(row => row.action === "retrieval.reset_entity.failed")).toBe(true);
});

it("A6 CRS adapter forwards the opaque test ID, trace and normalized fail-closed result", async () => {
  const t = convexTest(schema,modules);
  const closed = {identityMatch:false,fraudFlags:[],available:false};
  const mock = sidecar(closed);
  expect(await t.action(internal.retrieval.verify,{testIdentityId:"P12",traceId:"T-held-vendor"})).toEqual(closed);
  expect(mock.mock.calls[0][0]).toBe("http://sidecar.test/verify");
  expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual({testIdentityId:"P12"});
  expect(mock.mock.calls[0][1].headers["X-Trace-Id"]).toBe("T-held-vendor");
});

it('A6 publishes audit trace summaries into events with entity/date metadata',async()=>{
  const t=await seeded();
  await t.run(async ctx=>{await ctx.db.insert('auditLog',{entity:sample.entity,period:'2026-09',traceId:'T-fixture',actor:'controls',action:'post_entry.denied',detail:'8.1 refused',at:1});});
  const mock=sidecar({ok:true,id:'T-fixture'});
  expect(await t.action(internal.retrieval.indexTrace,{entity:sample.entity,traceId:'T-fixture',effectiveDate:'2026-09-30'})).toBe(true);
  expect(JSON.parse(mock.mock.calls[0][1].body)).toMatchObject({collection:'events',id:'T-fixture',meta:{entity:sample.entity,effectiveDate:'2026-09-30'}});
});
