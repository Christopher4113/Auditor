// Read-only Phase 2 subscriptions. Raw wire records are adapted in pure, tested functions.
import { useEffect } from "react";
import {
  ConvexReactClient,
  useConvexConnectionState,
  useQuery,
} from "convex/react";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
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
      ? parsed.href
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

export type LiveSnapshot = {
  proposals: Proposal[];
  periods: WirePeriod[];
  score?: WireScoreboard;
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
  const rows = useQuery(refs.proposals, { entity: ENTITY });
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
      workflow,
      audit: audit?.map(toAuditItem) ?? [],
      loading:
        rows === undefined ||
        periods === undefined ||
        score === undefined ||
        workflow === undefined ||
        audit === undefined,
      connected: connection.isWebSocketConnected,
      period,
    });
  }, [
    rows,
    periods,
    score,
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
  approve: makeFunctionReference<"mutation", { entity: string; proposalId: string; note?: string }, unknown>("api:approve"),
  reject: makeFunctionReference<"mutation", { entity: string; proposalId: string; instruction: string }, unknown>("api:reject"),
  sign: makeFunctionReference<"mutation", EntityPeriodArgs, unknown>("api:signPeriod"),
};
function requireHttp() {
  if (!http) throw new Error("A live workspace is not configured.");
  return http;
}
export const approve = (proposalId: string, note: string) => requireHttp().mutation(human.approve, { entity: ENTITY, proposalId, note });
export const reject = (proposalId: string, instruction: string) => requireHttp().mutation(human.reject, { entity: ENTITY, proposalId, instruction });
export const signPeriod = (period: Period) => requireHttp().mutation(human.sign, { entity: ENTITY, period: toPeriodKey(period) });
/** Convex wraps thrown errors as "[Request ID: …] Server Error Uncaught Error: <message> at …"; keep only the message. */
export const reason = (e: Error) => e.message.replace(/^.*?Uncaught Error: /, "").replace(/\s+at .*$/s, "");
