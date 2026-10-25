// Plain-English summary of one unit of work, for the Ask Auditor answer and for indexing into Moss so the
// audit trail is searchable in natural language (Phase 3 add-on). Built from the audit rows only, so it says
// nothing the log cannot back up.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";

const dollars = (c: number) => (Math.abs(c) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export async function summarizeTrace(ctx: QueryCtx, entity: string, traceId: string): Promise<string | null> {
  const events = await ctx.db.query("auditLog").withIndex("by_entity_traceId", (q) => q.eq("entity", entity).eq("traceId", traceId)).take(500);
  if (events.length === 0) return null;
  const lines: string[] = [];
  const txnId = traceId.startsWith("T-") && !traceId.startsWith("T-vendor-") ? traceId.slice(2) : null;
  const txn = txnId ? await ctx.db.query("bankTransactions").withIndex("by_entity_txnId", (q) => q.eq("entity", entity).eq("txnId", txnId)).unique() : null;
  if (txn) lines.push(`${traceId}: ${txn.date}, ${txn.counterparty}, ${txn.amount >= 0 ? "received" : "paid"} ${dollars(txn.amount)} (${txn.memo}).`);
  else lines.push(`${traceId}.`);

  const seenProposals = new Set<string>();
  for (const e of events) {
    if (e.proposalId && !seenProposals.has(e.proposalId)) {
      seenProposals.add(e.proposalId);
      const p = await ctx.db.get(e.proposalId);
      if (p) {
        const entry = p.lines.map((l) => `${l.debit ? "Dr" : "Cr"} ${l.account} ${dollars(l.debit || l.credit)}`).join(", ");
        const cites = p.citations.map((c) => c.sourceId).join(", ") || "no citations";
        lines.push(`The agent proposed ${p.proposalId} (revision ${p.revision}): ${entry}; citing ${cites}.${p.discardedFirstRead ? ` First read discarded: ${p.discardedFirstRead}.` : ""}`);
      }
    }
    if (e.action.startsWith("rule.") && !e.detail?.startsWith("pass")) lines.push(`Rule ${e.action.slice(5)} failed: ${e.detail ?? ""}.`);
    if (e.action === "review.pass") lines.push(`The controls engine passed every rule.`);
    if (e.action === "review.return") lines.push(`The controls engine returned it to the agent: ${e.detail ?? ""}.`);
    if (e.action === "escalate") lines.push(`Escalated to the controller${e.detail ? `: ${e.detail}` : ""}.`);
    if (e.action === "approve") lines.push(`The controller approved it${e.detail ? ` (precedent scope ${e.detail})` : ""}.`);
    if (e.action === "reject") lines.push(`The controller rejected it with the instruction: ${e.detail ?? ""}.`);
    if (e.action === "post_entry") lines.push(`Posted to the ledger by ${e.actor}.`);
    if (e.action === "post_entry.denied") lines.push(`A post was refused: ${e.detail ?? ""}.`);
    if (e.action === "index_decision") lines.push(`Decision ${e.detail ?? ""} indexed as precedent.`);
    if (e.action === "vendor.bank_change") lines.push(`Vendor bank details changed: ${e.detail ?? ""}.`);
    if (e.action === "verify_payee") lines.push(`Payee verification: ${e.detail ?? ""}.`);
    if (e.action === "vendor.hold.kept") lines.push(`The controller kept the payment hold: ${e.detail ?? ""}.`);
    if (e.action === "vendor.hold.released") lines.push(`The controller released the hold: ${e.detail ?? ""}.`);
    if (e.action === "contract.amend") lines.push(`Contract amended: ${e.detail ?? ""}.`);
  }
  return lines.join(" ");
}

export const summary = internalQuery({
  args: { entity: v.string(), traceId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { entity, traceId }) => summarizeTrace(ctx, entity, traceId),
});

/** Schedules one Moss "events" chunk per unit of work in the period. Called after every close and sign-off. */
export const indexPeriod = internalMutation({
  args: { entity: v.string(), period: v.string() },
  returns: v.number(),
  handler: async (ctx, { entity, period }) => {
    const rows = await ctx.db.query("auditLog").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).take(5000);
    const p = await ctx.db.query("periods").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).unique();
    const traces = [...new Set(rows.map((r) => r.traceId).filter((t): t is string => !!t))];
    for (const traceId of traces) await ctx.scheduler.runAfter(0, internal.retrieval.indexTrace, { entity, traceId, effectiveDate: p?.end ?? `${period}-28` });
    return traces.length;
  },
});
