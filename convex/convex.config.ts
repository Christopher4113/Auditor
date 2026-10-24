import { defineApp } from "convex/server";
import { v } from "convex/values";
import agent from "@convex-dev/agent/convex.config";
import workflow from "@convex-dev/workflow/convex.config";

const app = defineApp({ env: { RETRIEVAL_URL: v.optional(v.string()) } }); // FastAPI sidecar (Moss + CRS); unset = retrieval skipped, verify fails closed
app.use(agent);
app.use(workflow);
export default app;
