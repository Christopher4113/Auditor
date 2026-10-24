// Pure stub rules engine for Phase 1 demo and tests. No model calls, no I/O.
// B2: replaced by the real engine in Phase 2 (B4); Workflow entry points stay the same.

export type RuleResult = {
  ruleId: string;
  clause: string;
  kind: string;
  passed: boolean;
  effect: string;
  detail: string;
  evidence?: string;
};

export type ReviewOutcome = {
  outcome: "posted" | "returned" | "escalated";
  decisionCode: string;
  rules: RuleResult[];
  reason: string;
};

/**
 * Returns a canned review result: all rules passed, entry posted, decision D-0625.
 * Used for the Apex moment demo in Phase 1.
 */
export function stubReview(): ReviewOutcome {
  return {
    outcome: "posted",
    decisionCode: "D-0625",
    rules: [
      {
        ruleId: "rule_balance",
        clause: "2.0",
        kind: "balance",
        passed: true,
        effect: "post",
        detail: "Debits 1,600,000¢ equal credits 1,600,000¢",
      },
      {
        ruleId: "rule_citation",
        clause: "9.0",
        kind: "citation",
        passed: true,
        effect: "post",
        detail: "3 verbatim citations verified",
      },
      {
        ruleId: "rule_period_lock",
        clause: "3.0",
        kind: "period_lock",
        passed: true,
        effect: "post",
        detail: "Period 2026-09 is open",
      },
      {
        ruleId: "rule_threshold",
        clause: "8.0",
        kind: "threshold",
        passed: true,
        effect: "post",
        detail: "P&L impact 240,000¢ is under 500,000¢ threshold",
      },
      {
        ruleId: "rule_self_approval",
        clause: "8.1",
        kind: "self_approval",
        passed: true,
        effect: "post",
        detail: "Reviewer is controls, not proposer agent",
      },
      {
        ruleId: "rule_precedent",
        clause: "8.2",
        kind: "precedent",
        passed: true,
        effect: "post",
        detail: "Human-decided precedent D-0417 covers deposit_shortfall under threshold",
        evidence: "D-0417",
      },
    ],
    reason:
      "All rules passed. Precedent D-0417 pre-approves this deposit_shortfall. Entry posted.",
  };
}
