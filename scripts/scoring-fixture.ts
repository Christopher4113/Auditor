// Explicit scorer SELF-CHECK fixture. Never seed this into Convex or Moss.
// Expected lines are deliberately copied as an oracle to exercise the scorer;
// this does not measure Claude, detection, controller approvals, or a real close.
import type { Input } from "../convex/scoring/metrics.ts";

type Seed = {
  entity: string;
  bankTransactions: {id:string;period:string}[];
  breaks: {id:string;bankTransactionIds:string[];sourceDocumentIds:string[];contractIds:string[];kind:string}[];
  answerKey: {breakId:string;period:string;breakNumber:number;expectedLines:{accountCode:string;debit:number;credit:number}[];
    expectedEscalation:boolean;dependsOn:string[]}[];
  vendors: {id:string}[];
  contracts: {id:string;vendorId:string}[];
  periods: {id:string}[];
};

export function fixture(seed: Seed, corrections: boolean): Input {
  const entity = seed.entity;
  const input: Input = {entity, key:[], breaks:[], proposals:[], decisions:[], entries:[], events:[], corrections:[],
    banks:seed.bankTransactions.map(b => ({_id:b.id,entity,period:b.period,txnId:b.id,status:"unmatched"})),
    vendors:seed.vendors.map(v => ({entity,vendorId:v.id,paymentsHeld: corrections && v.id === "field-flame"})),
    periods:seed.periods.map(p => ({entity,period:p.id,status:"open"}))};
  for (const [i,k] of seed.answerKey.entries()) {
    const b = seed.breaks.find(b => b.id === k.breakId)!;
    const key = {_id:`key-${i}`,entity,period:k.period,caseId:k.breakId,breakNumber:k.breakNumber,txnId:b.bankTransactionIds[0] ?? "",
      expectedKind:b.kind,expectedLines:k.expectedLines.map(l => ({account:l.accountCode,debit:l.debit,credit:l.credit})),
      expectedEscalation:k.expectedEscalation,dependsOn:k.dependsOn,sourceDocumentIds:b.sourceDocumentIds,
      vendorId:seed.contracts.find(c => b.contractIds.includes(c.id))?.vendorId};
    input.key.push(key);
    if (!corrections) continue;
    const breakId = `break-${i}`, proposalId = `proposal-${i}`;
    input.breaks.push({_id:breakId,entity,period:k.period,kind:b.kind,bankTransactionId:b.bankTransactionIds[0],sourceDocumentIds:b.sourceDocumentIds});
    input.proposals.push({_id:proposalId,entity,period:k.period,breakId,proposalId:`P-fixture-${i}`,status:"posted",lines:key.expectedLines,
      revision:1,correctionsApplied:[],_creationTime:i+1});
    input.decisions.push({_id:`decision-${i}`,entity,period:k.period,proposalId,reviewer:k.expectedEscalation ? "human":"controls",
      outcome:k.expectedEscalation ? "approved":"posted",rulesRun:[]});
    input.entries.push({_id:`entry-${i}`,entity,period:k.period,proposalId,source:"post_entry",postedBy:k.expectedEscalation ? "human":"controls",lines:key.expectedLines});
  }
  return input;
}
