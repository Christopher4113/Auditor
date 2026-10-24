// Pure canned data for Phase 1 demo and tests. No Claude calls, no Convex I/O.
// B2: replaced by the real agent in Phase 2 (B3); Workflow entry points stay the same.

// Verbatim text from retrieval/main.py STUB_HITS — must match byte-for-byte.
export const STUB_HITS = {
  "D-0417": "Northern Lines cancellation fee expensed per policy 5.1; not carried as a receivable.",
  "apex-9.4":
    "A damage deposit of $16,000 is payable before load-in and refundable within 5 business days after load-out, less a 15% inspection fee.",
  "policy-5.1":
    "Where a contract makes a fee, penalty or deduction non-recoverable, the amount is expensed in the period it becomes certain. It is not carried as a receivable.",
} as const;

export type CannedProposal = {
  entity: string;
  period: string;
  breakId: string;
  entryDate: string;
  lines: Array<{
    account: string;
    debitCents: number;
    creditCents: number;
    memo?: string;
  }>;
  reason: string;
  governingSource: { source: string; why: string };
  citations: Array<{ sourceType: string; sourceId: string; text: string }>;
  correctionsApplied: string[];
  firstRead: string;
};

/**
 * Returns a canned Apex proposal for the September moment (Break 6 / the moment).
 * Lines: Dr 1000 13,600¢, Dr 5160 2,400¢, Cr 1200 16,000¢.
 * Citations verbatim from STUB_HITS.
 */
export function cannedApexProposal(entity: string): CannedProposal {
  return {
    entity,
    period: "2026-09",
    breakId: "break_apex_moment",
    entryDate: "2026-09-25",
    lines: [
      { account: "1000", debitCents: 1360000, creditCents: 0, memo: "Apex deposit net" },
      { account: "5160", debitCents: 240000, creditCents: 0, memo: "Inspection fee per apex-9.4" },
      { account: "1200", debitCents: 0, creditCents: 1600000, memo: "Clear vendor deposit" },
    ],
    reason:
      "Apex returned 13,600 net of a 2,400 inspection fee. Policy 5.1 requires expensing non-recoverable fees. Precedent D-0417 covers the same treatment.",
    governingSource: {
      source: "contract",
      why: "Apex contract clause 9.4 specifies the 15% inspection fee, making it non-recoverable.",
    },
    citations: [
      {
        sourceType: "decision",
        sourceId: "D-0417",
        text: STUB_HITS["D-0417"],
      },
      {
        sourceType: "contract",
        sourceId: "apex-9.4",
        text: STUB_HITS["apex-9.4"],
      },
      {
        sourceType: "policy",
        sourceId: "policy-5.1",
        text: STUB_HITS["policy-5.1"],
      },
    ],
    correctionsApplied: [],
    firstRead: "receivable 2,400",
  };
}
