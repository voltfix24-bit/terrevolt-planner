import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SECRET = Deno.env.get("URENAPP_SYNC_SECRET")!;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/list-masterdata-for-matching`;

function call(opts: { secret?: string | null; method?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.secret !== null) headers["x-urenapp-secret"] = opts.secret ?? SECRET;
  return fetch(ENDPOINT, { method: opts.method ?? "POST", headers });
}

Deno.test("GET -> 405", async () => {
  const r = await call({ method: "GET" });
  await r.text();
  assertEquals(r.status, 405);
});

Deno.test("ontbrekend geheim -> 401", async () => {
  const r = await call({ secret: null });
  await r.text();
  assertEquals(r.status, 401);
});

Deno.test("verkeerd geheim -> 401", async () => {
  const r = await call({ secret: "fout" });
  await r.text();
  assertEquals(r.status, 401);
});

Deno.test("correct geheim -> 200 + lijsten", async () => {
  const r = await call();
  const j = await r.json();
  assertEquals(r.status, 200);
  assertEquals(j.success, true);
  assert(Array.isArray(j.projecten));
  assert(Array.isArray(j.monteurs));
  assert(typeof j.counts.projecten === "number");
  assert(typeof j.counts.monteurs === "number");
  // geen financiele velden
  for (const p of j.projecten) {
    assert(!("uurtarief" in p));
    assert(!("kostprijs" in p));
  }
});
