// C1: loads seed.json (interface 5, shape in datagen/seed.schema.json). Wipes the entity first, so it is
// also the reset. Run: pnpm seed  (or  SEED=datagen/sample.json pnpm seed)
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id, TableNames } from "./_generated/dataModel";
import { audit } from "./audit";
import { vClause, vLine } from "./schema";

const vSeed = {
  seed: v.number(),
  entity: v.string(),
  accounts: v.array(v.object({ code: v.string(), name: v.string(), type: v.union(v.literal("asset"), v.literal("liability"), v.literal("equity"), v.literal("revenue"), v.literal("expense")) })),
  openingBalances: v.array(vLine), // as of the first period's start
  periods: v.array(v.object({ period: v.string(), start: v.string(), end: v.string() })),
  bankTransactions: v.array(v.object({ txnId: v.string(), period: v.string(), date: v.string(), amount: v.number(), counterparty: v.string(), memo: v.string() })),
  stripePayouts: v.array(v.object({ txnId: v.string(), period: v.string(), date: v.string(), amount: v.number(), gross: v.number(), fees: v.number(), chargeCount: v.number() })),
  contracts: v.array(v.object({ contractId: v.string(), counterparty: v.string(), title: v.string(), clauses: v.array(vClause) })),
  policyPack: v.object({ jurisdiction: v.string(), currency: v.string(), thresholdCents: v.number(), clauses: v.array(vClause) }),
  vendors: v.array(v.object({ vendorId: v.string(), name: v.string(), bankAccountLast4: v.string(), crsTestIdentity: v.string(), contractId: v.optional(v.string()) })),
  answerKey: v.array(v.object({ breakNumber: v.number(), period: v.string(), title: v.string(), txnId: v.string(), expectedKind: v.string(), expectedLines: v.array(vLine) })),
  fxRates: v.array(v.object({ period: v.string(), currency: v.string(), rateToUsd: v.number() })),
};

// Every table's first index starts with entity, so one prefix query per table clears an entity.
const ENTITY_INDEX: Record<TableNames, string> = {
  accounts: "by_entity_code",
  periods: "by_entity_period",
  bankTransactions: "by_entity_period_status",
  journalEntries: "by_entity_period",
  contracts: "by_entity_contractId",
  vendors: "by_entity_vendorId",
  breaks: "by_entity_period",
  proposals: "by_entity_period",
  decisions: "by_entity_period",
  auditLog: "by_entity_period",
  answerKey: "by_entity_period",
  policyPacks: "by_entity",
  fxRates: "by_entity_period",
  corrections: "by_entity_period",
};

export const load = internalMutation({
  args: vSeed,
  returns: v.object({ entity: v.string(), bankTransactions: v.number(), journalEntries: v.number() }),
  handler: async (ctx, s) => {
    const { entity } = s;
    for (const [table, index] of Object.entries(ENTITY_INDEX) as [TableNames, string][]) {
      // ponytail: one transaction; fine at a few hundred rows per table, batch + reschedule if it ever isn't
      // Typed per-table index names don't survive the loop, so the builder is cast once here.
      const q = ctx.db.query(table) as unknown as { withIndex: (i: string, r: (b: { eq: (f: string, v: string) => unknown }) => unknown) => AsyncIterable<{ _id: Id<TableNames> }> };
      for await (const row of q.withIndex(index, (b) => b.eq("entity", entity))) await ctx.db.delete(row._id);
    }

    for (const a of s.accounts) await ctx.db.insert("accounts", { entity, ...a });
    for (const p of s.periods) await ctx.db.insert("periods", { entity, ...p, status: "open" });
    for (const t of s.bankTransactions) await ctx.db.insert("bankTransactions", { entity, ...t, source: "bank", status: "unmatched" });
    for (const { gross, fees, chargeCount, ...t } of s.stripePayouts)
      await ctx.db.insert("bankTransactions", { entity, ...t, counterparty: "Stripe", memo: `Payout ${t.txnId}`, source: "stripe", stripe: { gross, fees, chargeCount }, status: "unmatched" });
    for (const c of s.contracts) await ctx.db.insert("contracts", { entity, ...c });
    await ctx.db.insert("policyPacks", { entity, ...s.policyPack });
    for (const vd of s.vendors) await ctx.db.insert("vendors", { entity, ...vd, paymentsHeld: false });
    for (const f of s.fxRates) await ctx.db.insert("fxRates", { entity, ...f });

    for (const k of s.answerKey) {
      await ctx.db.insert("answerKey", { entity, ...k });
      const txn = await ctx.db
        .query("bankTransactions")
        .withIndex("by_entity_txnId", (q) => q.eq("entity", entity).eq("txnId", k.txnId))
        .unique();
      if (txn) await ctx.db.patch("bankTransactions", txn._id, { plantedBreak: k.breakNumber });
    }

    const first = [...s.periods].sort((a, b) => a.start.localeCompare(b.start))[0];
    let journalEntries = 0;
    if (first && s.openingBalances.length) {
      await ctx.db.insert("journalEntries", {
        entity,
        period: first.period,
        entryId: "JE-OPENING",
        date: first.start,
        lines: s.openingBalances,
        memo: "Opening balances",
        source: "opening",
        postedBy: "seed",
      });
      journalEntries = 1;
    }
    await audit(ctx, { entity, actor: "seed", action: "seed.load", detail: `seed ${s.seed}` });
    return { entity, bankTransactions: s.bankTransactions.length + s.stripePayouts.length, journalEntries };
  },
});
