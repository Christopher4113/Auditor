// C4: scheduled period advance. Time prepares a close (counts what is waiting, records it on the period,
// writes an audit row); data (a bank transaction) or the controller's "prepare close" button runs it.
// Scheduled by signPeriod at the next period's end date, and swept daily by crons.ts for anything missed.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { audit } from "./audit";

export const prepare = internalMutation({
  args: { entity: v.string(), period: v.string() },
  returns: v.null(),
  handler: async (ctx, { entity, period }) => {
    const p = await ctx.db.query("periods").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).unique();
    if (!p || p.status === "signed") return null;
    const unmatched = (await ctx.db.query("bankTransactions").withIndex("by_entity_period_status", (q) => q.eq("entity", entity).eq("period", period).eq("status", "unmatched")).take(1000)).length;
    const openBreaks = (await ctx.db.query("breaks").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period)).take(1000)).filter((b) => b.status === "open").length;
    await ctx.db.patch("periods", p._id, { prepared: { at: Date.now(), unmatched, openBreaks } });
    await audit(ctx, { entity, period, actor: "workflow", action: "advance.prepared", detail: `${unmatched} unmatched, ${openBreaks} open breaks` });
    return null;
  },
});

/** Daily: prepare every open period whose end has passed, whose predecessor is signed, and that is not prepared yet. */
export const sweep = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    const periods = await ctx.db.query("periods").take(500); // ponytail: a handful of entities x months
    let prepared = 0;
    for (const p of periods) {
      if (p.status !== "open" || p.prepared || p.end > today) continue;
      const prev = periods.filter((x) => x.entity === p.entity && x.period < p.period).sort((a, b) => b.period.localeCompare(a.period))[0];
      if (prev && prev.status !== "signed") continue;
      await ctx.scheduler.runAfter(0, internal.advance.prepare, { entity: p.entity, period: p.period });
      prepared++;
    }
    return prepared;
  },
});
