import { defineApp } from "convex/server";
import { v } from "convex/values";
import agent from "@convex-dev/agent/convex.config";
import workflow from "@convex-dev/workflow/convex.config";

const app = defineApp({
  env: {
    RETRIEVAL_URL: v.optional(v.string()),
    RETRIEVAL_API_KEY: v.optional(v.string()),
    ANTHROPIC_MODEL: v.optional(v.string()),
    CONTEXT_WEBHOOK_SECRET: v.optional(v.string()), // context.dev monitor signing secret (whsec_...), verifies X-Context-Signature
    CONTEXT_WEBHOOK_TOKEN: v.optional(v.string()), // fallback shared token in the webhook URL when no secret is set
    CONTEXT_WEBHOOK_ENTITY: v.optional(v.string()),
    CONTEXT_WEBHOOK_EFFECTIVE_DATE: v.optional(v.string()), // demo clock for monitor-filed amendments, e.g. 2026-09-20
  },
}); // FastAPI sidecar; unset URL = retrieval skipped, verify fails closed
app.use(agent);
app.use(workflow);
export default app;
