/**
 * Browser wire contracts mirrored from convex/api.ts and convex/schema.ts.
 * IDs remain strings here so importing a client contract never compiles backend code.
 * All monetary values in this file are integer USD cents, not display dollars.
 */
export type WireIdentity = "agent" | "controls" | "human";
export type WireActor = WireIdentity | "workflow" | "seed" | "inject";
export type WireProposalStatus =
  | "under_review"
  | "posted"
  | "escalated"
  | "failed_rule"
  | "approved"
  | "rejected";
export type WireOutcome =
  | "posted"
  | "escalated"
  | "returned"
  | "approved"
  | "rejected";
export type WireDoc = { _id: string; _creationTime: number };
export type EntityArgs = { entity: string };
export type EntityPeriodArgs = EntityArgs & { period: string };
export type WireLine = {
  account: string;
  debit: number;
  credit: number;
  memo?: string;
};
export type WireCitation = {
  sourceType: "policy" | "contract" | "decision" | "correction";
  sourceId: string;
  text: string;
  score: number;
};
export type WireRuleResult = {
  rule: string;
  kind: "preventive" | "detective" | "enabling";
  passed: boolean;
  detail?: string;
};
export type WireProposal = WireDoc &
  EntityPeriodArgs & {
    /** Human-readable proposal code. C3 approve/reject use this external code. */
    proposalId: string;
    /** Actual Convex break ID. getBreak uses this ID, not the break's display code. */
    breakId: string;
    lines: WireLine[];
    reason: string;
    citations: WireCitation[];
    status: WireProposalStatus;
    revision: number;
    revisionOf?: string;
    discardedFirstRead?: string;
    correctionsApplied: string[];
    proposedBy: WireActor;
    traceId?: string;
  };
export type WireBreak = WireDoc &
  EntityPeriodArgs & {
    breakId: string;
    bankTransactionId: string;
    kind: string;
    description: string;
    status: "open" | "proposed" | "resolved" | "escalated";
    planted?: number;
    traceId?: string;
  };
export type WireBankTransaction = WireDoc &
  EntityPeriodArgs & {
    txnId: string;
    date: string;
    amount: number;
    counterparty: string;
    memo: string;
    reference?: string;
    vendorId?: string;
    source: "bank" | "stripe";
    stripe?: { gross: number; fees: number; chargeCount: number };
    status: "unmatched" | "matched" | "flagged";
    matchedEntryId?: string;
    plantedBreak?: number;
    traceId?: string;
  };
export type WireVendor = WireDoc &
  EntityArgs & {
    vendorId: string;
    name: string;
    bankAccountLast4: string;
    crsTestIdentity?: string;
    paymentsHeld: boolean;
    contractId?: string;
  };
export type WireContract = WireDoc &
  EntityArgs & {
    contractId: string;
    vendorId?: string;
    counterparty: string;
    title: string;
    clauses: {
      id: string;
      number?: string;
      text: string;
      effectiveDate?: string;
    }[];
    documents?: WireSourceDocument[];
  };
export type WirePrecedentScope = {
  breakKind: string;
  policyClause?: string;
  counterparty?: string;
};
export type WireDecision = WireDoc &
  EntityPeriodArgs & {
    decisionId: string;
    proposalId: string;
    reviewer: WireIdentity;
    outcome: WireOutcome;
    reason: string;
    rulesRun: WireRuleResult[];
    citations: WireCitation[];
    precedentScope?: WirePrecedentScope;
    instruction?: string;
    latencyMs?: number;
    entryId?: string;
    traceId?: string;
  };
export type WireEntry = WireDoc &
  EntityPeriodArgs & {
    entryId: string;
    date: string;
    lines: WireLine[];
    memo: string;
    source: "opening" | "import" | "post_entry";
    postedBy: WireActor;
    reference?: string;
    counterparty?: string;
    vendorId?: string;
    txnId?: string;
    proposalId?: string;
    traceId?: string;
  };
export type WireAuditEvent = WireDoc &
  EntityArgs & {
    period?: string;
    actor: WireActor;
    action: string;
    proposalId?: string;
    decisionId?: string;
    entryId?: string;
    breakId?: string;
    bankTransactionId?: string;
    traceId?: string;
    detail?: string;
    at: number;
  };
export type WireSourceDocument = EntityPeriodArgs & {
  id: string;
  date: string;
  kind: string;
  vendorId: string;
  contractId: string;
  title: string;
  text: string;
  amount: number | null;
  reference: string | null;
};
export type WireDecisionSummary = Pick<
  WireDecision,
  "decisionId" | "outcome" | "reason" | "rulesRun"
>;
export type LiveProposalRow = WireProposal & {
  break: Pick<WireBreak, "breakId" | "kind" | "description" | "status"> | null;
  amount: number | null;
  counterparty: string | null;
  date: string | null;
  reference: string | null;
  decision: WireDecisionSummary | null;
};
export type WirePeriod = WireDoc &
  EntityPeriodArgs & {
    start: string;
    end: string;
    status: "open" | "closing" | "signed";
    closeWorkflowId?: string;
    signedAt?: number;
    /** C4 adds these fields; existing Phase 1 period documents omit them. */
    prepared?: { at: number; unmatched: number; openBreaks: number };
    closeSummary?: SignPeriodResult;
  };
export type WireScoreboard = {
  transactions: number;
  closedByCode: number;
  proposals: number;
  posted: number;
  escalated: number;
  underReview: number;
  plantedBreaks: number;
  caught: number;
  correct: number;
};
export type WireCloseStatus = {
  type: string;
  running?: number;
  error?: string;
};
// Short aliases for the reactive workspace bridge.
export type LivePeriod = WirePeriod;
export type LiveScoreboard = WireScoreboard;
export type LiveCloseStatus = WireCloseStatus;
export type WireAudit = WireAuditEvent;
export type GetBreakResult = {
  break: WireBreak;
  bank: WireBankTransaction | null;
  vendor: WireVendor | null;
  contract: WireContract | null;
  proposals: WireProposal[];
};
export type GetDecisionResult = {
  decision: WireDecision | null;
  entry: WireEntry | null;
  audit: WireAuditEvent[];
};
export type WireCloseSummary = {
  status: string;
  signedAt: number | null;
  prepared: { at: number; unmatched: number; openBreaks: number } | null;
  entriesPosted: number;
  openItems: number;
  awaitingController: number;
  trialBalance: {
    code: string;
    name: string;
    debit: number;
    credit: number;
    balance: number;
  }[];
  debits: number;
  credits: number;
};
export type ListProposalsArgs = EntityArgs & { period?: string };
export type GetBreakArgs = { id: string };
export type GetDecisionArgs = { proposalId: string };
/** C3 uses the external proposal code, NOT the Convex proposal _id. */
export type ApproveArgs = EntityArgs & {
  proposalId: string;
  note?: string;
  precedentScope?: WirePrecedentScope;
};
export type ApproveResult = { decisionId: string; entryId: string };
export type RejectArgs = EntityArgs & {
  proposalId: string;
  instruction: string;
};
export type RejectResult = { decisionId: string; correctionId: string };
export type SignPeriodArgs = EntityPeriodArgs;
export type SignPeriodResult = {
  entriesPosted: number;
  openItemsCarried: number;
  debits: number;
  credits: number;
};
export type QueryContract<Args, Result> = { args: Args; result: Result };
export type ApiQueryContracts = {
  "api:listProposals": QueryContract<ListProposalsArgs, LiveProposalRow[]>;
  "api:getBreak": QueryContract<GetBreakArgs, GetBreakResult | null>;
  "api:getDecision": QueryContract<GetDecisionArgs, GetDecisionResult>;
  "api:listPeriods": QueryContract<EntityArgs, WirePeriod[]>;
  "api:scoreboard": QueryContract<EntityPeriodArgs, WireScoreboard>;
  "api:closeStatus": QueryContract<EntityPeriodArgs, WireCloseStatus | null>;
  "api:closeSummary": QueryContract<EntityPeriodArgs, WireCloseSummary>;
  "api:auditTrail": QueryContract<
    EntityArgs & { period?: string; limit?: number },
    WireAuditEvent[]
  >;
};
/** Integrated C3 controller mutations; calls still require an explicit user action. */
export type ApiMutationContracts = {
  "api:startClose": QueryContract<EntityPeriodArgs, string | null>;
  "api:approve": QueryContract<ApproveArgs, ApproveResult>;
  "api:reject": QueryContract<RejectArgs, RejectResult>;
  "api:signPeriod": QueryContract<SignPeriodArgs, SignPeriodResult>;
};
