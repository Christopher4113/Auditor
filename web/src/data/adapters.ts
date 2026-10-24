import type {
  AuditItem,
  Citation,
  ControlRule,
  JournalLine,
  Period,
  Proposal,
  ProposalStatus,
  ProposalVersion,
} from "./types";
import type {
  GetBreakResult,
  GetDecisionResult,
  LiveProposalRow,
  WireAuditEvent,
  WireCitation,
  WireContract,
  WireLine,
  WireProposal,
  WireProposalStatus,
  WireRuleResult,
} from "./contracts";

const PERIOD_LABELS: Record<string, Period> = {
  "2026-07": "July 2026",
  "2026-08": "August 2026",
  "2026-09": "September 2026",
};
const PERIOD_KEYS: Record<Period, string> = {
  "July 2026": "2026-07",
  "August 2026": "2026-08",
  "September 2026": "2026-09",
};
const RULE_LABELS: Record<string, string> = {
  balance: "Balanced entry",
  citation: "Source citations",
  threshold: "P&L materiality",
  period_lock: "Open period",
  bank_detail_change: "Bank-detail change",
  bank_detail_hold: "Bank-detail hold",
  revision_cap: "Revision cap",
  precedent: "Precedent",
  correction: "Correction check",
};
export function toPeriodKey(period: Period): string {
  const key = PERIOD_KEYS[period];
  if (!key) throw new Error(`Unsupported fiscal period: ${period}`);
  return key;
}
export function toPeriodLabel(period: string): Period {
  const label = PERIOD_LABELS[period];
  if (!label) throw new Error(`Unsupported fiscal period: ${period}`);
  return label;
}
export function centsToDollars(cents: number): number {
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Expected an integer number of USD cents.");
  }
  return cents / 100;
}
function dateLabel(iso: string | null): string {
  if (!iso) return "Date unavailable";
  // Bank dates are calendar dates. UTC formatting avoids changing their day in LA.
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}
function citationView(citation: WireCitation): Citation {
  return {
    ...citation,
    sourceType:
      citation.sourceType === "decision" ? "precedent" : citation.sourceType,
  };
}
function lineView(line: WireLine): JournalLine {
  return {
    account: line.account,
    name: line.memo || `Account ${line.account}`,
    debit: centsToDollars(line.debit),
    credit: centsToDollars(line.credit),
  };
}
function ruleViews(rules: WireRuleResult[]): ControlRule[] {
  return rules.map((rule) => ({
    label: RULE_LABELS[rule.rule] ?? rule.rule,
    detail: rule.detail ?? "No additional detail returned.",
    passed: rule.passed,
  }));
}

function parksPaymentInSuspense(
  lines: ReadonlyArray<Pick<WireLine, "account" | "debit" | "credit">>,
): boolean {
  // A credit clearing an old suspense balance is not a new payment hold.
  return (
    lines
      .filter((line) => line.account === "1400")
      .reduce((sum, line) => sum + line.debit - line.credit, 0) > 0
  );
}

/** Posting a hold journal records parked funds; it does not release the payment. */
export function statusFrom(
  status: WireProposalStatus,
  rules: WireRuleResult[] = [],
  paymentsHeld = false,
  lines: ReadonlyArray<Pick<WireLine, "account" | "debit" | "credit">> = [],
): ProposalStatus {
  const bankHold = rules.some(
    (rule) =>
      (rule.rule === "bank_detail_change" ||
        rule.rule === "bank_detail_hold") &&
      !rule.passed,
  );
  if (status === "posted") {
    // A rule on this proposal is payment-specific. A vendor-wide flag alone must
    // not retroactively reclassify unrelated refunds or old completed entries.
    return bankHold || (paymentsHeld && parksPaymentInSuspense(lines))
      ? "held"
      : "posted";
  }
  if (status === "rejected") return "rejected";
  if (paymentsHeld || bankHold) return "held";
  switch (status) {
    case "approved":
      return "approved";
    case "under_review":
      return "pending";
    case "escalated":
    case "failed_rule":
      return "review";
    default:
      throw new Error(`Unsupported proposal status: ${String(status)}`);
  }
}
function contractView(
  citations: Citation[],
  contract?: WireContract | null,
): Proposal["contract"] {
  const citation = citations.find((source) => source.sourceType === "contract");
  if (!citation) {
    return {
      title: contract?.title ?? "No cited contract passage",
      clause: "No contract clause cited",
      text: "",
      available: false,
    };
  }
  const clause = contract?.clauses.find(
    (candidate) =>
      candidate.id === citation.sourceId ||
      (citation.sourceId === contract.contractId &&
        candidate.text.includes(citation.text)),
  );
  return {
    title: clause ? contract!.title : "Cited contract passage",
    clause: clause?.number ? `Clause ${clause.number}` : citation.sourceId,
    // The citation passage is authoritative; never replace it with an arbitrary contract clause.
    text: citation.text,
    sourceId: citation.sourceId,
    available: true,
  };
}
function versionView(proposal: WireProposal): ProposalVersion {
  return {
    backendId: proposal._id,
    id: proposal.proposalId,
    revision: proposal.revision,
    revisionOf: proposal.revisionOf,
    firstRead: proposal.discardedFirstRead,
    status: statusFrom(proposal.status, [], false, proposal.lines),
    reason: proposal.reason,
    lines: proposal.lines.map(lineView),
    citations: proposal.citations.map(citationView),
  };
}

export function toProposal(row: LiveProposalRow): Proposal {
  const citations = row.citations.map(citationView);
  const wireRules = row.decision?.rulesRun ?? [];
  const impactCents = row.lines
    .filter((line) => /^[45]/.test(line.account))
    .reduce((sum, line) => sum + Math.abs(line.debit - line.credit), 0);
  return {
    id: row.proposalId,
    backendStatus: row.status,
    backendId: row._id,
    breakBackendId: row.breakId,
    revision: row.revision,
    revisionOf: row.revisionOf,
    firstRead: row.discardedFirstRead,
    provenance: "live",
    title: row.break?.description ?? row.proposalId,
    vendor: row.counterparty ?? "Counterparty unavailable",
    amount: centsToDollars(Math.abs(row.amount ?? 0)),
    impact: centsToDollars(impactCents),
    date: dateLabel(row.date),
    period: toPeriodLabel(row.period),
    status: statusFrom(row.status, wireRules, false, row.lines),
    category: row.break?.kind ?? "Unclassified",
    description: row.break?.description ?? "No break description returned.",
    reason: row.reason,
    decisionReason: row.decision?.reason,
    decisionId: row.decision?.decisionId ?? "",
    outcome: row.decision?.outcome,
    sourceBank: {
      label: row.counterparty ?? "Bank record unavailable",
      amount: centsToDollars(Math.abs(row.amount ?? 0)),
      signedAmount:
        row.amount === null ? undefined : centsToDollars(row.amount),
      date: dateLabel(row.date),
      reference: row.reference ?? "",
      available: row.amount !== null,
    },
    // A journal proposal is not a ledger source. This API does not return original ledger evidence.
    sourceLedger: {
      label: "Original ledger evidence is not returned by this API",
      amount: 0,
      account: "",
      available: false,
      evidenceKind: "unavailable",
    },
    contract: contractView(citations),
    lines: row.lines.map(lineView),
    citations,
    audit: [],
    rules: ruleViews(wireRules),
    detailsState: { sources: "loading", decision: "loading" },
    revisionNote: row.discardedFirstRead
      ? `First read discarded: ${row.discardedFirstRead}`
      : undefined,
  };
}

export function toAuditItem(event: WireAuditEvent): AuditItem {
  const kind: AuditItem["kind"] = /denied|failed|error/.test(event.action)
    ? "error"
    : /reject|hold|escalate/.test(event.action) ||
        /^FAIL\b/.test(event.detail ?? "")
      ? "warning"
      : /^(post_entry|approve|index_decision)$/.test(event.action)
        ? "success"
        : "info";
  return {
    at: event.at,
    actor: event.actor,
    action: event.action,
    time: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(event.at)),
    title: event.action.replace(/[._]/g, " "),
    detail: event.detail ?? "",
    kind,
  };
}

/** undefined = query still loading; null/empty decision = real absence, never a fake result. */
export function mergeProposalDetails(
  base: Proposal,
  sources: GetBreakResult | null | undefined,
  result: GetDecisionResult | null | undefined,
): Proposal {
  if (sources && sources.break._id !== base.breakBackendId) {
    throw new Error("Break details do not belong to the selected proposal.");
  }
  if (result?.decision && result.decision.proposalId !== base.backendId) {
    throw new Error("Decision details do not belong to the selected proposal.");
  }
  if (result?.entry && result.entry.proposalId !== base.backendId) {
    throw new Error("Posted entry does not belong to the selected proposal.");
  }
  const decision = result?.decision;
  const citations = decision
    ? decision.citations.map(citationView)
    : base.citations;
  const bank = sources?.bank;
  const rules = decision?.rulesRun;
  const postedEntry =
    result?.entry && decision?.entryId === result.entry._id
      ? result.entry
      : undefined;
  const bankHold = Boolean(sources?.vendor?.paymentsHeld);
  // Preserve the actual proposal status; an 'approved' decision alone is not proof of posting.
  const currentStatus: WireProposalStatus =
    base.backendStatus ??
    (base.status === "pending"
      ? "under_review"
      : base.status === "review" || base.status === "held"
        ? "escalated"
        : base.status);
  const status = statusFrom(
    postedEntry ? "posted" : currentStatus,
    rules ?? [],
    bankHold || (!base.backendStatus && base.status === "held"),
    postedEntry?.lines ?? base.lines,
  );
  return {
    ...base,
    status,
    sourceBank:
      sources === undefined
        ? base.sourceBank
        : bank
          ? {
              label: bank.memo || bank.counterparty,
              amount: centsToDollars(Math.abs(bank.amount)),
              signedAmount: centsToDollars(bank.amount),
              date: dateLabel(bank.date),
              reference: bank.reference ?? bank.txnId,
              available: true,
            }
          : {
              label: "Bank record unavailable",
              amount: 0,
              date: "Date unavailable",
              reference: "",
              available: false,
            },
    sourceLedger: postedEntry
      ? {
          label: "Posted journal total",
          amount: centsToDollars(
            postedEntry.lines.reduce((sum, line) => sum + line.debit, 0),
          ),
          account: postedEntry.entryId,
          available: true,
          evidenceKind: "posted_entry",
        }
      : {
          label: "Original ledger evidence is not returned by this API",
          amount: 0,
          account: "",
          available: false,
          evidenceKind: "unavailable",
        },
    contract: contractView(citations, sources?.contract),
    citations,
    rules: rules ? ruleViews(rules) : base.rules,
    reviewer: decision?.reviewer ?? base.reviewer,
    outcome: decision?.outcome ?? base.outcome,
    decisionId: decision?.decisionId ?? base.decisionId,
    decisionReason: decision?.reason ?? base.decisionReason,
    postedEntryId: postedEntry?._id,
    instruction: decision?.instruction,
    revisionNote: decision?.instruction ?? base.revisionNote,
    audit: result
      ? [...result.audit].sort((a, b) => a.at - b.at).map(toAuditItem)
      : base.audit,
    versions: sources
      ? sources.proposals
          .filter((proposal) => proposal._id !== base.backendId)
          .sort((a, b) => a.revision - b.revision)
          .map(versionView)
      : base.versions,
    detailsState: {
      sources:
        sources === undefined
          ? "loading"
          : sources === null
            ? "missing"
            : "ready",
      decision:
        result === undefined ? "loading" : decision ? "ready" : "missing",
    },
  };
}
