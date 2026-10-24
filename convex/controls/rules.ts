// Pure rules evaluation — no Convex I/O, no clock reads.
// B4: evaluate() runs all rules in fixed order and returns per-rule results + outcome.
// The mutation in controls.ts loads context and calls this.

export type Line = { account: string; debit: number; credit: number; memo?: string };
export type Citation = { sourceType: string; sourceId: string; text: string; score: number };

export type RuleResult = {
  rule: string;
  kind: "preventive" | "detective" | "enabling";
  passed: boolean;
  detail?: string;
};

export type Proposal = {
  lines: Line[];
  citations: Citation[];
  /** 1-based revision number; 3rd revision escalates (revision cap). */
  revision: number;
  /** correctionIds the agent applied before this proposal. */
  correctionsApplied: string[];
  discardedFirstRead?: string;
};

export type EvalCtx = {
  now: number;
  periodStatus: "open" | "closing" | "signed";
  thresholdCents: number;
  /** JSON-encoded precedentScope strings from human-decided decisions. */
  precedentScopes: string[];
  /** correctionIds that exist for this entity/period but were NOT applied by this proposal. */
  openCorrectionIds: string[];
  /** True when the transaction's counterparty vendor has a payment hold (policy 4.3). */
  vendorHeld: boolean;
  /**
   * Map from sourceId to full source text. Used for verbatim citation check (policy 9.0).
   * Built by the mutation from policyPacks, contracts, decisions and corrections tables.
   */
  sources: Map<string, string>;
  breakKind: string;
};

export type EvalResult = {
  rulesRun: RuleResult[];
  outcome: "posted" | "returned" | "escalated";
  reason: string;
};

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** P&L impact = sum of |debit − credit| on revenue (4xxx) and expense (5xxx) lines. */
export function plImpact(lines: Line[]): number {
  return lines
    .filter((l) => /^[45]/.test(l.account))
    .reduce((sum, l) => sum + Math.abs(l.debit - l.credit), 0);
}

function hasPrecedent(breakKind: string, precedentScopes: string[]): boolean {
  for (const raw of precedentScopes) {
    try {
      const scope = JSON.parse(raw) as { breakKind?: string };
      if (scope.breakKind === breakKind) return true;
    } catch {
      // skip malformed
    }
  }
  return false;
}

/**
 * Run ALL 8 rules in fixed order, then determine outcome from the results.
 * Every rule always runs so the audit record is complete (policy 9.0).
 *
 * Return-to-agent (count toward revision cap): balance, citation, period_lock, correction.
 * Escalate: threshold (not overridable by precedent), bank_detail_change, revision_cap,
 *           precedent-failed (8.3 first-occurrence).
 * Post: all rules pass, including precedent (8.2 pre-approval).
 */
export function evaluate(proposal: Proposal, ctx: EvalCtx): EvalResult {
  const rulesRun: RuleResult[] = [];

  // ── 1. Balance ────────────────────────────────────────────────────────────
  const debits = proposal.lines.reduce((s, l) => s + l.debit, 0);
  const credits = proposal.lines.reduce((s, l) => s + l.credit, 0);
  rulesRun.push({
    rule: "balance",
    kind: "preventive",
    passed: debits === credits,
    detail: `debits ${debits}¢ credits ${credits}¢`,
  });

  // ── 2. Citation (policy 9.0) ──────────────────────────────────────────────
  const citationChecks = proposal.citations.map((c) => {
    const src = ctx.sources.get(c.sourceId);
    if (!src) return { id: c.sourceId, ok: false, reason: "unknown sourceId" };
    const ok = normalize(src).includes(normalize(c.text));
    return { id: c.sourceId, ok, reason: ok ? "ok" : "not a verbatim substring" };
  });
  const citationPassed =
    proposal.citations.length > 0 && citationChecks.every((c) => c.ok);
  rulesRun.push({
    rule: "citation",
    kind: "detective",
    passed: citationPassed,
    detail:
      proposal.citations.length === 0
        ? "no citations — policy 9.0 requires at least one"
        : citationChecks.map((c) => `${c.id}: ${c.reason}`).join("; "),
  });

  // ── 3. Period lock (policy 3.0) ───────────────────────────────────────────
  rulesRun.push({
    rule: "period_lock",
    kind: "preventive",
    passed: ctx.periodStatus !== "signed",
    detail: `period status: ${ctx.periodStatus}`,
  });

  // ── 4. Correction check ───────────────────────────────────────────────────
  const unapplied = ctx.openCorrectionIds.filter(
    (id) => !proposal.correctionsApplied.includes(id),
  );
  rulesRun.push({
    rule: "correction",
    kind: "detective",
    passed: unapplied.length === 0,
    detail:
      unapplied.length > 0
        ? `unapplied corrections: ${unapplied.join(", ")}`
        : "all corrections applied",
  });

  // ── 5. Threshold (policy 8.0) ─────────────────────────────────────────────
  const pl = plImpact(proposal.lines);
  rulesRun.push({
    rule: "threshold",
    kind: "preventive",
    passed: pl < ctx.thresholdCents,
    detail: `P&L impact ${pl}¢ vs threshold ${ctx.thresholdCents}¢`,
  });

  // ── 6. Bank detail change (policy 4.3) ────────────────────────────────────
  rulesRun.push({
    rule: "bank_detail_change",
    kind: "preventive",
    passed: !ctx.vendorHeld,
    detail: ctx.vendorHeld ? "vendor payment hold active (policy 4.3)" : "no hold",
  });

  // ── 7. Revision cap ───────────────────────────────────────────────────────
  rulesRun.push({
    rule: "revision_cap",
    kind: "preventive",
    passed: proposal.revision < 3,
    detail: `revision ${proposal.revision} (cap is 3)`,
  });

  // ── 8. Precedent (policy 8.2 / 8.3) ──────────────────────────────────────
  const precedentExists = hasPrecedent(ctx.breakKind, ctx.precedentScopes);
  rulesRun.push({
    rule: "precedent",
    kind: "enabling",
    passed: precedentExists,
    detail: precedentExists
      ? `human-decided precedent in scope for ${ctx.breakKind} (policy 8.2 pre-approves)`
      : `no human precedent for ${ctx.breakKind} — first occurrence escalates (policy 8.3)`,
  });

  // ── Outcome determination ─────────────────────────────────────────────────
  const get = (name: string) => rulesRun.find((r) => r.rule === name)!;

  // Return-to-agent: any of the first four rules failed.
  const returnRules = ["balance", "citation", "period_lock", "correction"];
  const returnFailed = rulesRun.filter((r) => returnRules.includes(r.rule) && !r.passed);
  if (returnFailed.length > 0) {
    return {
      rulesRun,
      outcome: "returned",
      reason: `Return rules failed: ${returnFailed.map((r) => r.rule).join(", ")}`,
    };
  }

  // Threshold failure is not overridable — high-value items always need a human.
  if (!get("threshold").passed) {
    return {
      rulesRun,
      outcome: "escalated",
      reason: `Threshold: P&L impact ${pl}¢ ≥ ${ctx.thresholdCents}¢ (policy 8.0)`,
    };
  }

  // Bank detail change or revision cap failure.
  if (!get("bank_detail_change").passed) {
    return { rulesRun, outcome: "escalated", reason: "Vendor payment hold active (policy 4.3)" };
  }
  if (!get("revision_cap").passed) {
    return { rulesRun, outcome: "escalated", reason: `Revision cap: revision ${proposal.revision} ≥ 3` };
  }

  // Precedent: first occurrence escalates (8.3); existing precedent pre-approves (8.2).
  if (!get("precedent").passed) {
    return {
      rulesRun,
      outcome: "escalated",
      reason: `8.3 first occurrence: no human precedent for ${ctx.breakKind}`,
    };
  }

  return {
    rulesRun,
    outcome: "posted",
    reason: `All rules passed; policy 8.2 precedent for ${ctx.breakKind}`,
  };
}
