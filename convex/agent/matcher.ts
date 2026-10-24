// Pure code matcher — no Convex I/O, no clock reads.
// Closes ~85% of transactions deterministically: exact amount, same counterparty, within N days.
// The reconcile mutation in agent.ts calls this, then flags unmatched transactions as breaks.

const MATCH_WINDOW_DAYS = 3;

export type BankTxn = {
  _id: string;
  txnId: string;
  date: string; // YYYY-MM-DD
  amount: number; // signed cents; positive = money in
  counterparty: string;
  status: string;
};

export type LedgerEntry = {
  _id: string;
  entryId: string;
  date: string; // YYYY-MM-DD
  lines: { account: string; debit: number; credit: number }[];
  memo: string;
  proposalId?: string;
};

export type MatchResult = {
  txnId: string;
  matched: boolean;
  entryId: string | null;
  reason: string;
};

function parseDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

function daysDiff(a: string, b: string): number {
  const ms = Math.abs(parseDate(a).getTime() - parseDate(b).getTime());
  return Math.floor(ms / 86_400_000);
}

/**
 * Bank cash net: sum(debit − credit) for 1000. Processor clearing (1010)
 * is not the bank: including it would cancel a valid Stripe settlement.
 * Positive = money in, negative = money out — mirrors bank transaction sign convention.
 */
function cashNet(entry: LedgerEntry): number {
  return entry.lines
    .filter((l) => l.account === "1000")
    .reduce((s, l) => s + l.debit - l.credit, 0);
}

/**
 * Try to match a bank transaction to an existing journal entry.
 * Criteria (all must match):
 *   1. Entry cash-account net == transaction amount (sign-aware, integer cents)
 *   2. Entry memo or entryId contains the counterparty name (case-insensitive)
 *   3. Entry date is within MATCH_WINDOW_DAYS of the transaction date
 */
export function matchTransaction(txn: BankTxn, entries: LedgerEntry[]): MatchResult {
  const counterpartyLower = txn.counterparty.toLowerCase();

  for (const entry of entries) {
    const net = cashNet(entry);
    if (net !== txn.amount) continue;
    const memoLower = entry.memo.toLowerCase();
    if (!memoLower.includes(counterpartyLower) && !entry.entryId.toLowerCase().includes(counterpartyLower)) continue;
    if (daysDiff(txn.date, entry.date) > MATCH_WINDOW_DAYS) continue;
    return { txnId: txn.txnId, matched: true, entryId: entry._id, reason: "exact amount, counterparty, within 3 days" };
  }

  return { txnId: txn.txnId, matched: false, entryId: null, reason: "no matching entry found" };
}

/**
 * Match a batch of bank transactions against journal entries.
 * Returns matched IDs and the list of unmatched transaction IDs for the agent to investigate.
 */
export function matchBatch(
  txns: BankTxn[],
  entries: LedgerEntry[],
): { matched: string[]; unmatchedIds: string[] } {
  const matched: string[] = [];
  const unmatchedIds: string[] = [];

  for (const txn of txns) {
    const result = matchTransaction(txn, entries);
    if (result.matched) {
      matched.push(txn._id);
    } else {
      unmatchedIds.push(txn._id);
    }
  }

  return { matched, unmatchedIds };
}
