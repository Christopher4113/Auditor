import { describe, expect, it } from "vitest";
import { evaluate, plImpact, type EvalCtx, type Proposal } from "./rules";
import { STUB_HITS } from "../agent/fake";

// ── Helpers ────────────────────────────────────────────────────────────────────

const THRESHOLD = 500_000; // 500k cents = $5,000

function baseCtx(overrides: Partial<EvalCtx> = {}): EvalCtx {
  return {
    now: Date.now(),
    periodStatus: "open",
    thresholdCents: THRESHOLD,
    precedentScopes: [],
    openCorrectionIds: [],
    vendorHeld: false,
    sources: new Map([
      ["policy-5.1", STUB_HITS["policy-5.1"]],
      ["apex-9.4", STUB_HITS["apex-9.4"]],
      ["D-0417", STUB_HITS["D-0417"]],
      ["policy-6.1", "All ticket revenue is deferred until the event date. Payment processing fees are expensed at payout."],
    ]),
    breakKind: "deposit_shortfall",
    ...overrides,
  };
}

function balancedProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    lines: [
      { account: "1000", debit: 1_360_000, credit: 0 },
      { account: "5160", debit: 240_000, credit: 0 },
      { account: "1200", debit: 0, credit: 1_600_000 },
    ],
    citations: [
      { sourceType: "decision", sourceId: "D-0417", text: STUB_HITS["D-0417"], score: 0.91 },
      { sourceType: "contract", sourceId: "apex-9.4", text: STUB_HITS["apex-9.4"], score: 0.88 },
      { sourceType: "policy", sourceId: "policy-5.1", text: STUB_HITS["policy-5.1"], score: 0.85 },
    ],
    revision: 1,
    correctionsApplied: [],
    discardedFirstRead: "receivable 2,400",
    ...overrides,
  };
}

const apexPrecedent = JSON.stringify({ breakKind: "deposit_shortfall" });

// ── The moment (Apex, Sept 25) ────────────────────────────────────────────────

describe("the moment — Apex deposit shortfall", () => {
  it("posts when all rules pass with precedent D-0417", () => {
    const result = evaluate(
      balancedProposal(),
      baseCtx({ precedentScopes: [apexPrecedent] }),
    );
    expect(result.outcome).toBe("posted");
  });

  it("has all rules passed in rulesRun", () => {
    const { rulesRun } = evaluate(
      balancedProposal(),
      baseCtx({ precedentScopes: [apexPrecedent] }),
    );
    for (const r of rulesRun) {
      expect(r.passed).toBe(true);
    }
  });

  it("P&L impact is 240,000¢ (expense line only)", () => {
    expect(plImpact(balancedProposal().lines)).toBe(240_000);
  });
});

// ── Break 1: Stripe fee netting (stripe_fee_netting) ─────────────────────────

describe("break 1 — stripe_fee_netting", () => {
  const stripeProposal: Proposal = {
    lines: [
      { account: "5400", debit: 142_000, credit: 0 },
      { account: "1000", debit: 0, credit: 142_000 },
    ],
    citations: [
      { sourceType: "policy", sourceId: "policy-6.1", text: "Payment processing fees are expensed at payout.", score: 0.9 },
    ],
    revision: 1,
    correctionsApplied: [],
  };

  it("escalates on first occurrence (no precedent)", () => {
    const result = evaluate(stripeProposal, baseCtx({ breakKind: "stripe_fee_netting" }));
    expect(result.outcome).toBe("escalated");
    const precedentRule = result.rulesRun.find((r) => r.rule === "precedent")!;
    expect(precedentRule.passed).toBe(false);
  });

  it("posts after human sets precedent (second occurrence)", () => {
    const ctx = baseCtx({
      breakKind: "stripe_fee_netting",
      precedentScopes: [JSON.stringify({ breakKind: "stripe_fee_netting" })],
    });
    const result = evaluate(stripeProposal, ctx);
    expect(result.outcome).toBe("posted");
  });

  it("trap: booking shortfall as receivable (1150) instead of fee (5400)", () => {
    const trapProposal: Proposal = {
      lines: [
        { account: "1150", debit: 142_000, credit: 0 },
        { account: "1000", debit: 0, credit: 142_000 },
      ],
      citations: [{ sourceType: "policy", sourceId: "policy-6.1", text: "Payment processing fees are expensed at payout.", score: 0.9 }],
      revision: 1,
      correctionsApplied: [],
    };
    // P&L impact is 0 (both balance sheet accounts) → threshold passes,
    // but first occurrence still escalates without a precedent.
    const result = evaluate(trapProposal, baseCtx({ breakKind: "stripe_fee_netting" }));
    expect(result.outcome).toBe("escalated");
  });
});

// ── Break 3: Northern Lines deposit shortfall (deposit_shortfall, 900k P&L) ──

describe("break 3 — deposit_shortfall at 9,000", () => {
  const northernProposal: Proposal = {
    lines: [
      { account: "5050", debit: 900_000, credit: 0 },
      { account: "1200", debit: 0, credit: 900_000 },
    ],
    citations: [
      { sourceType: "policy", sourceId: "policy-5.1", text: STUB_HITS["policy-5.1"], score: 0.85 },
    ],
    revision: 1,
    correctionsApplied: [],
  };

  it("escalates due to threshold (P&L 900k > 500k)", () => {
    const result = evaluate(northernProposal, baseCtx({ breakKind: "deposit_shortfall" }));
    expect(result.outcome).toBe("escalated");
    const thresholdRule = result.rulesRun.find((r) => r.rule === "threshold")!;
    expect(thresholdRule.passed).toBe(false);
  });

  it("P&L impact is 900,000¢", () => {
    expect(plImpact(northernProposal.lines)).toBe(900_000);
  });

  it("trap: booking as receivable reduction (balance sheet) hides P&L — still escalates first occurrence", () => {
    const trapProposal: Proposal = {
      lines: [
        { account: "1200", debit: 900_000, credit: 0 }, // write off deposit
        { account: "2000", debit: 0, credit: 900_000 }, // credit AP — wrong
      ],
      citations: [{ sourceType: "policy", sourceId: "policy-5.1", text: STUB_HITS["policy-5.1"], score: 0.85 }],
      revision: 1,
      correctionsApplied: [],
    };
    // P&L = 0, under threshold, no precedent → escalates as first occurrence
    const result = evaluate(trapProposal, baseCtx({ breakKind: "deposit_shortfall" }));
    expect(result.outcome).toBe("escalated");
  });
});

// ── Break 5: Bank detail change / vendor hold (bank_detail_change) ───────────

describe("break 5 — bank_detail_change (Field & Flame)", () => {
  const paymentProposal: Proposal = {
    lines: [
      { account: "2000", debit: 4_200_000, credit: 0 },
      { account: "1000", debit: 0, credit: 4_200_000 },
    ],
    citations: [{ sourceType: "policy", sourceId: "policy-5.1", text: STUB_HITS["policy-5.1"], score: 0.85 }],
    revision: 1,
    correctionsApplied: [],
  };

  it("escalates when vendor is held (policy 4.3)", () => {
    const result = evaluate(
      paymentProposal,
      baseCtx({ breakKind: "bank_detail_change", vendorHeld: true }),
    );
    expect(result.outcome).toBe("escalated");
    const r = result.rulesRun.find((r) => r.rule === "bank_detail_change")!;
    expect(r.passed).toBe(false);
  });

  it("trap: agent tries to release held payment regardless — still escalated", () => {
    const result = evaluate(
      paymentProposal,
      baseCtx({
        breakKind: "bank_detail_change",
        vendorHeld: true,
        precedentScopes: [JSON.stringify({ breakKind: "bank_detail_change" })],
      }),
    );
    // Precedent cannot override a vendor hold
    expect(result.outcome).toBe("escalated");
  });
});

// ── Period lock (policy 3.0) ──────────────────────────────────────────────────

describe("period lock", () => {
  it("returns proposal when period is signed", () => {
    const result = evaluate(
      balancedProposal(),
      baseCtx({ periodStatus: "signed", precedentScopes: [apexPrecedent] }),
    );
    expect(result.outcome).toBe("returned");
    const lock = result.rulesRun.find((r) => r.rule === "period_lock")!;
    expect(lock.passed).toBe(false);
  });

  it("passes when period is open", () => {
    const { rulesRun } = evaluate(
      balancedProposal(),
      baseCtx({ periodStatus: "open", precedentScopes: [apexPrecedent] }),
    );
    expect(rulesRun.find((r) => r.rule === "period_lock")!.passed).toBe(true);
  });
});

// ── Revision cap ──────────────────────────────────────────────────────────────

describe("revision cap", () => {
  it("escalates on third revision", () => {
    const result = evaluate(
      balancedProposal({ revision: 3 }),
      baseCtx({ precedentScopes: [apexPrecedent] }),
    );
    expect(result.outcome).toBe("escalated");
    const cap = result.rulesRun.find((r) => r.rule === "revision_cap")!;
    expect(cap.passed).toBe(false);
  });

  it("allows second revision", () => {
    const result = evaluate(
      balancedProposal({ revision: 2 }),
      baseCtx({ precedentScopes: [apexPrecedent] }),
    );
    expect(result.outcome).toBe("posted");
  });
});

// ── Precedent exception (policy 8.2) ─────────────────────────────────────────

describe("8.2 precedent exception", () => {
  it("posts when precedent exists and threshold passes", () => {
    const result = evaluate(
      balancedProposal(),
      baseCtx({ breakKind: "deposit_shortfall", precedentScopes: [apexPrecedent] }),
    );
    expect(result.outcome).toBe("posted");
    const precedentRule = result.rulesRun.find((r) => r.rule === "precedent")!;
    expect(precedentRule.passed).toBe(true);
  });

  it("does not override threshold failure", () => {
    const bigProposal: Proposal = {
      lines: [
        { account: "5050", debit: 600_000, credit: 0 },
        { account: "1200", debit: 0, credit: 600_000 },
      ],
      citations: [{ sourceType: "policy", sourceId: "policy-5.1", text: STUB_HITS["policy-5.1"], score: 0.85 }],
      revision: 1,
      correctionsApplied: [],
    };
    const result = evaluate(
      bigProposal,
      baseCtx({ breakKind: "deposit_shortfall", precedentScopes: [apexPrecedent] }),
    );
    // P&L = 600k > 500k → threshold fails → escalate despite precedent
    expect(result.outcome).toBe("escalated");
    expect(result.rulesRun.find((r) => r.rule === "threshold")!.passed).toBe(false);
  });
});

// ── Correction check ──────────────────────────────────────────────────────────

describe("correction check", () => {
  it("returns when open correction is not applied", () => {
    const result = evaluate(
      balancedProposal({ correctionsApplied: [] }),
      baseCtx({ openCorrectionIds: ["C-0012"], precedentScopes: [apexPrecedent] }),
    );
    expect(result.outcome).toBe("returned");
    expect(result.rulesRun.find((r) => r.rule === "correction")!.passed).toBe(false);
  });

  it("passes when correction is applied", () => {
    const result = evaluate(
      balancedProposal({ correctionsApplied: ["C-0012"] }),
      baseCtx({ openCorrectionIds: ["C-0012"], precedentScopes: [apexPrecedent] }),
    );
    expect(result.outcome).toBe("posted");
  });
});

// ── Balance rule ──────────────────────────────────────────────────────────────

describe("balance rule", () => {
  it("returns when debits ≠ credits", () => {
    const unbalanced: Proposal = {
      lines: [
        { account: "1000", debit: 1_000_000, credit: 0 },
        { account: "1200", debit: 0, credit: 900_000 }, // off by 100k
      ],
      citations: [{ sourceType: "policy", sourceId: "policy-5.1", text: STUB_HITS["policy-5.1"], score: 0.85 }],
      revision: 1,
      correctionsApplied: [],
    };
    const result = evaluate(unbalanced, baseCtx({ precedentScopes: [apexPrecedent] }));
    expect(result.outcome).toBe("returned");
    expect(result.rulesRun.find((r) => r.rule === "balance")!.passed).toBe(false);
  });
});

// ── Citation rule ─────────────────────────────────────────────────────────────

describe("citation rule", () => {
  it("returns when citation text is not verbatim substring of source", () => {
    const result = evaluate(
      balancedProposal({
        citations: [
          { sourceType: "policy", sourceId: "policy-5.1", text: "Non-recoverable fees are expensed.", score: 0.9 },
        ],
      }),
      baseCtx({ precedentScopes: [apexPrecedent] }),
    );
    expect(result.outcome).toBe("returned");
    expect(result.rulesRun.find((r) => r.rule === "citation")!.passed).toBe(false);
  });

  it("returns when sourceId is unknown", () => {
    const result = evaluate(
      balancedProposal({
        citations: [{ sourceType: "policy", sourceId: "policy-99.9", text: "some text", score: 0.5 }],
      }),
      baseCtx({ precedentScopes: [apexPrecedent] }),
    );
    expect(result.outcome).toBe("returned");
  });

  it("returns when no citations provided", () => {
    const result = evaluate(
      balancedProposal({ citations: [] }),
      baseCtx({ precedentScopes: [apexPrecedent] }),
    );
    expect(result.outcome).toBe("returned");
    expect(result.rulesRun.find((r) => r.rule === "citation")!.passed).toBe(false);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe("determinism", () => {
  it("same input produces same output on repeated calls", () => {
    const proposal = balancedProposal();
    const ctx = baseCtx({ precedentScopes: [apexPrecedent] });
    const r1 = evaluate(proposal, ctx);
    const r2 = evaluate(proposal, ctx);
    expect(r1).toEqual(r2);
  });
});

// ── Rule count ────────────────────────────────────────────────────────────────

describe("rulesRun completeness", () => {
  it("always runs 8 rules regardless of outcome", () => {
    const scenarios = [
      baseCtx({ precedentScopes: [apexPrecedent] }),
      baseCtx({ periodStatus: "signed" }),
      baseCtx({ thresholdCents: 100 }), // threshold fail
      baseCtx({ vendorHeld: true }),
      baseCtx({}), // first occurrence
    ];
    for (const ctx of scenarios) {
      const { rulesRun } = evaluate(balancedProposal(), ctx);
      expect(rulesRun).toHaveLength(8);
    }
  });
});
