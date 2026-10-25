// B6: Ask Auditor — answers questions from retrieved sources only.
// Public action for D's voice UI. Temperature 0. Never paraphrases citations.
// If retrieved sources do not cover the question, says so explicitly.
import { v } from "convex/values";
import { action, internalQuery, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { searchRetrieval } from "./retrievalClient";

export const proposalContext = internalQuery({
  args: {entity:v.string(),proposalId:v.id("proposals")},
  returns:v.union(v.null(),v.object({asOf:v.string()})),
  handler:async(ctx,{entity,proposalId})=>{
    const p=await ctx.db.get(proposalId);
    if(!p || p.entity!==entity)return null;
    const [year,month]=p.period.split('-').map(Number);
    return {asOf:`${p.period}-${new Date(Date.UTC(year,month,0)).getUTCDate()}`};
  },
});

async function queryRetrieval(
  collection: string,
  query: string,
  k: number,
  entity: string,
  asOf: string,
): Promise<Array<{ sourceId: string; text: string; score: number }>> {
  if (!env.RETRIEVAL_URL) return [];
  try {
    const data=await searchRetrieval(env.RETRIEVAL_URL,{collection,text:query,k,entity,asOf},env.RETRIEVAL_API_KEY);
    return data.map((h) => ({ sourceId: h.id, text: h.text, score: h.score }));
  } catch {
    return [];
  }
}

export const askAuditor = action({
  args: {
    entity: v.string(),
    question: v.string(),
    proposalId: v.optional(v.id("proposals")),
    asOf: v.optional(v.string()),
  },
  returns: v.object({
    answer: v.string(),
    citations: v.array(v.object({ sourceId: v.string(), text: v.string() })),
    sourcesAvailable: v.boolean(),
  }),
  handler: async (ctx, { entity, question, proposalId, asOf }) => {
    const context:{asOf:string}|null=proposalId ? await ctx.runQuery(internal.ask.proposalContext,{entity,proposalId}) : null;
    const cutoff=asOf ?? context?.asOf ?? "2026-07-31";
    if(!/^\d{4}-\d{2}-\d{2}$/.test(cutoff))throw new Error("asOf must be YYYY-MM-DD");
    // 1. Retrieve scoped sources and audit summaries, k ≤ 5 each.
    const collections = ["policy", "contracts", "decisions", "corrections", "events"];
    const retrieved: Array<{ sourceId: string; text: string; score: number }> = [];
    await Promise.all(
      collections.map(async (col) => {
        const hits = await queryRetrieval(col, question, 5, entity, cutoff);
        retrieved.push(...hits);
      }),
    );

    // 2. Include the decision's stored citations when proposalId is provided.
    if (proposalId) {
      const extra = (await ctx.runQuery(internal.controls.decisionCitations, { proposalId, entity, asOf:cutoff })) as Array<{
        sourceId: string;
        text: string;
      }>;
      for (const c of extra) {
        if (!retrieved.some((r) => r.sourceId === c.sourceId)) {
          retrieved.push({ sourceId: c.sourceId, text: c.text, score: 1.0 });
        }
      }
    }

    if (retrieved.length === 0) {
      return {
        answer:
          "The retrieval service is unavailable. I cannot answer without sources — please check RETRIEVAL_URL or try again.",
        citations: [],
        sourcesAvailable: false,
      };
    }

    // 3. Build verbatim sources block (cap at 20 to keep context manageable).
    const sourcesBlock = retrieved
      .slice(0, 20)
      .map((r, i) => `[${i + 1}] ${r.sourceId}\n${r.text}`)
      .join("\n\n");

    const systemPrompt = `You are a financial controls auditor assistant. Answer the user's question using ONLY the sources provided below. Do not use any knowledge outside these sources.

Rules:
- If the sources cover the question, answer concisely and cite relevant source IDs in brackets (e.g. [1]).
- If the sources do not cover the question, respond only with: "The available sources do not cover this question."
- When citing, quote the exact passage; never paraphrase.
- Never introduce amounts, accounts or treatments not present in the sources.

Sources:
${sourcesBlock}`;

    const { text } = await generateText({
      model: anthropic(env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5"),
      temperature: 0,
      system: systemPrompt,
      prompt: question,
    });

    // 4. Collect cited source IDs from [N] markers in the answer.
    const citedIndices = new Set<number>();
    for (const m of text.matchAll(/\[(\d+)\]/g)) {
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < retrieved.length) citedIndices.add(idx);
    }
    const citations = Array.from(citedIndices).map((i) => ({
      sourceId: retrieved[i].sourceId,
      text: retrieved[i].text,
    }));

    return { answer: text, citations, sourcesAvailable: true };
  },
});
