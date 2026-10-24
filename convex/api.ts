// Interfaces 3 + 4 (C -> D): the queries and mutations the UI calls, with JSDoc. All take `entity`.
// Queries:   listProposals(period), getBreak(id), getDecision(proposalId), scoreboard(), listRules()
// Human:     approve(proposalId, note) writes precedentScope on the decision; reject(proposalId, instruction);
//            signPeriod(period) locks it
// Inject:    injectBankTransaction, amendContract, changeVendorBank (the Workflow picks each up within seconds)
// Admin:     resetAll (wipe and reseed), attemptAgentPost(proposalId) -- the "make the agent post" button;
//            post_entry refuses the agent's identity and the denial is logged
// decisions.citations[]: { sourceType, sourceId, text, score }  -- text is verbatim, never paraphrased
