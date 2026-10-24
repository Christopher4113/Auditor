// Interface 2 (B <-> C): Zod schemas for the tools and the three identities.
// Written together Friday 7-8 pm. Segregation of duties lives in these lists, not in prompts:
// the Workflow runs each step under its identity and every tool reads the caller's identity.
// post_entry refuses the proposer's identity regardless of who calls it (policy 8.1), server-side.

export const IDENTITIES = ["agent", "controls", "human"] as const;
export type Identity = (typeof IDENTITIES)[number];

// Brief v2, "Controls engine and permissions". The Permissions drawer renders these three lists.
export const TOOLS = {
  // Staff accountant (one Claude Sonnet agent; Opus by env switch). Cannot post, approve or change policy.
  agent: [
    "fetch_bank_transactions",
    "fetch_ledger",
    "fetch_contract",
    "search_precedent",
    "search_policy",
    "search_corrections",
    "match_transaction",
    "flag_break",
    "propose_entry", // (lines, reason, citations)
    "request_approval",
  ],
  // Controls engine (TypeScript rules, no model). Cannot propose or override the human.
  controls: ["verify_payee", "escalate", "post_entry", "index_decision"],
  // Human controller. Cannot touch anything it did not review.
  human: ["approve", "reject", "sign_period"], // reject carries an instruction
} as const satisfies Record<Identity, readonly string[]>;

export type ToolName = (typeof TOOLS)[Identity][number];
