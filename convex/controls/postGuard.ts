// Pure guard for post_entry permission — extracted so it can be tested without Convex.
// ledger.ts applies this same logic (server-side, never from client input).
// Policy 8.1: the proposer may not approve their own entry.
// The agent seat has no post_entry in TOOLS.agent and is denied server-side here.

export type PostCheck =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Checks whether `caller` may post the entry for a proposal that was submitted by `proposedBy`.
 * Two invariants, both preventive:
 *   1. The agent identity is never allowed to post (enforced regardless of who proposed).
 *   2. The proposer may not post their own entry (policy 8.1).
 */
export function checkPostPermission(caller: string, proposedBy: string): PostCheck {
  if (caller === "agent") {
    return { allowed: false, reason: `8.1: agent identity may never post (no post_entry in TOOLS.agent)` };
  }
  if (caller === proposedBy) {
    return { allowed: false, reason: `8.1: ${caller} proposed this entry and may not post it` };
  }
  return { allowed: true };
}
