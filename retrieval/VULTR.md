# Vultr deployment handoff

Deployment recorded on **October 24, 2026**.

| Item              | Deployed configuration                                        |
| ----------------- | ------------------------------------------------------------- |
| Instance          | `auditor-retrieval-calhacks`                                  |
| Region            | Silicon Valley (`sjc`)                                        |
| Plan              | Shared CPU `vc2-2c-4gb`: 2 vCPU, 4 GB RAM, 80 GB SSD          |
| Price             | $0.027/hour, up to $20/month; automatic backups disabled      |
| SSH               | `root@45.32.136.206`, using the existing Auditor SSH key      |
| Firewall          | TCP 22 from `161.115.52.84/32` only; TCP 80 public            |
| Checkout          | `/opt/auditor`, branch `phase-2`, deployed commit `d10caf1`   |
| Service           | `retrieval/compose.yaml`                                      |
| Environment       | `/opt/auditor/retrieval/.env`, owned by root with mode `0600` |
| Persistent volume | `retrieval_retrieval-data`                                    |

## Verified behavior

- Public readiness: <http://45.32.136.206/health> returned `ready: true`, `backend: moss`, and `documents: 21`.
- An unauthenticated request to a protected endpoint returned HTTP `401`.
- Actual Moss retrieval and exact source resolution passed for `apex-9.4` and `policy-5.1`; source text was preserved.
- CRS verification remains unavailable and fails closed. Deployment does not enable payment release.

The service currently uses **HTTP**. HTTP does not encrypt the bearer token or request contents. Configure TLS before using this deployment beyond the synthetic demo. Do not describe this endpoint as HTTPS or as encrypted transport.

## Shared Convex development deployment

`dev:wary-labrador-928` was updated to Phase 2 and configured with `RETRIEVAL_URL=http://45.32.136.206` and a matching random `RETRIEVAL_API_KEY`. The token is intentionally absent from this document.

A development-data backup snapshot was taken before the shared deployment was reset to the sample containing **10 bank transactions and 1 journal entry**. The subsequent source-index audit verified **21/21 clauses**.

The September workflow was started against the sample. Its first and final Apex proposals, `P-sample-bank-10-r1` and `P-sample-bank-10-r3`, correctly proposed Dr 1000 $13,600, Dr 5160 $2,400, Cr 1200 $16,000 and cited `apex-9.4` plus `policy-5.1`. The policy citation carries a real retrieved relevance score; the deployed service also resolved both source passages exactly. No real human precedent existed after the sample reset, so no `D-0417` fixture was inserted into production memory.

The workflow completed and recorded `close.success` with `{breaks: 3, escalated: 3, posted: 0}`. It produced 9 proposals across 3 revision passes; the latest proposal records still have status `failed_rule`, so the workflow result must not be presented as approved or posted accounting. Automatic posting is blocked by existing B3/B4 logic: breaks keep the generic `unmatched` kind; controls require corrections from unrelated transactions in the same period; and generated rule corrections are not published to Moss. Correction failure also takes priority over revision-cap escalation. These backend review issues need the owning team's fixes. No controls were bypassed and no human approval was fabricated.

## Routine update

Connect from the allowed SSH source address using the existing Auditor key, then:

```sh
ssh root@45.32.136.206
cd /opt/auditor
git pull --ff-only origin phase-2
docker compose -f retrieval/compose.yaml up -d --build
docker compose -f retrieval/compose.yaml ps
curl --fail --silent --show-error http://127.0.0.1/health
```

Allow time for Moss to warm before checking readiness. Keep the environment file and named volume across updates. Validate Compose without displaying resolved secrets with `docker compose -f retrieval/compose.yaml config --quiet`.

Data resets are destructive: `pnpm seed` wipes and reloads the configured entity, and `docker compose -f retrieval/compose.yaml down -v` removes the local retrieval volume. Neither belongs in a routine update. Confirm a retained backup and its location before another reset; this handoff does not depend on a temporary local backup path. Do not print or commit the environment file, bearer token, or private key.
