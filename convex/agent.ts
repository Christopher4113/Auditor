// Lane B: staff accountant. B3: code matcher (reconcile) + Sonnet agent (propose as internalAction).
// C handoff: close.ts line 24 must change step.runMutation → step.runAction for internal.agent.propose.
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { audit } from "./audit";
import { vIdentity, vCitation, vLine, vClause, vSourceDocument } from "./schema";
import { BREAK_KINDS, type BreakKind } from "./tools";
import { searchRetrieval } from "./retrievalClient";
import { matchBatch, type BankTxn, type LedgerEntry } from "./agent/matcher";
import { SYSTEM_PROMPT } from "./agent/instructions";
import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

// ── Reconcile ──────────────────────────────────────────────────────────────────

/** Code matcher: closes ~85% of transactions, flags the rest as breaks. */
export const reconcile = internalMutation({
  args: {
    caller: vIdentity,
    entity: v.string(),
    period: v.string(),
    bankTransactionIds: v.array(v.id("bankTransactions")),
  },
  returns: v.array(v.id("breaks")),
  handler: async (ctx, { caller, entity, period, bankTransactionIds }) => {
    const txnDocs = (await Promise.all(bankTransactionIds.map((id) => ctx.db.get(id)))).filter(
      (t) => t !== null && t.status === "unmatched",
    );

    const txns: BankTxn[] = txnDocs.map((t) => ({
      _id: t!._id as string,
      txnId: t!.txnId,
      date: t!.date,
      amount: t!.amount,
      counterparty: t!.counterparty,
      status: t!.status,
    }));

    const entryDocs = await ctx.db
      .query("journalEntries")
      .withIndex("by_entity_period", (q) => q.eq("entity", entity).eq("period", period))
      .take(500);
    const entries: LedgerEntry[] = entryDocs.map((e) => ({
      _id: e._id as string,
      entryId: e.entryId,
      date: e.date,
      lines: e.lines,
      memo: e.memo,
      proposalId: e.proposalId ?? undefined,
    }));

    const { matched, unmatchedIds } = matchBatch(txns, entries);

    for (const docId of matched) {
      await ctx.db.patch(docId as Id<"bankTransactions">, { status: "matched" });
      await audit(ctx, { entity, period, actor: caller, action: "match.close", detail: docId });
    }

    const breakIds: Id<"breaks">[] = [];
    for (const docId of unmatchedIds) {
      const txn = txnDocs.find((t) => t!._id === docId);
      if (!txn) continue;

      // Classify by what we can determine from transaction metadata alone.
      // The agent refines further via flag_break if it has more context.
      let kind: BreakKind = "other";
      if (txn.source === "stripe") {
        kind = "stripe_fee_netting";
      } else if (txn.vendorId) {
        const vendor = await ctx.db
          .query("vendors")
          .withIndex("by_entity_vendorId", (q) => q.eq("entity", entity).eq("vendorId", txn.vendorId!))
          .unique();
        if (vendor?.paymentsHeld) kind = "bank_detail_change";
      }

      const breakId = await ctx.db.insert("breaks", {
        entity,
        period,
        breakId: `B-${txn.txnId}`,
        bankTransactionId: txn._id,
        kind,
        description: `${txn.counterparty}: ${txn.memo}`,
        status: "open",
        planted: txn.plantedBreak,
        traceId: txn.traceId,
      });
      await ctx.db.patch(txn._id, { status: "flagged" });
      await audit(ctx, {
        entity,
        period,
        actor: caller,
        action: "flag_break",
        bankTransactionId: txn._id,
        breakId,
        detail: `B-${txn.txnId} ${txn.amount} (${kind})`,
      });
      breakIds.push(breakId);
    }
    return breakIds;
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────────

export const loadBreakCtx = internalQuery({
  args: { breakId: v.id("breaks") },
  returns: v.union(
    v.object({
      brk: v.object({
        _id: v.id("breaks"),
        entity: v.string(),
        period: v.string(),
        breakId: v.string(),
        kind: v.string(),
        description: v.string(),
      }),
      txn: v.object({
        _id: v.id("bankTransactions"),
        txnId: v.string(),
        date: v.string(),
        amount: v.number(),
        counterparty: v.string(),
        memo: v.string(),
      }),
    }),
    v.null(),
  ),
  handler: async (ctx, { breakId }) => {
    const brk = await ctx.db.get(breakId);
    if (!brk) return null;
    const txn = await ctx.db.get(brk.bankTransactionId);
    if (!txn) return null;
    return {
      brk: {
        _id: brk._id,
        entity: brk.entity,
        period: brk.period,
        breakId: brk.breakId,
        kind: brk.kind,
        description: brk.description,
      },
      txn: {
        _id: txn._id,
        txnId: txn.txnId,
        date: txn.date,
        amount: txn.amount,
        counterparty: txn.counterparty,
        memo: txn.memo,
      },
    };
  },
});

export const saveProposal = internalMutation({
  args: {
    entity: v.string(),
    period: v.string(),
    breakId: v.id("breaks"),
    txnId: v.string(),
    revision: v.number(),
    lines: v.array(vLine),
    reason: v.string(),
    citations: v.array(vCitation),
    correctionsApplied: v.array(v.string()),
    discardedFirstRead: v.optional(v.string()),
  },
  returns: v.id("proposals"),
  handler: async (ctx, { entity, period, breakId, txnId, revision: _requested, ...rest }) => {
    // After a human reject the break reopens; the next proposal is a revision of the last one (C3 loop).
    const prior = await ctx.db.query("proposals").withIndex("by_break", (q) => q.eq("breakId", breakId)).order("desc").take(10);
    const revision = prior.length + 1;
    const proposalId = await ctx.db.insert("proposals", {
      entity,
      period,
      breakId,
      proposalId: `P-${txnId}-r${revision}`,
      revision,
      revisionOf: prior[0]?._id,
      status: "under_review",
      proposedBy: "agent",
      ...rest,
    });
    await ctx.db.patch("breaks", breakId, { status: "proposed" });
    await audit(ctx, { entity, period, actor: "agent", action: "propose_entry", proposalId });
    return proposalId;
  },
});

export const escalateBreak = internalMutation({
  args: {
    entity: v.string(),
    period: v.string(),
    breakId: v.id("breaks"),
    question: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { entity, period, breakId, question }) => {
    const brk = await ctx.db.get(breakId);
    await ctx.db.patch("breaks", breakId, { status: "escalated" });
    await audit(ctx, {
      entity,
      period,
      actor: "agent",
      action: "request_approval",
      breakId,
      bankTransactionId: brk?.bankTransactionId,
      detail: question,
    });
    return null;
  },
});

/** Agent refines a break's kind after investigation (called by the flag_break tool). */
export const updateBreakKind = internalMutation({
  args: {
    breakId: v.id("breaks"),
    bankTransactionId: v.id("bankTransactions"),
    kind: v.string(),
    note: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { breakId, bankTransactionId, kind, note }) => {
    const brk = await ctx.db.get(breakId);
    if (!brk) return null;
    await ctx.db.patch("breaks", breakId, { kind });
    await audit(ctx, {
      entity: brk.entity,
      period: brk.period,
      actor: "agent",
      action: "flag_break.classify",
      breakId,
      bankTransactionId,
      detail: `${kind}: ${note}`,
    });
    return null;
  },
});

export const findContract = internalQuery({
  args: { entity: v.string(), counterparty: v.string(), asOf: v.optional(v.string()) },
  returns: v.union(
    v.array(
      v.object({
        contractId: v.string(),
        clauses: v.array(vClause),
        documents: v.optional(v.array(vSourceDocument)),
      }),
    ),
    v.null(),
  ),
  handler: async (ctx, { entity, counterparty, asOf }) => {
    const contracts = await ctx.db
      .query("contracts")
      .withIndex("by_entity_contractId", (q) => q.eq("entity", entity))
      .filter((q) => q.eq(q.field("counterparty"), counterparty))
      .take(3);
    if (!contracts.length) return null;
    return contracts.map((c) => ({ contractId: c.contractId,
      clauses: c.clauses.filter((clause) => !asOf || !clause.effectiveDate || clause.effectiveDate <= asOf),
      documents: c.documents?.filter((doc) => !asOf || doc.date <= asOf),
    }));
  },
});

/** Raw imported books for investigation; never reads answerKey or planted flags. */
export const readLedger = internalQuery({
  args: { entity: v.string(), period: v.string(), account: v.optional(v.string()), counterparty: v.optional(v.string()) },
  handler: async (ctx, { entity, period, account, counterparty }) => {
    const entries = await ctx.db.query("journalEntries")
      .withIndex("by_entity_period", (q) => q.eq("entity", entity).lte("period", period)).take(1000);
    return entries.filter((entry) => (!account || entry.lines.some((line) => line.account === account))
      && (!counterparty || entry.counterparty === counterparty || entry.memo.toLowerCase().includes(counterparty.toLowerCase())));
  },
});

// ── Retrieval ─────────────────────────────────────────────────────────────────

async function queryRetrieval(
  collection: string,
  query: string,
  k: number,
  scope: { entity: string; asOf: string; traceId?: string },
): Promise<Array<{ sourceId: string; text: string; score: number }>> {
  const url = process.env.RETRIEVAL_URL;
  if (!url) return [];
  try {
    const { traceId, ...filter } = scope;
    const hits = await searchRetrieval(url, { collection, text: query, k, ...filter }, process.env.RETRIEVAL_API_KEY, traceId);
    return hits.map((h) => ({ sourceId: h.id, text: h.text, score: h.score }));
  } catch {
    return [];
  }
}

// ── Propose ────────────────────────────────────────────────────────────────────

/** Staff accountant agent: investigates one break and proposes a journal entry. */
export const propose = internalAction({
  args: { caller: vIdentity, breakId: v.id("breaks") },
  returns: v.id("proposals"),
  handler: async (ctx, { breakId }) => {
    const breakCtx = await (ctx.runQuery(internal.agent.loadBreakCtx, { breakId }) as Promise<{
      brk: { _id: Id<"breaks">; entity: string; period: string; breakId: string; kind: string; description: string; traceId?: string };
      txn: { _id: Id<"bankTransactions">; txnId: string; date: string; amount: number; counterparty: string; memo: string };
    } | null>);
    if (!breakCtx) throw new Error(`break ${breakId} not found`);
    const { brk, txn } = breakCtx;
    const [year, month] = brk.period.split("-").map(Number);
    const asOf = `${brk.period}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
    const retrievalScope = { entity: brk.entity, asOf, traceId: brk.traceId };
    const retrievedScores = new Map<string, number>();
    const retrieve = async (collection: string, text: string, k: number) => {
      const hits = await queryRetrieval(collection, text, k, retrievalScope);
      for (const hit of hits) retrievedScores.set(hit.sourceId, hit.score);
      return hits;
    };

    let createdProposalId: Id<"proposals"> | null = null;
    let escalated = false;

    const amtDollars = (Math.abs(txn.amount) / 100).toFixed(2);

    // Pre-retrieve relevant policy for this break kind so the agent has citations available from step 1.
    const KIND_QUERIES: Record<string, string> = {
      stripe_fee_netting: "ticket revenue deferred fee expensed payout",
      deposit_shortfall: "deposit non-recoverable fee contract",
      duplicate_payable: "duplicate invoice control",
      bank_detail_change: "bank detail change verification hold",
      missing_accrual: "accrue period of service reverse invoice",
      contract_amendment: "amendment catch-up ratable recognition",
      other: "governing source which system bank ledger contract",
    };
    const kindQuery = KIND_QUERIES[brk.kind] ?? KIND_QUERIES.other;
    const preloadedPolicy = await retrieve("policy", kindQuery, 3);
    const preloadedPrecedents = await retrieve("decisions", kindQuery, 2);
    const preloadHints =
      preloadedPolicy.length > 0 || preloadedPrecedents.length > 0
        ? [
            "",
            "Pre-loaded context (cite verbatim if you use these):",
            ...preloadedPolicy.map((h) => `  [policy] ${h.sourceId}: "${h.text}"`),
            ...preloadedPrecedents.map((h) => `  [decision] ${h.sourceId}: "${h.text}"`),
          ].join("\n")
        : "";

    const userMsg = [
      `Break: ${brk.breakId} (${brk.kind})`,
      `Transaction: counterparty="${txn.counterparty}" | date=${txn.date} | amount=${txn.amount >= 0 ? "+" : "-"}$${amtDollars} | memo="${txn.memo}"`,
      `Entity: ${brk.entity} | Period: ${brk.period}`,
      preloadHints,
      "",
      "Follow the workflow in your instructions:",
      "1. Call search_precedent, search_policy, and search_corrections before proposing.",
      "2. Then call propose_entry with balanced lines and verbatim citations (required by policy 9.0).",
      "   OR call request_approval if you are genuinely uncertain about the treatment.",
    ].join("\n");

    await generateText({
      model: anthropic(process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5"),
      temperature: 0,
      system: SYSTEM_PROMPT,
      prompt: userMsg,
      stopWhen: stepCountIs(12),
      tools: {
        search_precedent: {
          description: "Retrieve past human-decided precedents matching the query via Moss",
          inputSchema: z.object({ query: z.string(), k: z.number().int().min(1).max(5).optional() }),
          execute: async ({ query, k }: { query: string; k?: number }) => {
            const hits = await retrieve("decisions", query, k ?? 3);
            return { hits };
          },
        },
        search_policy: {
          description: "Retrieve policy clauses matching the query via Moss",
          inputSchema: z.object({ query: z.string(), k: z.number().int().min(1).max(5).optional() }),
          execute: async ({ query, k }: { query: string; k?: number }) => {
            const hits = await retrieve("policy", query, k ?? 3);
            return { hits };
          },
        },
        search_corrections: {
          description: "Retrieve past corrections the agent applied, matching the query via Moss",
          inputSchema: z.object({ query: z.string(), k: z.number().int().min(1).max(5).optional() }),
          execute: async ({ query, k }: { query: string; k?: number }) => {
            const hits = await retrieve("corrections", query, k ?? 3);
            return { hits };
          },
        },
        fetch_contract: {
          description: "Fetch the active contract for a counterparty",
          inputSchema: z.object({ entity: z.string(), counterparty: z.string() }),
          execute: async ({ counterparty, ...rest }: { entity: string; counterparty: string }) => {
            const hits = await retrieve("contracts", counterparty, 3);
            const contracts = await (ctx.runQuery(internal.agent.findContract, {
              entity: brk.entity,
              counterparty,
              asOf,
            }) as Promise<Array<{ contractId: string; clauses: Array<{ id: string; text: string }> }> | null>);
            return { contract: contracts ?? null, hits };
          },
        },
        fetch_bank_transactions: {
          description: "Fetch unmatched bank transactions for the entity and period",
          inputSchema: z.object({ entity: z.string(), period: z.string(), cursor: z.string().optional() }),
          execute: async (_args: { entity: string; period: string; cursor?: string }) => ({
            message: "Use the break context in the task description; code matcher already ran.",
          }),
        },
        fetch_ledger: {
          description: "Fetch journal entries from the ledger for the entity and period",
          inputSchema: z.object({ entity: z.string(), period: z.string(), account: z.string().optional() }),
          execute: async (args: { entity: string; period: string; account?: string }) => ({
            entries: await ctx.runQuery(internal.agent.readLedger, {
              entity: brk.entity, period: brk.period, account: args.account, counterparty: txn.counterparty,
            }),
          }),
        },
        match_transaction: {
          description: "Attempt deterministic code match for a bank transaction",
          inputSchema: z.object({ entity: z.string(), bankTransactionId: z.string() }),
          execute: async (_args: { entity: string; bankTransactionId: string }) => ({
            message: "Code matcher already ran; this break was not closed deterministically.",
          }),
        },
        flag_break: {
          description: "Classify an already-flagged break by kind (deposit_shortfall, duplicate_payable, etc.). Call this before propose_entry when you have identified the break kind from context.",
          inputSchema: z.object({
            entity: z.string(),
            period: z.string(),
            kind: z.enum(BREAK_KINDS),
            note: z.string(),
            bankTransactionId: z.string().optional(),
            counterparty: z.string().optional(),
          }),
          execute: async (args: { entity: string; period: string; kind: string; note: string }) => {
            if (BREAK_KINDS.includes(args.kind as BreakKind)) {
              await ctx.runMutation(internal.agent.updateBreakKind, {
                breakId: brk._id,
                bankTransactionId: txn._id,
                kind: args.kind as BreakKind,
                note: args.note,
              });
            }
            return { message: `Break classified as ${args.kind}; proceed to propose_entry or request_approval.` };
          },
        },
        propose_entry: {
          description:
            "Propose a balanced journal entry for review; never posts directly. Requires at least 1 citation (policy 9.0).",
          inputSchema: z.object({
            breakId: z.string(),
            entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            lines: z
              .array(
                z.object({
                  account: z.string(),
                  debitCents: z.number().int().min(0),
                  creditCents: z.number().int().min(0),
                  memo: z.string().optional(),
                }),
              )
              .min(2),
            reason: z.string().min(1),
            governingSource: z.object({ source: z.string(), why: z.string() }),
            citations: z.array(z.object({ sourceType: z.string(), sourceId: z.string(), text: z.string() })).min(1),
            correctionsApplied: z.array(z.string()),
            firstRead: z.string().optional(),
            revisionOf: z.string().optional(),
          }),
          execute: async (args: {
            breakId: string;
            entryDate: string;
            lines: Array<{ account: string; debitCents: number; creditCents: number; memo?: string }>;
            reason: string;
            governingSource: { source: string; why: string };
            citations: Array<{ sourceType: string; sourceId: string; text: string }>;
            correctionsApplied: string[];
            firstRead?: string;
            revisionOf?: string;
          }) => {
            if (createdProposalId) return { error: "propose_entry already called for this break" };
            const lines = args.lines.map((l) => ({
              account: l.account,
              debit: l.debitCents,
              credit: l.creditCents,
              ...(l.memo ? { memo: l.memo } : {}),
            }));
            const citations = args.citations.map((c) => ({
              sourceType: c.sourceType as "policy" | "contract" | "decision" | "correction",
              sourceId: c.sourceId,
              text: c.text,
              score: retrievedScores.get(c.sourceId) ?? 0,
            }));
            const reason = `${args.reason} [governing: ${args.governingSource.source} — ${args.governingSource.why}]`;
            createdProposalId = await (ctx.runMutation(internal.agent.saveProposal, {
              entity: brk.entity,
              period: brk.period,
              breakId: brk._id,
              txnId: txn.txnId,
              revision: 1,
              lines,
              reason,
              citations,
              correctionsApplied: args.correctionsApplied,
              ...(args.firstRead ? { discardedFirstRead: args.firstRead } : {}),
            }) as Promise<Id<"proposals">>);
            return { proposalId: createdProposalId, status: "under_review" };
          },
        },
        request_approval: {
          description: "Escalate to the human controller with a specific question",
          inputSchema: z.object({
            entity: z.string(),
            breakId: z.string(),
            question: z.string().min(1),
            proposalId: z.string().optional(),
          }),
          execute: async ({ question }: { entity: string; breakId: string; question: string; proposalId?: string }) => {
            escalated = true;
            await ctx.runMutation(internal.agent.escalateBreak, {
              entity: brk.entity,
              period: brk.period,
              breakId: brk._id,
              question,
            });
            return { status: "escalated", message: "Human controller notified." };
          },
        },
      },
    });

    if (createdProposalId) return createdProposalId;

    // Agent didn't propose or escalate — create a stub and flag for human.
    if (!escalated) {
      await ctx.runMutation(internal.agent.escalateBreak, {
        entity: brk.entity,
        period: brk.period,
        breakId: brk._id,
        question: "Agent completed without proposing or escalating — needs human review.",
      });
    }

    const fallbackId = await (ctx.runMutation(internal.agent.saveProposal, {
      entity: brk.entity,
      period: brk.period,
      breakId: brk._id,
      txnId: txn.txnId,
      revision: 1,
      lines: [
        { account: "1000", debit: Math.abs(txn.amount), credit: 0 },
        { account: "1400", debit: 0, credit: Math.abs(txn.amount) },
      ],
      reason: "Fallback stub: agent did not call propose_entry; parked in 1400 for human review.",
      citations: [],
      correctionsApplied: [],
    }) as Promise<Id<"proposals">>);
    return fallbackId;
  },
});
