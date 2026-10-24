// Interface 2 (B <-> C): table types. Written together Friday 7-8 pm. Both groups import, neither forks.
// Thirteen tables (design doc, "Data model"): accounts, periods, bankTransactions, journalEntries,
// contracts, breaks, proposals, decisions, auditLog, answerKey, policyPacks, fxRates, corrections.
// Every table carries an `entity` field (demo entity: Experts Only Festival NYC; UK edition is the stretch).
// The agent writes only breaks and proposals; the controls engine and the human write decisions;
// journalEntries gains rows only through post_entry; auditLog is append-only.
import { defineSchema } from "convex/server";

export default defineSchema({});
