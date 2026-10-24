import { afterEach, expect, it, vi } from "vitest";
import { searchRetrieval } from "./retrievalClient";

afterEach(() => vi.unstubAllGlobals());

it("sends entity/as-of scope and consumes the agreed array response", async () => {
  const hits = [{ id: "apex-9.4", text: "Verbatim source", score: 0.8 }];
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(hits)));
  vi.stubGlobal("fetch", fetchMock);
  const query = { collection: "contracts", text: "inspection fee", k: 3, entity: "eo-festival-nyc", asOf: "2026-09-30" };
  expect(await searchRetrieval("http://localhost:8000/", query, "test-only", "T-test")).toEqual(hits);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("http://localhost:8000/query");
  expect(JSON.parse(init.body)).toEqual(query);
  expect(init.headers.Authorization).toBe("Bearer test-only");
  expect(init.headers["X-Trace-Id"]).toBe("T-test");
});

it("reports backend failures instead of treating them as successful retrieval", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
  await expect(searchRetrieval("http://localhost", { collection: "policy", text: "fee", k: 3, entity: "x", asOf: "2026-09-30" })).rejects.toThrow("503");
});

it("rejects the incompatible hits envelope", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ hits: [] }))));
  await expect(searchRetrieval("http://localhost", { collection: "policy", text: "fee", k: 3, entity: "x", asOf: "2026-09-30" })).rejects.toThrow("Interface 1");
});
