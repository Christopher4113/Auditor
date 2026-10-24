// The one door into journalEntries. The controls engine calls it when every rule passes; the human's
// approve calls it after approving. Policy 8.1: it refuses the proposer's identity regardless of who
// calls it, server-side, and logs the denial. It never throws on a denial so the audit row commits.
import { v } from "convex/values";
import { internalMutation, type QueryCtx } from "./_generated/server";
import { audit } from "./audit";
import { vIdentity } from "./schema";

export const postEntry = internalMutation({
  args: { caller: vIdentity, proposalId: v.id("proposals"), decisionId: v.id("decisions") },
  returns: v.union(
    v.object({ ok: v.literal(true), entryId: v.id("journalEntries") }),
    v.object({ ok: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, { caller, proposalId, decisionId }) => {
    const proposal = await ctx.db.get(proposalId);
    const decision = await ctx.db.get(decisionId);
    if (!proposal || !decision || decision.proposalId !== proposalId) throw new Error("proposal/decision mismatch");
    const { entity, period } = proposal;

    const deny = async (reason: string) => {
      await audit(ctx, { entity, period, actor: caller, action: "post_entry.denied", proposalId, decisionId, detail: reason });
      return { ok: false as const, reason };
    };

    if (caller === "agent" || caller === proposal.proposedBy) return deny(`8.1: ${caller} proposed this entry and may not post it`);
    if (decision.reviewer === caller && decision.outcome !== "posted" && decision.outcome !== "approved")
      return deny(`decision ${decision.decisionId} outcome is ${decision.outcome}`);

    const debits = proposal.lines.reduce((s, l) => s + l.debit, 0);
    const credits = proposal.lines.reduce((s, l) => s + l.credit, 0);
    if (debits !== credits) return deny(`unbalanced: debits ${debits} != credits ${credits}`);

    const periodDoc = await ctx.db
      .query("periods")
      .withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period))
      .unique();
    if (periodDoc?.status === "signed") return deny(`3.0: period ${period} is signed and locked`);

    const brk = await ctx.db.get(proposal.breakId);
    const txn = brk ? await ctx.db.get(brk.bankTransactionId) : null;
    const entryId = await ctx.db.insert("journalEntries", {
      entity,
      period,
      entryId: `JE-${proposal.proposalId}`,
      date: txn?.date ?? periodDoc?.end ?? period + "-01",
      lines: proposal.lines,
      memo: proposal.reason,
      source: "post_entry",
      postedBy: caller,
      proposalId,
    });
    await ctx.db.patch("proposals", proposalId, { status: "posted" });
    await ctx.db.patch("decisions", decisionId, { entryId });
    if (brk) await ctx.db.patch("breaks", brk._id, { status: "resolved" });
    if (txn) await ctx.db.patch("bankTransactions", txn._id, { status: "matched", matchedEntryId: entryId });
    await audit(ctx, { entity, period, actor: caller, action: "post_entry", proposalId, decisionId, entryId });
    return { ok: true as const, entryId };
  },
});

/** Trial balance through a period: per-account debit and credit totals from every posted entry. */
export async function trialBalance(ctx: QueryCtx, entity: string, throughPeriod: string) {
  // ponytail: full scan of the entity's entries (a few hundred rows); aggregate component if it grows
  const entries = await ctx.db.query("journalEntries").withIndex("by_entity_period", (q) => q.eq("entity", entity)).take(5000);
  const accounts = await ctx.db.query("accounts").withIndex("by_entity_code", (q) => q.eq("entity", entity)).take(100);
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const e of entries) {
    if (e.period > throughPeriod) continue;
    for (const l of e.lines) {
      const t = totals.get(l.account) ?? { debit: 0, credit: 0 };
      t.debit += l.debit;
      t.credit += l.credit;
      totals.set(l.account, t);
    }
  }
  const rows = [...totals.entries()]
    .map(([code, t]) => ({ code, name: accounts.find((a) => a.code === code)?.name ?? code, debit: t.debit, credit: t.credit, balance: t.debit - t.credit }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return { rows, debits: rows.reduce((s, r) => s + r.debit, 0), credits: rows.reduce((s, r) => s + r.credit, 0) };
}
