import type { Proposal } from "./types";

const groupKey = (proposal: Proposal) =>
  proposal.breakBackendId
    ? `break:${proposal.breakBackendId}`
    : `proposal:${proposal.id}`;

const revision = (proposal: Proposal) => proposal.revision ?? 1;

/** Keep one current proposal per break without reordering the incoming feed. */
export function latestProposals(rows: Proposal[]): Proposal[] {
  const latest = new Map<string, number>();
  rows.forEach((proposal, index) => {
    const key = groupKey(proposal);
    const previous = latest.get(key);
    if (
      previous === undefined ||
      revision(proposal) > revision(rows[previous])
    ) {
      latest.set(key, index);
    }
  });
  return rows.filter(
    (proposal, index) => latest.get(groupKey(proposal)) === index,
  );
}

/** Revisions stay within the selected break, including its historical decisions. */
export function revisionsFor(rows: Proposal[], selected: Proposal): Proposal[] {
  const key = groupKey(selected);
  return rows
    .filter((proposal) => groupKey(proposal) === key)
    .sort((left, right) => revision(right) - revision(left));
}

export function needsHumanReview(proposal: Proposal): boolean {
  if (proposal.status !== "review" && proposal.status !== "held") return false;
  if (proposal.provenance === "live" || proposal.backendStatus !== undefined) {
    // A posted suspense entry records the hold; it does not resolve the payment.
    if (proposal.status === "held" && proposal.backendStatus === "posted")
      return true;
    return (
      proposal.backendStatus === "escalated" ||
      proposal.backendStatus === "failed_rule"
    );
  }
  return true;
}

export const isUnresolved = (proposal: Proposal): boolean =>
  proposal.status !== "posted";

export function assertDemoAction(mode: "demo" | "live"): void {
  if (mode === "live") {
    throw new Error(
      "This action is only available in the demo workspace. Live records are read-only.",
    );
  }
}

export function proposalProgress(rows: Proposal[]): {
  total: number;
  posted: number;
  pending: number;
  percent: number | null;
} {
  const current = latestProposals(rows);
  const total = current.length;
  const posted = current.filter(
    (proposal) => proposal.status === "posted",
  ).length;
  return {
    total,
    posted,
    pending: total - posted,
    percent: total ? Math.round((posted / total) * 100) : null,
  };
}
