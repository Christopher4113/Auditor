// C4: the actions that call Group A's FastAPI sidecar (interface 1: retrieval/openapi.yaml).
// Moss: POST /index, POST /query, GET /stats. CRS: POST /verify. RETRIEVAL_URL unset = query returns
// nothing, index is skipped, verify fails closed. Nothing here ever throws into the Workflow.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalQuery } from "./_generated/server";
import { traceFor } from "./audit";

const vHit = v.object({ id: v.string(), text: v.string(), score: v.number() });
const vVerify = v.object({ identityMatch: v.boolean(), fraudFlags: v.array(v.string()), available: v.boolean() });
type Hit = { id: string; text: string; score: number };

const endpoint = (path: string) => (env.RETRIEVAL_URL ? `${env.RETRIEVAL_URL.replace(/\/$/, "")}${path}` : null);
const authHeaders = (): Record<string, string> => env.RETRIEVAL_API_KEY ? { Authorization: `Bearer ${env.RETRIEVAL_API_KEY}` } : {};
const periodEnd = (period: string): string => {
  const [year, month] = period.split("-").map(Number);
  return `${period}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
};

async function post<T>(path: string, body: unknown, traceId?: string): Promise<T | null> {
  const url = endpoint(path);
  if (!url) return null;
  try {
    const headers: Record<string, string> = { "content-type": "application/json", ...authHeaders() };
    if (traceId) headers["X-Trace-Id"] = traceId; // Group A logs it on /query and /verify
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      console.warn(`retrieval ${path} ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`retrieval ${path} failed: ${String(e)}`);
    return null;
  }
}

/** search_precedent / search_policy / search_corrections all route here; k=5 per collection (brief, Cost). */
export const query = internalAction({
  args: { collection: v.string(), text: v.string(), k: v.optional(v.number()), entity: v.optional(v.string()), asOf: v.optional(v.string()), traceId: v.optional(v.string()) },
  returns: v.array(vHit),
  handler: async (_ctx, { collection, text, k, entity, asOf, traceId }): Promise<Hit[]> => (await post<Hit[]>("/query", { collection, text, k: k ?? 5, entity, asOf }, traceId)) ?? [],
});

export const index = internalAction({
  args: { collection: v.string(), id: v.string(), text: v.string(), meta: v.optional(v.record(v.string(), v.string())), traceId: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean() }),
  handler: async (_ctx, { traceId, ...chunk }): Promise<{ ok: boolean }> => ({ ok: (await post<{ ok: boolean }>("/index", { ...chunk, meta: chunk.meta ?? {} }, traceId))?.ok === true }),
});

/** verify_payee (controls engine only). Fails closed: no sidecar, no identity, any error -> available=false. */
export const verify = internalAction({
  args: { testIdentityId: v.optional(v.string()), traceId: v.optional(v.string()) },
  returns: vVerify,
  handler: async (_ctx, { testIdentityId, traceId }) => {
    const closed = { identityMatch: false, fraudFlags: [] as string[], available: false };
    if (!testIdentityId) return closed;
    return (await post<typeof closed>("/verify", { testIdentityId }, traceId)) ?? closed;
  },
});

export const stats = internalAction({
  args: {},
  returns: v.union(v.null(), v.object({ retrievals: v.number(), medianLatencyMs: v.number(), tokensUsed: v.number(), tokensFullContext: v.number() })),
  handler: async () => {
    const url = endpoint("/stats");
    if (!url) return null;
    try {
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) return null;
      const raw = await res.json();
      const values = [raw.retrievals, raw.medianLatencyMs, raw.tokensUsed, raw.tokensFullContext];
      if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
      // Select the existing return contract; sidecar readiness/estimate fields
      // are additive and would otherwise fail Convex's strict return validator.
      return { retrievals: raw.retrievals, medianLatencyMs: raw.medianLatencyMs,
        tokensUsed: raw.tokensUsed, tokensFullContext: raw.tokensFullContext };
    } catch {
      return null;
    }
  },
});

// ── index_decision: every posted or human-decided decision becomes retrievable precedent ──────────

export const loadDecision = internalQuery({
  args: { decisionId: v.id("decisions") },
  returns: v.union(v.null(), v.object({ entity: v.string(), period: v.string(), id: v.string(), text: v.string(), meta: v.record(v.string(), v.string()), traceId: v.optional(v.string()) })),
  handler: async (ctx, { decisionId }) => {
    const d = await ctx.db.get(decisionId);
    if (!d) return null;
    const traceId = await traceFor(ctx, { decisionId });
    const p = await ctx.db.get(d.proposalId);
    const brk = p ? await ctx.db.get(p.breakId) : null;
    const lines = (p?.lines ?? []).map((l) => `${l.debit ? "Dr" : "Cr"} ${l.account} ${l.debit || l.credit}`).join("; ");
    const scope = d.precedentScope ? ` Scope: ${JSON.stringify(d.precedentScope)}.` : "";
    return {
      entity: d.entity,
      period: d.period,
      id: d.decisionId,
      text: `${d.decisionId} (${d.period}, ${brk?.kind ?? "break"}): ${d.outcome} by ${d.reviewer}. ${d.reason} Entry: ${lines}.${scope}`,
      meta: { entity: d.entity, period: d.period, effectiveDate: periodEnd(d.period),
        sourceType: "decision", reviewer: d.reviewer, outcome: d.outcome,
        breakKind: d.precedentScope?.breakKind ?? brk?.kind ?? "", scope: JSON.stringify(d.precedentScope ?? {}) },
      traceId,
    };
  },
});

export const indexDecision = internalAction({
  args: { decisionId: v.id("decisions") },
  returns: v.null(),
  handler: async (ctx, { decisionId }): Promise<null> => {
    const chunk = await ctx.runQuery(internal.retrieval.loadDecision, { decisionId });
    if (!chunk) return null;
    const { ok } = await ctx.runAction(internal.retrieval.index, { collection: "decisions", id: chunk.id, text: chunk.text, meta: chunk.meta, traceId: chunk.traceId });
    await ctx.runMutation(internal.audit.write, { entity: chunk.entity, period: chunk.period, actor: "controls", action: ok ? "index_decision" : "index_decision.skipped", decisionId, traceId: chunk.traceId, detail: chunk.id });
    return null;
  },
});

export const loadCorrection = internalQuery({
  args: { correctionId: v.id("corrections") },
  returns: v.union(v.null(), v.object({ entity: v.string(), period: v.string(), id: v.string(), text: v.string() })),
  handler: async (ctx, { correctionId }) => {
    const c = await ctx.db.get(correctionId);
    return c ? { entity: c.entity, period: c.period, id: c.correctionId, text: `${c.correctionId} (${c.kind}, scope: ${c.scope}): ${c.instruction}` } : null;
  },
});

export const indexCorrection = internalAction({
  args: { correctionId: v.id("corrections") },
  returns: v.null(),
  handler: async (ctx, { correctionId }): Promise<null> => {
    const c = await ctx.runQuery(internal.retrieval.loadCorrection, { correctionId });
    if (!c) return null;
    const { ok } = await ctx.runAction(internal.retrieval.index, { collection: "corrections", id: c.id, text: c.text,
      meta: { entity: c.entity, period: c.period, effectiveDate: periodEnd(c.period), sourceType: "correction" } });
    await ctx.runMutation(internal.audit.write, { entity: c.entity, period: c.period, actor: "human", action: ok ? "index_correction" : "index_correction.skipped", detail: c.id });
    return null;
  },
});

// ── seed-time indexing: the policy pack and every contract clause ──────────────────────────────

export const loadClauses = internalQuery({
  args: { entity: v.string() },
  returns: v.array(v.object({ collection: v.string(), id: v.string(), text: v.string(), meta: v.record(v.string(), v.string()) })),
  handler: async (ctx, { entity }) => {
    const pack = await ctx.db.query("policyPacks").withIndex("by_entity", (q) => q.eq("entity", entity)).unique();
    const contracts = await ctx.db.query("contracts").withIndex("by_entity_contractId", (q) => q.eq("entity", entity)).take(100);
    return [
      ...(pack?.clauses ?? []).filter((c) => !!c.effectiveDate).map((c) => ({ collection: "policy", id: c.id, text: c.text,
        meta: { entity, effectiveDate: c.effectiveDate!, sourceType: "policy", title: `Policy ${c.number ?? ""}`, number: c.number ?? "" } })),
      ...contracts.flatMap((k) => k.clauses.filter((c) => !!c.effectiveDate).map((c) => ({ collection: "contracts", id: c.id, text: c.text,
        meta: { entity, effectiveDate: c.effectiveDate!, sourceType: "contract", contractId: k.contractId,
          vendorId: k.vendorId ?? "", title: k.title, counterparty: k.counterparty } }))),
    ];
  },
});

export const indexEntity = internalAction({
  args: { entity: v.string() },
  returns: v.null(),
  handler: async (ctx, { entity }): Promise<null> => {
    const chunks = await ctx.runQuery(internal.retrieval.loadClauses, { entity });
    const result = chunks.length ? await post<{ ok: boolean }>("/index/batch", { chunks }) : null;
    const ok = result?.ok ? chunks.length : 0;
    await ctx.runMutation(internal.audit.write, { entity, actor: "seed", action: env.RETRIEVAL_URL ? "retrieval.index_entity" : "retrieval.skipped", detail: `${ok}/${chunks.length} chunks` });
    return null;
  },
});

/** A6: call after seed.load has cleared runtime decisions/corrections. Replaces
 *  the entity's sidecar snapshot, so a reset cannot retain old approvals in Moss.
 *  Ordinary indexEntity remains an upsert and preserves reviewed runtime memory.
 */
export const resetEntity = internalAction({
  args: { entity: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { entity }): Promise<{ ok: boolean }> => {
    const chunks = await ctx.runQuery(internal.retrieval.loadClauses, { entity });
    let result = await post<{ ok: boolean }>("/reindex-all", { entity, chunks });
    // A sidecar still on the Phase 2 image has no /reindex-all; upsert the source clauses so citations resolve.
    if (!result?.ok && chunks.length) result = await post<{ ok: boolean }>("/index/batch", { chunks });
    const ok = result?.ok === true;
    await ctx.runMutation(internal.audit.write, { entity, actor: "seed", action: ok ? "retrieval.reset_entity" : "retrieval.reset_entity.failed",
      detail: `${ok ? chunks.length : 0}/${chunks.length} source chunks; runtime memory reset ${ok ? "confirmed" : "not confirmed"}` });
    return { ok };
  },
});

// ── Audit trail in natural language (Phase 3 add-on): one summary per unit of work, searchable through Moss. ──

export const indexTrace = internalAction({
  args: { entity: v.string(), traceId: v.string(), effectiveDate: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { entity, traceId, effectiveDate }): Promise<boolean> => {
    const text = await ctx.runQuery(internal.trace.summary, { entity, traceId });
    if (!text) return false;
    // A6 stores audit summaries separately from reviewed decision precedent.
    const { ok } = await ctx.runAction(internal.retrieval.index, { collection: "events", id: traceId, text, meta: { entity, effectiveDate, sourceType: "trace" }, traceId });
    await ctx.runMutation(internal.audit.write, { entity, actor: "workflow", action: ok ? "index_trace" : "index_trace.skipped", traceId });
    return ok;
  },
});
