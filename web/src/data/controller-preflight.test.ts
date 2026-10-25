import { describe, expect, it } from "vitest";
import { toProposal } from "./adapters";
import { assertCurrentApproval } from "./controller-preflight";
import type {
  GetBreakResult,
  GetDecisionResult,
  LiveProposalRow,
} from "./contracts";

function context() {
  const row: LiveProposalRow = {
    _id: "proposal-internal",
    _creationTime: 1,
    entity: "eo-festival-nyc",
    proposalId: "P-public-r1",
    breakId: "break-internal",
    period: "2026-09",
    status: "escalated",
    revision: 1,
    proposedBy: "agent",
    correctionsApplied: [],
    reason: "Recognize the supported production cost.",
    citations: [
      {
        sourceType: "policy",
        sourceId: "policy-7.1",
        text: "Recognize services when received.",
        score: 0.9,
      },
    ],
    lines: [
      { account: "5100", debit: 940000, credit: 0 },
      { account: "2000", debit: 0, credit: 940000 },
    ],
    break: {
      breakId: "B-public",
      kind: "missing_accrual",
      description: "Services need an accrual.",
      status: "escalated",
    },
    amount: -940000,
    counterparty: "Ironclad",
    date: "2026-09-08",
    reference: "INV-01",
    decision: {
      decisionId: "D-public",
      outcome: "escalated",
      reason: "Materiality review needed.",
      rulesRun: [{ rule: "threshold", kind: "preventive", passed: false }],
    },
  };
  const sources: GetBreakResult = {
    break: {
      _id: "break-internal",
      _creationTime: 1,
      entity: row.entity,
      period: row.period,
      breakId: "B-public",
      bankTransactionId: "bank-internal",
      kind: "missing_accrual",
      description: "Services need an accrual.",
      status: "escalated",
    },
    bank: {
      _id: "bank-internal",
      _creationTime: 1,
      entity: row.entity,
      period: row.period,
      txnId: "BT-public",
      date: "2026-09-08",
      amount: -940000,
      counterparty: "Ironclad",
      memo: "Production invoice",
      source: "bank",
      status: "flagged",
    },
    vendor: {
      _id: "vendor-internal",
      _creationTime: 1,
      entity: row.entity,
      vendorId: "ironclad",
      name: "Ironclad",
      bankAccountLast4: "1234",
      paymentsHeld: false,
    },
    contract: null,
    proposals: [row],
  };
  const decision: GetDecisionResult = {
    decision: {
      _id: "decision-internal",
      _creationTime: 1,
      entity: row.entity,
      period: row.period,
      decisionId: "D-public",
      proposalId: row._id,
      reviewer: "controls",
      outcome: "escalated",
      reason: "Materiality review needed.",
      rulesRun: row.decision!.rulesRun,
      citations: row.citations,
    },
    entry: null,
    audit: [],
  };
  return { row, base: toProposal(row), sources, decision };
}

describe("fresh controller approval preflight", () => {
  it("returns a fresh, verified current view without mutating the source records", () => {
    const { base, sources, decision } = context();
    const before = JSON.stringify({ base, sources, decision });
    const fresh = assertCurrentApproval(base, sources, decision);
    expect(fresh.backendId).toBe("proposal-internal");
    expect(fresh.id).toBe("P-public-r1");
    expect(fresh.backendStatus).toBe("escalated");
    expect(fresh.reviewer).toBe("controls");
    expect(fresh.detailsState).toEqual({ sources: "ready", decision: "ready" });
    expect(JSON.stringify({ base, sources, decision })).toBe(before);
  });
  it("refuses a freshly changed vendor hold even when the list and latest decision have no hold rule", () => {
    const { base, sources, decision } = context();
    sources.vendor!.paymentsHeld = true;
    decision.decision!.rulesRun = [];
    expect(base.status).toBe("review");
    expect(() => assertCurrentApproval(base, sources, decision)).toThrow(
      "payment is on hold",
    );
  });
  it("refuses a historical selected revision when a real later revision is present", () => {
    const { base, row, sources, decision } = context();
    sources.proposals.push({
      ...row,
      _id: "new-internal",
      proposalId: "P-public-r2",
      revision: 2,
      revisionOf: row._id,
      status: "posted",
    });
    expect(() => assertCurrentApproval(base, sources, decision)).toThrow(
      "newer revision exists",
    );
  });
  it("does not substitute a matching display code for a missing actual selected ID", () => {
    const { base, row, sources, decision } = context();
    sources.proposals = [{ ...row, _id: "different-internal" }];
    expect(() => assertCurrentApproval(base, sources, decision)).toThrow(
      "no longer in the current source history",
    );
  });
  it.each(["rejected", "approved", "posted", "under_review"] as const)(
    "refuses a selected proposal whose actual status changed to %s",
    (status) => {
      const { base, sources, decision } = context();
      sources.proposals[0].status = status;
      expect(() => assertCurrentApproval(base, sources, decision)).toThrow(
        "no longer awaiting controller approval",
      );
    },
  );
  it("requires fresh sources and a real control decision instead of trusting the old row", () => {
    const { base, sources, decision } = context();
    expect(() => assertCurrentApproval(base, null, decision)).toThrow(
      "unavailable",
    );
    expect(() => assertCurrentApproval(base, undefined, decision)).toThrow(
      "unavailable",
    );
    expect(() =>
      assertCurrentApproval(base, sources, { ...decision, decision: null }),
    ).toThrow("unavailable");
    expect(() =>
      assertCurrentApproval(
        { ...base, backendId: undefined },
        sources,
        decision,
      ),
    ).toThrow("current live proposal");
    expect(() =>
      assertCurrentApproval(base, { ...sources, bank: null }, decision),
    ).toThrow("source record is unavailable");
  });
  it("refuses a newer human decision even if the proposal read still has its old escalated status", () => {
    const { base, sources, decision } = context();
    decision.decision!.reviewer = "human";
    decision.decision!.outcome = "rejected";
    expect(() => assertCurrentApproval(base, sources, decision)).toThrow(
      "reviewer decision changed",
    );
  });
  it("uses authoritative decision citations and refuses missing or failed evidence", () => {
    const { base, sources, decision } = context();
    decision.decision!.citations = [];
    expect(() => assertCurrentApproval(base, sources, decision)).toThrow(
      "verified citations",
    );
    decision.decision!.citations = sources.proposals[0].citations;
    decision.decision!.rulesRun = [
      { rule: "citation", kind: "detective", passed: false },
    ];
    expect(() => assertCurrentApproval(base, sources, decision)).toThrow(
      "verified citations",
    );
  });
  it("refuses wire citations changed independently of a stale control decision", () => {
    const { base, sources, decision } = context();
    sources.proposals[0].citations = [
      {
        ...sources.proposals[0].citations[0],
        text: "A wire passage not verified by this decision.",
      },
    ];
    expect(decision.decision!.citations[0].text).toBe(base.citations[0].text);
    expect(() => assertCurrentApproval(base, sources, decision)).toThrow(
      "entry or its cited sources changed",
    );
  });
  it("refuses changed journal amounts or changed cited text until the user reviews the new record", () => {
    const { base, sources, decision } = context();
    sources.proposals[0].lines = [
      { account: "5100", debit: 950000, credit: 0 },
      { account: "2000", debit: 0, credit: 950000 },
    ];
    expect(() => assertCurrentApproval(base, sources, decision)).toThrow(
      "entry or its cited sources changed",
    );
    sources.proposals[0].lines = context().row.lines;
    decision.decision!.citations = [
      { ...decision.decision!.citations[0], text: "A changed policy passage." },
    ];
    expect(() => assertCurrentApproval(base, sources, decision)).toThrow(
      "entry or its cited sources changed",
    );
  });
  it("rejects entity, period, break and decision mismatches", () => {
    for (const alter of [
      (c: ReturnType<typeof context>) => {
        c.sources.break.entity = "other-entity";
      },
      (c: ReturnType<typeof context>) => {
        c.sources.proposals[0].period = "2026-08";
      },
      (c: ReturnType<typeof context>) => {
        c.sources.proposals[0].breakId = "another-break";
      },
      (c: ReturnType<typeof context>) => {
        c.decision.decision!.proposalId = "another-proposal";
      },
      (c: ReturnType<typeof context>) => {
        c.sources.bank!._id = "another-bank";
      },
    ]) {
      const current = context();
      alter(current);
      expect(() =>
        assertCurrentApproval(current.base, current.sources, current.decision),
      ).toThrow("context changed");
    }
  });
  it("fails closed when the 10-row history cap cannot prove the current revision", () => {
    const { base, row, sources, decision } = context();
    sources.proposals = Array.from({ length: 10 }, (_, index) => ({
      ...row,
      _id: index ? `history-${index}` : row._id,
      proposalId: `P-history-${index}`,
      revision: index + 1,
    }));
    sources.proposals[0].proposalId = base.id;
    expect(() => assertCurrentApproval(base, sources, decision)).toThrow(
      "revision history is incomplete",
    );
  });
  it("keeps unrelated posted refunds posted rather than calling them held because of a vendor-wide flag", () => {
    const { base, sources, decision } = context();
    sources.proposals[0].status = "posted";
    sources.proposals[0].lines = [
      { account: "1000", debit: 940000, credit: 0 },
      { account: "1200", debit: 0, credit: 940000 },
    ];
    sources.bank!.amount = 940000;
    sources.vendor!.paymentsHeld = true;
    expect(() => assertCurrentApproval(base, sources, decision)).toThrow(
      "no longer awaiting controller approval",
    );
  });
  it("refuses posted funds parked in 1400 even if no vendor flag or hold rules are supplied", () => {
    const { base, sources, decision } = context();
    sources.proposals[0].status = "posted";
    sources.proposals[0].lines = [
      { account: "1400", debit: 940000, credit: 0 },
      { account: "1000", debit: 0, credit: 940000 },
    ];
    decision.decision!.rulesRun = [];
    expect(() => assertCurrentApproval(base, sources, decision)).toThrow(
      "payment is on hold",
    );
  });
});
