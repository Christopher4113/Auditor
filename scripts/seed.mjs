// Read JSON inside the CLI process: a Phase 2 seed exceeds macOS shell argv
// limits when passed through `"$(cat seed.json)"`. The maintained Convex CLI
// still handles authentication, target selection and execution.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flags = process.argv.slice(2);
const packagePath = require.resolve("convex/package.json");
const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
const cli = resolve(dirname(packagePath), typeof manifest.bin === "string" ? manifest.bin : manifest.bin.convex);

if (flags.includes("--help") || flags.includes("-h")) {
  process.argv = [process.execPath, cli, "run", "--help"];
  await import(pathToFileURL(cli).href);
} else {
  const source = resolve(root, process.env.SEED ?? "datagen/seed.json");
  execFileSync("uv", ["run", "--locked", "--project", resolve(root, "datagen"), "python",
    resolve(root, "datagen/validate.py"), source], { stdio: "inherit" });
  const seed = JSON.parse(readFileSync(source, "utf8"));
  if (flags.includes("--dry-run")) {
    console.log(JSON.stringify({ file: source, entity: seed.entity, schemaVersion: seed.schemaVersion,
      bankTransactions: seed.bankTransactions.length, journalEntries: 1 + (seed.ledgerEntries?.length ?? 0),
      cases: seed.answerKey.length, dryRun: true }, null, 2));
  } else {
    process.argv = [process.execPath, cli, "run", "seed:load", JSON.stringify(seed), ...flags];
    await import(pathToFileURL(cli).href);
  }
}
