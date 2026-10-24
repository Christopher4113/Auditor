// Live adapter (interface 3): Convex rows -> the frontend's Proposal view model.
// Function references are by name so the web tsconfig never type-checks convex/ (its lint rules differ);
// the shapes below mirror the return validators in convex/api.ts.
import { useEffect } from "react";
import { ConvexReactClient, useQuery } from "convex/react";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { Citation, ControlRule, Period, Proposal, ProposalStatus } from "./types";

export const ENTITY = "eo-festival-nyc";
const url = import.meta.env.CONVEX_URL as string | undefined;
export const convex = url ? new ConvexReactClient(url) : null;
const http = url ? new ConvexHttpClient(url) : null;

const PERIOD_LABEL: Record<string, Period> = { "2026-07": "July 2026", "2026-08": "August 2026", "2026-09": "September 2026" };
const PERIOD_KEY = Object.fromEntries(Object.entries(PERIOD_LABEL).map(([k, v]) => [v, k])) as Record<Period, string>;
const RULE_LABEL: Record<string, string> = {
  balance: "Balanced entry",
  citation: "Source citations",
  threshold: "P&L materiality",
  period_lock: "Open period",
  bank_detail_change: "Bank-detail change",
  revision_cap: "Revision cap",
  precedent: "Precedent",
  correction: "Correction check",
};

type Line = { account: string; debit: number; credit: number; memo?: string };
type LiveRow = {
  _id: string;
  proposalId: string;
  period: string;
  status: "under_review" | "posted" | "escalated" | "failed_rule" | "approved" | "rejected";
  lines: Line[];
  reason: string;
  citations: { sourceType: "policy" | "contract" | "decision" | "correction"; sourceId: string; text: string; score: number }[];
  discardedFirstRead?: string;
  break: { breakId: string; kind: string; description: string; status: string } | null;
  amount: number | null;
  counterparty: string | null;
  date: string | null;
  reference: string | null;
  decision: { decisionId: string; outcome: string; reason: string; rulesRun: { rule: string; kind: string; passed: boolean; detail?: string }[] } | null;
};

const listProposals = makeFunctionReference<"query", { entity: string; period?: string }, LiveRow[]>("api:listProposals");
const startCloseRef = makeFunctionReference<"mutation", { entity: string; period: string }, string | null>("api:startClose");

const dollars = (cents: number) => cents / 100;
const prettyDate = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
const STATUS: Record<LiveRow["status"], ProposalStatus> = {
  posted: "posted",
  approved: "posted",
  rejected: "rejected",
  under_review: "review",
  escalated: "review",
  failed_rule: "review",
};

export function toProposal(r: LiveRow): Proposal {
  const vendor = r.counterparty ?? "Unknown";
  const impact = r.lines.filter((l) => /^[45]/.test(l.account)).reduce((s, l) => s + Math.abs(l.debit - l.credit), 0);
  const credit = r.lines.find((l) => l.credit > 0);
  const citations: Citation[] = r.citations.map((c) => ({ ...c, sourceType: c.sourceType === "decision" ? "precedent" : c.sourceType }));
  const rules: ControlRule[] = (r.decision?.rulesRun ?? []).map((x) => ({ label: RULE_LABEL[x.rule] ?? x.rule, detail: x.detail ?? "", passed: x.passed }));
  return {
    id: r.proposalId,
    title: r.break?.description ?? `${vendor} · ${r.proposalId}`,
    vendor,
    amount: dollars(Math.abs(r.amount ?? 0)),
    impact: dollars(impact),
    date: prettyDate(r.date),
    period: PERIOD_LABEL[r.period] ?? "September 2026",
    status: STATUS[r.status],
    category: r.break?.kind ?? "unmatched",
    description: r.break?.description ?? "",
    reason: r.reason,
    decisionId: r.decision?.decisionId ?? "",
    sourceBank: { label: `${vendor} · ${r.break?.description ?? ""}`, amount: dollars(Math.abs(r.amount ?? 0)), date: prettyDate(r.date), reference: r.reference ?? "" },
    sourceLedger: { label: credit ? `Account ${credit.account}` : "", amount: dollars(credit?.credit ?? 0), account: credit?.account ?? "" },
    contract: { title: "", clause: "", text: "" }, // getBreak carries the contract; the center panel wires it in Phase 2 (D3)
    lines: r.lines.map((l) => ({ account: l.account, name: l.memo ?? l.account, debit: dollars(l.debit), credit: dollars(l.credit) })),
    citations,
    audit: [], // api.getDecision has the audit rows; the right panel wires them in Phase 2 (D4)
    rules,
    revisionNote: r.discardedFirstRead ? `First read discarded: ${r.discardedFirstRead}` : undefined,
  };
}

/** Subscribes to every proposal for the entity and hands the mapped list up. Renders nothing. */
export function LiveProposals({ onRows }: { onRows: (rows: Proposal[]) => void }) {
  const rows = useQuery(listProposals, { entity: ENTITY });
  useEffect(() => {
    if (rows) onRows(rows.map(toProposal));
  }, [rows, onRows]);
  return null;
}

/** "Prepare <period> close": starts the Workflow for that period (idempotent while one is running). */
export function startClose(period: Period) {
  return http?.mutation(startCloseRef, { entity: ENTITY, period: PERIOD_KEY[period] }) ?? Promise.resolve(null);
}
