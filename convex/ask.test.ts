// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { generateText } from 'ai';
import schema from './schema';
import { api } from './_generated/api';
vi.mock('ai',()=>({generateText:vi.fn(async()=>({text:'Source [1]'}))}));
vi.mock('@ai-sdk/anthropic',()=>({anthropic:vi.fn(()=>({}))}));
const modules=import.meta.glob('./**/*.ts');
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});

it('B6 consumes the real array contract with auth, entity/date scope and audit summaries',async()=>{
  vi.stubEnv('RETRIEVAL_URL','http://sidecar.test/');vi.stubEnv('RETRIEVAL_API_KEY','test-token');
  const fetchMock=vi.fn(async(_url,init)=>{
    const body=JSON.parse(init.body);
    return new Response(JSON.stringify(body.collection==='policy' ? [{id:'policy-5.1',text:'Verbatim policy text.',score:0.9}]:[]));
  });
  vi.stubGlobal('fetch',fetchMock);
  const t=convexTest(schema,modules);
  const answer=await t.action(api.ask.askAuditor,{entity:'test-entity',question:'Why was this held?',asOf:'2026-09-30'});
  expect(answer.citations).toEqual([{sourceId:'policy-5.1',text:'Verbatim policy text.'}]);
  expect(fetchMock).toHaveBeenCalledTimes(5);
  expect(fetchMock.mock.calls.map(([,init])=>JSON.parse(init.body).collection)).toContain('events');
  for(const [url,init] of fetchMock.mock.calls){
    expect(url).toBe('http://sidecar.test/query');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toMatchObject({entity:'test-entity',asOf:'2026-09-30',text:'Why was this held?',k:5});
  }
});

it('B6 never calls a model without retrieved sources',async()=>{
  vi.stubEnv('RETRIEVAL_URL','');
  const t=convexTest(schema,modules);
  expect((await t.action(api.ask.askAuditor,{entity:'test',question:'Anything?'}))).toMatchObject({sourcesAvailable:false,citations:[]});
  expect(generateText).not.toHaveBeenCalled();
});

it('B6 rejects stored citations from another entity',async()=>{
  vi.stubEnv('RETRIEVAL_URL','');
  const t=convexTest(schema,modules);
  const proposalId=await t.run(async ctx=>{
    const breakId=await ctx.db.insert('breaks',{entity:'other',period:'2026-09',breakId:'B',kind:'missing_accrual',description:'fixture',status:'open'});
    const proposalId=await ctx.db.insert('proposals',{entity:'other',period:'2026-09',proposalId:'P',breakId,lines:[],reason:'fixture',citations:[],status:'approved',revision:1,correctionsApplied:[],proposedBy:'agent'});
    await ctx.db.insert('decisions',{entity:'other',period:'2026-09',proposalId,decisionId:'D',reviewer:'human',outcome:'approved',reason:'fixture',rulesRun:[],citations:[{sourceType:'policy',sourceId:'secret',text:'Other entity text',score:1}]});
    return proposalId;
  });
  const answer=await t.action(api.ask.askAuditor,{entity:'test',question:'Anything?',proposalId});
  expect(answer).toMatchObject({sourcesAvailable:false,citations:[]});
  expect(generateText).not.toHaveBeenCalled();
});
