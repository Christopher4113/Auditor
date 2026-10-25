// Lane B: the controls engine. TypeScript rules, no model. B4 replaces the Phase 1 stub.
// Signature is interface 2: keep it. Runs under the controls identity; posting happens in ledger.postEntry.
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { audit } from "./audit";
import { vIdentity, vOutcome } from "./schema";
import { evaluate, plImpact, type EvalCtx } from "./controls/rules";
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

    const period = await ctx.db
      .query("periods")
      .withIndex("by_entity_period", (q) => q.eq("entity", p.entity).eq("period", p.period))
      .unique();

    // Vendor hold check (4.3): find the counterparty vendor for this transaction.
    const brk = await ctx.db.get(p.breakId);
    const txn = brk?.bankTransactionId ? await ctx.db.get(brk.bankTransactionId) : null;
    const vendorId = brk?.vendorId ?? txn?.vendorId;
    const vendor = vendorId ? await ctx.db.query("vendors").withIndex("by_entity_vendorId", q => q.eq("entity", p.entity).eq("vendorId", vendorId)).unique() : txn
      ? await ctx.db
          .query("vendors")
          .withIndex("by_entity_vendorId", (q) => q.eq("entity", p.entity))
          .filter((q) => q.eq(q.field("name"), txn.counterparty))
          .first()
      : null;

    // Open corrections: corrections for this entity/period not yet applied by this proposal.
    const allCorrections = await ctx.db
      .query("corrections")
      .withIndex("by_entity_period", (q) => q.eq("entity", p.entity).eq("period", p.period))
      .take(100);
    // A correction binds to the break it came from (its proposal's break) or, for a human rejection with no
    // proposal link, to the same break kind. Rule failures on another break are not this proposal's debt.
    const sameBreak = new Set<string>();
    for (const c of allCorrections) {
      if (!c.proposalId) continue;
      const cp = await ctx.db.get(c.proposalId);
      if (cp?.breakId === p.breakId) sameBreak.add(c.correctionId);
    }
    const openCorrectionIds = allCorrections
      .filter((c) => (c.proposalId ? sameBreak.has(c.correctionId) : c.scope === (brk?.kind ?? "unmatched")))
      .filter((c) => !c.appliedBy.includes(p.proposalId))
      .map((c) => c.correctionId);

    // Human-decided precedents: decisions with a non-null precedentScope.
    const allDecisions = await ctx.db
      .query("decisions")
      .withIndex("by_entity_period", (q) => q.eq("entity", p.entity).eq("period", p.period))
      .take(200);
    const precedentScopes = allDecisions
      .filter((d) => d.precedentScope !== undefined && d.precedentScope !== null)
      .map((d) => JSON.stringify(d.precedentScope));
    // Also check other periods (a July precedent covers September).
    const allDecisionsAllPeriods = await ctx.db
      .query("decisions")
      .withIndex("by_entity_period", (q) => q.eq("entity", p.entity))
      .take(500);
    const allPrecedentScopes = allDecisionsAllPeriods
      .filter((d) => d.precedentScope !== undefined && d.precedentScope !== null)
      .map((d) => JSON.stringify(d.precedentScope));

    // Source texts for citation verification (policy 9.0).
    // Policy clauses: keyed as "policy-{id}"
    const sources = new Map<string, string>();
    if (pack) {
      for (const clause of pack.clauses) {
        sources.set(`policy-${clause.id}`, clause.text);
        sources.set(clause.id, clause.text);
      }
    }
    // Contract clauses: keyed as "{contractId}-{clauseId}"
    const contracts = await ctx.db
      .query("contracts")
      .withIndex("by_entity_contractId", (q) => q.eq("entity", p.entity))
      .take(50);
    for (const contract of contracts) {
      for (const clause of contract.clauses) {
        sources.set(`${contract.contractId}-${clause.id}`, clause.text);
        sources.set(clause.id, clause.text);
      }
    }
    // Decision texts: keyed by decisionId (e.g. "D-0417")
    for (const d of allDecisionsAllPeriods) {
      sources.set(d.decisionId, d.reason);
      // Also make each of the decision's citations searchable by their sourceId
      for (const c of d.citations) {
        if (!sources.has(c.sourceId)) sources.set(c.sourceId, c.text);
      }
    }
    // Correction instructions: keyed by correctionId
    for (const c of allCorrections) {
      sources.set(c.correctionId, c.instruction);
    }
    // Real public documents (fee schedules, terms), keyed by their pub- id
    for (const ps of await ctx.db.query("publicSources").withIndex("by_entity_sourceId", (q) => q.eq("entity", p.entity)).take(50)) {
      sources.set(ps.sourceId, ps.text);
    }

    const evalCtx: EvalCtx = {
      now: started,
      periodStatus: period?.status ?? "open",
      thresholdCents: threshold,
      precedentScopes: allPrecedentScopes,
      openCorrectionIds,
      vendorHeld: vendor?.paymentsHeld ?? false,
      sources,
      breakKind: brk?.kind ?? "unmatched",
    };

    // The agent sometimes cites the decision id its own proposal will get (D-<proposalId>...). That is not
    // evidence; drop self-references so the citation rule judges the real sources.
    const citations = p.citations.filter((c) => !c.sourceId.includes(p.proposalId) && !(c.sourceId.startsWith("D-P-") && !sources.has(c.sourceId)));
    if (citations.length !== p.citations.length) await ctx.db.patch("proposals", proposalId, { citations });
    const proposalView = {
      lines: p.lines,
      citations,
      revision: p.revision,
      correctionsApplied: p.correctionsApplied,
      discardedFirstRead: p.discardedFirstRead,
    };
    let { rulesRun, outcome, reason } = evaluate(proposalView, evalCtx);

    // A rule-failure correction is addressed when that rule passes now; the agent fixed what it was told to.
    // Corrections on rules the agent cannot act on (precedent, threshold, cap) never block a revision.
    const passedNow = new Set(rulesRun.filter((r) => r.passed).map((r) => r.rule));
    const actionable = new Set(["balance", "citation", "period_lock"]);
    const addressed = allCorrections
      .filter((c) => openCorrectionIds.includes(c.correctionId))
      .filter((c) => c.kind === "rule_failure" && (!c.rule || !actionable.has(c.rule) || passedNow.has(c.rule)));
    if (addressed.length) {
      const remaining = openCorrectionIds.filter((id) => !addressed.some((c) => c.correctionId === id));
      ({ rulesRun, outcome, reason } = evaluate(proposalView, { ...evalCtx, openCorrectionIds: remaining }));
      for (const c of addressed) await ctx.db.patch("corrections", c._id, { appliedBy: [...c.appliedBy, p.proposalId] });
    }

    // The agent asked the controller a question (request_approval): that is an escalation by design (8.0,
    // "any control exception needs the controller"), not a return-and-revise loop. Rules still run and are logged.
    if (p.requestedApproval && outcome !== "escalated") {
      outcome = "escalated";
      reason = `Agent requested the controller's decision: ${p.reason.replace(/^Controller decision requested: /, "")}`;
    }

    // Audit every rule result.
    for (const r of rulesRun) {
      await audit(ctx, {
        entity: p.entity,
        period: p.period,
        actor: caller,
        action: `rule.${r.rule}`,
        proposalId,
        detail: `${r.passed ? "pass" : "FAIL"} ${r.detail ?? ""}`,
      });
    }

    const decisionId = await ctx.db.insert("decisions", {
      entity: p.entity,
      period: p.period,
      decisionId: `D-${p.proposalId}`,
      proposalId,
      reviewer: caller,
      outcome: outcome as Infer<typeof vOutcome>,
      reason,
      rulesRun,
      citations,
      latencyMs: Date.now() - started,
    });

    // Update proposal + break status.
    const newStatus =
      outcome === "posted" ? "posted" : outcome === "returned" ? "failed_rule" : "escalated";
    await ctx.db.patch("proposals", proposalId, { status: newStatus });
    if (brk && outcome !== "posted") {
      await ctx.db.patch("breaks", brk._id, { status: outcome === "escalated" ? "escalated" : "proposed" });
    }

    // Write a correction when a return rule fails (so the agent learns).
    if (outcome === "returned") {
      const failedRules = rulesRun.filter((r) => !r.passed && ["balance", "citation", "period_lock"].includes(r.rule));
      for (const r of failedRules) {
        await ctx.db.insert("corrections", {
          entity: p.entity,
          period: p.period,
          correctionId: `C-${p.proposalId}-${r.rule}`,
          kind: "rule_failure",
          scope: brk?.kind ?? "unmatched",
          instruction: `Rule ${r.rule} failed: ${r.detail ?? ""}`,
          rule: r.rule,
          proposalId,
          decisionId,
          appliedBy: [],
        });
      }
    }

    await audit(ctx, {
      entity: p.entity,
      period: p.period,
      actor: caller,
      action: outcome === "posted" ? "review.pass" : outcome === "returned" ? "review.return" : "escalate",
      proposalId,
      decisionId,
      detail: reason,
    });

    return { decisionId, outcome: outcome as Infer<typeof vOutcome> };
  },
});

/**
 * Event-driven policy 4.3: fired when a vendor's bank account details change.
 * Places a payment hold and escalates the same day (fails closed when CRS unavailable).
 * Called by C's changeVendorBank mutation (Phase 3, C5/C6).
 */
export const onVendorBankChange = internalMutation({
  args: {
    entity: v.string(),
    vendorId: v.string(),
    newBankLast4: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { entity, vendorId, newBankLast4 }) => {
    const vendor = await ctx.db
      .query("vendors")
      .withIndex("by_entity_vendorId", (q) => q.eq("entity", entity).eq("vendorId", vendorId))
      .unique();
    if (!vendor) throw new Error(`vendor ${vendorId} not found`);

    // 1. Place the payment hold immediately.
    await ctx.db.patch("vendors", vendor._id, {
      bankAccountLast4: newBankLast4,
      paymentsHeld: true,
    });

    await audit(ctx, {
      entity,
      actor: "controls",
      action: "bank_detail_change.hold_placed",
      detail: `vendor ${vendorId} bank changed to last4 ${newBankLast4} — hold placed`,
    });

    // 2. CRS not available (RETRIEVAL_URL not set) → fail closed → log and flag for human.
    // In Phase 2 the hold stays and the next payment proposal will be caught by the bank_detail_change rule.
    await audit(ctx, {
      entity,
      actor: "controls",
      action: "bank_detail_change.crs_unavailable",
      detail: `CRS unavailable — RETRIEVAL_URL not set; hold remains, escalate to human`,
    });

    return null;
  },
});

/** B6 helper: load citations from the most recent decision on a proposal, for askAuditor. */
export const decisionCitations = internalQuery({
  args: { proposalId: v.id("proposals"), entity:v.optional(v.string()), asOf:v.optional(v.string()) },
  returns: v.array(v.object({ sourceId: v.string(), text: v.string() })),
  handler: async (ctx, { proposalId, entity, asOf }) => {
    const proposal=await ctx.db.get(proposalId);
    if(!proposal || (entity && proposal.entity!==entity) || (asOf && proposal.period>asOf.slice(0,7)))return [];
    const decision = await ctx.db
      .query("decisions")
      .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
      .order("desc")
      .first();
    if (!decision) return [];
    return decision.citations.map((c) => ({ sourceId: c.sourceId, text: c.text }));
  },
});
