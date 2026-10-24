// Interface 1 adapter. Python returns [{id,text,score}], not {hits:[...]}.
export type RetrievalHit = { id: string; text: string; score: number };
export type RetrievalQuery = { collection: string; text: string; k: number; entity: string; asOf: string };

export async function searchRetrieval(url: string, query: RetrievalQuery, apiKey = ""): Promise<RetrievalHit[]> {
  const response = await fetch(`${url.replace(/\/$/, "")}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify(query),
  });
  if (!response.ok) throw new Error(`Retrieval HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data.every((h) => h && typeof h.id === "string" && typeof h.text === "string"
      && typeof h.score === "number" && Number.isFinite(h.score))) {
    throw new Error("Retrieval response does not match Interface 1");
  }
  return data as RetrievalHit[];
}
