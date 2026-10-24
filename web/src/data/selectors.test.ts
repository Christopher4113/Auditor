import { describe, expect, it } from "vitest";
import { initialProposals } from "./demo";
import {
  assertDemoAction,
  canApproveProposal,
  canRejectProposal,
  canSignPeriod,
  hasPostedSuspenseHold,
  isCurrentProposal,
  isUnresolved,
  latestProposals,
  needsHumanReview,
  proposalProgress,
  revisionsFor,
  reviewProposals,
  unresolvedProposals,
} from "./selectors";
import type { Proposal } from "./types";

const proposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  ...initialProposals[0],
  id: "P-A-r1",
  status: "review",
  revision: 1,
  ...overrides,
});

describe("current proposals and revisions", () => {
  it("retains the highest revision per break in feed order, including distinct breaks", () => {
    const oldA = proposal({ breakBackendId: "break-a", status: "rejected" });
    const newestB = proposal({
      id: "P-B-r1",
      breakBackendId: "break-b",
      status: "posted",
    });
    const newestA = proposal({
      id: "P-A-r2",
      breakBackendId: "break-a",
      revision: 2,
    });
    const fixture = proposal({ id: "demo-one", revision: undefined });
    const rows = [oldA, newestB, newestA, fixture];

    expect(latestProposals(rows)).toEqual([newestB, newestA, fixture]);
    expect(rows).toEqual([oldA, newestB, newestA, fixture]);
  });

  it("uses fixture IDs without grouping unrelated demo rows together", () => {
    const old = proposal({ id: "demo-one", revision: 1 });
    const latest = proposal({ id: "demo-one", revision: 2 });
    const other = proposal({ id: "demo-two", revision: undefined });

    expect(latestProposals([latest, old, other])).toEqual([latest, other]);
  });

  it("keeps the first feed row on ties and never duplicates the same object", () => {
    const first = proposal({
      breakBackendId: "break-a",
      reason: "Newest feed result",
    });
    const duplicate = proposal({
      breakBackendId: "break-a",
      reason: "Older feed result",
    });

    expect(latestProposals([first, duplicate, first])).toEqual([first]);
  });

  it("returns only the selected break's revisions without leaking another decision or audit", () => {
    const old = proposal({
      breakBackendId: "break-a",
      status: "rejected",
      decisionId: "D-A-r1",
      audit: [
        {
          time: "10:00",
          title: "Returned",
          detail: "Void the duplicate",
          kind: "warning",
        },
      ],
    });
    const other = proposal({
      id: "P-B-r3",
      breakBackendId: "break-b",
      revision: 3,
      decisionId: "D-B-r3",
    });
    const latest = proposal({
      id: "P-A-r2",
      breakBackendId: "break-a",
      revision: 2,
      decisionId: "D-A-r2",
      audit: [],
    });
    const rows = [old, other, latest];
    const versions = revisionsFor(rows, latest);

    expect(versions).toEqual([latest, old]);
    expect(versions[0].audit).toEqual([]);
    expect(versions[1].audit[0].detail).toBe("Void the duplicate");
    expect(rows).toEqual([old, other, latest]);
  });
});

describe("review eligibility", () => {
  it("shows local review and held items for a controller decision", () => {
    expect(
      needsHumanReview(proposal({ status: "review", provenance: "demo" })),
    ).toBe(true);
    expect(
      needsHumanReview(proposal({ status: "held", provenance: "demo" })),
    ).toBe(true);
  });

  it.each(["escalated", "failed_rule"] as const)(
    "allows live %s items into review",
    (backendStatus) => {
      expect(
        needsHumanReview(proposal({ provenance: "live", backendStatus })),
      ).toBe(true);
      expect(
        needsHumanReview(
          proposal({ provenance: "live", backendStatus, status: "held" }),
        ),
      ).toBe(true);
    },
  );

  it.each(["under_review", "approved", "rejected"] as const)(
    "does not present live %s as a human task",
    (backendStatus) => {
      expect(
        needsHumanReview(proposal({ provenance: "live", backendStatus })),
      ).toBe(false);
      expect(
        needsHumanReview(
          proposal({ provenance: "live", backendStatus, status: "held" }),
        ),
      ).toBe(false);
    },
  );

  it("keeps a posted suspense hold in review while completed postings need no human decision", () => {
    expect(
      needsHumanReview(
        proposal({
          provenance: "live",
          status: "held",
          backendStatus: "posted",
        }),
      ),
    ).toBe(true);
    expect(
      needsHumanReview(
        proposal({
          provenance: "live",
          status: "posted",
          backendStatus: "posted",
        }),
      ),
    ).toBe(false);
    expect(
      needsHumanReview(
        proposal({
          provenance: "live",
          status: "review",
          backendStatus: "posted",
        }),
      ),
    ).toBe(false);
  });

  it("fails closed when live status is absent and respects backend status without a provenance label", () => {
    expect(
      needsHumanReview(proposal({ provenance: "live", status: "held" })),
    ).toBe(false);
    expect(needsHumanReview(proposal({ backendStatus: "under_review" }))).toBe(
      false,
    );
    expect(needsHumanReview(proposal({ backendStatus: "escalated" }))).toBe(
      true,
    );
    expect(needsHumanReview(proposal({ status: "approved" }))).toBe(false);
  });
});

describe("progress and workspace boundary", () => {
  it("counts only current posted revisions, keeping approved and rejected items unresolved", () => {
    const rows = [
      proposal({ breakBackendId: "break-a", revision: 1, status: "posted" }),
      proposal({
        id: "P-A-r2",
        breakBackendId: "break-a",
        revision: 2,
        status: "review",
      }),
      proposal({ id: "P-B-r1", status: "approved", backendStatus: "approved" }),
      proposal({ id: "P-C-r1", status: "rejected" }),
      proposal({ id: "P-D-r1", status: "posted" }),
    ];

    expect(proposalProgress(rows)).toEqual({
      total: 4,
      posted: 1,
      pending: 3,
      percent: 25,
    });
    expect(isUnresolved(rows[2])).toBe(true);
    expect(isUnresolved(rows[3])).toBe(true);
    expect(isUnresolved(rows[4])).toBe(false);
  });

  it("does not imply completion when no proposals are available", () => {
    expect(proposalProgress([])).toEqual({
      total: 0,
      posted: 0,
      pending: 0,
      percent: null,
    });
  });

  it("permits local demo actions and prevents every live caller from performing one", () => {
    expect(() => assertDemoAction("demo")).not.toThrow();
    expect(() => assertDemoAction("live")).toThrow(
      "This simulation is only available in the demo workspace.",
    );
  });
});

describe("revision-aware period completion", () => {
  it("keeps posted funds parked in 1400 unresolved even when the feed's status label missed the hold", () => {
    const parked = proposal({
      status: "posted",
      backendStatus: "posted",
      postedEntryId: "actual-suspense-journal",
      lines: [
        {
          account: "1400",
          name: "Payments under review",
          debit: 42000,
          credit: 0,
        },
        { account: "1000", name: "Cash", debit: 0, credit: 42000 },
      ],
    });
    expect(hasPostedSuspenseHold(parked)).toBe(true);
    expect(unresolvedProposals([parked])).toEqual([parked]);
    expect(reviewProposals([parked])).toEqual([parked]);
    expect(proposalProgress([parked])).toEqual({
      total: 1,
      posted: 0,
      pending: 1,
      percent: 0,
    });
    expect(
      canSignPeriod([parked], { status: "open", feedComplete: true }),
    ).toBe(false);
    expect(canApproveProposal(parked)).toBe(false);
    expect(canRejectProposal(parked)).toBe(false);
  });
  it("allows a posted credit clearing 1400 and an unrelated posted refund to resolve normally", () => {
    const clearing = proposal({
      status: "posted",
      backendStatus: "posted",
      lines: [
        { account: "2000", name: "AP", debit: 42000, credit: 0 },
        {
          account: "1400",
          name: "Payments under review",
          debit: 0,
          credit: 42000,
        },
      ],
    });
    const refund = proposal({
      id: "refund",
      status: "posted",
      backendStatus: "posted",
    });
    expect(hasPostedSuspenseHold(clearing)).toBe(false);
    expect(hasPostedSuspenseHold(refund)).toBe(false);
    expect(unresolvedProposals([clearing, refund])).toEqual([]);
    expect(reviewProposals([clearing, refund])).toEqual([]);
    expect(
      canSignPeriod([clearing, refund], { status: "open", feedComplete: true }),
    ).toBe(true);
    const oldHold = proposal({
      id: "P-held-r1",
      backendId: "held-r1",
      breakBackendId: "held-break",
      status: "held",
      backendStatus: "posted",
      lines: [
        {
          account: "1400",
          name: "Payments under review",
          debit: 42000,
          credit: 0,
        },
        { account: "1000", name: "Cash", debit: 0, credit: 42000 },
      ],
    });
    const clearedRevision = {
      ...clearing,
      id: "P-held-r2",
      backendId: "held-r2",
      breakBackendId: "held-break",
      revision: 2,
      revisionOf: "held-r1",
    };
    expect(unresolvedProposals([oldHold, clearedRevision])).toEqual([]);
    expect(
      canSignPeriod([oldHold, clearedRevision], {
        status: "open",
        feedComplete: true,
      }),
    ).toBe(true);
  });
  it("allows signing after a rejected/failed proposal is replaced by a posted revision", () => {
    const rejected = proposal({
      id: "P-A-r1",
      backendId: "p-a-1",
      breakBackendId: "break-a",
      status: "rejected",
      backendStatus: "rejected",
    });
    const failed = proposal({
      id: "P-A-r2",
      backendId: "p-a-2",
      breakBackendId: "break-a",
      revision: 2,
      revisionOf: "p-a-1",
      status: "review",
      backendStatus: "failed_rule",
    });
    const posted = proposal({
      id: "P-A-r3",
      backendId: "p-a-3",
      breakBackendId: "break-a",
      revision: 3,
      revisionOf: "p-a-2",
      status: "posted",
      backendStatus: "posted",
    });
    const rows = Object.freeze([rejected, posted, failed]);

    expect(unresolvedProposals(rows)).toEqual([]);
    expect(reviewProposals(rows)).toEqual([]);
    expect(canSignPeriod(rows, { status: "open", feedComplete: true })).toBe(
      true,
    );
    expect(proposalProgress(rows)).toEqual({
      total: 1,
      posted: 1,
      pending: 0,
      percent: 100,
    });
    expect(isCurrentProposal(rejected, rows)).toBe(false);
    expect(isCurrentProposal(posted, rows)).toBe(true);
  });

  it("leaves the latest rejected proposal open while no actual revision exists", () => {
    const rejected = proposal({
      status: "rejected",
      backendId: "p-a-1",
      backendStatus: "rejected",
      breakBackendId: "break-a",
    });
    expect(unresolvedProposals([rejected])).toEqual([rejected]);
    expect(reviewProposals([rejected])).toEqual([]);
    expect(canSignPeriod([rejected], { status: "open" })).toBe(false);
  });

  it("blocks signing when a newer pending revision supersedes a posted version, without making it a human task", () => {
    const posted = proposal({
      backendId: "p-a-1",
      breakBackendId: "break-a",
      status: "posted",
      backendStatus: "posted",
    });
    const pending = proposal({
      id: "P-A-r2",
      backendId: "p-a-2",
      breakBackendId: "break-a",
      revision: 2,
      revisionOf: "p-a-1",
      status: "pending",
      backendStatus: "under_review",
    });
    expect(unresolvedProposals([posted, pending])).toEqual([pending]);
    expect(reviewProposals([posted, pending])).toEqual([]);
    expect(canSignPeriod([posted, pending], { status: "open" })).toBe(false);
  });

  it("keeps an approved proposal unposted until an actual posting is confirmed", () => {
    const approved = proposal({
      status: "approved",
      backendStatus: "approved",
    });
    expect(proposalProgress([approved]).posted).toBe(0);
    expect(canSignPeriod([approved])).toBe(false);
    const prematureLabel = { ...approved, status: "posted" as const };
    expect(isUnresolved(prematureLabel)).toBe(true);
    expect(canSignPeriod([prematureLabel])).toBe(false);
    expect(proposalProgress([prematureLabel]).posted).toBe(0);
    expect(
      canSignPeriod(
        [{ ...prematureLabel, postedEntryId: "actual-journal-id" }],
        { status: "open" },
      ),
    ).toBe(true);
  });

  it("blocks sign-off for a held payment even after its suspense journal posted", () => {
    const held = proposal({
      status: "held",
      backendStatus: "posted",
      postedEntryId: "suspense-entry",
      breakBackendId: "break-a",
    });
    expect(unresolvedProposals([held])).toEqual([held]);
    expect(reviewProposals([held])).toEqual([held]);
    expect(canSignPeriod([held], { status: "open" })).toBe(false);
    expect(canApproveProposal(held)).toBe(false);
    expect(canRejectProposal(held)).toBe(false);
  });

  it("joins actual revisionOf chains when break metadata is absent without parsing display IDs", () => {
    const rejected = proposal({
      id: "unrelated-looking-code",
      backendId: "actual-1",
      status: "rejected",
      backendStatus: "rejected",
    });
    const posted = proposal({
      id: "entirely-different-code",
      backendId: "actual-2",
      revision: 2,
      revisionOf: "actual-1",
      status: "posted",
      backendStatus: "posted",
    });
    expect(latestProposals([rejected, posted])).toEqual([posted]);
    expect(revisionsFor([rejected, posted], posted)).toEqual([
      posted,
      rejected,
    ]);
    expect(canSignPeriod([rejected, posted], { status: "open" })).toBe(true);
  });

  it("does not collapse different live records merely because they share a display ID", () => {
    const unresolved = proposal({
      id: "same-code",
      backendId: "actual-1",
      status: "rejected",
      backendStatus: "rejected",
    });
    const posted = proposal({
      id: "same-code",
      backendId: "actual-2",
      revision: 2,
      status: "posted",
      backendStatus: "posted",
    });
    expect(latestProposals([unresolved, posted])).toEqual([unresolved, posted]);
    expect(canSignPeriod([unresolved, posted])).toBe(false);
  });

  it("does not mix periods or entities even when identifiers and revision links collide", () => {
    const july = proposal({
      id: "P-July",
      entity: "nyc",
      period: "July 2026",
      backendId: "old-id",
      breakBackendId: "shared-break",
      status: "rejected",
      backendStatus: "rejected",
    });
    const september = proposal({
      id: "P-September",
      entity: "nyc",
      period: "September 2026",
      backendId: "new-id",
      breakBackendId: "shared-break",
      revisionOf: "old-id",
      revision: 2,
      status: "posted",
      backendStatus: "posted",
    });
    const otherEntity = proposal({
      id: "P-Other",
      entity: "other",
      period: "July 2026",
      backendId: "new-id",
      breakBackendId: "shared-break",
      revisionOf: "old-id",
      revision: 3,
      status: "posted",
      backendStatus: "posted",
    });
    const rows = [july, september, otherEntity];
    expect(latestProposals(rows)).toHaveLength(3);
    expect(revisionsFor(rows, july)).toEqual([july]);
    expect(
      unresolvedProposals(rows, { entity: "nyc", period: "July 2026" }),
    ).toEqual([july]);
    expect(canSignPeriod(rows, { entity: "nyc", period: "July 2026" })).toBe(
      false,
    );
    expect(
      canSignPeriod(rows, {
        entity: "nyc",
        period: "September 2026",
        status: "open",
      }),
    ).toBe(true);
  });

  it("refuses a conflicting revision link between two actual breaks", () => {
    const open = proposal({
      backendId: "actual-1",
      breakBackendId: "break-a",
      status: "rejected",
      backendStatus: "rejected",
    });
    const other = proposal({
      id: "P-B-r2",
      backendId: "actual-2",
      breakBackendId: "break-b",
      revisionOf: "actual-1",
      revision: 2,
      status: "posted",
      backendStatus: "posted",
    });
    expect(latestProposals([open, other])).toEqual([open, other]);
    expect(canSignPeriod([open, other])).toBe(false);
  });

  it("fails closed at the query cap and while close state is unknown or running", () => {
    const rows = Array.from({ length: 200 }, (_, index) =>
      proposal({ id: `demo-${index}`, status: "posted" }),
    );
    expect(canSignPeriod(rows)).toBe(false);
    expect(canSignPeriod(rows, { feedComplete: false })).toBe(false);
    expect(canSignPeriod(rows, { feedComplete: true })).toBe(true);
    expect(canSignPeriod(rows.slice(0, 199), { loading: true })).toBe(false);
    expect(canSignPeriod(rows.slice(0, 199), { closeRunning: true })).toBe(
      false,
    );
    for (const status of ["closing", "signed", "missing"]) {
      expect(canSignPeriod(rows.slice(0, 199), { status })).toBe(false);
    }
    expect(canSignPeriod([])).toBe(false);
    expect(canSignPeriod([], { allowEmpty: true })).toBe(false);
    expect(
      canSignPeriod([], {
        allowEmpty: true,
        feedComplete: true,
        status: "open",
      }),
    ).toBe(true);
    expect(
      canSignPeriod([
        proposal({
          provenance: "live",
          status: "posted",
          backendStatus: "posted",
        }),
      ]),
    ).toBe(false);
  });
});

describe("shared controller integrity guards", () => {
  it("allows a current materiality exception with balanced lines and real citations", () => {
    const current = proposal({
      provenance: "live",
      backendId: "actual-1",
      backendStatus: "escalated",
      rules: [
        { label: "P&L materiality", detail: "Above threshold", passed: false },
      ],
    });
    expect(canApproveProposal(current, { rows: [current] })).toBe(true);
    expect(canRejectProposal(current, { rows: [current] })).toBe(true);
    expect(canApproveProposal(current, { signed: true })).toBe(false);
    expect(canApproveProposal(current, { loading: true })).toBe(false);
  });

  it("blocks approval when citation verification failed or cited text is absent", () => {
    const current = proposal({
      provenance: "live",
      backendStatus: "failed_rule",
    });
    expect(
      canApproveProposal({
        ...current,
        rules: [
          {
            label: "Source citations",
            detail: "Source text mismatch",
            passed: false,
          },
        ],
      }),
    ).toBe(false);
    expect(canApproveProposal({ ...current, citations: [] })).toBe(false);
    expect(
      canApproveProposal({
        ...current,
        citations: [{ ...current.citations[0], text: "   " }],
      }),
    ).toBe(false);
    expect(
      canApproveProposal({
        ...current,
        citations: [{ ...current.citations[0], score: Number.NaN }],
      }),
    ).toBe(false);
    expect(canRejectProposal(current)).toBe(true);
  });

  it("blocks invalid, unbalanced or empty journal data instead of treating zero as balanced", () => {
    const current = proposal();
    expect(canApproveProposal({ ...current, lines: [] })).toBe(false);
    expect(
      canApproveProposal({
        ...current,
        lines: [{ account: "1000", name: "Cash", debit: 0, credit: 0 }],
      }),
    ).toBe(false);
    expect(
      canApproveProposal({
        ...current,
        lines: [{ account: "1000", name: "Cash", debit: 1, credit: 0 }],
      }),
    ).toBe(false);
    expect(
      canApproveProposal({
        ...current,
        lines: [
          { account: "1000", name: "Cash", debit: Number.NaN, credit: 0 },
        ],
      }),
    ).toBe(false);
    expect(
      canApproveProposal({
        ...current,
        lines: [
          { account: "1000", name: "Cash", debit: 1.001, credit: 0 },
          { account: "2000", name: "AP", debit: 0, credit: 1.001 },
        ],
      }),
    ).toBe(false);
  });

  it("does not approve or reject historical versions or agent-pending proposals", () => {
    const old = proposal({
      backendId: "actual-1",
      backendStatus: "escalated",
      breakBackendId: "break-a",
    });
    const current = proposal({
      id: "P-A-r2",
      backendId: "actual-2",
      backendStatus: "under_review",
      status: "pending",
      breakBackendId: "break-a",
      revision: 2,
      revisionOf: "actual-1",
    });
    expect(canApproveProposal(old, { rows: [old, current] })).toBe(false);
    expect(canRejectProposal(old, { rows: [old, current] })).toBe(false);
    expect(canApproveProposal(current)).toBe(false);
    expect(canRejectProposal(current)).toBe(false);
    const held = { ...old, status: "held" as const };
    expect(canApproveProposal(held)).toBe(false);
    expect(canRejectProposal(held)).toBe(true);
  });
});
