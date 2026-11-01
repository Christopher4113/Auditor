# Deep's Milestone 2 evaluation contribution

This measures **the existing local retrieval component**, not the complete
Claude/Convex/Moss close. Two hand-labeled synthetic pilots contain 12 queries
each (9 answerable, 3 negative), against the same 21 source-only policy and
contract clauses. They are two task datasets from one project, not independent
public benchmarks. Labels are not indexed or passed to rankers.

From the repository root, with Python 3.12+ and `uv`:

```sh
uv sync --locked --project retrieval
uv run --project retrieval python evaluation/milestone2/evaluate.py
uv run --project retrieval python -m unittest discover -s evaluation/milestone2 -p 'test_*.py' -v
```

Results go to `results/results.json`, `results/execution.txt` and an HTML view.
Use `--out /tmp/auditor-m2-results` for an independent reproduction without
overwriting the checked-in evidence. Timings and timestamps vary; source-match,
abstention and scope scores should agree. The report records source/configuration
hashes and the code commit at execution. No credentials or cloud services are
needed, and no shared data is changed.

Compared methods:

- **Unscoped TF-IDF:** collection-filtered cosine TF-IDF over clause text,
  title and ID; ignores entity and date. A conventional retrieval baseline that
  exposes what scoping contributes.
- **Scoped TF-IDF:** same ranker with entity/effective-date filtering. A
  stronger deterministic baseline; no vendor-title narrowing.
- **Auditor local:** actual FastAPI `/query` handler, SQLite catalog, current
  scoping and contract-title narrowing, existing BM25-style `LocalBackend`.
  No production ranking code was modified for this experiment.

All methods use the same query/corpus and return at most three positive-score
hits. Top-1 and Hit@3 use nine answerable examples per dataset. Abstention uses
three negatives and requires a successful empty response; failures cannot earn
credit. Task success means an in-scope expected first source, or correct empty
response for a negative. Scope violations count returned hits outside the
requested entity/date. Verbatim integrity compares returned text to the source.

Auditor timings include in-process HTTP routing; baseline timings are direct
calls. One run per example, fixed method order, no warm-up control or network:
these are descriptive timings, not fair speed rankings or production latency.
There are zero model/cloud calls; model billing and actual savings are unmeasured.

The pilots mostly use words from source clauses. They are small, manually
annotated, unblinded development pilots, with no tuning/test split and no
independent accounting review. Full-system evaluation, held-out paraphrases,
more negative questions, Moss comparisons, real approvals and stakeholder
acceptance remain required team work. Oracle scorer fixtures are not agent
results. See the report and handoff under `docs/milestone2/`.
