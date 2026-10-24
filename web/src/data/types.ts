/** Frontend view models. The Convex adapter can map its eventual API into these shapes. */
export type Period = "July 2026" | "August 2026" | "September 2026";

export type ProposalStatus =
  | "pending"
  | "approved"
  | "posted"
  | "review"
  | "held"
  | "rejected";

export type Citation = {
  sourceType: "precedent" | "policy" | "contract" | "correction";
  sourceId: string;
  /** Verbatim source text, never a generated summary. */
  text: string;
  score: number;
};

export type JournalLine = {
  account: string;
  name: string;
  debit: number;
  credit: number;
};

export type AuditItem = {
  time: string;
  title: string;
  detail: string;
  kind: "success" | "info" | "warning" | "error";
  at?: number;
  actor?: string;
  action?: string;
};

export type ControlRule = {
  label: string;
  detail: string;
  passed: boolean;
};

export type Proposal = {
  id: string;
  entity?: string;
  title: string;
  vendor: string;
  amount: number;
  /** Absolute effect on profit and loss, not the total bank movement. */
  impact: number;
  date: string;
  period: Period;
  status: ProposalStatus;
  backendStatus?:
    | "under_review"
    | "approved"
    | "posted"
    | "escalated"
    | "failed_rule"
    | "rejected";
  backendId?: string;
  breakBackendId?: string;
  provenance?: "demo" | "live";
  revision?: number;
  revisionOf?: string;
  firstRead?: string;
  reviewer?: "controls" | "human" | "agent";
  outcome?: string;
  postedEntryId?: string;
  decisionReason?: string;
  instruction?: string;
  detailsState?: {
    sources: "loading" | "missing" | "ready";
    decision: "loading" | "missing" | "ready";
  };
  versions?: ProposalVersion[];
  category: string;
  description: string;
  reason: string;
  decisionId: string;
  sourceBank: {
    label: string;
    amount: number;
    date: string;
    reference: string;
    available?: boolean;
    signedAmount?: number;
  };
  sourceLedger: {
    label: string;
    amount: number;
    account: string;
    available?: boolean;
    evidenceKind?: "balance" | "posted_entry" | "unavailable";
  };
  contract: {
    title: string;
    clause: string;
    text: string;
    available?: boolean;
    sourceId?: string;
  };
  lines: JournalLine[];
  citations: Citation[];
  audit: AuditItem[];
  rules: ControlRule[];
  revisionNote?: string;
};

export type ProposalVersion = {
  backendId: string;
  id: string;
  revision: number;
  status: ProposalStatus;
  reason: string;
  lines: JournalLine[];
  citations: Citation[];
  revisionOf?: string;
  firstRead?: string;
};

export type PermissionGroup = {
  identity: "agent" | "controls" | "human";
  title: string;
  description: string;
  tools: readonly string[];
  restriction: string;
};
