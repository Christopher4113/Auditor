// A5: read-only live report and an internal, explicit result snapshot.
import { v } from "convex/values";
import { query, internalMutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { calculate, DEFAULT_ASSUMPTIONS, type Assumptions } from "./scoring/metrics";

const nullableNumber = v.union(v.number(), v.null());
const totals = { planted: v.number(), caught: v.number(), correct: v.number(), falsePositives: v.number(), falseNegatives: v.number(),
  precision: nullableNumber, recall: nullableNumber, accuracy: nullableNumber };
const assumptionsFields = { routineMinutes: v.number(), exceptionMinutes: v.number(), controllerMinutes: v.number(), manualCloseDays: v.number() };
export const vReport = v.object({ entity: v.string(), period: v.union(v.string(), v.null()), overall: v.object(totals),
  byBreak: v.array(v.object({ breakNumber: v.number(), ...totals })),
  cases: v.array(v.object({ caseId: v.string(), period: v.string(), breakNumber: v.number(), kind: v.string(), caught: v.boolean(),
    accountingCorrect: v.boolean(), controlsCorrect: v.boolean(), dependenciesSatisfied: v.boolean(), correct: v.boolean(), postedEntries: v.number(), escalated: v.boolean() })),
  impact: v.object({ assumptions: v.object(assumptionsFields), closedByCode: v.number(), investigated: v.number(), humanReviews: v.number(),
    escalations: v.number(), manualMinutes: v.number(), controllerMinutes: v.number(), estimatedHoursSaved: v.number(), cashProtectedCents: v.number(),
    misclassificationCorrectedCents: v.number(), repeatMistakes: v.number(), basis: v.string(),
    periods: v.array(v.object({ period: v.string(), status: v.string(), closeElapsedDays: nullableNumber, estimatedDaysSaved: nullableNumber, escalations: v.number() })) }) });

export async function loadReport(ctx: QueryCtx | MutationCtx, entity: string, period?: string, assumptions?: Assumptions) {
  if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("period must be YYYY-MM");
  if (assumptions && Object.values(assumptions).some(n => !Number.isFinite(n) || n < 0 || n > 10000)) throw new Error("Invalid time assumptions");
  // The seed is a bounded three-month benchmark. Refuse an oversized report
  // rather than silently showing inflated accuracy from truncated rows.
  const [key, breaks, proposals, entries, decisions, banks, events, corrections, vendors, periods] = await Promise.all([
    ctx.db.query("answerKey").withIndex("by_entity_period", q => q.eq("entity", entity)).take(101),
    ctx.db.query("breaks").withIndex("by_entity_period", q => q.eq("entity", entity)).take(1001),
    ctx.db.query("proposals").withIndex("by_entity_period", q => q.eq("entity", entity)).take(2001),
    ctx.db.query("journalEntries").withIndex("by_entity_period", q => q.eq("entity", entity)).take(3001),
    ctx.db.query("decisions").withIndex("by_entity_period", q => q.eq("entity", entity)).take(3001),
    ctx.db.query("bankTransactions").withIndex("by_entity_period_status", q => q.eq("entity", entity)).take(2001),
    ctx.db.query("auditLog").withIndex("by_entity_period", q => q.eq("entity", entity)).take(10001),
    ctx.db.query("corrections").withIndex("by_entity_period", q => q.eq("entity", entity)).take(1001),
    ctx.db.query("vendors").withIndex("by_entity_vendorId", q => q.eq("entity", entity)).take(101),
    ctx.db.query("periods").withIndex("by_entity_period", q => q.eq("entity", entity)).take(25),
  ]);
  const counts = [key.length, breaks.length, proposals.length, entries.length, decisions.length, banks.length, events.length, corrections.length, vendors.length, periods.length];
  if (counts.some((n,i) => n > [100,1000,2000,3000,3000,2000,10000,1000,100,24][i])) throw new Error("Scoring benchmark limit exceeded; report not computed");
  return calculate({ entity, period, key, breaks, proposals, entries, decisions, banks, events, corrections, vendors, periods }, assumptions);
}

/** UI/judges: ratios are 0–1, null when their denominator is zero. Money is cents. */
export const report = query({
  args: { entity: v.string(), period: v.optional(v.string()), assumptions: v.optional(v.object(assumptionsFields)) },
  returns: vReport,
  handler: (ctx, {entity, period, assumptions}) => loadReport(ctx, entity, period, assumptions),
});

/** Optional scoring snapshot for export; live reports always recompute from records. */
export const refresh = internalMutation({
  args: { entity: v.string(), period: v.optional(v.string()) },
  returns: vReport,
  handler: async (ctx, {entity, period}) => {
    const report = await loadReport(ctx, entity, period, DEFAULT_ASSUMPTIONS);
    const rows = await ctx.db.query("answerKey").withIndex("by_entity_period", q => period ? q.eq("entity", entity).eq("period", period) : q.eq("entity", entity)).take(100);
    for (const row of rows) {
      const result = report.cases.find(c => c.caseId === (row.caseId ?? row._id));
      if (result) await ctx.db.patch("answerKey", row._id, { result: { caught: result.caught, correct: result.correct, scoredAt: Date.now() } });
    }
    return report;
  },
});
