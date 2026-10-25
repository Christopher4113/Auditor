// Interface 2 (B <-> C): table types. Both groups import, neither forks.
// Fourteen tables: the thirteen in the design doc (accounts, periods, bankTransactions, journalEntries,
// contracts, breaks, proposals, decisions, auditLog, answerKey, policyPacks, fxRates, corrections)
// plus vendors (vendor master with bank-account last4 and crsTestIdentity; break 5 and changeVendorBank need it).
// Every table carries `entity` (demo: "eo-festival-nyc"). `period` is the key "YYYY-MM", shared across tables.
// Money is integer cents. Dates are "YYYY-MM-DD". Bank amounts are signed: positive = money in.
//
// Who writes what: the agent writes only breaks and proposals; the controls engine and the human write
// decisions; journalEntries gains rows only through ledger.postEntry; auditLog is append-only.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const vIdentity = v.union(v.literal("agent"), v.literal("controls"), v.literal("human"));
export const vActor = v.union(vIdentity, v.literal("workflow"), v.literal("seed"), v.literal("inject"));

export const vLine = v.object({
  account: v.string(), // chart-of-accounts code, e.g. "1000"
  debit: v.number(), // cents
  credit: v.number(), // cents
  memo: v.optional(v.string()),
});

// Interface 4: citation cards render `text` verbatim, never paraphrased.
export const vCitation = v.object({
  sourceType: v.union(v.literal("policy"), v.literal("contract"), v.literal("decision"), v.literal("correction")),
  sourceId: v.string(), // "policy-5.1", "apex-9.4", "D-0417", "C-0012"
  text: v.string(),
  score: v.number(),
});

export const vClause = v.object({ id: v.string(), number: v.optional(v.string()), text: v.string(), effectiveDate: v.optional(v.string()) });

// A3 evidence. Bank changes, invoices and service schedules remain source
// documents; they are never disguised as settled bank transactions.
export const vSourceDocument = v.object({
  id: v.string(), entity: v.string(), period: v.string(), date: v.string(), kind: v.string(),
  vendorId: v.string(), contractId: v.string(), title: v.string(), text: v.string(),
  amount: v.union(v.number(), v.null()), reference: v.union(v.string(), v.null()),
});

export const vRuleResult = v.object({
  rule: v.string(), // "balance", "citation", "threshold", "bank_detail_change", "period_lock", "revision_cap", "precedent", "correction"
  kind: v.union(v.literal("preventive"), v.literal("detective"), v.literal("enabling")),
  passed: v.boolean(),
  detail: v.optional(v.string()),
});

export const vPeriodStatus = v.union(v.literal("open"), v.literal("closing"), v.literal("signed"));
// Rule 8.2 matches a new proposal against a human-decided precedent on this scope (same shape as tools.ts approve).
export const vPrecedentScope = v.object({ breakKind: v.string(), policyClause: v.optional(v.string()), counterparty: v.optional(v.string()) });
export const vProposalStatus = v.union(
  v.literal("under_review"),
  v.literal("posted"),
  v.literal("escalated"),
  v.literal("failed_rule"),
  v.literal("approved"),
  v.literal("rejected"),
);
// What a reviewer decided. "posted" = every rule passed, the Workflow calls postEntry next.
export const vOutcome = v.union(
  v.literal("posted"),
  v.literal("escalated"),
  v.literal("returned"),
  v.literal("approved"),
  v.literal("rejected"),
);

const entity = { entity: v.string() };
const scoped = { entity: v.string(), period: v.string() };

export default defineSchema({
  accounts: defineTable({
    ...entity,
    code: v.string(),
    name: v.string(),
    type: v.union(v.literal("asset"), v.literal("liability"), v.literal("equity"), v.literal("revenue"), v.literal("expense")),
  }).index("by_entity_code", ["entity", "code"]),

  periods: defineTable({
    ...scoped,
    start: v.string(),
    end: v.string(),
    status: vPeriodStatus,
    closeWorkflowId: v.optional(v.string()),
    prepared: v.optional(v.object({ at: v.number(), unmatched: v.number(), openBreaks: v.number() })), // scheduled advance (C4)
    signedAt: v.optional(v.number()),
    closeSummary: v.optional(v.object({ entriesPosted: v.number(), openItemsCarried: v.number(), debits: v.number(), credits: v.number() })),
  }).index("by_entity_period", ["entity", "period"]),

  bankTransactions: defineTable({
    ...scoped,
    txnId: v.string(), // "BT-0231"
    date: v.string(),
    amount: v.number(),
    counterparty: v.string(),
    memo: v.string(),
    reference: v.optional(v.string()), // invoice / payout reference, the code matcher keys on it
    vendorId: v.optional(v.string()), // vendors.vendorId; null on Stripe receipts
    source: v.union(v.literal("bank"), v.literal("stripe")),
    stripe: v.optional(v.object({ gross: v.number(), fees: v.number(), chargeCount: v.number() })),
    status: v.union(v.literal("unmatched"), v.literal("matched"), v.literal("flagged")),
    matchedEntryId: v.optional(v.id("journalEntries")),
    plantedBreak: v.optional(v.number()), // 1-6 from the answer key; never shown to the agent
    traceId: v.optional(v.string()), // correlation id for one unit of work; minted at seed/ingest, inherited downstream
  })
    .index("by_entity_period_status", ["entity", "period", "status"])
    .index("by_entity_txnId", ["entity", "txnId"]),

  journalEntries: defineTable({
    ...scoped,
    entryId: v.string(), // "JE-P-BT-0231-r1"
    date: v.string(),
    lines: v.array(vLine),
    memo: v.string(),
    source: v.union(v.literal("opening"), v.literal("import"), v.literal("post_entry")),
    postedBy: vActor,
    reference: v.optional(v.string()),
    counterparty: v.optional(v.string()),
    vendorId: v.optional(v.string()),
    txnId: v.optional(v.string()),
    proposalId: v.optional(v.id("proposals")),
    traceId: v.optional(v.string()),
  }).index("by_entity_period", ["entity", "period"]),

  contracts: defineTable({
    ...entity,
    contractId: v.string(), // "contract-apex"
    vendorId: v.optional(v.string()),
    counterparty: v.string(), // vendor name
    title: v.string(),
    clauses: v.array(vClause), // chunked into Moss; amendments append a clause
    documents: v.optional(v.array(vSourceDocument)),
  }).index("by_entity_contractId", ["entity", "contractId"]),

  vendors: defineTable({
    ...entity,
    vendorId: v.string(),
    name: v.string(),
    bankAccountLast4: v.string(),
    crsTestIdentity: v.optional(v.string()), // absent = not configured; verify_payee fails closed
    paymentsHeld: v.boolean(), // rule 4.3
    contractId: v.optional(v.string()),
    bankChange: v.optional(v.object({ at: v.number(), previousLast4: v.string(), newLast4: v.string(), source: v.string(), traceId: v.string() })),
    verification: v.optional(v.object({ at: v.number(), identityMatch: v.boolean(), fraudFlags: v.array(v.string()), available: v.boolean(), report: v.optional(v.any()) })), // verify_payee result; report = CRS identity/criminal/fraud/public-records summary (A6)
  }).index("by_entity_vendorId", ["entity", "vendorId"]),

  // The last loaded seed, so resetAll can wipe and reseed from inside Convex (C5).
  seedFiles: defineTable({
    ...entity,
    dataset: v.string(),
    json: v.string(),
    savedAt: v.number(),
  }).index("by_entity", ["entity"]),

  breaks: defineTable({
    ...scoped,
    breakId: v.string(), // "B-BT-0231"
    bankTransactionId: v.optional(v.id("bankTransactions")), // evidence-only cases have no settled cash movement
    sourceDocumentIds: v.optional(v.array(v.string())), // authoritative raw evidence IDs, never scoring case IDs
    vendorId: v.optional(v.string()),
    kind: v.string(), // "unmatched", "duplicate_invoice", "deposit_shortfall", ...
    description: v.string(),
    status: v.union(v.literal("open"), v.literal("proposed"), v.literal("resolved"), v.literal("escalated")),
    planted: v.optional(v.number()),
    traceId: v.optional(v.string()),
  })
    .index("by_entity_period", ["entity", "period"])
    .index("by_bankTransaction", ["bankTransactionId"]),

  proposals: defineTable({
    ...scoped,
    proposalId: v.string(), // "P-BT-0231-r1"
    breakId: v.id("breaks"),
    lines: v.array(vLine),
    reason: v.string(),
    citations: v.array(vCitation), // retrieved before proposing; the engine checks them
    status: vProposalStatus,
    revision: v.number(), // 1-based; the revision cap escalates the third
    revisionOf: v.optional(v.id("proposals")),
    discardedFirstRead: v.optional(v.string()),
    correctionsApplied: v.array(v.string()), // correction ids the agent addressed
    proposedBy: vActor,
    traceId: v.optional(v.string()),
  })
    .index("by_entity_period", ["entity", "period"])
    .index("by_break", ["breakId"])
    .index("by_entity_proposalId", ["entity", "proposalId"]),

  decisions: defineTable({
    ...scoped,
    decisionId: v.string(), // "D-P-BT-0231-r1"
    proposalId: v.id("proposals"),
    reviewer: vIdentity, // "controls" or "human"
    outcome: vOutcome,
    reason: v.string(),
    rulesRun: v.array(vRuleResult),
    citations: v.array(vCitation),
    precedentScope: v.optional(vPrecedentScope), // set by human approve; rule 8.2 matches on it
    instruction: v.optional(v.string()), // human reject carries one
    latencyMs: v.optional(v.number()),
    entryId: v.optional(v.id("journalEntries")),
    traceId: v.optional(v.string()),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_entity_period", ["entity", "period"]),

  auditLog: defineTable({
    entity: v.string(),
    period: v.optional(v.string()),
    actor: vActor,
    action: v.string(), // tool or rule name, e.g. "propose_entry", "post_entry.denied", "rule.threshold"
    proposalId: v.optional(v.id("proposals")),
    decisionId: v.optional(v.id("decisions")),
    entryId: v.optional(v.id("journalEntries")),
    breakId: v.optional(v.id("breaks")),
    bankTransactionId: v.optional(v.id("bankTransactions")),
    traceId: v.optional(v.string()), // resolved by audit() from any id above when not passed
    detail: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_entity_period", ["entity", "period"])
    .index("by_proposal", ["proposalId"])
    .index("by_entity_traceId", ["entity", "traceId"]),

  answerKey: defineTable({
    ...scoped,
    breakNumber: v.number(),
    title: v.string(),
    txnId: v.string(), // the planted bank transaction
    expectedKind: v.string(),
    expectedLines: v.array(vLine),
    caseId: v.optional(v.string()),
    expectedAction: v.optional(v.string()),
    expectedEscalation: v.optional(v.boolean()),
    pnlImpact: v.optional(v.number()),
    citationIds: v.optional(v.array(v.string())),
    sourceDocumentIds: v.optional(v.array(v.string())),
    vendorId: v.optional(v.string()),
    dependsOn: v.optional(v.array(v.string())),
    result: v.optional(v.object({ caught: v.boolean(), correct: v.boolean(), scoredAt: v.number() })),
  }).index("by_entity_period", ["entity", "period"]),

  policyPacks: defineTable({
    ...entity,
    jurisdiction: v.string(), // "US", "UK"
    currency: v.string(), // "USD", "GBP"
    thresholdCents: v.number(), // rule 8.0 materiality, P&L impact
    clauses: v.array(vClause),
  }).index("by_entity", ["entity"]),

  fxRates: defineTable({
    ...scoped,
    currency: v.string(),
    rateToUsd: v.number(),
  }).index("by_entity_period", ["entity", "period"]),

  corrections: defineTable({
    ...scoped,
    correctionId: v.string(), // "C-0012"
    kind: v.union(v.literal("human_rejection"), v.literal("rule_failure")),
    scope: v.string(), // what it applies to, e.g. "duplicate invoice, same vendor"
    instruction: v.string(),
    rule: v.optional(v.string()),
    proposalId: v.optional(v.id("proposals")),
    decisionId: v.optional(v.id("decisions")),
    appliedBy: v.array(v.string()), // proposal ids that addressed it
    traceId: v.optional(v.string()),
  }).index("by_entity_period", ["entity", "period"]),
});
