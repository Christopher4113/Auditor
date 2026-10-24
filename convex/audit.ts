// Append-only audit log. Every tool and every rule writes a row through here (policy 9.0).
import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { vActor } from "./schema";

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

/** For actions, which have no ctx.db. */
export const write = internalMutation({
  args: { entity: v.string(), period: v.optional(v.string()), actor: vActor, action: v.string(), decisionId: v.optional(v.id("decisions")), detail: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, row) => {
    await audit(ctx, row);
    return null;
  },
});
