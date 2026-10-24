// Interface 2 (B <-> C): Zod schemas for the 14 tools and the three identities.
// Written together Friday 7-8 pm. Segregation of duties lives in these lists, not in prompts.
//
// Reconciler (Sonnet): fetch_bank_transactions, fetch_ledger, fetch_contract, match_transaction,
//                      flag_break, propose_entry, request_approval            -- no post_entry
// Controller (Opus):   fetch_bank_transactions (read-only), fetch_ledger, fetch_contract,
//                      search_precedent, search_policy, approve (< $5,000, no control exception),
//                      reject, escalate, post_entry (only via approve), index_decision, verify_payee
// Human:               approve, reject, post_entry

export const IDENTITIES = ["reconciler", "controller", "human"] as const;
export type Identity = (typeof IDENTITIES)[number];
