import { describe, expect, it } from "vitest";
import { cannedApexProposal, STUB_HITS } from "./fake";

describe("cannedApexProposal", () => {
  const proposal = cannedApexProposal("eo-festival-nyc");

  it("has correct entity", () => {
    expect(proposal.entity).toBe("eo-festival-nyc");
  });

  it("has 3 lines", () => {
    expect(proposal.lines).toHaveLength(3);
  });

  it("Dr 1000 1,360,000¢", () => {
    const line = proposal.lines.find((l) => l.account === "1000");
    expect(line).toBeDefined();
    expect(line!.debitCents).toBe(1360000);
    expect(line!.creditCents).toBe(0);
  });

  it("Dr 5160 240,000¢", () => {
    const line = proposal.lines.find((l) => l.account === "5160");
    expect(line).toBeDefined();
    expect(line!.debitCents).toBe(240000);
    expect(line!.creditCents).toBe(0);
  });

  it("Cr 1200 1,600,000¢", () => {
    const line = proposal.lines.find((l) => l.account === "1200");
    expect(line).toBeDefined();
    expect(line!.debitCents).toBe(0);
    expect(line!.creditCents).toBe(1600000);
  });

  it("debits equal credits (balanced)", () => {
    const totalDebits = proposal.lines.reduce((s, l) => s + l.debitCents, 0);
    const totalCredits = proposal.lines.reduce((s, l) => s + l.creditCents, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  it("has 3 citations", () => {
    expect(proposal.citations).toHaveLength(3);
  });

  it("citation text matches STUB_HITS D-0417 byte-for-byte", () => {
    const citation = proposal.citations.find((c) => c.sourceId === "D-0417");
    expect(citation).toBeDefined();
    expect(citation!.text).toBe(STUB_HITS["D-0417"]);
  });

  it("citation text matches STUB_HITS apex-9.4 byte-for-byte", () => {
    const citation = proposal.citations.find((c) => c.sourceId === "apex-9.4");
    expect(citation).toBeDefined();
    expect(citation!.text).toBe(STUB_HITS["apex-9.4"]);
  });

  it("citation text matches STUB_HITS policy-5.1 byte-for-byte", () => {
    const citation = proposal.citations.find((c) => c.sourceId === "policy-5.1");
    expect(citation).toBeDefined();
    expect(citation!.text).toBe(STUB_HITS["policy-5.1"]);
  });

  it("firstRead is 'receivable 2,400'", () => {
    expect(proposal.firstRead).toBe("receivable 2,400");
  });

  it("governingSource is contract", () => {
    expect(proposal.governingSource.source).toBe("contract");
  });

  it("correctionsApplied is empty", () => {
    expect(proposal.correctionsApplied).toHaveLength(0);
  });

  it("all cents values are integers", () => {
    for (const line of proposal.lines) {
      expect(Number.isInteger(line.debitCents)).toBe(true);
      expect(Number.isInteger(line.creditCents)).toBe(true);
    }
  });
});
