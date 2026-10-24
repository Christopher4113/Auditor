// Interfaces 3 + 4 (C -> D): everything the UI calls. All take `entity`; `period` is "YYYY-MM".
// Return validators are the fixture shapes D builds against.
// Phase 1 (here): listPeriods, listProposals, getBreak, getDecision, auditTrail, scoreboard, startClose, closeStatus.
// Phase 2 (C3, here): approve(proposalId, note, precedentScope?) writes precedentScope; reject(proposalId, instruction); signPeriod(period); closeSummary.
// Phase 3 (C5/C6): injectBankTransaction, amendContract, changeVendorBank, resetAll, attemptAgentPost.
// decisions.citations[]: { sourceType, sourceId, text, score } -- text is verbatim, never paraphrased.
import { getStatus } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { ensureClose } from "./close";
import { approve as approveProposal, reject as rejectProposal, signPeriod as signPeriodFn } from "./human";
import { trialBalance } from "./ledger";
import schema, { vPrecedentScope, vRuleResult } from "./schema";

const orNull = <T extends Parameters<typeof v.union>[0]>(t: T) => v.union(t, v.null());

/** Periods for the header: status is open | closing | signed. */
export const listPeriods = query({
  args: { entity: v.string() },
  returns: v.array(schema.doc("periods")),
  handler: async (ctx, { entity }) =>
    ctx.db.query("periods").withIndex("by_entity_period", (q) => q.eq("entity", entity)).take(24),
});

/** The left rail: every proposal (one period, or all when period is omitted), newest first, with its break,
 *  bank transaction and latest decision so the rail and the right panel render from one subscription. */
export const listProposals = query({
  args: { entity: v.string(), period: v.optional(v.string()) },
  returns: v.array(
    schema.doc("proposals").extend({
      break: orNull(v.object({ breakId: v.string(), kind: v.string(), description: v.string(), status: v.string() })),
      amount: orNull(v.number()),
      counterparty: orNull(v.string()),
      date: orNull(v.string()),
      reference: orNull(v.string()),
      decision: orNull(v.object({ decisionId: v.string(), outcome: v.string(), reason: v.string(), rulesRun: v.array(vRuleResult) })),
    }),
  ),
  handler: async (ctx, { entity, period }) => {
    const proposals = await ctx.db
      .query("proposals")
      .withIndex("by_entity_period", (q) => (period ? q.eq("entity", entity).eq("period", period) : q.eq("entity", entity)))
      .order("desc")
      .take(200);
    return Promise.all(
      proposals.map(async (p) => {
        const brk = await ctx.db.get(p.breakId);
        const txn = brk ? await ctx.db.get(brk.bankTransactionId) : null;
        const d = await ctx.db.query("decisions").withIndex("by_proposal", (q) => q.eq("proposalId", p._id)).order("desc").first();
        return {
          ...p,
          break: brk ? { breakId: brk.breakId, kind: brk.kind, description: brk.description, status: brk.status } : null,
          amount: txn?.amount ?? null,
          counterparty: txn?.counterparty ?? null,
          date: txn?.date ?? null,
          reference: txn?.reference ?? null,
          decision: d ? { decisionId: d.decisionId, outcome: d.outcome, reason: d.reason, rulesRun: d.rulesRun } : null,
        };
      }),
    );
  },
});

/** Center panel: the break's sources (bank, vendor, contract) and every proposal revision. */
export const getBreak = query({
  args: { id: v.id("breaks") },
  returns: orNull(
    v.object({
      break: schema.doc("breaks"),
      bank: orNull(schema.doc("bankTransactions")),
      vendor: orNull(schema.doc("vendors")),
      contract: orNull(schema.doc("contracts")),
      proposals: v.array(schema.doc("proposals")),
    }),
  ),
  handler: async (ctx, { id }) => {
    const brk = await ctx.db.get(id);
    if (!brk) return null;
    const bank = await ctx.db.get(brk.bankTransactionId);
    const vendors = bank ? await ctx.db.query("vendors").withIndex("by_entity_vendorId", (q) => q.eq("entity", brk.entity)).take(100) : [];
    const vendor = vendors.find((vd) => (bank?.vendorId ? vd.vendorId === bank.vendorId : vd.name === bank?.counterparty)) ?? null;
    const contractId = vendor?.contractId;
    const contract = contractId
      ? await ctx.db.query("contracts").withIndex("by_entity_contractId", (q) => q.eq("entity", brk.entity).eq("contractId", contractId)).unique()
      : null;
    const proposals = await ctx.db.query("proposals").withIndex("by_break", (q) => q.eq("breakId", id)).take(10);
    return { break: brk, bank, vendor, contract, proposals };
  },
});

/** Right panel: the decision on a proposal (controls engine or human) and the audit rows it produced. */
export const getDecision = query({
  args: { proposalId: v.id("proposals") },
  returns: v.object({
    decision: orNull(schema.doc("decisions")),
    entry: orNull(schema.doc("journalEntries")),
    audit: v.array(schema.doc("auditLog")),
  }),
  handler: async (ctx, { proposalId }) => {
    const decision = await ctx.db.query("decisions").withIndex("by_proposal", (q) => q.eq("proposalId", proposalId)).order("desc").first();
    const audit = await ctx.db.query("auditLog").withIndex("by_proposal", (q) => q.eq("proposalId", proposalId)).take(100);
    const entry = decision?.entryId ? await ctx.db.get(decision.entryId) : null;
    return { decision, entry, audit };
  },
});

/** Audit trail drawer / status bar feed. Newest first. */
export const auditTrail = query({
  args: { entity: v.string(), period: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.array(schema.doc("auditLog")),
  handler: async (ctx, { entity, period, limit }) =>
    ctx.db
      .query("auditLog")
      .withIndex("by_entity_period", (q) => (period ? q.eq("entity", entity).eq("period", period) : q.eq("entity", entity)))
      .order("desc")
      .take(limit ?? 100),
});

/** Status bar + Scoreboard drawer. A5 adds precision/recall against the answer key and the Impact panel. */
export const scoreboard = query({
  args: { entity: v.string(), period: v.string() },
  returns: v.object({
    transactions: v.number(),
    closedByCode: v.number(),
    proposals: v.number(),
    posted: v.number(),
    escalated: v.number(),
    underReview: v.number(),
    plantedBreaks: v.number(),
    caught: v.number(),
    correct: v.number(),
  }),
  handler: async (ctx, { entity, period }) => {
    // ponytail: bounded scans, tables are a few hundred rows; aggregate component if that changes
    const proposals = await ctx.db.query("proposals").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).take(500);
    const txns = await ctx.db.query("bankTransactions").withIndex("by_entity_period_status", (q) => q.eq("entity", entity).eq("period", period)).take(1000);
    const key = await ctx.db.query("answerKey").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).take(20);
    const by = (s: string) => proposals.filter((p) => p.status === s).length;
    return {
      transactions: txns.length,
      closedByCode: txns.filter((t) => t.status === "matched" && !t.matchedEntryId).length,
      proposals: proposals.length,
      posted: by("posted"),
      escalated: by("escalated"),
      underReview: by("under_review"),
      plantedBreaks: key.length,
      caught: key.filter((k) => k.result?.caught).length,
      correct: key.filter((k) => k.result?.correct).length,
    };
  },
});

/** "Prepare <period> close" in the Scoreboard drawer. Idempotent while a close is running. */
export const startClose = mutation({
  args: { entity: v.string(), period: v.string() },
  returns: orNull(v.string()),
  handler: async (ctx, { entity, period }): Promise<string | null> => ensureClose(ctx, entity, period, "human"),
});

/** Live indicator: the running close's status, or null when none has run. */
export const closeStatus = query({
  args: { entity: v.string(), period: v.string() },
  returns: orNull(v.object({ type: v.string(), running: v.optional(v.number()), error: v.optional(v.string()) })),
  handler: async (ctx, { entity, period }) => {
    const p = await ctx.db.query("periods").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).unique();
    if (!p?.closeWorkflowId) return null;
    const s = await getStatus(ctx, components.workflow, p.closeWorkflowId as never);
    return { type: s.type, running: s.type === "inProgress" ? s.running.length : undefined, error: s.type === "failed" ? s.error : undefined };
  },
});

// ── Human controller (C3). proposalId is the external code shown in the rail, e.g. "P-sample-bank-04-r1". ──

/** Approve an escalated proposal: posts it under the human identity and records precedentScope (8.2). */
export const approve = mutation({
  args: { entity: v.string(), proposalId: v.string(), note: v.optional(v.string()), precedentScope: v.optional(vPrecedentScope) },
  returns: v.object({ decisionId: v.id("decisions"), entryId: v.id("journalEntries") }),
  handler: async (ctx, { entity, proposalId, note, precedentScope }): Promise<{ decisionId: Id<"decisions">; entryId: Id<"journalEntries"> }> =>
    approveProposal(ctx, entity, proposalId, note, precedentScope),
});

/** Reject with an instruction: stored as a correction, the break reopens and the Workflow proposes a revision. */
export const reject = mutation({
  args: { entity: v.string(), proposalId: v.string(), instruction: v.string() },
  returns: v.object({ decisionId: v.id("decisions"), correctionId: v.id("corrections") }),
  handler: async (ctx, { entity, proposalId, instruction }) => rejectProposal(ctx, entity, proposalId, instruction),
});

/** Sign the period: snapshots the close summary, locks it (3.0), schedules the next period's advance (C4). */
export const signPeriod = mutation({
  args: { entity: v.string(), period: v.string() },
  returns: v.object({ entriesPosted: v.number(), openItemsCarried: v.number(), debits: v.number(), credits: v.number() }),
  handler: async (ctx, { entity, period }) => signPeriodFn(ctx, entity, period),
});

/** Close summary drawer: what the controller signs. Live until signed; the stored snapshot after. */
export const closeSummary = query({
  args: { entity: v.string(), period: v.string() },
  returns: v.object({
    status: v.string(),
    signedAt: orNull(v.number()),
    prepared: orNull(v.object({ at: v.number(), unmatched: v.number(), openBreaks: v.number() })),
    entriesPosted: v.number(),
    openItems: v.number(),
    awaitingController: v.number(),
    trialBalance: v.array(v.object({ code: v.string(), name: v.string(), debit: v.number(), credit: v.number(), balance: v.number() })),
    debits: v.number(),
    credits: v.number(),
  }),
  handler: async (ctx, { entity, period }) => {
    const p = await ctx.db.query("periods").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).unique();
    const proposals = await ctx.db.query("proposals").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).take(500);
    const entries = await ctx.db.query("journalEntries").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).take(500);
    const tb = await trialBalance(ctx, entity, period);
    return {
      status: p?.status ?? "missing",
      signedAt: p?.signedAt ?? null,
      prepared: p?.prepared ?? null,
      entriesPosted: entries.length,
      openItems: proposals.filter((x) => x.status !== "posted" && x.status !== "approved" && x.status !== "rejected").length,
      awaitingController: proposals.filter((x) => x.status === "escalated" || x.status === "failed_rule").length,
      trialBalance: tb.rows,
      debits: tb.debits,
      credits: tb.credits,
    };
  },
});
