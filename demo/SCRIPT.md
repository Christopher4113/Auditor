# Auditor demo script

About four and a half minutes spoken. One person drives, one person talks, or one person does both. Reset first (`scripts/demo-reset.sh`), open the live site, pick September 2026, dark theme, Live data badge showing. Keep the Activity tab in a second browser tab, already open on September.

Lines in **bold** are what you say. Lines in *italics* are what you do. Say the bold lines in your own words once you know them. Do not read.

---

## Three minute cut (judging slots)

Reset first. Site open on September, dark theme, phone also open on the site.

**0:00** *Click View close summary, Prepare close. Close the drawer.* **"Every company closes its books monthly. Most bank lines match themselves. The few that do not are where mistakes and fraud hide. Auditor: one Claude agent proposes, a rulebook in plain code checks, a human decides. The agent cannot post. The server refuses it."**

**0:20** *⋯, Add a test scenario, Vendor bank change, Field & Flame, 42000, "new account ending 8832", Add scenario.* **"While the close runs, a vendor just emailed new bank details, five days before a 42,000 dollar payment. We will come back to it."**

**0:40** *Hold up the phone as the first rows land.* **"Same rows on every screen, no refresh. Convex. 123 lines, the code matcher cleared the routine ones with no model call."**

**0:55** *Click Apex Staging. Expand Citations.* **"A 16,000 dollar deposit came back 13,600. The agent found clause 9.4, a 15 percent inspection fee, policy 5.1 on when fees are expensed, and booked 2,400 as expense. Three quotes, verified word for word through Moss. Under threshold, so the rules posted it. Nobody touched it."**

**1:30** *Click the Stripe row, point at the second citation.* **"Stripe payout. In July the agent asked, I approved once, and now it cites that approval and posts on its own. Asked once."**

**1:45** *Click Field & Flame, now On hold.* **"Back to the vendor. The engine held the payment, checked the payee against TransUnion through CRS, identity mismatch, four fraud flags. Parked in payments under review. Only a human can release it."** *Type "call the vendor first" and Keep hold with instruction.*

**2:15** *⋯, How approvals work, Advanced, Make the agent post.* **"The agent trying to post directly. Refused on the server, logged with the policy reference. Not a prompt."**

**2:30** *Ask Auditor, type "Why is the Field & Flame payment on hold?", send.* **"Every step carries one trace id, and the trail is searchable in plain English."** *Read the first sentence of the answer.*

**2:50** **"Routine items post themselves with citations. Exceptions come to me with evidence. The agent gets faster each month because I teach it once. The books are fictitious. The system is live."**

If the close is slow, swap the order: do the forbidden call at 0:40 and come back to Apex when it lands.

---

## 0. Setup line (15 s)

*Overview screen, nothing started.*

**Every company closes its books once a month. Most bank lines match on their own. The handful that do not are where mistakes and fraud hide. This is Auditor. One Claude agent plays the junior accountant. A rulebook written in plain code checks every entry it writes. And a human makes the calls that matter. The agent cannot post to the books. That is enforced on the server, not in a prompt.**

## 1. Start the close, inject the hold early (30 s)

*Click View close summary, then Prepare close. Close the drawer.*

**One button starts the September close. 123 bank transactions. A code matcher clears the routine ones with no model call at all. Only the odd lines reach the agent.**

*While it runs, open the ⋯ menu, Add a test scenario, Vendor bank change, vendor Field & Flame, amount 42000, context "new account ending 8832". Add scenario. Close the drawer.*

**While that runs I am going to do what a judge can do. A vendor just emailed us new bank details, five days before a 42,000 dollar payment. We will come back to it.**

## 2. The moment (60 s)

*Rows start appearing in the rail. Wait for Apex Staging. Click it. Expand Decision and checks, Citations, Accounting entry.*

**Here is the first one. A staging vendor returned a 16,000 dollar deposit and 13,600 came back. The agent went looking. It found clause 9.4 in the Apex contract, a 15 percent inspection fee. It found our policy 5.1, which says a fee like that is expensed when it becomes certain. It booked the 2,400 as inspection expense and cleared the deposit.**

*Point at the citations.*

**Three citations, quoted word for word from the source. The rules checked that each quote really exists, that the entry balances, that the amount is under the 5,000 dollar threshold, and posted it. Nobody touched this one. Every retrieval runs through Moss, and every check is a line of TypeScript, not a prompt.**

## 3. The learning loop (30 s)

*Click the Stripe row. Expand Citations.*

**Stripe pays out weekly, net of fees. In July the agent was unsure and asked. The controller approved it once. Look at the second citation. It is July's decision, and it literally says approved by human. So in September the agent cites that precedent and the rules let it through on its own. We asked once. Stripe's real fee schedule is indexed too, fetched from the web through context.dev, so the agent can cite the actual document by URL.**

## 4. The no (60 s)

*Click the Field & Flame row, now showing On hold.*

**Back to the bank change. The moment those details changed, the engine held every payment to this vendor. It verified the payee against TransUnion through CRS Credit, and the report came back with an identity mismatch and fraud flags.**

*Switch to the Activity tab briefly, point at verify_payee, switch back.*

**The 42,000 dollar payment is parked in account 1400, payments under review. The agent cannot release it. The rules cannot release it. Only a person can.**

*Type a short note, "Call the vendor on the number in the contract before any release." Click Keep hold with instruction.*

**The hold stays, the reason is in the audit trail, and this item carries forward to next month with a note. That is the design. A positive check would not release it either.**

## 5. The forbidden call (25 s)

*⋯ menu, How approvals work. Open Advanced, test posting access. Click Make the agent post.*

**Here is the agent trying to post straight to the ledger. Refused. The server checked the identity of the caller, logged the denial with the policy reference, and nothing changed. Three identities, agent, controls, human, and only the last two can ever write an entry.**

## 6. Ask the audit trail (30 s)

*Click Ask Auditor. Type or speak "Why is the Field & Flame payment on hold?" Send.*

**Every unit of work carries one trace id, from the bank line through the agent, the rules, and the human decision. The trail is summarised in plain English and indexed, so you can just ask it.**

*Read the first two sentences of the answer aloud.*

## 7. Close (20 s)

*Return to Overview. Point at the dark card.*

**So that is the month. Routine items posted themselves with citations. The exceptions came to me with the evidence attached. The agent gets faster every month because the human teaches it, and the human only ever sees the things worth their time. Everything you saw is live on Convex, the agent is Claude, retrieval is Moss, payee checks are CRS, public sources come through context.dev, and the retrieval service runs on Vultr. The books are fictitious. The system is not.**

*Optional if time: ⋯ menu, Close summary, Sign period. "One item carries forward. Signed and locked."*

---

## If a judge wants to drive

Offer the ⋯ menu, Add a test scenario. Three safe suggestions:

- Bank transaction, any vendor from the rail, amount under 5,000, a plain memo. Posts on its own in about two minutes.
- Bank transaction, amount over 5,000. Escalates to the Review inbox, and they can approve it or return it with an instruction and watch the revision.
- Contract amendment, vendor Brightwater Beverage, text describing a new fee. Indexed into Moss, the close re-runs.

Every injection re-runs the close, about two minutes. Reset between judges.

## Questions you will get

**How do you know it is right?** The generator plants six break types with a known answer key, and we score precision and recall against it. The engine also verifies every citation against the stored source text, so a made up quote fails before anyone sees it.

**What stops the agent from posting?** The one function that writes journal entries checks the caller's identity and refuses the agent. You just watched it refuse. It is not a prompt.

**Is any of this real data?** The books, vendors and amounts are synthetic. The ledger, workflow, agent, rules, retrieval, CRS sandbox calls and the public documents cited by URL are real.

**What happens if the retrieval service is down?** Citations fail closed. Nothing posts without a verified quote, and payee checks fail closed to a hold.

**Why one agent and not a team of agents?** The trust comes from the rules and the human, not from more models. One agent that must quote its sources is easier to audit than five that talk to each other.
