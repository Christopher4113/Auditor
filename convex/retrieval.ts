// C4: the actions that call Group A's FastAPI sidecar (interface 1: retrieval/openapi.yaml).
// Moss: POST /index, POST /query, GET /stats. CRS: POST /verify. RETRIEVAL_URL unset = query returns
// nothing, index is skipped, verify fails closed. Nothing here ever throws into the Workflow.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalQuery } from "./_generated/server";

const vHit = v.object({ id: v.string(), text: v.string(), score: v.number() });
const vVerify = v.object({ identityMatch: v.boolean(), fraudFlags: v.array(v.string()), available: v.boolean() });
type Hit = { id: string; text: string; score: number };

const endpoint = (path: string) => (env.RETRIEVAL_URL ? `${env.RETRIEVAL_URL.replace(/\/$/, "")}${path}` : null);

async function post<T>(path: string, body: unknown): Promise<T | null> {
  const url = endpoint(path);
  if (!url) return null;
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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
  args: { collection: v.string(), text: v.string(), k: v.optional(v.number()) },
  returns: v.array(vHit),
  handler: async (_ctx, { collection, text, k }): Promise<Hit[]> => (await post<Hit[]>("/query", { collection, text, k: k ?? 5 })) ?? [],
});

export const index = internalAction({
  args: { collection: v.string(), id: v.string(), text: v.string(), meta: v.optional(v.record(v.string(), v.string())) },
  returns: v.object({ ok: v.boolean() }),
  handler: async (_ctx, chunk): Promise<{ ok: boolean }> => ({ ok: (await post<{ ok: boolean }>("/index", { ...chunk, meta: chunk.meta ?? {} }))?.ok === true }),
});

/** verify_payee (controls engine only). Fails closed: no sidecar, no identity, any error -> available=false. */
export const verify = internalAction({
  args: { testIdentityId: v.optional(v.string()) },
  returns: vVerify,
  handler: async (_ctx, { testIdentityId }) => {
    const closed = { identityMatch: false, fraudFlags: [] as string[], available: false };
    if (!testIdentityId) return closed;
    return (await post<typeof closed>("/verify", { testIdentityId })) ?? closed;
  },
});

export const stats = internalAction({
  args: {},
  returns: v.union(v.null(), v.object({ retrievals: v.number(), medianLatencyMs: v.number(), tokensUsed: v.number(), tokensFullContext: v.number() })),
  handler: async () => {
    const url = endpoint("/stats");
    if (!url) return null;
    try {
      const res = await fetch(url);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  },
});

// ── index_decision: every posted or human-decided decision becomes retrievable precedent ──────────

export const loadDecision = internalQuery({
  args: { decisionId: v.id("decisions") },
  returns: v.union(v.null(), v.object({ entity: v.string(), period: v.string(), id: v.string(), text: v.string(), meta: v.record(v.string(), v.string()) })),
  handler: async (ctx, { decisionId }) => {
    const d = await ctx.db.get(decisionId);
    if (!d) return null;
    const p = await ctx.db.get(d.proposalId);
    const brk = p ? await ctx.db.get(p.breakId) : null;
    const lines = (p?.lines ?? []).map((l) => `${l.debit ? "Dr" : "Cr"} ${l.account} ${l.debit || l.credit}`).join("; ");
    const scope = d.precedentScope ? ` Scope: ${d.precedentScope.breakKind}${d.precedentScope.counterparty ? " / " + d.precedentScope.counterparty : ""}.` : "";
    return {
      entity: d.entity,
      period: d.period,
      id: d.decisionId,
      text: `${d.decisionId} (${d.period}, ${brk?.kind ?? "break"}): ${d.outcome} by ${d.reviewer}. ${d.reason} Entry: ${lines}.${scope}`,
      meta: { entity: d.entity, period: d.period, reviewer: d.reviewer, outcome: d.outcome, breakKind: brk?.kind ?? "" },
    };
  },
});

export const indexDecision = internalAction({
  args: { decisionId: v.id("decisions") },
  returns: v.null(),
  handler: async (ctx, { decisionId }): Promise<null> => {
    const chunk = await ctx.runQuery(internal.retrieval.loadDecision, { decisionId });
    if (!chunk) return null;
    const { ok } = await ctx.runAction(internal.retrieval.index, { collection: "decisions", id: chunk.id, text: chunk.text, meta: chunk.meta });
    await ctx.runMutation(internal.audit.write, { entity: chunk.entity, period: chunk.period, actor: "controls", action: ok ? "index_decision" : "index_decision.skipped", decisionId, detail: chunk.id });
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
    const { ok } = await ctx.runAction(internal.retrieval.index, { collection: "corrections", id: c.id, text: c.text, meta: { entity: c.entity, period: c.period } });
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
      ...(pack?.clauses ?? []).map((c) => ({ collection: "policy", id: c.id, text: c.text, meta: { entity, number: c.number ?? "" } })),
      ...contracts.flatMap((k) => k.clauses.map((c) => ({ collection: "contracts", id: c.id, text: c.text, meta: { entity, contractId: k.contractId, counterparty: k.counterparty } }))),
    ];
  },
});

export const indexEntity = internalAction({
  args: { entity: v.string() },
  returns: v.null(),
  handler: async (ctx, { entity }): Promise<null> => {
    const chunks = await ctx.runQuery(internal.retrieval.loadClauses, { entity });
    let ok = 0;
    for (const c of chunks) if ((await ctx.runAction(internal.retrieval.index, c)).ok) ok++;
    await ctx.runMutation(internal.audit.write, { entity, actor: "seed", action: env.RETRIEVAL_URL ? "retrieval.index_entity" : "retrieval.skipped", detail: `${ok}/${chunks.length} chunks` });
    return null;
  },
});
