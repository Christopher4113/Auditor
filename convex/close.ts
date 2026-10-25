// C2: the close as a durable Workflow, plus the data trigger. No run button in production: the Workflow is
// started by the scheduled advance (C4) and by data (a bank transaction arriving). api.startClose exists
// for the Phase 1 gate and the "prepare September close" button.
// fetch -> reconcile -> propose -> review -> post. Each step runs under its seat's identity.
import type { Id } from "./_generated/dataModel";
import { WorkflowManager, start, getStatus, vWorkflowId, vResultValidator, type WorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { audit } from "./audit";

export const workflow = new WorkflowManager(components.workflow);

export const closePeriod = workflow
  .define({
    args: { entity: v.string(), period: v.string() },
    returns: v.object({ breaks: v.number(), posted: v.number(), escalated: v.number() }),
  })
  .handler(async (step, { entity, period }): Promise<{ breaks: number; posted: number; escalated: number }> => {
    const bankTransactionIds = await step.runQuery(internal.close.fetchUnmatched, { entity, period });
    const reconciled = await step.runMutation(internal.agent.reconcile, { caller: "agent", entity, period, bankTransactionIds });
    // Breaks a human rejection reopened get a revision in the same run (C3 loop).
    const reopened = await step.runQuery(internal.close.fetchOpenBreaks, { entity, period });
    const breakIds = [...new Set([...reconciled, ...reopened])];
    // One break is one agent run (about 45 s). Breaks are independent, so they run side by side; the
    // ledger and the review are mutations and serialize on their own.
    const handle = async (breakId: Id<"breaks">): Promise<"posted" | "escalated" | "returned"> => {
      const proposalId = await step.runAction(internal.agent.propose, { caller: "agent", breakId });
      const decision = await step.runMutation(internal.controls.review, { caller: "controls", proposalId });
      if (decision.outcome === "posted") {
        const r = await step.runMutation(internal.ledger.postEntry, { caller: "controls", proposalId, decisionId: decision.decisionId });
        if (!r.ok) return "escalated";
        await step.runAction(internal.retrieval.indexDecision, { decisionId: decision.decisionId }, { retry: true }); // index_decision (C4)
        return "posted";
      }
      return decision.outcome === "escalated" ? "escalated" : "returned";
    };
    const first = await Promise.all(breakIds.map(handle));
    let posted = first.filter((o) => o === "posted").length;
    let escalated = first.filter((o) => o !== "posted").length;
    // Returned proposals (a rule failed, e.g. missing citation) get a revision in the same run; B4's
    // revision_cap rule escalates the third, so at most two extra passes.
    for (let pass = 0; pass < 2; pass++) {
      const returned = await step.runQuery(internal.close.fetchReturnedBreaks, { entity, period });
      if (returned.length === 0) break;
      const again = await Promise.all(returned.map(handle));
      const nowPosted = again.filter((o) => o === "posted").length;
      posted += nowPosted;
      escalated -= nowPosted;
    }
    return { breaks: breakIds.length, posted, escalated };
  });

/** Breaks whose latest proposal the engine returned (status failed_rule) and that are not yet resolved. */
export const fetchReturnedBreaks = internalQuery({
  args: { entity: v.string(), period: v.string() },
  returns: v.array(v.id("breaks")),
  handler: async (ctx, { entity, period }) => {
    const breaks = await ctx.db.query("breaks").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).take(500);
    const out = [];
    for (const b of breaks) {
      if (b.status === "resolved" || b.status === "escalated") continue;
      const latest = await ctx.db.query("proposals").withIndex("by_break", (q) => q.eq("breakId", b._id)).order("desc").first();
      if (latest?.status === "failed_rule") out.push(b._id);
    }
    return out;
  },
});

export const fetchUnmatched = internalQuery({
  args: { entity: v.string(), period: v.string() },
  returns: v.array(v.id("bankTransactions")),
  handler: async (ctx, { entity, period }) => {
    // ponytail: 500 cap; ~120 transactions a month, so one batch. Paginate if an entity ever exceeds it.
    const rows = await ctx.db
      .query("bankTransactions")
      .withIndex("by_entity_period_status", (q) => q.eq("entity", entity).eq("period", period).eq("status", "unmatched"))
      .take(500);
    return rows.map((r) => r._id);
  },
});

export const fetchOpenBreaks = internalQuery({
  args: { entity: v.string(), period: v.string() },
  returns: v.array(v.id("breaks")),
  handler: async (ctx, { entity, period }) => {
    const rows = await ctx.db.query("breaks").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).take(500);
    return rows.filter((b) => b.status === "open").map((b) => b._id);
  },
});

/** Starts a close for the period unless one is already running. Returns the workflow id or null. */
export async function ensureClose(ctx: MutationCtx, entity: string, period: string, actor: "human" | "inject" | "workflow"): Promise<string | null> {
  const p = await ctx.db
    .query("periods")
    .withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period))
    .unique();
  if (!p) throw new Error(`period ${period} not found for ${entity}`);
  if (p.status === "signed") return null;
  if (p.closeWorkflowId) {
    const s = await getStatus(ctx, components.workflow, p.closeWorkflowId as never);
    if (s.type === "inProgress") {
      // The running close already chose its lines. Remember to run again when it finishes (judges inject mid-close).
      if (!p.rerunRequested) await ctx.db.patch("periods", p._id, { rerunRequested: true });
      return p.closeWorkflowId;
    }
  }
  const workflowId: WorkflowId = await start(ctx, internal.close.closePeriod, { entity, period }, { onComplete: internal.close.onComplete, context: { entity, period } });
  await ctx.db.patch("periods", p._id, { status: "closing", closeWorkflowId: workflowId });
  await audit(ctx, { entity, period, actor, action: "close.start", detail: workflowId });
  return workflowId;
}

export const onComplete = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ entity: v.string(), period: v.string() }) },
  returns: v.null(),
  handler: async (ctx, { workflowId, result, context: { entity, period } }) => {
    const p = await ctx.db
      .query("periods")
      .withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period))
      .unique();
    if (p && p.status === "closing") await ctx.db.patch("periods", p._id, { status: "open" });
    await ctx.scheduler.runAfter(0, internal.trace.indexPeriod, { entity, period }); // audit trail into Moss "events" (Ask Auditor)
    if (p?.rerunRequested) {
      await ctx.db.patch("periods", p._id, { rerunRequested: false });
      await ctx.scheduler.runAfter(0, internal.close.rerun, { entity, period });
    }
    await audit(ctx, {
      entity,
      period,
      actor: "workflow",
      action: `close.${result.kind}`,
      detail: result.kind === "success" ? JSON.stringify(result.returnValue) : result.kind === "failed" ? result.error : workflowId,
    });
    return null;
  },
});

/** Data trigger: a new bank transaction (inject, or a real feed later) is picked up within seconds. */
export const ingestBankTransaction = internalMutation({
  args: {
    entity: v.string(),
    period: v.string(),
    txnId: v.string(),
    date: v.string(),
    amount: v.number(),
    counterparty: v.string(),
    memo: v.string(),
    source: v.union(v.literal("bank"), v.literal("stripe")),
    reference: v.optional(v.string()),
    vendorId: v.optional(v.string()),
    actor: v.union(v.literal("inject"), v.literal("workflow")),
  },
  returns: v.id("bankTransactions"),
  handler: async (ctx, { actor, ...txn }) => {
    const traceId = `T-${txn.txnId}`;
    const id = await ctx.db.insert("bankTransactions", { ...txn, status: "unmatched", traceId });
    await audit(ctx, { entity: txn.entity, period: txn.period, actor, action: "bank.ingest", bankTransactionId: id, traceId, detail: `${txn.txnId} ${txn.amount}` });
    await ensureClose(ctx, txn.entity, txn.period, actor);
    return id;
  },
});

/** A close finished while new work was waiting: start the next one (scheduled from onComplete). */
export const rerun = internalMutation({
  args: { entity: v.string(), period: v.string() },
  returns: v.null(),
  handler: async (ctx, { entity, period }) => {
    await ensureClose(ctx, entity, period, "workflow");
    return null;
  },
});
