// C3: the human controller's three moves. Public wrappers live in api.ts; the logic is here so it runs
// under the human identity and nowhere else. approve posts through ledger.postEntry (which still refuses
// the proposer), writes precedentScope so rule 8.2 can honor it next time, and indexes the decision.
// reject records the instruction as a correction, reopens the break, and the Workflow re-proposes.
// signPeriod snapshots the close summary, locks the period (3.0) and schedules the next advance (C4).
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { audit, traceFor } from "./audit";
import { ensureClose } from "./close";
import { trialBalance } from "./ledger";
import type { vPrecedentScope } from "./schema";

async function findProposal(ctx: MutationCtx, entity: string, proposalId: string): Promise<Doc<"proposals">> {
  const p = await ctx.db.query("proposals").withIndex("by_entity_proposalId", (q) => q.eq("entity", entity).eq("proposalId", proposalId)).unique();
  if (!p) throw new Error(`proposal ${proposalId} not found`);
  return p;
}

async function assertOpen(ctx: MutationCtx, entity: string, period: string) {
  const p = await ctx.db.query("periods").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).unique();
  if (p?.status === "signed") throw new Error(`3.0: period ${period} is signed and locked`);
}

export async function approve(
  ctx: MutationCtx,
  entity: string,
  proposalId: string,
  note?: string,
  scope?: Infer<typeof vPrecedentScope>,
): Promise<{ decisionId: Id<"decisions">; entryId: Id<"journalEntries"> }> {
  const p = await findProposal(ctx, entity, proposalId);
  if (p.status !== "escalated" && p.status !== "failed_rule") throw new Error(`${proposalId} is ${p.status}, not awaiting the controller`);
  await assertOpen(ctx, entity, p.period);
  const brk = await ctx.db.get(p.breakId);
  const txn = brk ? await ctx.db.get(brk.bankTransactionId) : null;
  const precedentScope = scope ?? { breakKind: brk?.kind ?? "unmatched", counterparty: txn?.counterparty };
  const traceId = await traceFor(ctx, { proposalId: p._id });
  const decisionId = await ctx.db.insert("decisions", {
    traceId,
    entity,
    period: p.period,
    decisionId: `D-${p.proposalId}-h`,
    proposalId: p._id,
    reviewer: "human",
    outcome: "approved",
    reason: note?.trim() || "Approved by the controller",
    rulesRun: [],
    citations: p.citations,
    precedentScope,
  });
  await ctx.db.patch("proposals", p._id, { status: "approved" });
  await audit(ctx, { entity, period: p.period, actor: "human", action: "approve", proposalId: p._id, decisionId, detail: `${precedentScope.breakKind}${precedentScope.counterparty ? " / " + precedentScope.counterparty : ""}` });
  const r: { ok: true; entryId: Id<"journalEntries"> } | { ok: false; reason: string } = await ctx.runMutation(internal.ledger.postEntry, { caller: "human", proposalId: p._id, decisionId });
  if (!r.ok) throw new Error(r.reason);
  await ctx.scheduler.runAfter(0, internal.retrieval.indexDecision, { decisionId });
  return { decisionId, entryId: r.entryId };
}

export async function reject(ctx: MutationCtx, entity: string, proposalId: string, instruction: string) {
  if (!instruction.trim()) throw new Error("a rejection carries an instruction");
  const p = await findProposal(ctx, entity, proposalId);
  if (p.status !== "escalated" && p.status !== "failed_rule") throw new Error(`${proposalId} is ${p.status}, not awaiting the controller`);
  await assertOpen(ctx, entity, p.period);
  const brk = await ctx.db.get(p.breakId);
  const txn = brk ? await ctx.db.get(brk.bankTransactionId) : null;
  const traceId = await traceFor(ctx, { proposalId: p._id });
  const decisionId = await ctx.db.insert("decisions", {
    traceId,
    entity,
    period: p.period,
    decisionId: `D-${p.proposalId}-h`,
    proposalId: p._id,
    reviewer: "human",
    outcome: "rejected",
    reason: instruction,
    instruction,
    rulesRun: [],
    citations: p.citations,
  });
  const correctionId = await ctx.db.insert("corrections", {
    traceId,
    entity,
    period: p.period,
    correctionId: `C-${p.proposalId}`,
    kind: "human_rejection",
    scope: `${brk?.kind ?? "unmatched"}${txn ? " / " + txn.counterparty : ""}`,
    instruction,
    proposalId: p._id,
    decisionId,
    appliedBy: [],
  });
  await ctx.db.patch("proposals", p._id, { status: "rejected" });
  if (brk) await ctx.db.patch("breaks", brk._id, { status: "open" }); // the Workflow proposes a revision
  await audit(ctx, { entity, period: p.period, actor: "human", action: "reject", proposalId: p._id, decisionId, detail: instruction });
  await ctx.scheduler.runAfter(0, internal.retrieval.indexCorrection, { correctionId });
  await ensureClose(ctx, entity, p.period, "human");
  return { decisionId, correctionId };
}

export async function signPeriod(ctx: MutationCtx, entity: string, period: string) {
  const p = await ctx.db.query("periods").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).unique();
  if (!p) throw new Error(`period ${period} not found`);
  if (p.status === "signed") throw new Error(`${period} is already signed`);
  if (p.status === "closing") throw new Error(`${period} close is still running`);
  const proposals = await ctx.db.query("proposals").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).take(500);
  const entries = await ctx.db.query("journalEntries").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).take(500);
  const openItemsCarried = proposals.filter((x) => x.status === "escalated" || x.status === "under_review" || x.status === "failed_rule").length;
  const tb = await trialBalance(ctx, entity, period);
  const closeSummary = { entriesPosted: entries.length, openItemsCarried, debits: tb.debits, credits: tb.credits };
  await ctx.db.patch("periods", p._id, { status: "signed", signedAt: Date.now(), closeSummary });
  await audit(ctx, { entity, period, actor: "human", action: "sign_period", detail: JSON.stringify(closeSummary) });

  // C4 time trigger: prepare the next period's close at its end date (now, if that has passed).
  const periods = await ctx.db.query("periods").withIndex("by_entity_period", (q) => q.eq("entity", entity)).take(24);
  const next = periods.filter((x) => x.period > period).sort((a, b) => a.period.localeCompare(b.period))[0];
  if (next) await ctx.scheduler.runAt(Math.max(Date.now(), new Date(`${next.end}T23:59:59Z`).getTime()), internal.advance.prepare, { entity, period: next.period });
  return closeSummary;
}
