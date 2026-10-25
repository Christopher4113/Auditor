# Auditor: test it, then demo it

Live site: https://auditor-nine-ecru.vercel.app (prod data, shared by everyone who opens it).
The badge top left must say **Live data**. If it says demo, open "More workspace tools" (the ⋯ button) → Open demo workspace is the toggle; stay out of it for testing and demos.

## 0. Reset (run before every test and every demo)

From the repo root on a laptop that is logged in to Convex:

```bash
scripts/demo-reset.sh
```

About a minute. Puts prod back to: July and August signed, September open and untouched, Moss memory matching. Wait for the rail to settle before running it (never mid-close). Anyone can run it; nothing else needs doing on Vercel.

## 1. Ten-minute test (what to click, what you should see)

| Step | Do | Expect |
|---|---|---|
| 1 | Open the site, pick **September 2026** | Hero says "Your September close", 123 bank transactions, 0 entries handled |
| 2 | **View close summary** → **Prepare close** | Status flips to running. Over 2–4 minutes proposals appear in the rail with no refresh. Open the site on a phone too: same rows appear there |
| 3 | Click **Apex Staging** ($13,600, Sept 25) | Posted by controls at revision 1. Entry books the $2,400 shortfall as inspection fee expense. Three citations: Apex clause 9.4, policy 5.1, policy 2.0. "First read discarded" line present |
| 4 | Click a **Stripe** payout | Posted by controls at revision 1 with no human touch (the learning loop). Two citations: policy 6.1 and the July decision D-P-bank-stripe-20260710-r1-h, whose text reads "approved by human". Some payouts also cite the Stripe fee schedule, a real public source with a URL |
| 5 | **Review inbox** | Escalated items wait here: Brightwater sponsorship settlement ($40,000, contract amendment) and Ironclad setup invoice ($9,400, accrual reversal). Open one: rule checks listed, evidence on the right |
| 6 | **Approve** one, **Return for revision** the other with an instruction | Approved: "Approved and posted", entry appears under the human identity. Returned: a revision arrives in the rail within a minute citing your instruction |
| 7 | ⋯ → **Add a test scenario** → **Bank detail change**, vendor `Field & Flame`, note "new account ending 8832" | A held item appears: payment parked in 1400, CRS verification result with the TransUnion report summary. Only **Keep hold with instruction** is offered |
| 8 | ⋯ → **How approvals work** → **Make the agent post** | Refused. Denial count goes up; the audit trail shows post_entry.denied with the 8.1 reason |
| 9 | **Ask Auditor** (top right): "Why is the Field & Flame payment on hold?" | Answer in plain English citing the trace id and policy 4.3 |
| 10 | ⋯ → **Close summary** → **Sign period** | Entries posted, items carried forward, debits = credits. Period locked |

Also worth a look: **Activity** tab (every rule result and who acted), **Past decisions** (precedents by period), **Export records**.

If a step does not match: wait 30 seconds first (the close is still running), then check the Convex dashboard logs for `tough-shepherd-182`. Last resort: `scripts/demo-reset.sh` and start over.

## 2. The demo (about four minutes)

Reset first. Open September. Say one line: "One AI staff accountant, a controls engine written in code, and a human controller. The agent cannot post, and that is enforced on the server."

**Scene 1, the moment (90 s).** View close summary → Prepare close. While it runs: "123 bank transactions. A code matcher clears the routine ones with no model call. Only the breaks reach the agent." When Apex Staging lands, click it: "The deposit came back $2,400 short. The agent retrieved the contract's inspection clause, our policy, and a July precedent, proposed the fee as expense with three verbatim citations, and the engine posted it under threshold. Nobody touched it."

**Scene 2, the no (60 s).** Add a test scenario → Bank detail change → Field & Flame. "A vendor emailed new bank details five days before a $42,000 payment. The engine holds the payment, verifies the payee against TransUnion through CRS, and escalates the same day." Open the held item: show the CRS report. Keep hold with instruction. "The human decides. The hold and the reason are in the audit trail."

**Scene 3, the forbidden call (30 s).** How approvals work → Make the agent post. "Here is the agent trying to post directly. Refused, logged, with the policy reference. This is not a prompt. It is the server."

**Scene 4, ask the audit trail (30 s).** Ask Auditor: "Why is the Field & Flame payment on hold?" Read the answer. "Every unit of work carries a trace id from the bank line to the human decision, and the trail is searchable in plain language."

**Close (20 s).** Review inbox: "Two items waiting for me, with the evidence. Stripe was escalated the first time in July; I approved it once and it has posted on its own since. That is the learning loop." Optional: Sign period.

Judges may inject their own scenarios from Add a test scenario: a bank transaction, a contract amendment, or a bank detail change. Every injection re-runs the close for the period.

## 3. What not to do

- Do not press Sign period on September before the recording or a judge demo unless you reset right after.
- Do not run `scripts/demo-reset.sh save`. It overwrites the golden snapshot with whatever prod holds.
- Do not reseed dev (`pnpm seed`); dev and prod share the Moss index. Testing approvals on dev is fine, the prod reset cleans Moss afterwards.
- Do not push to main between the Sunday reset and the end of judging; pushes deploy straight to prod and the site.
