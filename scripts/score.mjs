// Read-only live scoring through the authenticated Convex CLI and its selected deployment.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const packagePath = require.resolve("convex/package.json");
const manifest = JSON.parse(readFileSync(packagePath,"utf8"));
const cli = resolve(dirname(packagePath),typeof manifest.bin === "string" ? manifest.bin : manifest.bin.convex);
const args = {entity:process.env.ENTITY ?? "eo-festival-nyc",...(process.env.PERIOD ? {period:process.env.PERIOD} : {})};
process.argv = [process.execPath,cli,"run","scoring:report",JSON.stringify(args),...process.argv.slice(2)];
await import(pathToFileURL(cli).href);
