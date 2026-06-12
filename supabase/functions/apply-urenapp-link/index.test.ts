import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SECRET = Deno.env.get("URENAPP_SYNC_SECRET")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/apply-urenapp-link`;

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

const UA1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01";
const UA2 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02";

async function createTestProject(): Promise<string> {
  const { data, error } = await admin
    .from("projecten")
    .insert({ case_nummer: `TEST-${Date.now()}-${Math.random()}`, station_naam: "Test", jaar: 2026, status: "concept" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
async function createTestMonteur(): Promise<string> {
  const { data, error } = await admin
    .from("monteurs")
    .insert({ naam: `TestM-${Date.now()}-${Math.random()}`, type: "schakelmonteur", actief: true, werkdagen: [1,2,3] })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
async function getProj(id: string) {
  const { data } = await admin.from("projecten").select("*").eq("id", id).single();
  return data;
}
async function delProj(id: string) { await admin.from("projecten").delete().eq("id", id); }
async function delMont(id: string) { await admin.from("monteurs").delete().eq("id", id); }

Deno.test("GET -> 405", async () => {
  const r = await call(null, { method: "GET" });
  await r.text();
  assertEquals(r.status, 405);
});

Deno.test("ontbrekend geheim -> 401", async () => {
  const r = await call({}, { secret: null });
  const t = await r.text();
  assertEquals(r.status, 401);
  assert(!t.includes(SECRET));
});

Deno.test("verkeerd geheim -> 401", async () => {
  const r = await call({}, { secret: "fout" });
  const t = await r.text();
  assertEquals(r.status, 401);
  assert(!t.includes(SECRET));
});

Deno.test("ongeldige UUID -> 400", async () => {
  const r = await call({ kind: "project", planner_id: "x", urenapp_id: UA1, expected_current_urenapp_id: null });
  await r.text();
  assertEquals(r.status, 400);
});

Deno.test("extra velden -> 400", async () => {
  const r = await call({
    kind: "project", planner_id: crypto.randomUUID(), urenapp_id: UA1,
    expected_current_urenapp_id: null, extra: "x",
  });
  await r.text();
  assertEquals(r.status, 400);
});

Deno.test("onbekend project -> 404", async () => {
  const r = await call({
    kind: "project", planner_id: crypto.randomUUID(), urenapp_id: UA1, expected_current_urenapp_id: null,
  });
  await r.text();
  assertEquals(r.status, 404);
});

Deno.test("onbekend monteur -> 404", async () => {
  const r = await call({
    kind: "monteur", planner_id: crypto.randomUUID(), urenapp_id: UA1, expected_current_urenapp_id: null,
  });
  await r.text();
  assertEquals(r.status, 404);
});

Deno.test("koppelen vanaf NULL + idempotent + exact velden + alleen koppelkolom verandert", async () => {
  const id = await createTestProject();
  try {
    const before = await getProj(id);
    const r1 = await call({ kind: "project", planner_id: id, urenapp_id: UA1, expected_current_urenapp_id: null });
    const j1 = await r1.json();
    assertEquals(r1.status, 200);
    assertEquals(Object.keys(j1).sort(), ["action", "kind", "planner_id", "success", "urenapp_id"]);
    assertEquals(j1.action, "linked");
    assert(!JSON.stringify(j1).includes(SECRET));

    const after = await getProj(id);
    assertEquals(after.urenapp_project_id, UA1);
    // only urenapp_project_id changed
    for (const k of Object.keys(before)) {
      if (k === "urenapp_project_id" || k === "updated_at") continue;
      assertEquals(after[k], before[k], `field ${k} changed`);
    }

    // idempotent
    const r2 = await call({ kind: "project", planner_id: id, urenapp_id: UA1, expected_current_urenapp_id: null });
    const j2 = await r2.json();
    assertEquals(r2.status, 200);
    assertEquals(j2.action, "already_linked");
  } finally {
    await delProj(id);
  }
});

Deno.test("afwijkende bestaande koppeling -> 409 zonder write", async () => {
  const id = await createTestProject();
  try {
    await admin.from("projecten").update({ urenapp_project_id: UA1 }).eq("id", id);
    const r = await call({ kind: "project", planner_id: id, urenapp_id: UA2, expected_current_urenapp_id: null });
    await r.text();
    assertEquals(r.status, 409);
    const after = await getProj(id);
    assertEquals(after.urenapp_project_id, UA1);
  } finally {
    await delProj(id);
  }
});

Deno.test("twee gelijktijdige verzoeken -> 1 linked, 1 already_linked of conflict", async () => {
  const id = await createTestProject();
  try {
    const body = { kind: "project" as const, planner_id: id, urenapp_id: UA1, expected_current_urenapp_id: null };
    const [r1, r2] = await Promise.all([call(body), call(body)]);
    const [j1, j2] = await Promise.all([r1.json(), r2.json()]);
    const statuses = [r1.status, r2.status].sort();
    // both should be 200 (one linked, one already_linked) — never duplicate write
    assert(statuses.every((s) => s === 200), `statuses=${JSON.stringify(statuses)}`);
    const actions = [j1.action, j2.action].sort();
    assertEquals(actions, ["already_linked", "linked"]);
    const after = await getProj(id);
    assertEquals(after.urenapp_project_id, UA1);
  } finally {
    await delProj(id);
  }
});

Deno.test("monteur koppelen + idempotent", async () => {
  const id = await createTestMonteur();
  try {
    const r1 = await call({ kind: "monteur", planner_id: id, urenapp_id: UA1, expected_current_urenapp_id: null });
    const j1 = await r1.json();
    assertEquals(r1.status, 200);
    assertEquals(j1.action, "linked");
    const r2 = await call({ kind: "monteur", planner_id: id, urenapp_id: UA1, expected_current_urenapp_id: null });
    const j2 = await r2.json();
    assertEquals(j2.action, "already_linked");
  } finally {
    await delMont(id);
  }
});
