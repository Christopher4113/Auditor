import { describe, expect, it } from "vitest";
import { matchTransaction, matchBatch, type BankTxn, type LedgerEntry } from "./matcher";

function txn(overrides: Partial<BankTxn> = {}): BankTxn {
  return {
    _id: "bt1",
    txnId: "BT-0001",
    date: "2026-09-25",
    amount: 1_360_000,
    counterparty: "Apex Staging",
    status: "unmatched",
    ...overrides,
  };
}

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    _id: "je1",
    entryId: "JE-opening-1",
    date: "2026-09-25",
    lines: [
      { account: "1000", debit: 1_360_000, credit: 0 },
      { account: "1200", debit: 0, credit: 1_360_000 },
    ],
    memo: "Apex Staging deposit returned",
    ...overrides,
  };
}

describe("matchTransaction", () => {
  it("matches net bank cash when the Stripe entry also clears gross processor funds", () => {
    const result = matchTransaction(txn({ counterparty: "Stripe", amount: 4_718_000 }), [entry({
      memo: "Stripe payout settlement", lines: [
        { account: "1000", debit: 4_718_000, credit: 0 },
        { account: "5400", debit: 142_000, credit: 0 },
        { account: "1010", debit: 0, credit: 4_860_000 },
      ],
    })]);
    expect(result.matched).toBe(true);
  });
  it("matches exact amount, counterparty in memo, same date", () => {
    const result = matchTransaction(txn(), [entry()]);
    expect(result.matched).toBe(true);
    expect(result.entryId).toBe("je1");
  });

  it("matches within 3 days (before)", () => {
    const result = matchTransaction(txn(), [entry({ date: "2026-09-22" })]);
    expect(result.matched).toBe(true);
  });

  it("matches within 3 days (after)", () => {
    const result = matchTransaction(txn(), [entry({ date: "2026-09-28" })]);
    expect(result.matched).toBe(true);
  });

  it("does not match when 4 days apart", () => {
    const result = matchTransaction(txn(), [entry({ date: "2026-09-21" })]);
    expect(result.matched).toBe(false);
  });

  it("does not match when amount differs", () => {
    const result = matchTransaction(txn(), [
      entry({ lines: [{ account: "1000", debit: 1_600_000, credit: 0 }, { account: "1200", debit: 0, credit: 1_600_000 }] }),
    ]);
    expect(result.matched).toBe(false);
  });

  it("does not match when counterparty not in memo", () => {
    const result = matchTransaction(txn(), [entry({ memo: "Random vendor payment" })]);
    expect(result.matched).toBe(false);
  });

  it("matches case-insensitively", () => {
    const result = matchTransaction(txn({ counterparty: "apex staging" }), [
      entry({ memo: "APEX STAGING deposit" }),
    ]);
    expect(result.matched).toBe(true);
  });

  it("handles negative amounts (outflows)", () => {
    const outflow = txn({ amount: -900_000, counterparty: "Northern Lines" });
    const outEntry = entry({
      _id: "je2",
      lines: [
        { account: "5050", debit: 900_000, credit: 0 },
        { account: "1200", debit: 0, credit: 900_000 },
      ],
      memo: "Northern Lines cancellation",
    });
    // Net of outEntry = 900k - 900k = 0, not -900k → no match for a -900k txn
    const result = matchTransaction(outflow, [outEntry]);
    expect(result.matched).toBe(false);
  });

  it("returns unmatched when no entries provided", () => {
    const result = matchTransaction(txn(), []);
    expect(result.matched).toBe(false);
    expect(result.entryId).toBeNull();
  });
});

describe("matchBatch", () => {
  it("splits transactions into matched and unmatched", () => {
    const txns = [
      txn({ _id: "bt1", txnId: "BT-0001" }),
      txn({ _id: "bt2", txnId: "BT-0002", counterparty: "Unknown Vendor", amount: 500_000 }),
    ];
    const entries = [entry({ _id: "je1" })]; // only matches bt1
    const { matched, unmatchedIds } = matchBatch(txns, entries);
    expect(matched).toContain("bt1");
    expect(unmatchedIds).toContain("bt2");
  });

  it("all unmatched when entries is empty", () => {
    const txns = [txn({ _id: "bt1" }), txn({ _id: "bt2", txnId: "BT-0002" })];
    const { matched, unmatchedIds } = matchBatch(txns, []);
    expect(matched).toHaveLength(0);
    expect(unmatchedIds).toHaveLength(2);
  });
});
