import { describe, expect, it } from "vitest";
import { checkPostPermission } from "./postGuard";

describe("checkPostPermission — forbidden call (policy 8.1)", () => {
  it("denies agent regardless of proposer", () => {
    const r = checkPostPermission("agent", "human");
    expect(r.allowed).toBe(false);
    expect((r as { allowed: false; reason: string }).reason).toMatch(/8.1/);
    expect((r as { allowed: false; reason: string }).reason).toMatch(/agent/);
  });

  it("denies the proposer posting their own entry", () => {
    const r = checkPostPermission("controls", "controls");
    expect(r.allowed).toBe(false);
    expect((r as { allowed: false; reason: string }).reason).toMatch(/8.1/);
  });

  it("denies human proposer posting their own entry", () => {
    const r = checkPostPermission("human", "human");
    expect(r.allowed).toBe(false);
  });

  it("allows controls to post a human-proposed entry", () => {
    const r = checkPostPermission("controls", "human");
    expect(r.allowed).toBe(true);
  });

  it("allows human to post a controls-reviewed entry", () => {
    const r = checkPostPermission("human", "agent");
    expect(r.allowed).toBe(true);
  });

  it("agent denial reason is stable (audit row text)", () => {
    const r = checkPostPermission("agent", "agent");
    expect(r.allowed).toBe(false);
    expect((r as { allowed: false; reason: string }).reason).toContain("may never post");
  });
});
