// Append-only audit log. Every tool and every rule writes a row through here (policy 9.0).
import type { Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { vActor } from "./schema";

export async function audit(
  ctx: MutationCtx,
  row: {
    entity: string;
    period?: string;
    actor: Infer<typeof vActor>;
    action: string;
    proposalId?: Id<"proposals">;
    decisionId?: Id<"decisions">;
    entryId?: Id<"journalEntries">;
    detail?: string;
  },
) {
  await ctx.db.insert("auditLog", { ...row, at: Date.now() });
}
