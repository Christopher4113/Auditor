import { describe, expect, it } from "vitest";
import { stubReview } from "./stub";

describe("stubReview", () => {
  const result = stubReview();

  it("outcome is 'posted'", () => {
    expect(result.outcome).toBe("posted");
  });

  it("decision code is D-0625", () => {
    expect(result.decisionCode).toBe("D-0625");
  });

  it("all rules passed", () => {
    for (const rule of result.rules) {
      expect(rule.passed).toBe(true);
    }
  });

  it("has at least one rule", () => {
    expect(result.rules.length).toBeGreaterThan(0);
  });

  it("every rule has required fields", () => {
    for (const rule of result.rules) {
      expect(rule.ruleId).toBeTruthy();
      expect(rule.clause).toBeTruthy();
      expect(rule.kind).toBeTruthy();
      expect(rule.effect).toBeTruthy();
      expect(rule.detail).toBeTruthy();
    }
  });

  it("is deterministic (same output on repeated calls)", () => {
    const r1 = stubReview();
    const r2 = stubReview();
    expect(r1).toEqual(r2);
  });
});
