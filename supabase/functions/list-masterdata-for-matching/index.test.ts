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

Deno.test("correct geheim -> 200 + exacte top-level keys en recordvelden", async () => {
  const r = await call();
  const j = await r.json();
  assertEquals(r.status, 200);
  assertEquals(Object.keys(j).sort(), ["monteurs", "projecten"]);

  assert(Array.isArray(j.projecten));
  assert(Array.isArray(j.monteurs));

  for (const p of j.projecten) {
    assertEquals(Object.keys(p).sort(), [
      "case_nummer", "jaar", "planner_id", "postcode", "stad", "station_naam",
      "status", "straat", "urenapp_project_id",
    ]);
    assert(!("uurtarief" in p));
    assert(!("kostprijs" in p));
  }

  for (const m of j.monteurs) {
    assertEquals(Object.keys(m).sort(), [
      "actief", "naam", "planner_id", "type", "urenapp_profile_id", "werkdagen",
    ]);
  }
});
