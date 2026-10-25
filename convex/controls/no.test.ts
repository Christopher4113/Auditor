// B5: the no + hold invariants.
// Scene: Field & Flame bank detail changed Sept 10 (4471 → 8832), 42k payment due Sept 15.
// Human says "keep the hold until callback verification is logged."
// Invariants:
//   1. A proposal for a held vendor always escalates (bank_detail_change rule).
//   2. The hold does not lift on rejection — vendorHeld is never set by the agent.
//   3. No money leaves: postEntry is never reached when bank_detail_change fails.
//   4. The forbidden call (postEntry with caller "agent") is denied regardless.
import { describe, expect, it } from "vitest";
import { evaluate, type EvalCtx, type Proposal } from "./rules";
import { checkPostPermission } from "./postGuard";
import { STUB_HITS } from "../agent/fake";

const THRESHOLD = 500_000;

function heldVendorCtx(overrides: Partial<EvalCtx> = {}): EvalCtx {
  return {
    now: Date.now(),
    periodStatus: "open",
    thresholdCents: THRESHOLD,
    precedentScopes: [JSON.stringify({ breakKind: "bank_detail_change" })], // has precedent — still escalates
    openCorrectionIds: [],
    vendorHeld: true, // 4.3 hold active
    sources: new Map([
      ["policy-4.3", "A bank-account detail change holds payments to that vendor until callback verification is logged."],
      ["D-0417", STUB_HITS["D-0417"]],
    ]),
    breakKind: "bank_detail_change",
    ...overrides,
  };
}

function paymentProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    // A payment proposal to Field & Flame: Dr 2000 4200000 / Cr 1000 4200000
    lines: [
      { account: "2000", debit: 4_200_000, credit: 0 },
      { account: "1000", debit: 0, credit: 4_200_000 },
    ],
    citations: [
      {
        sourceType: "policy",
        sourceId: "policy-4.3",
        text: "A bank-account detail change holds payments to that vendor until callback verification is logged.",
        score: 0.9,
      },
    ],
    revision: 1,
    correctionsApplied: [],
    ...overrides,
  };
}

describe("B5: the no — hold invariants", () => {
  it("escalates a payment proposal for a held vendor (bank_detail_change rule)", () => {
    const result = evaluate(paymentProposal(), heldVendorCtx());
    expect(result.outcome).toBe("escalated");
  });

  it("bank_detail_change rule failed in rulesRun", () => {
    const result = evaluate(paymentProposal(), heldVendorCtx());
    const rule = result.rulesRun.find((r) => r.rule === "bank_detail_change");
    expect(rule).toBeDefined();
    expect(rule!.passed).toBe(false);
    expect(rule!.detail).toMatch(/hold/i);
  });

  it("precedent does NOT override the hold — bank_detail_change always escalates if held", () => {
    // Even with a precedent for bank_detail_change, the hold still escalates.
    const result = evaluate(
      paymentProposal(),
      heldVendorCtx({ precedentScopes: [JSON.stringify({ breakKind: "bank_detail_change" })] }),
    );
    expect(result.outcome).toBe("escalated");
  });

  it("outcome is the same on second revision — nothing retries past the hold", () => {
    const result = evaluate(paymentProposal({ revision: 2 }), heldVendorCtx());
    expect(result.outcome).toBe("escalated");
  });

  it("hold lifted: proposal posts when vendorHeld is false and precedent exists", () => {
    const result = evaluate(
      paymentProposal(),
      heldVendorCtx({ vendorHeld: false, precedentScopes: [JSON.stringify({ breakKind: "bank_detail_change" })] }),
    );
    // P&L impact of 2000/1000 lines = 0 (balance sheet only) → no threshold issue → posts with precedent
    expect(result.outcome).toBe("posted");
  });

  it("evaluate is deterministic — same input, same output (no clock inside rules)", () => {
    const p = paymentProposal();
    const c = heldVendorCtx();
    const r1 = evaluate(p, c);
    const r2 = evaluate(p, c);
    expect(r1.outcome).toBe(r2.outcome);
    expect(r1.rulesRun.map((r) => r.rule)).toEqual(r2.rulesRun.map((r) => r.rule));
    expect(r1.rulesRun.map((r) => r.passed)).toEqual(r2.rulesRun.map((r) => r.passed));
  });
});

describe("B5: forbidden call — postEntry with caller agent", () => {
  it("denied: agent is never allowed to post", () => {
    const r = checkPostPermission("agent", "agent");
    expect(r.allowed).toBe(false);
  });

  it("denied: agent even when proposedBy is controls", () => {
    const r = checkPostPermission("agent", "controls");
    expect(r.allowed).toBe(false);
  });

  it("reason includes 8.1 reference (audit row is meaningful)", () => {
    const r = checkPostPermission("agent", "human");
    expect(r.allowed).toBe(false);
    expect((r as { allowed: false; reason: string }).reason).toContain("8.1");
  });

  it("controls can post a proposal when it is the reviewer (not proposer)", () => {
    const r = checkPostPermission("controls", "agent");
    expect(r.allowed).toBe(true);
  });
});
