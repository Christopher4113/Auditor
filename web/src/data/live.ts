// Reactive workspace subscriptions and explicit controller actions. Server results stay authoritative.
import { useEffect } from "react";
import {
  ConvexReactClient,
  useConvexConnectionState,
  useQuery,
} from "convex/react";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { assertCurrentApproval } from "./controller-preflight";
import type { AuditItem, Period, Proposal } from "./types";
import type {
  EntityArgs,
  EntityPeriodArgs,
  GetBreakArgs,
  GetBreakResult,
  GetDecisionArgs,
  GetDecisionResult,
  LiveProposalRow,
  ListProposalsArgs,
  WireAuditEvent,
  WireCloseStatus,
  WirePeriod,
  WireScoreboard,
  WireCloseSummary,
  WireRuleResult,
  ApproveArgs,
  ApproveResult,
  RejectArgs,
  RejectResult,
  SignPeriodResult,
} from "./contracts";
import {
  mergeProposalDetails,
  toAuditItem,
  toPeriodKey,
  toProposal,
} from "./adapters";

export const ENTITY = "eo-festival-nyc";
const configuredUrl = import.meta.env.CONVEX_URL as string | undefined;
function validUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol)
      ? parsed.origin
      : undefined;
  } catch {
    return undefined;
  }
}
const url = validUrl(configuredUrl);
export const configurationError = Boolean(configuredUrl && !url);
export const convex = url ? new ConvexReactClient(url) : null;
const http = url ? new ConvexHttpClient(url) : null;

const refs = {
  summary: makeFunctionReference<"query", EntityPeriodArgs, WireCloseSummary>(
    "api:closeSummary",
  ),
  proposals: makeFunctionReference<
    "query",
    ListProposalsArgs,
    LiveProposalRow[]
  >("api:listProposals"),
  periods: makeFunctionReference<"query", EntityArgs, WirePeriod[]>(
    "api:listPeriods",
  ),
  score: makeFunctionReference<"query", EntityPeriodArgs, WireScoreboard>(
    "api:scoreboard",
  ),
  status: makeFunctionReference<
    "query",
    EntityPeriodArgs,
    WireCloseStatus | null
  >("api:closeStatus"),
  audit: makeFunctionReference<
    "query",
    EntityArgs & { period?: string; limit?: number },
    WireAuditEvent[]
  >("api:auditTrail"),
  sources: makeFunctionReference<"query", GetBreakArgs, GetBreakResult | null>(
    "api:getBreak",
  ),
  decision: makeFunctionReference<"query", GetDecisionArgs, GetDecisionResult>(
    "api:getDecision",
  ),
  start: makeFunctionReference<"mutation", EntityPeriodArgs, string | null>(
    "api:startClose",
  ),
};

export type LiveControlResult = WireRuleResult & { proposalId: string };

export type LiveSnapshot = {
  proposals: Proposal[];
  periods: WirePeriod[];
  score?: WireScoreboard;
  summary?: WireCloseSummary;
  controlResults: LiveControlResult[];
  feedComplete: boolean;
  workflow?: WireCloseStatus | null;
  audit: AuditItem[];
  loading: boolean;
  connected: boolean;
  period: Period;
};
export type LiveDetails = { id: string; proposal: Proposal; loading: boolean };

/** One subscription per feed, with server data remaining authoritative. */
export function LiveWorkspace({
  period,
  onData,
}: {
  period: Period;
  onData: (snapshot: LiveSnapshot) => void;
}) {
  const periodKey = toPeriodKey(period);
  const rows = useQuery(refs.proposals, { entity: ENTITY, period: periodKey });
  const summary = useQuery(refs.summary, { entity: ENTITY, period: periodKey });
  const periods = useQuery(refs.periods, { entity: ENTITY });
  const score = useQuery(refs.score, { entity: ENTITY, period: periodKey });
  const workflow = useQuery(refs.status, { entity: ENTITY, period: periodKey });
  const audit = useQuery(refs.audit, {
    entity: ENTITY,
    period: periodKey,
    limit: 100,
  });
  const connection = useConvexConnectionState();
  useEffect(() => {
    onData({
      proposals: rows?.map(toProposal) ?? [],
      periods: periods ?? [],
      score,
      summary,
      controlResults:
        rows?.flatMap((row) =>
          (row.decision?.rulesRun ?? []).map((rule) => ({
            ...rule,
            proposalId: row.proposalId,
          })),
        ) ?? [],
      feedComplete: rows !== undefined && rows.length < 200,
      workflow,
      audit: audit?.map(toAuditItem) ?? [],
      loading:
        rows === undefined ||
        periods === undefined ||
        score === undefined ||
        summary === undefined ||
        workflow === undefined ||
        audit === undefined,
      connected: connection.isWebSocketConnected,
      period,
    });
  }, [
    rows,
    periods,
    score,
    summary,
    workflow,
    audit,
    connection.isWebSocketConnected,
    period,
    onData,
  ]);
  return null;
}

/** Each selected revision gets its own decision and audit subscription by internal Convex ID. */
export function LiveSelection({
  proposal,
  onData,
}: {
  proposal: Proposal;
  onData: (details: LiveDetails) => void;
}) {
  const sources = useQuery(
    refs.sources,
    proposal.breakBackendId ? { id: proposal.breakBackendId } : "skip",
  );
  const decision = useQuery(
    refs.decision,
    proposal.backendId ? { proposalId: proposal.backendId } : "skip",
  );
  useEffect(() => {
    onData({
      id: proposal.id,
      proposal: mergeProposalDetails(proposal, sources, decision),
      loading: sources === undefined || decision === undefined,
    });
  }, [proposal, sources, decision, onData]);
  return null;
}

/** No local success fallback: callers await the actual workflow ID and handle rejection. */
export async function startClose(period: Period): Promise<string> {
  if (!http) throw new Error("A live workspace is not configured.");
  const workflowId = await http.mutation(refs.start, {
    entity: ENTITY,
    period: toPeriodKey(period),
  });
  if (!workflowId)
    throw new Error(
      "This period cannot start a close. It may already be signed.",
    );
  return workflowId;
}

// ── Human controller moves (C3). proposalId is the rail's external code, e.g. "P-sample-bank-04-r1". ──
const human = {
  approve: makeFunctionReference<"mutation", ApproveArgs, ApproveResult>(
    "api:approve",
  ),
  reject: makeFunctionReference<"mutation", RejectArgs, RejectResult>(
    "api:reject",
  ),
  sign: makeFunctionReference<"mutation", EntityPeriodArgs, SignPeriodResult>(
    "api:signPeriod",
  ),
};
function requireHttp() {
  if (!http) throw new Error("A live workspace is not configured.");
  return http;
}
/** Refresh payment holds and revision state immediately before an explicit approval. */
export async function checkApproval(proposal: Proposal): Promise<void> {
  if (!proposal.backendId || !proposal.breakBackendId)
    throw new Error(
      "The proposal's source identifiers are unavailable. Reconnect and try again.",
    );
  const client = requireHttp();
  const [sources, decision] = await Promise.all([
    client.query(refs.sources, { id: proposal.breakBackendId }),
    client.query(refs.decision, { proposalId: proposal.backendId }),
  ]);
  assertCurrentApproval(proposal, sources, decision);
}
export const approve = (proposalId: string, note: string) =>
  requireHttp().mutation(human.approve, { entity: ENTITY, proposalId, note });
export const reject = (proposalId: string, instruction: string) =>
  requireHttp().mutation(human.reject, {
    entity: ENTITY,
    proposalId,
    instruction,
  });
export const signPeriod = (period: Period) =>
  requireHttp().mutation(human.sign, {
    entity: ENTITY,
    period: toPeriodKey(period),
  });
export { controllerError as reason } from "./controller";

// ── Phase 3 seams: the Inject drawer, the Permissions drawer's "make the agent post", Ask Auditor. ──
import type { AskAnswer } from "./ask-demo";
type InjectResult = { traceId: string };
const phase3 = {
  bank: makeFunctionReference<"mutation", { entity: string; date: string; amount: number; counterparty: string; memo: string }, InjectResult & { txnId: string }>("inject:injectBankTransaction"),
  amend: makeFunctionReference<"mutation", { entity: string; counterparty: string; text: string; effectiveDate: string }, InjectResult & { clauseId: string }>("inject:amendContract"),
  bankChange: makeFunctionReference<"mutation", { entity: string; vendorName: string; newLast4: string; source: string; paymentAmount?: number; date?: string }, InjectResult>("inject:changeVendorBank"),
  attemptAgentPost: makeFunctionReference<"mutation", { entity: string; proposalId: string }, { ok: boolean; reason: string }>("api:attemptAgentPost"),
  ask: makeFunctionReference<"action", { entity: string; question: string; asOf?: string; proposalCode?: string }, { answer: string; citations: { sourceId: string; text: string }[]; sourcesAvailable: boolean }>("ask:askAuditor"),
};
function requireLive() {
  if (!http) throw new Error("A live workspace is not configured.");
  return http;
}
/** Judge's scenario from the Inject drawer. Amounts arrive in dollars; payments are money out. */
export async function injectScenario(kind: string, vendor: string, amountDollars: number, note: string, period: Period): Promise<string> {
  const key = toPeriodKey(period);
  const date = `${key}-15`;
  const h = requireLive();
  if (kind === "contract_amendment") {
    const r = await h.mutation(phase3.amend, { entity: ENTITY, counterparty: vendor, text: note, effectiveDate: date });
    return r.traceId;
  }
  if (kind === "vendor_bank_change") {
    const first = note.match(/\b\d{4}\b/); // "...a new account ending 8832 instead of 4471": the first 4-digit group is the new one
    const newLast4 = first ? first[0] : "8832";
    const r = await h.mutation(phase3.bankChange, { entity: ENTITY, vendorName: vendor, newLast4, source: "inject", paymentAmount: amountDollars > 0 ? Math.round(Math.abs(amountDollars) * 100) : undefined, date });
    return r.traceId;
  }
  const r = await h.mutation(phase3.bank, { entity: ENTITY, date, amount: -Math.round(Math.abs(amountDollars) * 100), counterparty: vendor, memo: note });
  return r.traceId;
}
/** "Make the agent post": refused server-side (8.1); the reason is the toast and the denial is in the audit log. */
export async function attemptAgentPost(proposalId: string): Promise<{ ok: boolean; reason: string }> {
  return requireLive().mutation(phase3.attemptAgentPost, { entity: ENTITY, proposalId });
}
/** Ask Auditor: Group B's action answers from retrieved citations only. */
export async function askAuditor(question: string, period: Period, proposalCode?: string): Promise<AskAnswer> {
  const r = await requireLive().action(phase3.ask, { entity: ENTITY, question, asOf: `${toPeriodKey(period)}-28`, proposalCode });
  return { text: r.answer, citations: r.citations.map((c) => ({ sourceType: c.sourceId.startsWith("D-") ? "precedent" : c.sourceId.startsWith("policy") ? "policy" : "contract", sourceId: c.sourceId, text: c.text })) };
}
