// Lane B: the staff accountant. These are Phase 1 stubs so the Workflow runs end to end (C2 gate).
// B2 replaces the bodies with the canned Apex proposal; B3 replaces them with the code matcher and the
// Sonnet agent (Agent component). The signatures are interface 2: keep them, the Workflow calls them.
// Both run under the agent identity, which can write only breaks and proposals.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { audit } from "./audit";
import { vIdentity } from "./schema";
import { cannedApexProposal } from "./agent/fake";

/** Code matcher + flag_break. Returns the breaks the agent must now investigate. */
export const reconcile = internalMutation({
  args: {
    caller: vIdentity,
    entity: v.string(),
    period: v.string(),
    bankTransactionIds: v.array(v.id("bankTransactions")),
  },
  returns: v.array(v.id("breaks")),
  handler: async (ctx, { caller, entity, period, bankTransactionIds }) => {
    const breakIds = [];
    for (const id of bankTransactionIds) {
      const txn = await ctx.db.get(id);
      if (!txn || txn.status !== "unmatched") continue;
      // ponytail: no code matcher yet, every unmatched transaction becomes a break; B3 adds the matcher
      const breakId = await ctx.db.insert("breaks", {
        entity,
        period,
        breakId: `B-${txn.txnId}`,
        bankTransactionId: id,
        kind: "unmatched",
        description: `${txn.counterparty}: ${txn.memo}`,
        status: "open",
        planted: txn.plantedBreak,
      });
      await ctx.db.patch("bankTransactions", id, { status: "flagged" });
      await audit(ctx, { entity, period, actor: caller, action: "flag_break", detail: `B-${txn.txnId} ${txn.amount}` });
      breakIds.push(breakId);
    }
    return breakIds;
  },
});

/** propose_entry(lines, reason, citations). The Apex refund gets B2's canned proposal with its three verbatim
 *  citations (the moment); everything else: cash in parks in 1400, cash out expenses to 5100. */
export const propose = internalMutation({
  args: { caller: vIdentity, breakId: v.id("breaks") },
  returns: v.id("proposals"),
  handler: async (ctx, { caller, breakId }) => {
    const brk = await ctx.db.get(breakId);
    if (!brk) throw new Error("break not found");
    const txn = await ctx.db.get(brk.bankTransactionId);
    if (!txn) throw new Error("bank transaction not found");
    const amt = Math.abs(txn.amount);
    const canned = txn.vendorId === "apex" && txn.amount === 1360000 ? cannedApexProposal(brk.entity) : null;
    const lines = canned
      ? canned.lines.map((l) => ({ account: l.account, debit: l.debitCents, credit: l.creditCents, memo: l.memo }))
      : txn.amount >= 0
        ? [
            { account: "1000", debit: amt, credit: 0 },
            { account: "1400", debit: 0, credit: amt },
          ]
        : [
            { account: "5100", debit: amt, credit: 0 },
            { account: "1000", debit: 0, credit: amt },
          ];
    const proposalId = await ctx.db.insert("proposals", {
      entity: brk.entity,
      period: brk.period,
      proposalId: `P-${txn.txnId}-r1`,
      breakId,
      lines,
      reason: canned?.reason ?? `Stub proposal for ${txn.counterparty} ${txn.memo} (B3 replaces)`,
      // ponytail: fixed scores until A4 returns real ones from Moss
      citations: canned?.citations.map((c) => ({ ...c, sourceType: c.sourceType as "policy" | "contract" | "decision" | "correction", score: 0.9 })) ?? [],
      status: "under_review",
      revision: 1,
      discardedFirstRead: canned?.firstRead,
      correctionsApplied: canned?.correctionsApplied ?? [],
      proposedBy: caller,
    });
    await ctx.db.patch("breaks", breakId, { status: "proposed" });
    await audit(ctx, { entity: brk.entity, period: brk.period, actor: caller, action: "propose_entry", proposalId });
    return proposalId;
  },
});
