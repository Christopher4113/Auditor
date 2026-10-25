import { defineApp } from "convex/server";
import { v } from "convex/values";
import agent from "@convex-dev/agent/convex.config";
import workflow from "@convex-dev/workflow/convex.config";

const app = defineApp({ env: { RETRIEVAL_URL: v.optional(v.string()), RETRIEVAL_API_KEY: v.optional(v.string()), ANTHROPIC_MODEL:v.optional(v.string()) } }); // FastAPI sidecar; unset URL = retrieval skipped, verify fails closed
app.use(agent);
app.use(workflow);
export default app;
