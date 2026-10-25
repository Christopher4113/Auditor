// A5: deterministic benchmark scoring. This file is never imported by agent tools.
// All money is integer cents. No planted flag or cached result is used to score.
export type Line = { account: string; debit: number; credit: number };
type Scoped = { _id: string; entity: string; period: string };
export type Key = Scoped & { caseId?: string; breakNumber: number; txnId: string; expectedKind: string;
  expectedLines: Line[]; expectedEscalation?: boolean; dependsOn?: string[]; sourceDocumentIds?: string[]; vendorId?: string };
export type Break = Scoped & { bankTransactionId?: string; kind: string; sourceDocumentIds?: string[] };
export type Proposal = Scoped & { breakId: string; proposalId: string; status: string; lines: Line[];
  revision: number; correctionsApplied: string[]; _creationTime: number };
export type Entry = Scoped & { proposalId?: string; source: string; postedBy: string; lines: Line[] };
export type Decision = Scoped & { proposalId: string; reviewer: string; outcome: string;
  rulesRun: { rule: string; passed: boolean }[] };
export type Event = { entity: string; period?: string; action: string; actor: string; at: number;
  proposalId?: string; breakId?: string; detail?: string; traceId?: string };
export type Input = { entity: string; period?: string; key: Key[]; breaks: Break[]; proposals: Proposal[];
  entries: Entry[]; decisions: Decision[]; banks: (Scoped & { txnId: string; status: string })[];
  events: Event[]; corrections: (Scoped & { proposalId?: string; rule?: string; _creationTime: number })[];
  vendors: { entity: string; vendorId: string; paymentsHeld: boolean }[];
  periods: { entity: string; period: string; status: string; signedAt?: number }[] };

export const DEFAULT_ASSUMPTIONS = { routineMinutes: 3, exceptionMinutes: 15, controllerMinutes: 5, manualCloseDays: 5 };
export type Assumptions = typeof DEFAULT_ASSUMPTIONS;

export function balanced(lines: Line[]): boolean {
  return lines.length >= 2 && lines.every(l => Number.isSafeInteger(l.debit) && Number.isSafeInteger(l.credit)
    && l.debit >= 0 && l.credit >= 0 && !(l.debit && l.credit))
    && lines.reduce((s, l) => s + l.debit, 0) > 0
    && Number.isSafeInteger(lines.reduce((s, l) => s + l.debit, 0))
    && lines.reduce((s, l) => s + l.debit - l.credit, 0) === 0;
}

function net(lines: Line[]): string {
  const amounts = new Map<string, number>();
  for (const l of lines) amounts.set(l.account, (amounts.get(l.account) ?? 0) + l.debit - l.credit);
  if ([...amounts.values()].some(n => !Number.isSafeInteger(n))) return "invalid";
  return JSON.stringify([...amounts].filter(([, n]) => n !== 0).sort(([a], [b]) => a.localeCompare(b)));
}

function totals(cases: { caught: boolean; correct: boolean }[], falsePositives: number) {
  const caught = cases.filter(c => c.caught).length, correct = cases.filter(c => c.correct).length;
  return { planted: cases.length, caught, correct, falsePositives, falseNegatives: cases.length - caught,
    precision: caught + falsePositives ? caught / (caught + falsePositives) : null,
    recall: cases.length ? caught / cases.length : null,
    accuracy: cases.length ? correct / cases.length : null };
}

export function calculate(input: Input, assumptions: Assumptions = DEFAULT_ASSUMPTIONS) {
  const { entity, period } = input;
  const scope = (r: {entity: string; period?: string}) => r.entity === entity && (!period || r.period === period);
  // Load earlier cases for dependency checks; future cases cannot help this period.
  const eligible = (r: {entity: string; period: string}) => r.entity === entity && (!period || r.period <= period);
  const key = input.key.filter(eligible), breaks = input.breaks.filter(eligible);
  const proposals = input.proposals.filter(eligible), entries = input.entries.filter(eligible);
  const decisions = input.decisions.filter(eligible), banks = input.banks.filter(eligible);
  const events = input.events.filter(e => e.entity === entity && (!period || !e.period || e.period <= period));
  const bankById = new Map(banks.map(b => [b._id, b.txnId]));
  const signature = (b: Break) => `${b.period}:${bankById.get(b.bankTransactionId ?? "") ?? ([...(b.sourceDocumentIds ?? [])].sort().join(",") || b._id)}`;
  const groups = new Map<string, Break[]>();
  for (const b of breaks) groups.set(signature(b), [...(groups.get(signature(b)) ?? []), b]);
  const matches = (b: Break, k: Key) => b.period === k.period && (k.txnId
    ? bankById.get(b.bankTransactionId ?? "") === k.txnId
    : (b.sourceDocumentIds ?? []).some(id => (k.sourceDocumentIds ?? []).includes(id)));
  const allCases = key.map(k => {
    const found = breaks.filter(b => matches(b, k)), ids = new Set(found.map(b => b._id));
    const ps = proposals.filter(p => ids.has(p.breakId) && p.period === k.period);
    const proposalIds = new Set(ps.map(p => p._id));
    const posted = entries.filter(e => e.period === k.period && e.source === "post_entry" && proposalIds.has(e.proposalId ?? ""));
    const ds = decisions.filter(d => d.period === k.period && proposalIds.has(d.proposalId));
    const escalated = ds.some(d => d.outcome === "escalated" || d.reviewer === "human")
      || events.some(e => e.period === k.period && proposalIds.has(e.proposalId ?? "") && e.action === "request_approval");
    const hold = k.breakNumber !== 5 || input.vendors.some(v => v.entity === entity && v.vendorId === k.vendorId && v.paymentsHeld);
    const accountingCorrect = posted.length > 0 && posted.every(e => balanced(e.lines)
      && (e.postedBy === "controls" || e.postedBy === "human")
      && ds.some(d => d.proposalId === e.proposalId && (d.outcome === "approved" || d.outcome === "posted")))
      && balanced(k.expectedLines) && net(posted.flatMap(e => e.lines)) === net(k.expectedLines);
    const controlsCorrect = hold && (k.expectedEscalation === undefined || escalated === k.expectedEscalation);
    return { caseId: k.caseId ?? k._id, period: k.period, breakNumber: k.breakNumber, kind: k.expectedKind,
      caught: found.length > 0, accountingCorrect, controlsCorrect, dependenciesSatisfied: false,
      correct: false, postedEntries: posted.length, escalated, dependencies: k.dependsOn ?? [] };
  }).sort((a,b) => a.period.localeCompare(b.period) || a.breakNumber - b.breakNumber);
  const done = new Map<string, boolean>();
  for (const c of allCases) {
    c.dependenciesSatisfied = c.dependencies.every(id => done.get(id) === true);
    c.correct = c.caught && c.accountingCorrect && c.controlsCorrect && c.dependenciesSatisfied;
    done.set(c.caseId, c.correct);
  }
  const cases = allCases.filter(c => !period || c.period === period);
  const falseGroups = [...groups.values()].filter(g => scope(g[0]) && !key.some(k => g.some(b => matches(b, k))));
  const overall = totals(cases, falseGroups.length);
  const byBreak = [...new Set(cases.map(c => c.breakNumber))].sort().map(breakNumber => {
    const cs = cases.filter(c => c.breakNumber === breakNumber), kinds = new Set(cs.map(c => c.kind));
    return { breakNumber, ...totals(cs, falseGroups.filter(g => kinds.has(g[0].kind)).length) };
  });
  const selectedEvents = events.filter(scope), selectedProposals = proposals.filter(scope), selectedBanks = banks.filter(scope);
  const selectedBreaks = breaks.filter(scope), selectedDecisions = decisions.filter(scope);
  const codeIds = new Set(selectedEvents.filter(e => e.action === "match.close").map(e => e.detail));
  const closedByCode = selectedBanks.filter(b => codeIds.has(b._id)).length;
  const investigated = new Set(selectedProposals.map(p => p.breakId)).size;
  const escalations = new Set(selectedDecisions.filter(d => d.outcome === "escalated").map(d => d.proposalId));
  for (const e of selectedEvents) if (e.action === "request_approval" && e.proposalId) escalations.add(e.proposalId);
  const humanReviews = new Set(selectedEvents.filter(e => e.actor === "human" && ["approve", "reject", "vendor.hold.kept", "vendor.hold.released"].includes(e.action))
    .map(e => e.proposalId ?? e.traceId ?? String(e.at))).size;
  const manualMinutes = closedByCode * assumptions.routineMinutes + investigated * assumptions.exceptionMinutes + humanReviews * assumptions.controllerMinutes;
  const controllerMinutes = humanReviews * assumptions.controllerMinutes;
  const cashProtectedCents = cases.filter(c => c.correct && [2,5].includes(c.breakNumber)).reduce((sum,c) => {
    const k = key.find(k => (k.caseId ?? k._id) === c.caseId)!;
    return sum + k.expectedLines.reduce((n,l) => n + l.debit, 0);
  },0);
  const misclassificationCorrectedCents = cases.filter(c => c.correct && c.breakNumber === 3).reduce((sum,c) => {
    const k = key.find(k => (k.caseId ?? k._id) === c.caseId)!;
    return sum + k.expectedLines.filter(l => /^[45]/.test(l.account)).reduce((n,l) => n + Math.abs(l.debit-l.credit),0);
  },0);
  // Count repeated failures of the SAME rule after its correction, on the same
  // break; proposal revisions alone and unrelated corrections are not mistakes.
  const repeats = new Set<string>();
  for (const correction of input.corrections.filter(eligible)) {
    const original = proposals.find(p => p._id === correction.proposalId);
    if (!original || !correction.rule) continue;
    for (const p of selectedProposals.filter(p => p.breakId === original.breakId && p._creationTime > correction._creationTime)) {
      if (selectedDecisions.some(d => d.proposalId === p._id && d.rulesRun.some(r => r.rule === correction.rule && !r.passed))) repeats.add(`${p._id}:${correction.rule}`);
    }
  }
  const periods = input.periods.filter(scope).map(p => {
    const start = events.filter(e => e.period === p.period && e.action === "close.start").map(e => e.at);
    const elapsed = p.signedAt !== undefined && start.length && p.signedAt >= Math.min(...start) ? (p.signedAt - Math.min(...start)) / 86400000 : null;
    return { period: p.period, status: p.status,
      closeElapsedDays: elapsed, estimatedDaysSaved: elapsed === null ? null : assumptions.manualCloseDays - elapsed,
      escalations: new Set(decisions.filter(d => d.period === p.period && d.outcome === "escalated").map(d => d.proposalId)).size };
  }).sort((a,b) => a.period.localeCompare(b.period));
  return { entity, period: period ?? null, overall, byBreak, cases: cases.map(({dependencies, ...c}) => c),
    impact: { assumptions, closedByCode, investigated, humanReviews, escalations: escalations.size,
      manualMinutes, controllerMinutes, estimatedHoursSaved: (manualMinutes-controllerMinutes)/60,
      cashProtectedCents, misclassificationCorrectedCents, repeatMistakes: repeats.size, periods,
      basis: "Recorded activity; time savings are estimates. Protected exposure is not realized cash savings. Elapsed close time is wall time from close.start to controller signature. Repeat mistakes count later failures of the same recorded rule on the same break; free-text human instructions are not graded." } };
}
