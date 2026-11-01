# Milestone 2 — Deep's handoff

Prepared November 1, 2026 on branch `Deep` for the November 8 deadline.

Use [the editable Word draft](CSE598-Milestone2-Deep-DRAFT.docx) to assemble the
group's **one** submission. [The PDF](CSE598-Milestone2-Deep-DRAFT.pdf) is an
eight-page reference rendering. Both use the provided template's seven sections.
This is a group draft with explicit missing evidence, not a submission-ready
claim that the stakeholder meeting and integrated evaluation have occurred.

Deep's completed work in this update:

- Added two versioned 12-query pilot datasets, two TF-IDF baselines, an evaluator
  using the existing real local `/query` handler, and three evaluator tests.
- Recorded 72 actual runs, response text, failures, scope checks, timing,
  source/configuration hashes and a source commit. Labels never enter retrieval.
- Wrote the dataset/evaluation analysis, actual failure analysis, proposed
  remaining-work assignments, implementation explanation and contribution evidence.
- Produced an architecture figure and a readable browser capture of the actual
  Apex contract lookup; generated editable DOCX and PDF drafts from the template.
- Verified 341 automated tests, both TypeScript projects and the web build.

Measured pilot findings: Auditor local returned the expected first source on
18/18 answerable questions. It succeeded overall on 11/12 policy and 10/12
contract questions, tied scoped TF-IDF, and had no scope violations. It failed to
abstain on three unsupported questions. These are **retrieval component** results,
not full-agent accounting accuracy or proof that Moss/Claude completed a close.

Required team inputs before submission:

1. Actual stakeholder identity, meeting date, participants, demonstrations,
   feedback, team responses, confirmed deliverables and success criteria.
2. The **group Auditor** Milestone 1 report and selected stakeholder proposal.
   Deep's local individual course-policy proposal is a different project.
3. Current full-system evaluation with two genuine task baselines on two
   accounting datasets, recorded model/configuration budgets and actual outcomes.
   The current 24-question retrieval pilot does not replace this requirement.
4. A current integrated demo trace/screenshots showing agent actions, controls,
   controller decisions where applicable, and real posting/escalation outcomes.
5. Confirmed roster/contact details, non-code contributions, owner assignments,
   accounting assumptions, and grader access to the repository.

Representative contribution links, based on actual history:

| Member | Evidence |
| --- | --- |
| Deep Nayak (`Deep-nayak007`) | [Generator/schema](https://github.com/Christopher4113/Auditor/commit/92e7571), [scenario data and retrieval](https://github.com/Christopher4113/Auditor/commit/2782fa3), [retrieval interface integration](https://github.com/Christopher4113/Auditor/commit/379b47c), [scoring/reset/CRS](https://github.com/Christopher4113/Auditor/commit/22def4c), [Milestone 2 evaluator](https://github.com/Christopher4113/Auditor/commit/ef07a1325a98f8a0c10fc4eb9831bd6f6a182dd2) |
| Prem Mahendra Pagare (`prempagare07`) | [Tool schemas](https://github.com/Christopher4113/Auditor/commit/07bcc44), [matcher/model proposer](https://github.com/Christopher4113/Auditor/commit/8f30503), [controls](https://github.com/Christopher4113/Auditor/commit/acccebb), [hold guard](https://github.com/Christopher4113/Auditor/commit/3a624e5) |
| Christopher Lam (`Christopher4113`) | [Phase 3 integration](https://github.com/Christopher4113/Auditor/commit/14971b9), [controller and source grounding](https://github.com/Christopher4113/Auditor/commit/91f9771), [audit and webhook integrations](https://github.com/Christopher4113/Auditor/commit/863b3a2) |
| Aarya Bhutkar (`AaryaBhutkar`) | [Frontend](https://github.com/Christopher4113/Auditor/commit/2d38fd2), [source/review interface](https://github.com/Christopher4113/Auditor/commit/b42f6a4), [deployment record](https://github.com/Christopher4113/Auditor/commit/24c0b02), [controller drawers](https://github.com/Christopher4113/Auditor/commit/40c2466) |

Reproduce from the repository root:

```sh
uv run --project retrieval python evaluation/milestone2/evaluate.py --out /tmp/auditor-m2-results
python3 evaluation/milestone2/render_evidence.py
uv run evaluation/milestone2/build_report.py
```

The report builder uses checked-in `evaluation/milestone2/results/results.json`.
To refresh the draft using new results, run the evaluator without `--out`, then
render evidence and build in that order. Review changed labels/results before
replacing the existing evidence. The renderer needs Chrome/Chromium (or
`CHROME_BIN`); the builder resolves declared document dependencies with `uv`.
The supplied template is preserved unchanged as `template.docx`.

See [evaluation instructions](../../evaluation/milestone2/README.md),
[recorded results](../../evaluation/milestone2/results/results.json), and
[verification](verification.md). The evaluated source/harness snapshot is
`ef07a1325a98f8a0c10fc4eb9831bd6f6a182dd2`; the artifact commit is available in the
`Deep` branch history. No other branch, shared deployment or external message was
changed by this work.
