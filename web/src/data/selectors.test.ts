import { describe, expect, it } from "vitest";
import { initialProposals } from "./demo";
import {
  assertDemoAction,
  isUnresolved,
  latestProposals,
  needsHumanReview,
  proposalProgress,
  revisionsFor,
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
      "This action is only available in the demo workspace. Live records are read-only.",
    );
  });
});
