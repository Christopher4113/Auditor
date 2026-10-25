import type { Period, Proposal } from "./types";

export type ProposalScope = { period?: Period; entity?: string };
const revision = (proposal: Proposal) =>
  Number.isSafeInteger(proposal.revision) && (proposal.revision ?? 0) > 0
    ? proposal.revision!
    : 1;
const liveRecord = (proposal: Proposal) =>
  proposal.provenance === "live" ||
  proposal.backendStatus !== undefined ||
  Boolean(proposal.backendId || proposal.breakBackendId);
const scopeKey = (proposal: Proposal) =>
  JSON.stringify([
    proposal.entity ?? null,
    proposal.period,
    liveRecord(proposal) ? "live" : "demo",
  ]);
const inScope = (proposal: Proposal, scope: ProposalScope) =>
  (scope.period === undefined || proposal.period === scope.period) &&
  (scope.entity === undefined || proposal.entity === scope.entity);

/** Link actual break IDs and revision ancestry without crossing period/entity boundaries. */
function revisionGroups(rows: readonly Proposal[]) {
  const parents = rows.map((_, index) => index);
  const breaks = rows.map((proposal) => proposal.breakBackendId);
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const unite = (left: number, right: number) => {
    const a = find(left),
      b = find(right);
    if (a === b) return;
    // An inconsistent revisionOf link must never hide another break's open item.
    if (breaks[a] && breaks[b] && breaks[a] !== breaks[b]) return;
    parents[b] = a;
    breaks[a] ??= breaks[b];
  };
  const tokens = new Map<string, number>();
  rows.forEach((proposal, index) => {
    const keys: string[] = [];
    if (proposal.breakBackendId) keys.push(`break:${proposal.breakBackendId}`);
    if (proposal.backendId) keys.push(`backend:${proposal.backendId}`);
    if (proposal.revisionOf) keys.push(`backend:${proposal.revisionOf}`);
    // Fixture IDs are stable in the demo. A live display code alone is not ancestry.
    if (!liveRecord(proposal) && !keys.length)
      keys.push(`fixture:${proposal.id}`);
    for (const token of keys) {
      const key = JSON.stringify([scopeKey(proposal), token]);
      const previous = tokens.get(key);
      if (previous === undefined) tokens.set(key, index);
      else unite(index, previous);
    }
  });
  return { find };
}

/** Keep one current proposal per revision chain without reordering the feed. */
export function latestProposals(
  rows: readonly Proposal[],
  scope: ProposalScope = {},
): Proposal[] {
  const scoped = rows.filter((proposal) => inScope(proposal, scope));
  const { find } = revisionGroups(scoped);
  const latest = new Map<number, number>();
  scoped.forEach((proposal, index) => {
    const key = find(index);
    const previous = latest.get(key);
    if (
      previous === undefined ||
      revision(proposal) > revision(scoped[previous]) ||
      (revision(proposal) === revision(scoped[previous]) &&
        Boolean(proposal.revisionOf) &&
        proposal.revisionOf === scoped[previous].backendId)
    )
      latest.set(key, index);
  });
  return scoped.filter((_, index) => latest.get(find(index)) === index);
}

/** Historical decisions remain available, scoped to the selected revision chain. */
export function revisionsFor(
  rows: readonly Proposal[],
  selected: Proposal,
): Proposal[] {
  const candidates = [...rows, selected];
  const { find } = revisionGroups(candidates);
  const group = find(candidates.length - 1);
  return rows
    .filter((_, index) => find(index) === group)
    .sort((left, right) => revision(right) - revision(left));
}

export function isCurrentProposal(
  proposal: Proposal,
  rows: readonly Proposal[],
): boolean {
  return latestProposals(rows).some(
    (current) =>
      current === proposal ||
      (scopeKey(current) === scopeKey(proposal) &&
        (proposal.backendId
          ? current.backendId === proposal.backendId
          : !liveRecord(proposal) &&
            current.id === proposal.id &&
            revision(current) === revision(proposal))),
  );
}

/** A posted debit to Payments under review records parked funds, not a release. */
export function hasPostedSuspenseHold(proposal: Proposal): boolean {
  if (
    proposal.status !== "posted" &&
    proposal.backendStatus !== "posted" &&
    !proposal.postedEntryId
  )
    return false;
  return (
    proposal.lines
      .filter((line) => line.account === "1400")
      .reduce(
        (sum, line) =>
          sum + Math.round(line.debit * 100) - Math.round(line.credit * 100),
        0,
      ) > 0
  );
}

export function needsHumanReview(proposal: Proposal): boolean {
  if (hasPostedSuspenseHold(proposal)) return true;
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
  hasPostedSuspenseHold(proposal) ||
  proposal.status !== "posted" ||
  (liveRecord(proposal) &&
    proposal.backendStatus !== "posted" &&
    !proposal.postedEntryId);

/** A rejected historical version is resolved by its later revision, not by hiding rejection. */
export function unresolvedProposals(
  rows: readonly Proposal[],
  scope: ProposalScope = {},
): Proposal[] {
  return latestProposals(rows, scope).filter(isUnresolved);
}

export function reviewProposals(
  rows: readonly Proposal[],
  scope: ProposalScope = {},
): Proposal[] {
  return latestProposals(rows, scope).filter(needsHumanReview);
}

export type SignPeriodOptions = ProposalScope & {
  status?: string;
  loading?: boolean;
  closeRunning?: boolean;
  /** False when the capped 200-row query cannot prove all current items were returned. */
  feedComplete?: boolean;
  /** Only set after an authoritative summary confirms an empty proposal period is complete. */
  allowEmpty?: boolean;
};

/** Frontend guard is intentionally stricter than the backend's carry-open-items behavior. */
export function canSignPeriod(
  rows: readonly Proposal[],
  options: SignPeriodOptions = {},
): boolean {
  if (
    options.loading ||
    options.closeRunning ||
    (options.status !== undefined && options.status !== "open") ||
    !(options.feedComplete ?? rows.length < 200)
  )
    return false;
  const current = latestProposals(rows, options);
  if (!current.length) {
    return Boolean(
      options.allowEmpty &&
        options.status === "open" &&
        options.feedComplete === true,
    );
  }
  if (current.some(liveRecord) && options.status === undefined) return false;
  // Policy 3.0: a period closes on sign-off; items still with the controller carry forward and are booked
  // in the current period with a reference. Only work the engine has not finished blocks signing.
  return current.every((proposal) => !isUnresolved(proposal) || carriesForward(proposal));
}

/** A live item the controller has seen (escalated, returned or rejected) may carry forward at sign-off. */
export const carriesForward = (proposal: Proposal): boolean =>
  liveRecord(proposal) &&
  (proposal.backendStatus === "escalated" ||
    proposal.backendStatus === "failed_rule" ||
    proposal.backendStatus === "rejected");

export type ControllerOptions = {
  signed?: boolean;
  loading?: boolean;
  rows?: readonly Proposal[];
};
function controllerCanAct(proposal: Proposal, options: ControllerOptions) {
  if (options.signed || options.loading || !needsHumanReview(proposal))
    return false;
  if (options.rows && !isCurrentProposal(proposal, options.rows)) return false;
  // Posted suspense holds need attention, but C3 cannot approve/reject a posted proposal.
  return (
    !liveRecord(proposal) ||
    proposal.backendStatus === "escalated" ||
    proposal.backendStatus === "failed_rule"
  );
}

export function canRejectProposal(
  proposal: Proposal,
  options: ControllerOptions = {},
): boolean {
  return controllerCanAct(proposal, options);
}

/** Checks evidence/entry integrity; materiality exceptions are still human-reviewable. */
export function canApproveProposal(
  proposal: Proposal,
  options: ControllerOptions = {},
): boolean {
  if (!controllerCanAct(proposal, options) || proposal.status === "held")
    return false;
  if (!proposal.lines.length || !proposal.citations.length) return false;
  const cents = (value: number) => Math.round(value * 100);
  if (
    proposal.lines.some(
      (line) =>
        !line.account.trim() ||
        [line.debit, line.credit].some(
          (value) =>
            !Number.isFinite(value) ||
            value < 0 ||
            !Number.isSafeInteger(cents(value)) ||
            Math.abs(value * 100 - cents(value)) > 0.000001,
        ) ||
        (line.debit > 0 && line.credit > 0),
    )
  )
    return false;
  const debit = proposal.lines.reduce(
    (sum, line) => sum + cents(line.debit),
    0,
  );
  const credit = proposal.lines.reduce(
    (sum, line) => sum + cents(line.credit),
    0,
  );
  if (debit <= 0 || debit !== credit) return false;
  if (
    proposal.citations.some(
      (citation) =>
        !citation.sourceId.trim() ||
        !citation.text.trim() ||
        !Number.isFinite(citation.score),
    )
  )
    return false;
  const mandatory = new Set([
    "balance",
    "balanced entry",
    "citation",
    "source citations",
    "period lock",
    "open period",
    "bank detail change",
    "bank detail hold",
    "crs payee verification",
  ]);
  return !proposal.rules.some(
    (rule) =>
      !rule.passed &&
      mandatory.has(rule.label.toLowerCase().replace(/[_-]/g, " ").trim()),
  );
}

export function assertDemoAction(mode: "demo" | "live"): void {
  if (mode === "live") {
    throw new Error("This simulation is only available in the demo workspace.");
  }
}

export function proposalProgress(rows: readonly Proposal[]): {
  total: number;
  posted: number;
  pending: number;
  percent: number | null;
} {
  const current = latestProposals(rows);
  const total = current.length;
  const posted = current.filter((proposal) => !isUnresolved(proposal)).length;
  return {
    total,
    posted,
    pending: total - posted,
    percent: total ? Math.round((posted / total) * 100) : null,
  };
}
