// Real-world data trigger (Phase 3 add-on): a context.dev Monitor watches a public page (a vendor's terms,
// Stripe's fee schedule, the city's permit fees) and calls this endpoint when it changes. The change is filed
// as a contract amendment on the named counterparty, indexed into Moss, and the period's close re-runs,
// exactly as a judge's injection would. The agent never fetches the web itself; it only ever sees what was
// indexed, with the date it arrived.
//
// Create the monitor with webhook URL  <CONVEX_SITE_URL>/hooks/context  and name it  "contract:<counterparty>".
// Set CONTEXT_WEBHOOK_SECRET to the whsec_ value the create call returns (X-Context-Signature is verified), or,
// without a secret, append ?token=<CONTEXT_WEBHOOK_TOKEN> to the URL.
import { httpRouter } from "convex/server";
import { api } from "./_generated/api";
import { env, httpAction } from "./_generated/server";

const http = httpRouter();

async function signatureValid(secret: string, header: string | null, raw: string): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > 600) return false; // reject stale (10 min) or malformed
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i); // constant time
  return diff === 0;
}

http.route({
  path: "/hooks/context",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const raw = await req.text();
    const secret = env.CONTEXT_WEBHOOK_SECRET;
    const token = new URL(req.url).searchParams.get("token");
    const authorized = secret ? await signatureValid(secret, req.headers.get("X-Context-Signature"), raw) : !!env.CONTEXT_WEBHOOK_TOKEN && token === env.CONTEXT_WEBHOOK_TOKEN;
    if (!authorized) return new Response("forbidden", { status: 403 });

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response("bad request", { status: 400 });
    }
    if (typeof body !== "object" || body === null) return new Response("bad request", { status: 400 });
    const event = body as { id?: unknown; type?: unknown; data?: { monitor?: { name?: unknown }; change?: Record<string, unknown> } };
    if (event.type !== "change.detected") return new Response("ignored", { status: 200 });

    const name = typeof event.data?.monitor?.name === "string" ? event.data.monitor.name : "";
    const m = /^contract:(.+)$/.exec(name);
    if (!m) return new Response("monitor name must be contract:<counterparty>", { status: 400 });
    const change = event.data?.change ?? {};
    const pick = (k: string) => (typeof change[k] === "string" ? (change[k] as string) : null);
    const text = pick("summary") ?? pick("description") ?? pick("diff") ?? JSON.stringify(change).slice(0, 2000);
    const url = pick("url") ?? "";
    const eventId = req.headers.get("X-Context-Id") ?? (typeof event.id === "string" ? event.id : `evt-${Date.now()}`);

    const r = await ctx.runMutation(api.inject.amendContract, {
      entity: env.CONTEXT_WEBHOOK_ENTITY ?? "eo-festival-nyc",
      counterparty: m[1],
      text: `${text}${url ? ` (source: ${url}; context.dev event ${eventId})` : ` (context.dev event ${eventId})`}`,
      effectiveDate: env.CONTEXT_WEBHOOK_EFFECTIVE_DATE ?? new Date().toISOString().slice(0, 10), // demo: set to the open period's date
      number: "Monitor",
    });
    return new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } });
  }),
});

export default http;
