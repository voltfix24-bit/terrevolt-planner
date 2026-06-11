import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SECRET = Deno.env.get("URENAPP_SYNC_SECRET")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ENDPOINT = `${SUPABASE_URL}/functions/v1/receive-urenapp-masterdata`;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function call(body: unknown, opts: { secret?: string | null; method?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.secret !== null) headers["x-urenapp-secret"] = opts.secret ?? SECRET;
  return fetch(ENDPOINT, {
    method: opts.method ?? "POST",
    headers,
    body: opts.method === "GET" ? undefined : JSON.stringify(body),
  });
}

const PID = "11111111-1111-1111-1111-111111111111";
const PID2 = "22222222-2222-2222-2222-222222222222";
const MID = "33333333-3333-3333-3333-333333333333";
const MID2 = "44444444-4444-4444-4444-444444444444";

async function cleanup() {
  await admin.from("projecten").delete().in("urenapp_project_id", [PID, PID2]);
  await admin.from("monteurs").delete().in("urenapp_profile_id", [MID, MID2]);
}

Deno.test("GET resulteert in 405", async () => {
  const res = await call(null, { method: "GET" });
  await res.text();
  assertEquals(res.status, 405);
});

Deno.test("ontbrekend geheim -> 401", async () => {
  const res = await call({ type: "project", data: {} }, { secret: null });
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test("verkeerd geheim -> 401", async () => {
  const res = await call({ type: "project", data: {} }, { secret: "fout" });
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test("ongeldige UUID -> 400", async () => {
  const res = await call({
    type: "project",
    data: {
      urenapp_project_id: "not-a-uuid",
      nummer: "P-1", naam: "X", jaar: 2026, actief: true,
    },
  });
  await res.text();
  assertEquals(res.status, 400);
});

Deno.test("ongeldige monteursoort -> 400", async () => {
  const res = await call({
    type: "monteur",
    data: {
      urenapp_profile_id: MID, naam: "Jan",
      type: "kabelmonteur", actief: true, werkdagen: [1,2,3],
    },
  });
  await res.text();
  assertEquals(res.status, 400);
});

Deno.test("ongeldige werkdagen -> 400", async () => {
  const res = await call({
    type: "monteur",
    data: {
      urenapp_profile_id: MID, naam: "Jan",
      type: "schakelmonteur", actief: true, werkdagen: [0, 9],
    },
  });
  await res.text();
  assertEquals(res.status, 400);
});

Deno.test("financiele velden worden geweigerd", async () => {
  const res = await call({
    type: "project",
    data: {
      urenapp_project_id: PID2, nummer: "P-X", naam: "X",
      jaar: 2026, actief: true, uurtarief: 95,
    },
  });
  await res.text();
  assertEquals(res.status, 400);
});

Deno.test("project aanmaken + update zonder duplicaat", async () => {
  await cleanup();
  const payload = {
    type: "project",
    data: {
      urenapp_project_id: PID,
      nummer: "P-100",
      naam: "Project A",
      stationsnaam: "Station Alpha",
      straat: "Hoofdstraat 1",
      postcode: "1234 AB",
      stad: "Utrecht",
      jaar: 2026,
      actief: true,
    },
  };
  const r1 = await call(payload);
  const j1 = await r1.json();
  assertEquals(r1.status, 200);
  assertEquals(j1.action, "created");
  assertEquals(j1.type, "project");
  assert(j1.planner_id);

  const r2 = await call({ ...payload, data: { ...payload.data, naam: "Project A v2" } });
  const j2 = await r2.json();
  assertEquals(r2.status, 200);
  assertEquals(j2.action, "updated");
  assertEquals(j2.planner_id, j1.planner_id);

  const { count } = await admin
    .from("projecten")
    .select("*", { count: "exact", head: true })
    .eq("urenapp_project_id", PID);
  assertEquals(count, 1);

  await cleanup();
});

Deno.test("monteur aanmaken + update zonder duplicaat", async () => {
  await cleanup();
  const payload = {
    type: "monteur",
    data: {
      urenapp_profile_id: MID,
      naam: "Piet",
      type: "schakelmonteur",
      actief: true,
      werkdagen: [1,2,3,4,5],
    },
  };
  const r1 = await call(payload);
  const j1 = await r1.json();
  assertEquals(r1.status, 200);
  assertEquals(j1.action, "created");

  const r2 = await call({ ...payload, data: { ...payload.data, naam: "Piet B" } });
  const j2 = await r2.json();
  assertEquals(r2.status, 200);
  assertEquals(j2.action, "updated");
  assertEquals(j2.planner_id, j1.planner_id);

  const { count } = await admin
    .from("monteurs")
    .select("*", { count: "exact", head: true })
    .eq("urenapp_profile_id", MID);
  assertEquals(count, 1);

  await cleanup();
});
