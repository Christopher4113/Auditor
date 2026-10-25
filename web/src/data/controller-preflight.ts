import { mergeProposalDetails, toPeriodKey, toProposal } from "./adapters";
import type {
  GetBreakResult,
  GetDecisionResult,
  LiveProposalRow,
} from "./contracts";
import { canApproveProposal, isCurrentProposal } from "./selectors";
import type { Proposal } from "./types";

const changed = () =>
  new Error(
    "The proposal context changed. Refresh the workspace and review the current proposal before approving.",
  );
function reviewedEntry(proposal: Proposal): string {
  return JSON.stringify(
    proposal.lines.map(({ account, debit, credit }) => ({
      account,
      debit,
      credit,
    })),
  );
}
function reviewedSources(proposal: Proposal): string {
  return JSON.stringify(
    proposal.citations
      .map(({ sourceType, sourceId, text }) =>
        JSON.stringify([sourceType, sourceId, text]),
      )
      .sort(),
  );
}

/**
 * Re-check a clicked approval against freshly read sources and reviewer results.
 * This never calls a mutation or fabricates a replacement proposal. The server
 * must still enforce policy atomically when the approval mutation runs.
 */
export function assertCurrentApproval(
  base: Proposal,
  sources: GetBreakResult | null | undefined,
  result: GetDecisionResult | null | undefined,
): Proposal {
  if (!base.backendId || !base.breakBackendId || !base.entity) {
    throw new Error("Open the current live proposal before approving it.");
  }
  if (!sources || !result?.decision) {
    throw new Error(
      "Current sources or the control decision are unavailable. Refresh the proposal before approving.",
    );
  }
  if (!sources.bank || (sources.bank.vendorId && !sources.vendor)) {
    throw new Error(
      "The current bank or vendor source record is unavailable. Refresh the sources before approving.",
    );
  }
  const period = toPeriodKey(base.period);
  if (
    sources.break._id !== base.breakBackendId ||
    sources.break.entity !== base.entity ||
    sources.break.period !== period
  )
    throw changed();
  const wire = sources.proposals.find(
    (proposal) => proposal._id === base.backendId,
  );
  if (!wire) {
    throw new Error(
      "This proposal is no longer in the current source history. Refresh before approving.",
    );
  }
  if (
    wire.proposalId !== base.id ||
    sources.proposals.some(
      (proposal) =>
        proposal.entity !== base.entity ||
        proposal.period !== period ||
        proposal.breakId !== base.breakBackendId,
    ) ||
    result.decision.proposalId !== wire._id ||
    result.decision.entity !== base.entity ||
    result.decision.period !== period ||
    (result.entry &&
      (result.entry.proposalId !== wire._id ||
        result.entry.entity !== base.entity ||
        result.entry.period !== period ||
        result.decision.entryId !== result.entry._id)) ||
    (sources.bank &&
      (sources.bank._id !== sources.break.bankTransactionId ||
        sources.bank.entity !== base.entity ||
        sources.bank.period !== period)) ||
    (sources.vendor &&
      (sources.vendor.entity !== base.entity ||
        (sources.bank.vendorId &&
          sources.vendor.vendorId !== sources.bank.vendorId))) ||
    (sources.contract && sources.contract.entity !== base.entity)
  )
    throw changed();
  // getBreak currently uses take(10) with no continuation/completeness marker.
  if (sources.proposals.length >= 10) {
    throw new Error(
      "The current revision history is incomplete. Approval needs the full latest history.",
    );
  }
  const rows = sources.proposals
    .map(
      (proposal): LiveProposalRow => ({
        ...proposal,
        break: {
          breakId: sources.break.breakId,
          kind: sources.break.kind,
          description: sources.break.description,
          status: sources.break.status,
        },
        amount: sources.bank?.amount ?? null,
        counterparty:
          sources.bank?.counterparty ?? sources.vendor?.name ?? null,
        date: sources.bank?.date ?? null,
        reference: sources.bank?.reference ?? null,
        decision:
          proposal._id === wire._id
            ? {
                decisionId: result.decision!.decisionId,
                outcome: result.decision!.outcome,
                reason: result.decision!.reason,
                rulesRun: result.decision!.rulesRun,
              }
            : null,
      }),
    )
    .map(toProposal);
  const current = rows.find((proposal) => proposal.backendId === wire._id)!;
  if (!isCurrentProposal(current, rows)) {
    throw new Error(
      "A newer revision exists. Review the latest proposal before approving.",
    );
  }
  const fresh = mergeProposalDetails(current, sources, result);
  if (fresh.status === "held") {
    throw new Error(
      "This payment is on hold. Its bank details must be independently confirmed before release.",
    );
  }
  if (wire.status !== "escalated" && wire.status !== "failed_rule") {
    throw new Error(
      "This proposal is no longer awaiting controller approval. Refresh its current status.",
    );
  }
  if (
    result.decision.reviewer !== "controls" ||
    !["escalated", "returned"].includes(result.decision.outcome)
  ) {
    throw new Error(
      "The reviewer decision changed. Refresh the proposal before making another controller decision.",
    );
  }
  if (!canApproveProposal(fresh, { rows })) {
    throw new Error(
      "Approval requires verified citations and a balanced current entry. Review the source and control results.",
    );
  }
  if (
    (base.revision !== undefined && base.revision !== wire.revision) ||
    reviewedEntry(base) !== reviewedEntry(fresh) ||
    reviewedSources(base) !== reviewedSources(fresh) ||
    reviewedSources(current) !== reviewedSources(fresh)
  ) {
    throw new Error(
      "The proposed entry or its cited sources changed. Review the updated proposal before approving.",
    );
  }
  return fresh;
}
