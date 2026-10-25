// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// Synthetic oracle fixtures exercise scoring, not an agent/controller close.
import { afterAll, beforeAll, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { FunctionArgs } from "convex/server";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules=import.meta.glob("./**/*.ts");
let directory:string;
let seed:FunctionArgs<typeof internal.seed.load>;
beforeAll(()=>{
  directory=mkdtempSync(resolve(tmpdir(),"auditor-scoring-"));
  const output=resolve(directory,"seed.json");
  execFileSync("uv",["run","--locked","generate.py","--out",output],{cwd:resolve("datagen")});
  seed=JSON.parse(readFileSync(output,"utf8"));
});
afterAll(()=>{if(directory)rmSync(directory,{recursive:true,force:true});});

async function setup(post=false){
  const t=convexTest(schema,modules);
  await t.mutation(internal.seed.load,seed);
  if(post){
    const ids=await t.run(async ctx=>{
      const key=await ctx.db.query("answerKey").take(100);
      const vendor=await ctx.db.query("vendors").withIndex("by_entity_vendorId",q=>q.eq("entity",seed.entity).eq("vendorId","field-flame")).unique();
      await ctx.db.patch("vendors",vendor!._id,{paymentsHeld:true});
      const output=[];
      for(const k of key){
        const bank=k.txnId ? await ctx.db.query("bankTransactions").withIndex("by_entity_txnId",q=>q.eq("entity",seed.entity).eq("txnId",k.txnId)).unique():null;
        const breakId=await ctx.db.insert("breaks",{entity:seed.entity,period:k.period,breakId:`fixture-${k.caseId}`,kind:k.expectedKind,
          bankTransactionId:bank?._id,sourceDocumentIds:k.sourceDocumentIds,vendorId:k.vendorId,description:"Explicit scorer oracle fixture",status:"proposed"});
        const proposalId=await ctx.db.insert("proposals",{entity:seed.entity,period:k.period,breakId,proposalId:`P-fixture-${k.caseId}`,
          lines:k.expectedLines,reason:"Scorer self-check only",citations:[],status:k.expectedEscalation ? "approved":"posted",revision:1,correctionsApplied:[],proposedBy:"agent"});
        const caller=k.expectedEscalation ? "human" as const:"controls" as const;
        const decisionId=await ctx.db.insert("decisions",{entity:seed.entity,period:k.period,proposalId,decisionId:`D-fixture-${k.caseId}`,
          reviewer:caller,outcome:k.expectedEscalation ? "approved":"posted",reason:"Synthetic oracle",rulesRun:[],citations:[]});
        output.push({proposalId,decisionId,caller});
      }
      return output;
    });
    for(const id of ids) expect((await t.mutation(internal.ledger.postEntry,id)).ok).toBe(true);
  }
  return t;
}

it("unprocessed real dataset scores 0/11, without inventing accuracy or Impact",async()=>{
  const t=await setup();
  const r=await t.query(api.scoring.report,{entity:seed.entity});
  expect(r.overall).toMatchObject({planted:11,caught:0,correct:0,recall:0,precision:null});
  expect(r.byBreak.map(b=>b.breakNumber)).toEqual([1,2,3,4,5,6]);
  expect(r.impact).toMatchObject({cashProtectedCents:0,estimatedHoursSaved:0});
});

it("scores every family through the posting door, including the two cases without bank rows",async()=>{
  const t=await setup(true);
  const r=await t.query(api.scoring.report,{entity:seed.entity});
  expect(r.overall).toMatchObject({planted:11,caught:11,correct:11,precision:1,recall:1,accuracy:1});
  expect(r.impact).toMatchObject({cashProtectedCents:6050000,misclassificationCorrectedCents:1140000});
  expect((await t.query(api.api.scoreboard,{entity:seed.entity,period:"2026-09"}))).toMatchObject({plantedBreaks:5,caught:5,correct:5,precision:1,recall:1});
  const snapshot=await t.mutation(internal.scoring.refresh,{entity:seed.entity});
  expect(snapshot.overall.correct).toBe(11);
  const keys=await t.run(ctx=>ctx.db.query("answerKey").take(100));
  expect(keys.every(k=>k.result?.correct)).toBe(true);
});

it("recomputes current books instead of trusting cached green results",async()=>{
  const t=await setup(true);
  await t.mutation(internal.scoring.refresh,{entity:seed.entity});
  await t.run(async ctx=>{
    const entry=await ctx.db.query("journalEntries").withIndex("by_entity_period",q=>q.eq("entity",seed.entity).eq("period","2026-09")).filter(q=>q.eq(q.field("source"),"post_entry")).first();
    await ctx.db.delete("journalEntries",entry!._id);
  });
  expect((await t.query(api.scoring.report,{entity:seed.entity})).overall.correct).toBeLessThan(11);
});

it("period reports retain earlier dependencies and never include another entity",async()=>{
  const t=await setup(true);
  const july=await t.query(api.scoring.report,{entity:seed.entity,period:"2026-07"});
  expect(july.overall).toMatchObject({planted:3,correct:3});
  const other=await t.query(api.scoring.report,{entity:"another-entity"});
  expect(other.overall).toMatchObject({planted:0,caught:0,precision:null,recall:null});
  await t.run(async ctx=>{
    // Remove all July corrective entries; September's cash posting alone cannot
    // claim the earlier human-decided precedent and accounting prerequisites.
    const entries=await ctx.db.query("journalEntries").withIndex("by_entity_period",q=>q.eq("entity",seed.entity).eq("period","2026-07")).take(1000);
    for(const e of entries)if(e.source==="post_entry")await ctx.db.delete("journalEntries",e._id);
  });
  const september=await t.query(api.scoring.report,{entity:seed.entity,period:"2026-09"});
  expect(september.cases.find(c=>c.caseId==="B3-2026-09")).toMatchObject({accountingCorrect:true,dependenciesSatisfied:false,correct:false});
});

it("accepts explicit time assumptions and rejects invalid report inputs",async()=>{
  const t=await setup();
  await expect(t.query(api.scoring.report,{entity:seed.entity,period:"2026-13"})).rejects.toThrow();
  await expect(t.query(api.scoring.report,{entity:seed.entity,assumptions:{routineMinutes:-1,exceptionMinutes:15,controllerMinutes:5,manualCloseDays:5}})).rejects.toThrow();
  const r=await t.query(api.scoring.report,{entity:seed.entity,assumptions:{routineMinutes:4,exceptionMinutes:10,controllerMinutes:3,manualCloseDays:6}});
  expect(r.impact.assumptions.routineMinutes).toBe(4);
});
