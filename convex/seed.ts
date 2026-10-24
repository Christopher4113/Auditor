// C1: loads seed.json (interface 5; shape owned by Group A in datagen/seed.schema.json, v1.0.0).
// Wipes the entity first, so it is also the reset. Run: pnpm seed  (or  SEED=datagen/sample.seed.json pnpm seed)
// Mapping from the seed contract to the tables: external ids become *Id string fields, never _id;
// openingBalances become one balanced opening entry; stripePayouts attach to their bank transaction;
// policyClauses become one policyPacks row; the answer key marks plantedBreak on bank transactions.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id, TableNames } from "./_generated/dataModel";
import { audit } from "./audit";

const id = v.string();
const cents = v.number();
const seedLine = v.object({ accountCode: v.string(), debit: cents, credit: cents });
const seedClause = v.object({ id, number: v.string(), text: v.string(), effectiveDate: v.string() });

const vSeed = {
  schemaVersion: v.string(),
  seed: v.number(),
  dataset: v.string(),
  entity: id,
  currency: v.string(),
  company: v.object({ name: v.string(), synthetic: v.boolean(), eventStartDate: v.string(), eventEndDate: v.string(), paidAttendance: v.number() }),
  accounts: v.array(v.object({ id, entity: id, code: v.string(), name: v.string(), type: v.union(v.literal("asset"), v.literal("liability"), v.literal("equity"), v.literal("revenue"), v.literal("expense")), normalBalance: v.string(), currency: v.string() })),
  openingBalances: v.array(v.object({ id, entity: id, date: v.string(), accountCode: v.string(), debit: cents, credit: cents })),
  periods: v.array(v.object({ id, entity: id, startDate: v.string(), endDate: v.string(), status: v.union(v.literal("open"), v.literal("closing"), v.literal("closed")) })),
  bankTransactions: v.array(
    v.object({
      id,
      entity: id,
      period: v.string(),
      date: v.string(),
      amount: v.number(),
      currency: v.string(),
      counterparty: v.string(),
      description: v.string(),
      reference: v.string(),
      vendorId: v.union(id, v.null()),
      stripePayoutId: v.union(id, v.null()),
      status: v.union(v.literal("unmatched"), v.literal("matched")),
    }),
  ),
  stripePayouts: v.array(v.object({ id, entity: id, period: v.string(), arrivalDate: v.string(), currency: v.string(), gross: cents, fee: cents, net: cents, chargeCount: v.number(), bankTransactionId: id })),
  contracts: v.array(v.object({ id, entity: id, vendorId: id, title: v.string(), signedDate: v.string(), startDate: v.string(), endDate: v.string(), currency: v.string(), clauses: v.array(seedClause) })),
  policyClauses: v.array(v.object({ id, entity: id, policyPackId: id, number: v.string(), text: v.string(), effectiveDate: v.string() })),
  vendors: v.array(v.object({ id, entity: id, name: v.string(), category: v.string(), bankAccountLast4: v.string(), crsTestIdentity: v.union(id, v.null()) })),
  breaks: v.array(v.object({ id, entity: id, period: v.string(), kind: v.string(), description: v.string(), bankTransactionIds: v.array(id), contractIds: v.array(id), status: v.string() })),
  answerKey: v.array(
    v.object({ id, entity: id, breakId: id, period: v.string(), expectedAction: v.string(), expectedLines: v.array(seedLine), citationIds: v.array(id), expectedEscalation: v.boolean(), pnlImpact: cents, explanation: v.string() }),
  ),
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

// ponytail: rule 8.0 threshold is not in the seed contract yet; the brief says $5,000. A adds it to policyPack metadata if it ever varies.
const THRESHOLD_CENTS = 500_000;

export const load = internalMutation({
  args: vSeed,
  returns: v.object({ entity: v.string(), bankTransactions: v.number(), journalEntries: v.number() }),
  handler: async (ctx, s) => {
    const { entity } = s;
    for (const [table, index] of Object.entries(ENTITY_INDEX) as [TableNames, string][]) {
      // ponytail: one transaction; fine at a few hundred rows per table, batch + reschedule if it ever isn't
      const q = ctx.db.query(table) as unknown as { withIndex: (i: string, r: (b: { eq: (f: string, v: string) => unknown }) => unknown) => AsyncIterable<{ _id: Id<TableNames> }> };
      for await (const row of q.withIndex(index, (b) => b.eq("entity", entity))) await ctx.db.delete(row._id);
    }

    for (const a of s.accounts) await ctx.db.insert("accounts", { entity, code: a.code, name: a.name, type: a.type });
    for (const p of s.periods)
      await ctx.db.insert("periods", { entity, period: p.id, start: p.startDate, end: p.endDate, status: p.status === "closed" ? "signed" : p.status });

    const payoutByTxn = new Map(s.stripePayouts.map((p) => [p.bankTransactionId, p]));
    const plantedByTxn = new Map<string, number>();
    const breaksById = new Map(s.breaks.map((b) => [b.id, b]));
    s.answerKey.forEach((k, i) => {
      for (const t of breaksById.get(k.breakId)?.bankTransactionIds ?? []) plantedByTxn.set(t, i + 1);
    });
    for (const t of s.bankTransactions) {
      const payout = payoutByTxn.get(t.id);
      await ctx.db.insert("bankTransactions", {
        entity,
        period: t.period,
        txnId: t.id,
        date: t.date,
        amount: t.amount,
        counterparty: t.counterparty,
        memo: t.description,
        reference: t.reference,
        vendorId: t.vendorId ?? undefined,
        source: payout ? "stripe" : "bank",
        stripe: payout ? { gross: payout.gross, fees: payout.fee, chargeCount: payout.chargeCount } : undefined,
        status: t.status,
        plantedBreak: plantedByTxn.get(t.id),
      });
    }

    const vendorName = new Map(s.vendors.map((vd) => [vd.id, vd.name]));
    const contractByVendor = new Map(s.contracts.map((c) => [c.vendorId, c.id]));
    for (const c of s.contracts)
      await ctx.db.insert("contracts", {
        entity,
        contractId: c.id,
        vendorId: c.vendorId,
        counterparty: vendorName.get(c.vendorId) ?? c.vendorId,
        title: c.title,
        clauses: c.clauses.map(({ id, number, text }) => ({ id, number, text })),
      });
    for (const vd of s.vendors)
      await ctx.db.insert("vendors", {
        entity,
        vendorId: vd.id,
        name: vd.name,
        bankAccountLast4: vd.bankAccountLast4,
        crsTestIdentity: vd.crsTestIdentity ?? undefined,
        paymentsHeld: false,
        contractId: contractByVendor.get(vd.id),
      });
    await ctx.db.insert("policyPacks", {
      entity,
      jurisdiction: "US",
      currency: s.currency,
      thresholdCents: THRESHOLD_CENTS,
      clauses: s.policyClauses.map(({ id, number, text }) => ({ id, number, text })),
    });
    for (const f of s.fxRates) await ctx.db.insert("fxRates", { entity, ...f });

    for (const [i, k] of s.answerKey.entries()) {
      const brk = breaksById.get(k.breakId);
      await ctx.db.insert("answerKey", {
        entity,
        period: k.period,
        breakNumber: i + 1,
        title: k.expectedAction,
        txnId: brk?.bankTransactionIds[0] ?? "",
        expectedKind: brk?.kind ?? "unknown",
        expectedLines: k.expectedLines.map((l) => ({ account: l.accountCode, debit: l.debit, credit: l.credit })),
      });
    }

    const first = [...s.periods].sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    let journalEntries = 0;
    if (first && s.openingBalances.length) {
      await ctx.db.insert("journalEntries", {
        entity,
        period: first.id,
        entryId: "JE-OPENING",
        date: s.openingBalances[0].date,
        lines: s.openingBalances.map((l) => ({ account: l.accountCode, debit: l.debit, credit: l.credit })),
        memo: "Opening balances",
        source: "opening",
        postedBy: "seed",
      });
      journalEntries = 1;
    }
    await audit(ctx, { entity, actor: "seed", action: "seed.load", detail: `${s.dataset} seed ${s.seed} schema ${s.schemaVersion}` });
    return { entity, bankTransactions: s.bankTransactions.length, journalEntries };
  },
});
