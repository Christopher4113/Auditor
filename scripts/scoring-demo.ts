import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { calculate } from "../convex/scoring/metrics.ts";
import { fixture } from "./scoring-fixture.ts";

const seed = JSON.parse(readFileSync(new URL("../datagen/seed.json",import.meta.url),"utf8"));
const baseline = calculate(fixture(seed,false));
const oracle = calculate(fixture(seed,true));
if (baseline.overall.caught !== 0 || baseline.overall.correct !== 0 || oracle.overall.correct !== seed.answerKey.length)
  throw new Error("Scoring self-check failed");
console.log("Phase 3 scorer self-check — SYNTHETIC fixtures; no agent accuracy or real approvals claimed.");
console.log(`Unprocessed seed: ${baseline.overall.caught}/${baseline.overall.planted} detected; ${baseline.overall.correct} corrected.`);
console.log(`Oracle fixture: ${oracle.overall.correct}/${oracle.overall.planted} corrected; precision=${oracle.overall.precision}; recall=${oracle.overall.recall}.`);
const directory = new URL("../.artifacts/",import.meta.url);
mkdirSync(directory,{recursive:true});
writeFileSync(new URL("scoring-self-check.json",directory),JSON.stringify({
  kind:"synthetic_scorer_self_check",agentEvaluated:false,baseline,oracle},null,2)+"\n");
console.log("PASS: .artifacts/scoring-self-check.json (baseline + oracle; not live performance).");
