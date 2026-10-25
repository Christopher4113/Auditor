import { describe, expect, it } from "vitest";
import {
  centsToDollars,
  mergeProposalDetails,
  statusFrom,
  toAuditItem,
  toPeriodKey,
  toPeriodLabel,
  toProposal,
} from "./adapters";
import type {
  GetBreakResult,
  GetDecisionResult,
  LiveProposalRow,
  WireAuditEvent,
  WireCitation,
  WireContract,
  WireDecision,
  WireEntry,
  WireProposal,
  WireRuleResult,
} from "./contracts";

const contractCitation: WireCitation = {
  sourceType: "contract",
  sourceId: "apex-9.4",
  text: "The inspection fee is 15%. Keep this passage exactly as written.",
  score: 0.88,
};
function row(overrides: Partial<LiveProposalRow> = {}): LiveProposalRow {
  return {
    _id: "convex-proposal-2",
    _creationTime: 1000,
    entity: "eo-festival-nyc",
    proposalId: "P-APEX-r2",
    breakId: "convex-break-1",
    period: "2026-09",
    status: "under_review",
    revision: 2,
    revisionOf: "convex-proposal-1",
    discardedFirstRead: "Carry the deduction as a receivable.",
    correctionsApplied: ["C-APEX-r1"],
    proposedBy: "agent",
    reason: "Expense the non-recoverable inspection fee.",
    citations: [contractCitation],
    lines: [
      { account: "1000", debit: 1360000, credit: 0, memo: "Returned cash" },
      { account: "5160", debit: 240000, credit: 0, memo: "Inspection fee" },
      { account: "1200", debit: 0, credit: 1600000, memo: "Vendor deposit" },
    ],
    break: {
      breakId: "B-APEX",
      kind: "deposit_shortfall",
      description: "Deposit returned with a contractual deduction.",
      status: "proposed",
    },
    amount: 1360000,
    counterparty: "Apex",
    date: "2026-09-25",
    reference: "BNK-0925",
    decision: null,
    ...overrides,
  };
}
function decision(overrides: Partial<WireDecision> = {}): WireDecision {
  return {
    _id: "convex-decision-2",
    _creationTime: 2000,
    entity: "eo-festival-nyc",
    period: "2026-09",
    decisionId: "D-APEX-r2-h",
    proposalId: "convex-proposal-2",
    reviewer: "human",
    outcome: "approved",
    reason: "The controller approved the cited treatment.",
    citations: [contractCitation],
    rulesRun: [],
    ...overrides,
  };
}
function entry(overrides: Partial<WireEntry> = {}): WireEntry {
  return {
    _id: "convex-entry-2",
    _creationTime: 2100,
    entity: "eo-festival-nyc",
    period: "2026-09",
    entryId: "JE-APEX-r2",
    date: "2026-09-25",
    lines: row().lines,
    memo: "Approved Apex deposit settlement.",
    source: "post_entry",
    postedBy: "human",
    proposalId: "convex-proposal-2",
    ...overrides,
  };
}
function sources(overrides: Partial<GetBreakResult> = {}): GetBreakResult {
  return {
    break: {
      _id: "convex-break-1",
      _creationTime: 500,
      entity: "eo-festival-nyc",
      period: "2026-09",
      breakId: "B-APEX",
      bankTransactionId: "convex-bank-1",
      kind: "deposit_shortfall",
      description: "Apex deposit deduction.",
      status: "proposed",
    },
    bank: {
      _id: "convex-bank-1",
      _creationTime: 400,
      entity: "eo-festival-nyc",
      period: "2026-09",
      txnId: "BT-APEX",
      date: "2026-09-25",
      amount: 1360000,
      counterparty: "Apex",
      memo: "Apex deposit returned",
      source: "bank",
      status: "flagged",
    },
    vendor: {
      _id: "convex-vendor-1",
      _creationTime: 100,
      entity: "eo-festival-nyc",
      vendorId: "apex",
      name: "Apex",
      bankAccountLast4: "1234",
      paymentsHeld: false,
    },
    contract: null,
    proposals: [row()],
    ...overrides,
  };
}
function details(
  overrides: Partial<GetDecisionResult> = {},
): GetDecisionResult {
  return { decision: decision(), entry: null, audit: [], ...overrides };
}
function contract(overrides: Partial<WireContract> = {}): WireContract {
  return {
    _id: "convex-contract-1",
    _creationTime: 100,
    entity: "eo-festival-nyc",
    contractId: "contract-apex",
    counterparty: "Apex",
    title: "Apex Agreement",
    clauses: [
      {
        id: "apex-1.1",
        number: "1.1",
        text: "This is an unrelated first clause.",
      },
      { id: "apex-9.4", number: "9.4", text: contractCitation.text },
    ],
    ...overrides,
  };
}

describe("live proposal mapping", () => {
  it("retains each wire entity so identical display codes cannot merge across entities", () => {
    const nyc = toProposal(row({ entity: "eo-festival-nyc" }));
    const other = toProposal(row({ entity: "eo-festival-london" }));
    expect(nyc.id).toBe(other.id);
    expect(nyc.entity).toBe("eo-festival-nyc");
    expect(other.entity).toBe("eo-festival-london");
  });
  it("keeps display codes separate from Convex IDs and preserves the original revision", () => {
    const proposal = toProposal(row());
    expect(proposal.id).toBe("P-APEX-r2");
    expect(proposal.entity).toBe("eo-festival-nyc");
    expect(proposal.backendId).toBe("convex-proposal-2");
    expect(proposal.breakBackendId).toBe("convex-break-1");
    expect(proposal.revisionOf).toBe("convex-proposal-1");
    expect(proposal.revision).toBe(2);
    expect(proposal.firstRead).toBe("Carry the deduction as a receivable.");
    expect(proposal.backendStatus).toBe("under_review");
    expect(proposal.status).toBe("pending");
  });
  it("converts cents without rounding away cents, and keeps bank direction", () => {
    const proposal = toProposal(
      row({
        amount: -12345,
        lines: [{ account: "5160", debit: 12345, credit: 0 }],
      }),
    );
    expect(proposal.amount).toBe(123.45);
    expect(proposal.sourceBank.signedAmount).toBe(-123.45);
    expect(proposal.lines[0].debit).toBe(123.45);
    expect(proposal.impact).toBe(123.45);
    expect(centsToDollars(1)).toBe(0.01);
    expect(() => centsToDollars(1.2)).toThrow("integer");
  });
  it("does not call an approved proposal posted before a journal exists", () => {
    const proposal = toProposal(row({ status: "approved" }));
    const merged = mergeProposalDetails(proposal, sources(), details());
    expect(merged.status).toBe("approved");
    expect(merged.postedEntryId).toBeUndefined();
    expect(merged.sourceLedger.available).toBe(false);
  });
  it("does not treat the controls outcome 'posted' as evidence of a journal post", () => {
    const proposal = toProposal(
      row({
        decision: {
          decisionId: "D-APEX",
          outcome: "posted",
          reason: "Controls passed",
          rulesRun: [],
        },
      }),
    );
    expect(proposal.status).toBe("pending");
  });
  it("uses an actual linked journal as posted-entry evidence, never as a ledger balance", () => {
    const proposal = toProposal(row({ status: "approved" }));
    const merged = mergeProposalDetails(
      proposal,
      sources(),
      details({
        decision: decision({ entryId: "convex-entry-2" }),
        entry: entry(),
      }),
    );
    expect(merged.status).toBe("posted");
    expect(merged.postedEntryId).toBe("convex-entry-2");
    expect(merged.sourceLedger).toMatchObject({
      label: "Posted journal total",
      amount: 16000,
      available: true,
      evidenceKind: "posted_entry",
    });
    expect(merged.sourceLedger.evidenceKind).not.toBe("balance");
  });
  it("does not fabricate an original ledger balance from a proposed credit line", () => {
    const proposal = toProposal(row());
    expect(proposal.lines[2].credit).toBe(16000);
    expect(proposal.sourceLedger.available).toBe(false);
    expect(proposal.sourceLedger.evidenceKind).toBe("unavailable");
    expect(proposal.sourceLedger.account).toBe("");
    const absentBank = toProposal(
      row({ amount: null, date: null, counterparty: null }),
    );
    expect(absentBank.sourceBank.available).toBe(false);
    expect(absentBank.sourceBank.signedAmount).toBeUndefined();
  });
  it("keeps holds specific to explicit hold evidence", () => {
    const bankRule: WireRuleResult = {
      rule: "bank_detail_change",
      kind: "preventive",
      passed: true,
    };
    expect(
      statusFrom("escalated", [
        { rule: "threshold", kind: "preventive", passed: false },
      ]),
    ).toBe("review");
    expect(statusFrom("escalated", [bankRule])).toBe("review");
    expect(statusFrom("escalated", [{ ...bankRule, passed: false }])).toBe(
      "held",
    );
    expect(statusFrom("under_review", [], true)).toBe("held");
    expect(statusFrom("posted", [], true)).toBe("posted");
    const ordinary = toProposal(
      row({ reason: "The bank detail change policy was checked and passed." }),
    );
    expect(ordinary.status).toBe("pending");
  });
  it("applies an actual vendor hold to the selected proposal", () => {
    const source = sources();
    source.vendor!.paymentsHeld = true;
    expect(
      mergeProposalDetails(
        toProposal(row({ status: "escalated" })),
        source,
        details(),
      ).status,
    ).toBe("held");
  });
  it("keeps a posted suspense payment held while preserving its factual posting IDs", () => {
    const suspenseLines = [
      { account: "1400", debit: 4200000, credit: 0 },
      { account: "1000", debit: 0, credit: 4200000 },
    ];
    const heldSource = sources();
    heldSource.vendor!.paymentsHeld = true;
    const base = toProposal(
      row({ status: "posted", amount: -4200000, lines: suspenseLines }),
    );
    const merged = mergeProposalDetails(
      base,
      heldSource,
      details({
        decision: decision({ outcome: "approved", entryId: "convex-entry-2" }),
        entry: entry({ lines: suspenseLines }),
      }),
    );
    expect(merged.status).toBe("held");
    expect(merged.backendStatus).toBe("posted");
    expect(merged.postedEntryId).toBe("convex-entry-2");
    expect(merged.sourceLedger).toMatchObject({
      available: true,
      evidenceKind: "posted_entry",
      amount: 42000,
    });
  });
  it("preserves a payment-specific failed bank rule even when the suspense journal posted", () => {
    const holdRule: WireRuleResult = {
      rule: "bank_detail_change",
      kind: "preventive",
      passed: false,
      detail: "Payment remains held pending independent bank confirmation.",
    };
    const suspenseLines = [
      { account: "1400", debit: 4200000, credit: 0 },
      { account: "1000", debit: 0, credit: 4200000 },
    ];
    const base = toProposal(
      row({
        status: "posted",
        lines: suspenseLines,
        decision: {
          decisionId: "D-APEX",
          outcome: "posted",
          reason: "Record parked funds only.",
          rulesRun: [holdRule],
        },
      }),
    );
    expect(base.status).toBe("held");
    const merged = mergeProposalDetails(
      base,
      sources(),
      details({
        decision: decision({ entryId: "convex-entry-2", rulesRun: [holdRule] }),
        entry: entry({ lines: suspenseLines }),
      }),
    );
    expect(merged.status).toBe("held");
    expect(merged.postedEntryId).toBe("convex-entry-2");
  });
  it("does not retroactively hold a posted refund because the vendor has another held payment", () => {
    const heldSource = sources();
    heldSource.vendor!.paymentsHeld = true;
    const merged = mergeProposalDetails(
      toProposal(row({ status: "posted" })),
      heldSource,
      details({
        decision: decision({ entryId: "convex-entry-2" }),
        entry: entry(),
      }),
    );
    expect(merged.status).toBe("posted");
    expect(merged.backendStatus).toBe("posted");
    expect(merged.postedEntryId).toBe("convex-entry-2");
  });
  it("treats posted net parked funds as held until a suspense-clearing journal is posted", () => {
    const clearingLines = [
      { account: "2000", debit: 4200000, credit: 0 },
      { account: "1400", debit: 0, credit: 4200000 },
    ];
    expect(statusFrom("posted", [], true, clearingLines)).toBe("posted");
    expect(
      statusFrom(
        "posted",
        [{ rule: "bank_detail_change", kind: "preventive", passed: false }],
        true,
        clearingLines,
      ),
    ).toBe("posted");
    const suspenseLines = [
      { account: "1400", debit: 4200000, credit: 0 },
      { account: "1000", debit: 0, credit: 4200000 },
    ];
    expect(statusFrom("posted", [], false, suspenseLines)).toBe("held");
    expect(
      statusFrom(
        "posted",
        [{ rule: "bank_detail_change", kind: "preventive", passed: true }],
        false,
        suspenseLines,
      ),
    ).toBe("held");
  });
  it("fails closed in the feed when a posted 1400 journal has an empty latest human decision", () => {
    const suspenseLines = [
      { account: "1400", debit: 4200000, credit: 0 },
      { account: "1000", debit: 0, credit: 4200000 },
    ];
    const base = toProposal(
      row({
        status: "posted",
        lines: suspenseLines,
        decision: {
          decisionId: "D-APEX-h",
          outcome: "approved",
          reason: "Record the funds under review.",
          rulesRun: [],
        },
      }),
    );
    expect(base.status).toBe("held");
    expect(base.backendStatus).toBe("posted");
    expect(base.postedEntryId).toBeUndefined();
    const merged = mergeProposalDetails(
      base,
      undefined,
      details({
        decision: decision({ entryId: "convex-entry-2", rulesRun: [] }),
        entry: entry({ lines: suspenseLines }),
      }),
    );
    expect(merged.status).toBe("held");
    expect(merged.backendStatus).toBe("posted");
    expect(merged.postedEntryId).toBe("convex-entry-2");
  });
  it("rejects unsupported period keys instead of moving their records into September", () => {
    expect(toPeriodKey("September 2026")).toBe("2026-09");
    expect(toPeriodLabel("2026-07")).toBe("July 2026");
    expect(() => toProposal(row({ period: "2026-10" }))).toThrow(
      "Unsupported fiscal period",
    );
  });
});

describe("authoritative detail evidence", () => {
  it("selects the exact cited clause instead of the contract's first clause", () => {
    const merged = mergeProposalDetails(
      toProposal(row()),
      sources({ contract: contract() }),
      details(),
    );
    expect(merged.contract.title).toBe("Apex Agreement");
    expect(merged.contract.clause).toBe("Clause 9.4");
    expect(merged.contract.text).toBe(contractCitation.text);
    expect(merged.contract.text).not.toContain("unrelated");
  });
  it("never attaches an unrelated contract title or substitutes its text", () => {
    const unrelated = contract({
      title: "Unrelated Catering Agreement",
      contractId: "contract-catering",
      clauses: [
        { id: "catering-9.4", number: "9.4", text: "Other vendor terms" },
      ],
    });
    const merged = mergeProposalDetails(
      toProposal(row()),
      sources({ contract: unrelated }),
      details(),
    );
    expect(merged.contract.title).toBe("Cited contract passage");
    expect(merged.contract.text).toBe(contractCitation.text);
  });
  it("uses decision citations, including an explicitly empty list, over proposal citations", () => {
    const authoritative: WireCitation = {
      sourceType: "decision",
      sourceId: "D-0417",
      text: "Keep this controller citation verbatim.",
      score: 0.97,
    };
    const merged = mergeProposalDetails(
      toProposal(row()),
      sources({ contract: contract() }),
      details({ decision: decision({ citations: [authoritative] }) }),
    );
    expect(merged.citations).toEqual([
      { ...authoritative, sourceType: "precedent" },
    ]);
    expect(merged.contract.available).toBe(false);
    const empty = mergeProposalDetails(
      toProposal(row()),
      sources(),
      details({ decision: decision({ citations: [] }) }),
    );
    expect(empty.citations).toEqual([]);
    expect(empty.contract.available).toBe(false);
  });
  it("preserves prior revisions and controller instructions without inventing a revision", () => {
    const prior: WireProposal = {
      ...row(),
      _id: "convex-proposal-1",
      proposalId: "P-APEX-r1",
      revision: 1,
      revisionOf: undefined,
      status: "rejected",
      reason: "Initial receivable proposal.",
      discardedFirstRead: undefined,
    };
    const merged = mergeProposalDetails(
      toProposal(row()),
      sources({ proposals: [row(), prior] }),
      details({
        decision: decision({
          outcome: "rejected",
          instruction: "Expense the inspection fee under policy 5.1.",
        }),
      }),
    );
    expect(merged.versions).toHaveLength(1);
    expect(merged.versions![0]).toMatchObject({
      backendId: "convex-proposal-1",
      id: "P-APEX-r1",
      revision: 1,
      status: "rejected",
      reason: "Initial receivable proposal.",
    });
    expect(merged.instruction).toBe(
      "Expense the inspection fee under policy 5.1.",
    );
    expect(merged.reason).toBe(row().reason);
    expect(merged.decisionReason).toBe(decision().reason);
  });
  it("distinguishes still-loading queries from real source and decision absence", () => {
    const loading = mergeProposalDetails(
      toProposal(row()),
      undefined,
      undefined,
    );
    expect(loading.detailsState).toEqual({
      sources: "loading",
      decision: "loading",
    });
    const absent = mergeProposalDetails(toProposal(row()), null, {
      decision: null,
      entry: null,
      audit: [],
    });
    expect(absent.detailsState).toEqual({
      sources: "missing",
      decision: "missing",
    });
    expect(absent.sourceBank.available).toBe(false);
    expect(absent.sourceLedger.available).toBe(false);
  });
  it("refuses stale query results that belong to another record", () => {
    const base = toProposal(row());
    const stale = sources();
    stale.break._id = "different-break";
    expect(() => mergeProposalDetails(base, stale, undefined)).toThrow(
      "Break details",
    );
    expect(() =>
      mergeProposalDetails(
        base,
        sources(),
        details({ decision: decision({ proposalId: "different-proposal" }) }),
      ),
    ).toThrow("Decision details");
    expect(() =>
      mergeProposalDetails(
        base,
        sources(),
        details({ entry: entry({ proposalId: "different-proposal" }) }),
      ),
    ).toThrow("Posted entry");
  });
  it("formats audit times in Los Angeles and sorts by the actual event timestamp", () => {
    const event: WireAuditEvent = {
      _id: "audit-1",
      _creationTime: 0,
      entity: "eo-festival-nyc",
      actor: "controls",
      action: "post_entry.denied",
      at: Date.UTC(2026, 9, 24, 2, 30, 0),
      detail: "The agent cannot post.",
    };
    expect(toAuditItem(event)).toMatchObject({
      time: "19:30:00",
      at: event.at,
      kind: "error",
      actor: "controls",
      action: "post_entry.denied",
    });
    const merged = mergeProposalDetails(
      toProposal(row()),
      sources(),
      details({
        audit: [
          event,
          { ...event, _id: "audit-0", action: "approve", at: event.at - 1000 },
        ],
      }),
    );
    expect(merged.audit.map((item) => item.action)).toEqual([
      "approve",
      "post_entry.denied",
    ]);
    expect(toProposal(row()).date).toBe("Sep 25, 2026");
  });
});
