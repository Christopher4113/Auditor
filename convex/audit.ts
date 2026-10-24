// Append-only audit log. Every tool and every rule writes a row through here (policy 9.0).
// Observability: each row carries a traceId, the correlation id of one unit of work (one bank transaction's
// journey). Callers pass it, or any id on the chain (decision, proposal, entry, break, bank transaction) and
// audit() resolves it, so the trace view is one indexed query across Convex, the agent, FastAPI and the human.
import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { vActor } from "./schema";

export type TraceRef = {
  traceId?: string;
  decisionId?: Id<"decisions">;
  proposalId?: Id<"proposals">;
  entryId?: Id<"journalEntries">;
  breakId?: Id<"breaks">;
  bankTransactionId?: Id<"bankTransactions">;
};

/** Walks decision -> proposal -> break -> bank transaction until a traceId is found. */
export async function traceFor(ctx: QueryCtx, ref: TraceRef): Promise<string | undefined> {
  if (ref.traceId) return ref.traceId;
  let proposalId = ref.proposalId;
  if (ref.decisionId) {
    const d = await ctx.db.get(ref.decisionId);
    if (d?.traceId) return d.traceId;
    proposalId ??= d?.proposalId;
  }
  if (ref.entryId) {
    const e = await ctx.db.get(ref.entryId);
    if (e?.traceId) return e.traceId;
    proposalId ??= e?.proposalId;
  }
  let breakId = ref.breakId;
  if (proposalId) {
    const p = await ctx.db.get(proposalId);
    if (p?.traceId) return p.traceId;
    breakId ??= p?.breakId;
  }
  let txnId = ref.bankTransactionId;
  if (breakId) {
    const b = await ctx.db.get(breakId);
    if (b?.traceId) return b.traceId;
    txnId ??= b?.bankTransactionId;
  }
  if (txnId) return (await ctx.db.get(txnId))?.traceId;
  return undefined;
}

export async function audit(
  ctx: MutationCtx,
  row: TraceRef & {
    entity: string;
    period?: string;
    actor: Infer<typeof vActor>;
    action: string;
    detail?: string;
  },
) {
  const traceId = await traceFor(ctx, row);
  await ctx.db.insert("auditLog", { ...row, traceId, at: Date.now() });
}

/** For actions, which have no ctx.db. */
export const write = internalMutation({
  args: {
    entity: v.string(),
    period: v.optional(v.string()),
    actor: vActor,
    action: v.string(),
    decisionId: v.optional(v.id("decisions")),
    proposalId: v.optional(v.id("proposals")),
    traceId: v.optional(v.string()),
    detail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, row) => {
    await audit(ctx, row);
    return null;
  },
});
