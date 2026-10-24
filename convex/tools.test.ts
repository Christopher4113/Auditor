import { describe, expect, it } from "vitest";
import {
  IDENTITIES,
  TOOLS,
  TOOL_ARGS,
  canCall,
  assertCanCall,
  assertNotProposer,
  PermissionDenied,
  toolCatalog,
} from "./tools";

describe("permission matrix", () => {
  it("agent can call all agent tools", () => {
    for (const tool of TOOLS.agent) {
      expect(canCall("agent", tool)).toBe(true);
    }
  });

  it("agent cannot call post_entry, approve, sign_period", () => {
    expect(canCall("agent", "post_entry")).toBe(false);
    expect(canCall("agent", "approve")).toBe(false);
    expect(canCall("agent", "sign_period")).toBe(false);
  });

  it("controls can call all controls tools", () => {
    for (const tool of TOOLS.controls) {
      expect(canCall("controls", tool)).toBe(true);
    }
  });

  it("controls cannot call propose_entry, approve, sign_period, reject", () => {
    expect(canCall("controls", "propose_entry")).toBe(false);
    expect(canCall("controls", "approve")).toBe(false);
    expect(canCall("controls", "sign_period")).toBe(false);
    expect(canCall("controls", "reject")).toBe(false);
  });

  it("human can call all human tools", () => {
    for (const tool of TOOLS.human) {
      expect(canCall("human", tool)).toBe(true);
    }
  });

  it("human cannot call fetch_bank_transactions, propose_entry, post_entry", () => {
    expect(canCall("human", "fetch_bank_transactions")).toBe(false);
    expect(canCall("human", "propose_entry")).toBe(false);
    expect(canCall("human", "post_entry")).toBe(false);
  });
});

describe("assertCanCall", () => {
  it("does not throw when allowed", () => {
    expect(() => assertCanCall("agent", "propose_entry")).not.toThrow();
  });

  it("throws PermissionDenied when disallowed", () => {
    expect(() => assertCanCall("agent", "post_entry")).toThrow(PermissionDenied);
  });
});

describe("assertNotProposer", () => {
  it("does not throw when actor is not the proposer", () => {
    expect(() => assertNotProposer("controls", "agent")).not.toThrow();
    expect(() => assertNotProposer("human", "agent")).not.toThrow();
  });

  it("throws PermissionDenied when actor is the proposer (8.1)", () => {
    expect(() => assertNotProposer("agent", "agent")).toThrow(PermissionDenied);
    expect(() => assertNotProposer("controls", "controls")).toThrow(PermissionDenied);
  });
});

describe("TOOL_ARGS schemas", () => {
  it("has an entry for every tool", () => {
    const allTools = [
      ...TOOLS.agent,
      ...TOOLS.controls,
      ...TOOLS.human,
    ] as string[];
    for (const tool of allTools) {
      expect(TOOL_ARGS).toHaveProperty(tool);
    }
  });

  it("propose_entry accepts a valid proposal shape", () => {
    const schema = TOOL_ARGS.propose_entry;
    const result = schema.safeParse({
      breakId: "brk_123",
      entryDate: "2026-09-25",
      lines: [
        { account: "1000", debitCents: 1360000, creditCents: 0 },
        { account: "5160", debitCents: 240000, creditCents: 0 },
        { account: "1200", debitCents: 0, creditCents: 1600000 },
      ],
      reason: "Apex deposit returned 13,600 net of 2,400 inspection fee per policy 5.1",
      governingSource: { source: "contract", why: "Apex contract 9.4 states the fee" },
      citations: [
        { sourceType: "contract", sourceId: "apex-9.4", text: "A damage deposit of $16,000 is payable before load-in and refundable within 5 business days after load-out, less a 15% inspection fee." },
      ],
      correctionsApplied: [],
    });
    expect(result.success).toBe(true);
  });

  it("propose_entry rejects floats in cents fields", () => {
    const schema = TOOL_ARGS.propose_entry;
    const result = schema.safeParse({
      breakId: "brk_123",
      entryDate: "2026-09-25",
      lines: [
        { account: "1000", debitCents: 1360000.5, creditCents: 0 },
        { account: "1200", debitCents: 0, creditCents: 1360000 },
      ],
      reason: "test",
      governingSource: { source: "contract", why: "because" },
      citations: [{ sourceType: "policy", sourceId: "5.1", text: "text" }],
      correctionsApplied: [],
    });
    expect(result.success).toBe(false);
  });

  it("propose_entry requires at least 2 lines", () => {
    const schema = TOOL_ARGS.propose_entry;
    const result = schema.safeParse({
      breakId: "brk_123",
      entryDate: "2026-09-25",
      lines: [
        { account: "1000", debitCents: 1360000, creditCents: 0 },
      ],
      reason: "test",
      governingSource: { source: "contract", why: "because" },
      citations: [{ sourceType: "policy", sourceId: "5.1", text: "text" }],
      correctionsApplied: [],
    });
    expect(result.success).toBe(false);
  });

  it("propose_entry requires at least 1 citation", () => {
    const schema = TOOL_ARGS.propose_entry;
    const result = schema.safeParse({
      breakId: "brk_123",
      entryDate: "2026-09-25",
      lines: [
        { account: "1000", debitCents: 1360000, creditCents: 0 },
        { account: "1200", debitCents: 0, creditCents: 1360000 },
      ],
      reason: "test",
      governingSource: { source: "contract", why: "because" },
      citations: [],
      correctionsApplied: [],
    });
    expect(result.success).toBe(false);
  });

  it("propose_entry accepts optional firstRead and revisionOf", () => {
    const schema = TOOL_ARGS.propose_entry;
    const result = schema.safeParse({
      breakId: "brk_123",
      entryDate: "2026-09-25",
      lines: [
        { account: "1000", debitCents: 1360000, creditCents: 0 },
        { account: "1200", debitCents: 0, creditCents: 1360000 },
      ],
      reason: "test",
      governingSource: { source: "contract", why: "because" },
      citations: [{ sourceType: "policy", sourceId: "5.1", text: "text" }],
      correctionsApplied: [],
      firstRead: "receivable 2,400",
      revisionOf: "P-0612",
    });
    expect(result.success).toBe(true);
  });
});

describe("toolCatalog", () => {
  it("returns all tools for each identity", () => {
    const catalog = toolCatalog();
    expect(catalog.agent).toEqual(TOOLS.agent);
    expect(catalog.controls).toEqual(TOOLS.controls);
    expect(catalog.human).toEqual(TOOLS.human);
  });
});

describe("identity coverage", () => {
  it("IDENTITIES matches TOOLS keys", () => {
    const toolKeys = Object.keys(TOOLS).sort();
    const ids = [...IDENTITIES].sort();
    expect(toolKeys).toEqual(ids);
  });
});
