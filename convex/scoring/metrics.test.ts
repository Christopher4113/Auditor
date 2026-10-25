import { describe, expect, it } from "vitest";
import { calculate, type Input } from "./metrics";

function input(): Input {
  const entity="test",period="2026-07";
  const lines=[{account:"5400",debit:142000,credit:0},{account:"1000",debit:0,credit:142000}];
  return {entity, key:[{_id:"key",entity,period,caseId:"B1-2026-07",breakNumber:1,txnId:"stripe",expectedKind:"stripe_fee_netting",expectedLines:lines,expectedEscalation:true}],
    banks:[{_id:"bank",entity,period,txnId:"stripe",status:"flagged"}],
    breaks:[{_id:"break",entity,period,bankTransactionId:"bank",kind:"unmatched"}],
    proposals:[{_id:"p",entity,period,breakId:"break",proposalId:"P-test",status:"posted",lines,revision:1,correctionsApplied:[],_creationTime:1}],
    entries:[{_id:"entry",entity,period,proposalId:"p",source:"post_entry",postedBy:"human",lines}],
    decisions:[{_id:"d",entity,period,proposalId:"p",reviewer:"human",outcome:"approved",rulesRun:[]}],
    events:[],corrections:[],vendors:[],periods:[{entity,period,status:"open"}]};
}

describe("A5 accounting and detection",()=>{
  it("scores a true flag and exact posted treatment",()=>{
    expect(calculate(input()).overall).toMatchObject({caught:1,correct:1,precision:1,recall:1,accuracy:1});
  });
  it("does not mistake an unposted proposal or status for a journal entry",()=>{
    const i=input();i.entries=[];
    expect(calculate(i).overall).toMatchObject({caught:1,correct:0});
  });
  it("does not credit opening/imported books as a correction",()=>{
    const i=input();i.entries[0].source="import";
    expect(calculate(i).overall.correct).toBe(0);
  });
  it("rejects wrong but balanced cents, wrong account, and agent postings",()=>{
    for(const mutation of [(i:Input)=>{i.entries[0].lines=i.entries[0].lines.map(l=>({...l,debit:l.debit?142001:0,credit:l.credit?142001:0}));},
      (i:Input)=>{i.entries[0].lines=[{account:"1150",debit:142000,credit:0},{account:"1000",debit:0,credit:142000}];},
      (i:Input)=>{i.entries[0].postedBy="agent";}]) {
      const i=input();mutation(i);expect(calculate(i).overall.correct).toBe(0);
    }
  });
  it("accepts equivalent split lines and account order",()=>{
    const i=input();i.entries[0].lines=[{account:"1000",debit:0,credit:142000},{account:"5400",debit:42000,credit:0},{account:"5400",debit:100000,credit:0}];
    expect(calculate(i).overall.correct).toBe(1);
  });
  it("rejects double-posted corrections rather than cherry-picking one correct entry",()=>{
    const i=input();i.entries.push({...i.entries[0],_id:"duplicate"});
    expect(calculate(i).overall.correct).toBe(0);
  });
  it("rejects unbalanced, negative, fractional, and nonfinite postings",()=>{
    for(const n of [141999,-1,1.5,Infinity,NaN]){
      const i=input();i.entries[0].lines=[{account:"5400",debit:n,credit:0},{account:"1000",debit:0,credit:142000}];
      expect(calculate(i).overall.correct).toBe(0);
    }
  });
  it("deduplicates repeated flags but counts a clean transaction flag as a false positive",()=>{
    const i=input();i.breaks.push({...i.breaks[0],_id:"revision"});
    i.banks.push({...i.banks[0],_id:"clean",txnId:"clean"});
    i.breaks.push({...i.breaks[0],_id:"fp",bankTransactionId:"clean"});
    expect(calculate(i).overall).toMatchObject({caught:1,falsePositives:1,precision:0.5,recall:1});
  });
  it("reports zero recall for no flags and null precision for no predictions",()=>{
    const i=input();i.breaks=[];
    expect(calculate(i).overall).toMatchObject({caught:0,falseNegatives:1,precision:null,recall:0});
    i.key=[];expect(calculate(i).overall.recall).toBeNull();
  });
  it("checks actual escalation and required dependencies",()=>{
    const i=input();i.decisions[0].reviewer="controls";i.decisions[0].outcome="posted";
    expect(calculate(i).cases[0].controlsCorrect).toBe(false);
    i.key[0].expectedEscalation=false;i.key[0].dependsOn=["missing-prior-period"];
    expect(calculate(i).cases[0]).toMatchObject({accountingCorrect:true,dependenciesSatisfied:false,correct:false});
  });
  it("scopes entities and periods before evaluating",()=>{
    const i=input();i.entries[0].entity="other";
    expect(calculate(i).overall.correct).toBe(0);
    i.period="2026-06";expect(calculate(i).overall.planted).toBe(0);
  });
  it("matches non-bank cases by raw evidence and never by kind alone",()=>{
    const i=input();i.key[0].txnId="";i.key[0].sourceDocumentIds=["service-schedule"];
    delete i.breaks[0].bankTransactionId;i.breaks[0].kind="stripe_fee_netting";
    expect(calculate(i).overall.caught).toBe(0);
    i.breaks[0].sourceDocumentIds=["service-schedule"];
    expect(calculate(i).overall.correct).toBe(1);
  });
});

describe("A5 Impact is measured activity plus visible assumptions",()=>{
  it("does not award time or protected dollars to an unprocessed dataset",()=>{
    const i=input();i.breaks=[];i.proposals=[];i.entries=[];i.decisions=[];
    expect(calculate(i).impact).toMatchObject({estimatedHoursSaved:0,cashProtectedCents:0,humanReviews:0,repeatMistakes:0});
  });
  it("deduplicates routine activity and human reviews and computes elapsed signed time",()=>{
    const i=input();i.events=[
      {entity:"test",period:"2026-07",actor:"agent",action:"match.close",detail:"bank",at:100},
      {entity:"test",period:"2026-07",actor:"agent",action:"match.close",detail:"bank",at:200},
      {entity:"test",period:"2026-07",actor:"human",action:"approve",proposalId:"p",at:300},
      {entity:"test",period:"2026-07",actor:"workflow",action:"close.start",at:1000}];
    i.periods[0].signedAt=86401000;
    const impact=calculate(i).impact;
    expect(impact).toMatchObject({closedByCode:1,humanReviews:1,investigated:1,manualMinutes:23,controllerMinutes:5,estimatedHoursSaved:0.3});
    expect(impact.periods[0].closeElapsedDays).toBe(1);
  });
  it("keeps cash protected separate from non-cash misclassification",()=>{
    const i=input();i.key[0].breakNumber=3;
    expect(calculate(i).impact).toMatchObject({cashProtectedCents:0,misclassificationCorrectedCents:142000});
    i.key[0].breakNumber=5;i.key[0].vendorId="vendor";
    expect(calculate(i).overall.correct).toBe(0);
    i.vendors=[{entity:"test",vendorId:"vendor",paymentsHeld:true}];
    expect(calculate(i).impact.cashProtectedCents).toBe(142000);
  });
  it("counts the same failed rule after its correction on a later revision",()=>{
    const i=input();i.proposals.push({...i.proposals[0],_id:"revision",_creationTime:3,revision:2});
    i.corrections=[{_id:"correction",entity:"test",period:"2026-07",proposalId:"p",rule:"citation",_creationTime:2}];
    i.decisions.push({...i.decisions[0],_id:"d2",proposalId:"revision",outcome:"returned",rulesRun:[{rule:"citation",passed:false}]});
    expect(calculate(i).impact.repeatMistakes).toBe(1);
    i.decisions[1].rulesRun[0].rule="balance";
    expect(calculate(i).impact.repeatMistakes).toBe(0);
  });
});
