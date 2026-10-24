// C2: the close as a durable Workflow, plus the data trigger. No run button in production: the Workflow is
// started by the scheduled advance (C4) and by data (a bank transaction arriving). api.startClose exists
// for the Phase 1 gate and the "prepare September close" button.
// fetch -> reconcile -> propose -> review -> post. Each step runs under its seat's identity.
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
    let posted = 0;
    let escalated = 0;
    for (const breakId of breakIds) {
      const proposalId = await step.runMutation(internal.agent.propose, { caller: "agent", breakId });
      const decision = await step.runMutation(internal.controls.review, { caller: "controls", proposalId });
      if (decision.outcome === "posted") {
        const r = await step.runMutation(internal.ledger.postEntry, { caller: "controls", proposalId, decisionId: decision.decisionId });
        if (r.ok) {
          posted++;
          await step.runAction(internal.retrieval.indexDecision, { decisionId: decision.decisionId }, { retry: true }); // index_decision (C4)
        } else escalated++;
      } else {
        escalated++;
      }
    }
    return { breaks: breakIds.length, posted, escalated };
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
    if (s.type === "inProgress") return p.closeWorkflowId;
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
    actor: v.union(v.literal("inject"), v.literal("workflow")),
  },
  returns: v.id("bankTransactions"),
  handler: async (ctx, { actor, ...txn }) => {
    const id = await ctx.db.insert("bankTransactions", { ...txn, status: "unmatched" });
    await audit(ctx, { entity: txn.entity, period: txn.period, actor, action: "bank.ingest", detail: `${txn.txnId} ${txn.amount}` });
    await ensureClose(ctx, txn.entity, txn.period, actor);
    return id;
  },
});
