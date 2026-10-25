// C5: the Inject drawer (judges' own scenarios) and reset. Three injections, each a unit of work with its
// own trace: a bank transaction (the Workflow picks it up within seconds), a contract amendment (indexed
// into Moss, the period's close re-runs), a vendor bank-detail change (rule 4.3: payments held, verify_payee
// against CRS, escalated the same day; the controller keeps or releases the hold). resetAll wipes and
// reseeds from the last loaded seed file.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import { audit } from "./audit";
import { ensureClose } from "./close";

const stamp = () => Date.now().toString(36);
/** The demo clock is the books' clock: evidence from an event belongs to the latest unsigned period. */
async function currentPeriodEnd(ctx: { db: MutationCtx["db"] }, entity: string): Promise<string> {
  const periods = await ctx.db.query("periods").withIndex("by_entity_period", (q) => q.eq("entity", entity)).take(24);
  const open = periods.filter((p) => p.status !== "signed").sort((a, b) => b.period.localeCompare(a.period));
  return (open[0] ?? periods[periods.length - 1])?.end ?? new Date().toISOString().slice(0, 10);
}
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
  args: {
    entity: v.string(), vendorId: v.optional(v.string()), vendorName: v.optional(v.string()), newLast4: v.string(), source: v.optional(v.string()),
    paymentAmount: v.optional(v.number()), // cents; the payment that is now due to this vendor. Injected as a bank line so the hold has something to hold.
    date: v.optional(v.string()), // YYYY-MM-DD for that payment; defaults to today
  },
  returns: v.object({ traceId: v.string() }),
  handler: async (ctx, { entity, vendorId: givenId, vendorName, newLast4, source, paymentAmount, date }) => {
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
    // Generated books carry no payment row for this case (the answer key's B5 has no txnId), so the drawer's
    // "payment affected" becomes one: the agent sees the held vendor, parks it in 1400, rule 4.3 escalates it.
    if (paymentAmount && Math.round(Math.abs(paymentAmount)) > 0) {
      const d = date ?? new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("date must be YYYY-MM-DD");
      await ctx.runMutation(internal.close.ingestBankTransaction, {
        entity, period: d.slice(0, 7), txnId: `INJ-${stamp()}`, date: d, amount: -Math.round(Math.abs(paymentAmount)),
        counterparty: vendor.name, memo: `Payment due; bank details changed to ...${newLast4} via ${bankChange.source}`, vendorId, source: "bank", actor: "inject",
      });
    }
    return { traceId };
  },
});

/** verify_payee (controls only): CRS sandbox through Group A's sidecar; fails closed; result stored on the vendor. */
export const verifyVendor = internalAction({
  args: { entity: v.string(), vendorId: v.string(), traceId: v.string() },
  returns: v.null(),
  handler: async (ctx, { entity, vendorId, traceId }): Promise<null> => {
    const identity: string | null = await ctx.runQuery(internal.inject.vendorIdentity, { entity, vendorId });
    const result = await ctx.runAction(internal.retrieval.verify, { testIdentityId: identity ?? undefined, includeReport: true, traceId });
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
  args: { entity: v.string(), vendorId: v.string(), traceId: v.string(), identityMatch: v.boolean(), fraudFlags: v.array(v.string()), available: v.boolean(), report: v.optional(v.any()) },
  returns: v.null(),
  handler: async (ctx, { entity, vendorId, traceId, ...result }) => {
    const vendor = await ctx.db.query("vendors").withIndex("by_entity_vendorId", (q) => q.eq("entity", entity).eq("vendorId", vendorId)).unique();
    if (!vendor) return null;
    await ctx.db.patch("vendors", vendor._id, { verification: { at: Date.now(), ...result } });
    // The CRS report is evidence for the controller, never an automatic verdict (brief: A6 add-on).
    const rep = (result.report ?? {}) as { fraudFinder?: { score?: number; reviewThreshold?: number }; criminal?: { records?: number }; publicRecords?: { bankruptcies?: number; liens?: number; judgments?: number } };
    const extra = result.available
      ? [
          rep.fraudFinder?.score !== undefined ? `fraud score ${rep.fraudFinder.score}/${rep.fraudFinder.reviewThreshold ?? 70}` : null,
          rep.criminal?.records !== undefined ? `criminal records ${rep.criminal.records}` : null,
          rep.publicRecords ? `bankruptcies ${rep.publicRecords.bankruptcies ?? 0}, liens ${rep.publicRecords.liens ?? 0}, judgments ${rep.publicRecords.judgments ?? 0}` : null,
        ].filter(Boolean).join("; ")
      : "";
    await audit(ctx, {
      entity,
      actor: "controls",
      action: "verify_payee",
      traceId,
      detail: result.available
        ? `CRS: identityMatch=${result.identityMatch}${result.fraudFlags.length ? " flags=" + result.fraudFlags.join(",") : ""}${extra ? "; " + extra : ""}`
        : "CRS unavailable or no test identity: fail closed, hold stays",
    });
    await audit(ctx, { entity, actor: "controls", action: "escalate", traceId, detail: `${vendor.name}: bank-detail change needs the controller's callback decision` });
    // Searchable at once, so Ask Auditor can explain the hold before the controller has decided.
    await ctx.scheduler.runAfter(0, internal.retrieval.indexTrace, { entity, traceId, effectiveDate: await currentPeriodEnd(ctx, entity) });
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
    if (traceId) await ctx.scheduler.runAfter(0, internal.retrieval.indexTrace, { entity, traceId, effectiveDate: await currentPeriodEnd(ctx, entity) });
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

/** Add a real public document as a citable source (Hyphenate add-on). Fetch it outside Convex (context.dev
 *  Scrape), pass the cleaned text here; it is stored with its URL and date and indexed into Moss "policy". */
export const addPublicSource = mutation({
  args: { entity: v.string(), sourceId: v.string(), title: v.string(), url: v.string(), publisher: v.string(), text: v.string(), effectiveDate: v.string() },
  returns: v.object({ sourceId: v.string(), chars: v.number() }),
  handler: async (ctx, a) => {
    if (!/^pub-[a-z0-9-]+$/.test(a.sourceId)) throw new Error("sourceId must look like pub-<slug>");
    if (!/^https?:\/\//.test(a.url)) throw new Error("url must be http(s)");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.effectiveDate)) throw new Error("effectiveDate must be YYYY-MM-DD");
    const text = a.text.replace(/\s+\n/g, "\n").trim().slice(0, 20000);
    if (text.length < 200) throw new Error("text too short to be a source");
    const existing = await ctx.db.query("publicSources").withIndex("by_entity_sourceId", (q) => q.eq("entity", a.entity).eq("sourceId", a.sourceId)).unique();
    const row = { entity: a.entity, sourceId: a.sourceId, title: a.title, url: a.url, publisher: a.publisher, text, effectiveDate: a.effectiveDate, fetchedAt: Date.now() };
    if (existing) await ctx.db.replace("publicSources", existing._id, row);
    else await ctx.db.insert("publicSources", row);
    await audit(ctx, { entity: a.entity, actor: "human", action: "public_source.add", detail: `${a.sourceId} ${a.url} (${text.length} chars)` });
    await ctx.scheduler.runAfter(0, internal.retrieval.index, {
      collection: "policy",
      id: a.sourceId,
      text,
      meta: { entity: a.entity, effectiveDate: a.effectiveDate, sourceType: "public", title: a.title, url: a.url, publisher: a.publisher },
    });
    return { sourceId: a.sourceId, chars: text.length };
  },
});
