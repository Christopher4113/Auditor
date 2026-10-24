// Interface 2 (B <-> C): Zod schemas for the tools and the three identities.
// Written together Friday 7-8 pm. Segregation of duties lives in these lists, not in prompts:
// the Workflow runs each step under its identity and every tool reads the caller's identity.
// post_entry refuses the proposer's identity regardless of who calls it (policy 8.1), server-side.

import { z } from "zod";

export const IDENTITIES = ["agent", "controls", "human"] as const;
export type Identity = (typeof IDENTITIES)[number];

// Brief v2, "Controls engine and permissions". The Permissions drawer renders these three lists.
export const TOOLS = {
  // Staff accountant (one Claude Sonnet agent; Opus by env switch). Cannot post, approve or change policy.
  agent: [
    "fetch_bank_transactions",
    "fetch_ledger",
    "fetch_contract",
    "search_precedent",
    "search_policy",
    "search_corrections",
    "match_transaction",
    "flag_break",
    "propose_entry", // (lines, reason, citations)
    "request_approval",
  ],
  // Controls engine (TypeScript rules, no model). Cannot propose or override the human.
  controls: ["verify_payee", "escalate", "post_entry", "index_decision"],
  // Human controller. Cannot touch anything it did not review.
  human: ["approve", "reject", "sign_period"], // reject carries an instruction
} as const satisfies Record<Identity, readonly string[]>;

export type ToolName = (typeof TOOLS)[Identity][number];

// ── Enums ──────────────────────────────────────────────────────────────────────

export const BREAK_KINDS = [
  "stripe_fee_netting",
  "duplicate_payable",
  "deposit_shortfall",
  "contract_amendment",
  "bank_detail_change",
  "missing_accrual",
  "other",
] as const;
export type BreakKind = (typeof BREAK_KINDS)[number];

export const CONTROL_EXCEPTION_KINDS = [
  "duplicate",
  "fraud_flag",
  "manual_override",
  "threshold_exceeded",
  "other",
] as const;
export type ControlExceptionKind = (typeof CONTROL_EXCEPTION_KINDS)[number];

export const CITATION_SOURCE_TYPES = [
  "policy",
  "contract",
  "decision",
  "correction",
] as const;
export type CitationSourceType = (typeof CITATION_SOURCE_TYPES)[number];

export const GOVERNING_SOURCES = [
  "bank",
  "ledger",
  "contract",
  "policy",
  "precedent",
] as const;
export type GoverningSource = (typeof GOVERNING_SOURCES)[number];

// ── Shared sub-schemas ─────────────────────────────────────────────────────────

const LineSchema = z
  .object({
    account: z
      .string()
      .regex(/^[1-5]\d{3}$/, "account must be a 4-digit code 1000–5999")
      .describe("Chart of accounts code (e.g. 1000, 5160)"),
    debitCents: z
      .number()
      .int("debitCents must be an integer")
      .min(0)
      .describe("Debit amount in integer cents; 0 for credit-side lines"),
    creditCents: z
      .number()
      .int("creditCents must be an integer")
      .min(0)
      .describe("Credit amount in integer cents; 0 for debit-side lines"),
    memo: z.string().optional().describe("Optional line memo"),
  })
  .describe("One journal line; each line is one-sided (debit xor credit)");

const CitationSchema = z
  .object({
    sourceType: z
      .enum(CITATION_SOURCE_TYPES)
      .describe("Kind of source: policy, contract, decision, or correction"),
    sourceId: z.string().describe("Source identifier (e.g. policy-5.1, D-0417)"),
    text: z
      .string()
      .min(1)
      .describe("Verbatim excerpt from the source; never paraphrased (policy 9.0)"),
  })
  .describe("One verbatim citation");

const GoverningSourceSchema = z
  .object({
    source: z
      .enum(GOVERNING_SOURCES)
      .describe("Which system of record governs this entry (policy 2.0)"),
    why: z
      .string()
      .min(1)
      .describe("Reason this source governs; required by policy 2.0"),
  })
  .describe("Governing source declaration (policy 2.0: state which source and why)");

// ── TOOL_ARGS ─────────────────────────────────────────────────────────────────
// Zod schemas for every tool's arguments. Shape-only validation; balance and
// policy rules are the controls engine's responsibility.

export const TOOL_ARGS = {
  // ── Agent tools ──────────────────────────────────────────────────────────────

  fetch_bank_transactions: z
    .object({
      entity: z.string().describe("Entity identifier (e.g. eo-festival-nyc)"),
      period: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .describe("Period in YYYY-MM format"),
      cursor: z.string().optional().describe("Pagination cursor from prior call"),
    })
    .describe("Fetch unmatched bank transactions for the entity and period"),

  fetch_ledger: z
    .object({
      entity: z.string().describe("Entity identifier"),
      period: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .describe("Period in YYYY-MM format"),
      account: z.string().optional().describe("Filter to a specific account code"),
    })
    .describe("Fetch journal entries from the ledger for the entity and period"),

  fetch_contract: z
    .object({
      entity: z.string().describe("Entity identifier"),
      counterparty: z.string().describe("Vendor or artist name"),
    })
    .describe("Fetch the active contract for a counterparty"),

  search_precedent: z
    .object({
      query: z.string().min(1).describe("Natural-language search query"),
      k: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe("Maximum results (default 3, max 5)"),
    })
    .describe("Retrieve past human-decided precedents matching the query via Moss"),

  search_policy: z
    .object({
      query: z.string().min(1).describe("Natural-language search query"),
      k: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe("Maximum results (default 3, max 5)"),
    })
    .describe("Retrieve policy clauses matching the query via Moss"),

  search_corrections: z
    .object({
      query: z.string().min(1).describe("Natural-language search query"),
      k: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe("Maximum results (default 3, max 5)"),
    })
    .describe("Retrieve past corrections the agent applied, matching the query via Moss"),

  match_transaction: z
    .object({
      entity: z.string().describe("Entity identifier"),
      bankTransactionId: z.string().describe("Bank transaction to match"),
    })
    .describe("Attempt deterministic code match for a bank transaction"),

  flag_break: z
    .object({
      entity: z.string().describe("Entity identifier"),
      period: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .describe("Period in YYYY-MM format"),
      kind: z.enum(BREAK_KINDS).describe("Break category"),
      bankTransactionId: z
        .string()
        .optional()
        .describe("Related bank transaction ID if applicable"),
      counterparty: z.string().optional().describe("Related counterparty name if known"),
      note: z.string().min(1).describe("Free-text description of the break"),
    })
    .describe("Flag an unreconciled transaction as a named break"),

  propose_entry: z
    .object({
      breakId: z.string().describe("Break this proposal addresses"),
      entryDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Journal entry date in YYYY-MM-DD format"),
      lines: z
        .array(LineSchema)
        .min(2, "at least 2 lines required for a balanced entry")
        .describe("Journal lines; must balance (sum debits = sum credits, checked by engine)"),
      reason: z
        .string()
        .min(1)
        .describe("Plain-English reason for the entry, citing the governing source"),
      governingSource: GoverningSourceSchema,
      citations: z
        .array(CitationSchema)
        .min(1, "at least 1 citation required (policy 9.0)")
        .describe("Verbatim citations from policy, contracts, decisions, or corrections"),
      correctionsApplied: z
        .array(z.string())
        .describe("IDs of corrections applied from prior human feedback"),
      firstRead: z
        .string()
        .optional()
        .describe("The agent's first (discarded) interpretation before retrieving"),
      revisionOf: z
        .string()
        .optional()
        .describe("Proposal code this is a revision of (e.g. P-0612)"),
    })
    .describe(
      "Propose a balanced journal entry for human or engine review; never posts directly"
    ),

  request_approval: z
    .object({
      entity: z.string().describe("Entity identifier"),
      breakId: z.string().describe("Break requiring human judgment"),
      question: z
        .string()
        .min(1)
        .describe("Specific question for the human controller"),
      proposalId: z
        .string()
        .optional()
        .describe("Proposal already submitted, if any"),
    })
    .describe("Escalate to the human controller with a specific question"),

  // ── Controls tools ────────────────────────────────────────────────────────────

  verify_payee: z
    .object({
      entity: z.string().describe("Entity identifier"),
      vendorId: z.string().describe("Vendor to verify via CRS"),
    })
    .describe("Call CRS to verify payee identity before releasing a held payment (policy 4.3)"),

  escalate: z
    .object({
      entity: z.string().describe("Entity identifier"),
      proposalId: z.string().describe("Proposal to escalate"),
      ruleId: z.string().describe("Rule that triggered escalation"),
      detail: z.string().min(1).describe("Reason for escalation"),
    })
    .describe("Escalate a proposal to the human controller"),

  post_entry: z
    .object({
      proposalId: z.string().describe("Proposal to post to the ledger"),
      actor: z
        .enum(["controls", "human"])
        .describe(
          "Identity posting the entry; agent is never allowed here (enforced server-side)"
        ),
    })
    .describe(
      "Post an approved proposal to the journal; agent identity is rejected server-side (invariant 1)"
    ),

  index_decision: z
    .object({
      decisionId: z.string().describe("Decision to index into Moss for future retrieval"),
    })
    .describe("Schedule async indexing of a decision into the Moss retrieval store"),

  // ── Human tools ───────────────────────────────────────────────────────────────

  approve: z
    .object({
      proposalId: z.string().describe("Proposal to approve"),
      note: z.string().optional().describe("Optional approval note"),
      precedentScope: z
        .object({
          breakKind: z.enum(BREAK_KINDS),
          policyClause: z.string().optional(),
          counterparty: z.string().optional(),
        })
        .optional()
        .describe("Scope of precedent this approval sets (policy 8.2)"),
    })
    .describe("Human approves a proposal; proposer cannot approve their own (policy 8.1)"),

  reject: z
    .object({
      proposalId: z.string().describe("Proposal to reject"),
      instruction: z
        .string()
        .min(1)
        .describe("Instruction to the agent on how to revise"),
    })
    .describe("Human rejects a proposal with a revision instruction"),

  sign_period: z
    .object({
      entity: z.string().describe("Entity identifier"),
      period: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .describe("Period to lock in YYYY-MM format"),
    })
    .describe(
      "Controller signs and locks a period; locked periods reject new entries (policy 1.0, 3.0)"
    ),
} as const;

export type ToolArgs = typeof TOOL_ARGS;

// ── Permission helpers ────────────────────────────────────────────────────────

export class PermissionDenied extends Error {
  constructor(
    public readonly identity: Identity,
    public readonly tool: string
  ) {
    super(`identity "${identity}" is not permitted to call "${tool}"`);
    this.name = "PermissionDenied";
  }
}

/** Returns true if the given identity may call the given tool. */
export function canCall(identity: Identity, tool: string): boolean {
  return (TOOLS[identity] as readonly string[]).includes(tool);
}

/** Throws PermissionDenied if the identity may not call the tool. */
export function assertCanCall(identity: Identity, tool: string): void {
  if (!canCall(identity, tool)) {
    throw new PermissionDenied(identity, tool);
  }
}

/**
 * Throws PermissionDenied if actor is the same identity as proposer (policy 8.1).
 * Prevents self-approval: no one approves what they proposed.
 */
export function assertNotProposer(actor: Identity, proposer: Identity): void {
  if (actor === proposer) {
    throw new PermissionDenied(
      actor,
      "approve/post_entry (actor cannot approve their own proposal — policy 8.1)"
    );
  }
}

/** Returns the full tool catalog for rendering the Permissions drawer. */
export function toolCatalog(): typeof TOOLS {
  return TOOLS;
}
