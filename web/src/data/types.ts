/** Frontend view models. The Convex adapter can map its eventual API into these shapes. */
export type Period = "July 2026" | "August 2026" | "September 2026";

export type ProposalStatus = "posted" | "review" | "held" | "rejected";

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
};

export type ControlRule = {
  label: string;
  detail: string;
  passed: boolean;
};

export type Proposal = {
  id: string;
  title: string;
  vendor: string;
  amount: number;
  /** Absolute effect on profit and loss, not the total bank movement. */
  impact: number;
  date: string;
  period: Period;
  status: ProposalStatus;
  category: string;
  description: string;
  reason: string;
  decisionId: string;
  sourceBank: {
    label: string;
    amount: number;
    date: string;
    reference: string;
  };
  sourceLedger: {
    label: string;
    amount: number;
    account: string;
  };
  contract: {
    title: string;
    clause: string;
    text: string;
  };
  lines: JournalLine[];
  citations: Citation[];
  audit: AuditItem[];
  rules: ControlRule[];
  revisionNote?: string;
};

export type PermissionGroup = {
  identity: "agent" | "controls" | "human";
  title: string;
  description: string;
  tools: readonly string[];
  restriction: string;
};
