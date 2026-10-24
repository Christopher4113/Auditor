// Lane B: the controls engine. TypeScript rules, no model. Phase 1 stub runs two of the nine rules
// (balance, threshold) so the Workflow has real outcomes to route; B4 adds citation, bank-detail change
// (4.3 + verify_payee), period lock, revision cap, precedent exception, correction check.
// Signature is interface 2: keep it. Runs under the controls identity; posting happens in ledger.postEntry.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { audit } from "./audit";
import { vIdentity, vOutcome, type vRuleResult } from "./schema";
import type { Infer } from "convex/values";

export const review = internalMutation({
  args: { caller: vIdentity, proposalId: v.id("proposals") },
  returns: v.object({ decisionId: v.id("decisions"), outcome: vOutcome }),
  handler: async (ctx, { caller, proposalId }) => {
    const started = Date.now();
    const p = await ctx.db.get(proposalId);
    if (!p) throw new Error("proposal not found");
    const pack = await ctx.db
      .query("policyPacks")
      .withIndex("by_entity", (q) => q.eq("entity", p.entity))
      .unique();
    const threshold = pack?.thresholdCents ?? 500_000;

    const debits = p.lines.reduce((s, l) => s + l.debit, 0);
    const credits = p.lines.reduce((s, l) => s + l.credit, 0);
    // Materiality is P&L impact: the sum of revenue (4xxx) and expense (5xxx) lines (policy 8.0).
    const pl = p.lines.filter((l) => /^[45]/.test(l.account)).reduce((s, l) => s + Math.abs(l.debit - l.credit), 0);

    const rulesRun: Infer<typeof vRuleResult>[] = [
      { rule: "balance", kind: "preventive", passed: debits === credits, detail: `${debits} / ${credits}` },
      { rule: "threshold", kind: "preventive", passed: pl < threshold, detail: `P&L impact ${pl} vs ${threshold}` },
    ];
    for (const r of rulesRun)
      await audit(ctx, { entity: p.entity, period: p.period, actor: caller, action: `rule.${r.rule}`, proposalId, detail: `${r.passed ? "pass" : "FAIL"} ${r.detail ?? ""}` });

    const outcome: Infer<typeof vOutcome> = rulesRun.every((r) => r.passed) ? "posted" : "escalated";
    const decisionId = await ctx.db.insert("decisions", {
      entity: p.entity,
      period: p.period,
      decisionId: `D-${p.proposalId}`,
      proposalId,
      reviewer: caller,
      outcome,
      reason: outcome === "posted" ? "Every rule passed; under threshold" : rulesRun.filter((r) => !r.passed).map((r) => r.rule).join(", ") + " failed",
      rulesRun,
      citations: p.citations,
      latencyMs: Date.now() - started,
    });
    if (outcome === "escalated") {
      await ctx.db.patch("proposals", proposalId, { status: "escalated" });
      await ctx.db.patch("breaks", p.breakId, { status: "escalated" });
    }
    await audit(ctx, { entity: p.entity, period: p.period, actor: caller, action: outcome === "posted" ? "review.pass" : "escalate", proposalId, decisionId });
    return { decisionId, outcome };
  },
});
