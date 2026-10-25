// C5: the Inject drawer (judges' own scenarios) and reset. Three injections, each a unit of work with its
// own trace: a bank transaction (the Workflow picks it up within seconds), a contract amendment (indexed
// into Moss, the period's close re-runs), a vendor bank-detail change (rule 4.3: payments held, verify_payee
// against CRS, escalated the same day; the controller keeps or releases the hold). resetAll wipes and
// reseeds from the last loaded seed file.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { audit } from "./audit";
import { ensureClose } from "./close";

const stamp = () => Date.now().toString(36);
/** Judges type names loosely: "Field & Flame" should find "Field & Flame Catering" and vice versa. */
const nameMatches = (stored: string, typed?: string) => {
  const a = stored.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const b = (typed ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return b.length > 0 && (a === b || a.startsWith(b) || b.startsWith(a));
};

/** A bank transaction arrives. The data trigger starts a close for its period. */
export const injectBankTransaction = mutation({
  args: {
    entity: v.string(),
    date: v.string(), // YYYY-MM-DD; the period is derived
    amount: v.number(), // cents, signed, positive = money in
    counterparty: v.string(),
    memo: v.string(),
    reference: v.optional(v.string()),
    vendorId: v.optional(v.string()),
  },
  returns: v.object({ txnId: v.string(), traceId: v.string() }),
  handler: async (ctx, { entity, date, amount, counterparty, memo, reference, vendorId }) => {
    if (!Number.isFinite(amount) || amount === 0 || !Number.isInteger(amount)) throw new Error("amount must be a non-zero integer in cents");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
    const txnId = `INJ-${stamp()}`;
    await ctx.runMutation(internal.close.ingestBankTransaction, {
      entity,
      period: date.slice(0, 7),
      txnId,
      date,
      amount,
      counterparty,
      memo,
      reference,
      vendorId,
      source: "bank",
      actor: "inject",
    });
    return { txnId, traceId: `T-${txnId}` };
  },
});

/** A contract is amended: the clause is appended, indexed into Moss, and the period's close re-runs. */
export const amendContract = mutation({
  args: { entity: v.string(), contractId: v.optional(v.string()), counterparty: v.optional(v.string()), text: v.string(), effectiveDate: v.string(), number: v.optional(v.string()) },
  returns: v.object({ clauseId: v.string(), traceId: v.string() }),
  handler: async (ctx, { entity, contractId: givenId, counterparty, text, effectiveDate, number }) => {
    if (!text.trim()) throw new Error("an amendment needs text");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error("effectiveDate must be YYYY-MM-DD");
    // The Inject drawer sends the vendor's name; the CLI sends the contract id.
    const contract = givenId
      ? await ctx.db.query("contracts").withIndex("by_entity_contractId", (q) => q.eq("entity", entity).eq("contractId", givenId)).unique()
      : (await ctx.db.query("contracts").withIndex("by_entity_contractId", (q) => q.eq("entity", entity)).take(100)).find((c) => nameMatches(c.counterparty, counterparty)) ?? null;
    if (!contract) throw new Error(`no contract for ${givenId ?? counterparty}`);
    const contractId = contract.contractId;
    const n = contract.clauses.filter((c) => c.id.includes("amendment")).length + 1;
    const clauseId = `${contractId}-amendment-${n}`;
    const clause = { id: clauseId, number: number ?? `Amendment ${n}`, text: text.trim(), effectiveDate };
    await ctx.db.patch("contracts", contract._id, { clauses: [...contract.clauses, clause] });
    const traceId = `T-${clauseId}`;
    await audit(ctx, { entity, period: effectiveDate.slice(0, 7), actor: "inject", action: "contract.amend", traceId, detail: `${contractId}: ${clause.number} effective ${effectiveDate}` });
    await ctx.scheduler.runAfter(0, internal.retrieval.index, {
      collection: "contracts",
      id: clauseId,
      text: clause.text,
      meta: { entity, effectiveDate, sourceType: "contract", contractId, vendorId: contract.vendorId ?? "", title: contract.title, counterparty: contract.counterparty },
      traceId,
    });
    const period = await ctx.db.query("periods").withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", effectiveDate.slice(0, 7))).unique();
    if (period && period.status !== "signed") await ensureClose(ctx, entity, period.period, "inject");
    return { clauseId, traceId };
  },
});

/** A vendor's bank details change (seeded email or judge's injection). Rule 4.3 fires the same day. */
export const changeVendorBank = mutation({
  args: { entity: v.string(), vendorId: v.optional(v.string()), vendorName: v.optional(v.string()), newLast4: v.string(), source: v.optional(v.string()) },
  returns: v.object({ traceId: v.string() }),
  handler: async (ctx, { entity, vendorId: givenId, vendorName, newLast4, source }) => {
    if (!/^\d{4}$/.test(newLast4)) throw new Error("newLast4 must be four digits");
    const vendor = givenId
      ? await ctx.db.query("vendors").withIndex("by_entity_vendorId", (q) => q.eq("entity", entity).eq("vendorId", givenId)).unique()
      : (await ctx.db.query("vendors").withIndex("by_entity_vendorId", (q) => q.eq("entity", entity)).take(100)).find((vd) => nameMatches(vd.name, vendorName)) ?? null;
    if (!vendor) throw new Error(`vendor ${givenId ?? vendorName} not found`);
    const vendorId = vendor.vendorId;
    const traceId = `T-vendor-${vendorId}-${stamp()}`;
    const bankChange = { at: Date.now(), previousLast4: vendor.bankAccountLast4, newLast4, source: source ?? "email", traceId };
    await ctx.db.patch("vendors", vendor._id, { bankAccountLast4: newLast4, paymentsHeld: true, bankChange, verification: undefined });
    await audit(ctx, { entity, actor: "inject", action: "vendor.bank_change", traceId, detail: `${vendor.name}: ${bankChange.previousLast4} -> ${newLast4} via ${bankChange.source}` });
    await audit(ctx, { entity, actor: "controls", action: "rule.bank_detail_change", traceId, detail: `4.3: payments to ${vendor.name} held until callback verification is logged` });
    await ctx.scheduler.runAfter(0, internal.inject.verifyVendor, { entity, vendorId, traceId });
    return { traceId };
  },
});

/** verify_payee (controls only): CRS sandbox through Group A's sidecar; fails closed; result stored on the vendor. */
export const verifyVendor = internalAction({
  args: { entity: v.string(), vendorId: v.string(), traceId: v.string() },
  returns: v.null(),
  handler: async (ctx, { entity, vendorId, traceId }): Promise<null> => {
    const identity: string | null = await ctx.runQuery(internal.inject.vendorIdentity, { entity, vendorId });
    const result = await ctx.runAction(internal.retrieval.verify, { testIdentityId: identity ?? undefined, traceId });
    await ctx.runMutation(internal.inject.recordVerification, { entity, vendorId, traceId, ...result });
    return null;
  },
});

export const vendorIdentity = internalQuery({
  args: { entity: v.string(), vendorId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { entity, vendorId }) => {
    const vendor = await ctx.db.query("vendors").withIndex("by_entity_vendorId", (q) => q.eq("entity", entity).eq("vendorId", vendorId)).unique();
    return vendor?.crsTestIdentity ?? null;
  },
});

export const recordVerification = internalMutation({
  args: { entity: v.string(), vendorId: v.string(), traceId: v.string(), identityMatch: v.boolean(), fraudFlags: v.array(v.string()), available: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { entity, vendorId, traceId, ...result }) => {
    const vendor = await ctx.db.query("vendors").withIndex("by_entity_vendorId", (q) => q.eq("entity", entity).eq("vendorId", vendorId)).unique();
    if (!vendor) return null;
    await ctx.db.patch("vendors", vendor._id, { verification: { at: Date.now(), ...result } });
    await audit(ctx, {
      entity,
      actor: "controls",
      action: "verify_payee",
      traceId,
      detail: result.available ? `CRS: identityMatch=${result.identityMatch}${result.fraudFlags.length ? " flags=" + result.fraudFlags.join(",") : ""}` : "CRS unavailable or no test identity: fail closed, hold stays",
    });
    await audit(ctx, { entity, actor: "controls", action: "escalate", traceId, detail: `${vendor.name}: bank-detail change needs the controller's callback decision` });
    return null;
  },
});

/** The controller's callback decision on a held vendor (scene 2: "no, keep the hold"). */
export const decideVendorHold = mutation({
  args: { entity: v.string(), vendorId: v.string(), release: v.boolean(), note: v.string() },
  returns: v.null(),
  handler: async (ctx, { entity, vendorId, release, note }) => {
    if (!note.trim()) throw new Error("record why");
    const vendor = await ctx.db.query("vendors").withIndex("by_entity_vendorId", (q) => q.eq("entity", entity).eq("vendorId", vendorId)).unique();
    if (!vendor) throw new Error(`vendor ${vendorId} not found`);
    if (!vendor.paymentsHeld) throw new Error(`${vendor.name} has no hold`);
    const traceId = vendor.bankChange?.traceId;
    if (release) await ctx.db.patch("vendors", vendor._id, { paymentsHeld: false });
    await audit(ctx, { entity, actor: "human", action: release ? "vendor.hold.released" : "vendor.hold.kept", traceId, detail: note.trim() });
    return null;
  },
});

/** Wipe the entity and reseed from the last loaded seed file. Running closes are left to finish on their own. */
export const resetAll = mutation({
  args: { entity: v.string() },
  returns: v.object({ dataset: v.string(), bankTransactions: v.number() }),
  handler: async (ctx, { entity }) => {
    const file = await ctx.db.query("seedFiles").withIndex("by_entity", (q) => q.eq("entity", entity)).order("desc").first();
    if (!file) throw new Error(`no seed stored for ${entity}; run pnpm seed once`);
    const seed = JSON.parse(file.json);
    const r: { entity: string; bankTransactions: number; journalEntries: number } = await ctx.runMutation(internal.seed.load, seed);
    await audit(ctx, { entity, actor: "human", action: "reset", detail: `${file.dataset} reseeded` });
    return { dataset: file.dataset, bankTransactions: r.bankTransactions };
  },
});
