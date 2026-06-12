import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SECRET = Deno.env.get("URENAPP_SYNC_SECRET")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/list-planning-for-urenapp`;
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

const UA_P = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01";
const UA_M = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02";

// helper iso-week monday
function isoMonday(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const d = new Date(jan4);
  d.setUTCDate(jan4.getUTCDate() - (dow - 1) + (week - 1) * 7);
  return d;
}
function fmt(d: Date) { return d.toISOString().slice(0, 10); }

Deno.test("GET -> 405", async () => {
  const r = await call(null, { method: "GET" });
  await r.text();
  assertEquals(r.status, 405);
});

Deno.test("missing secret -> 401", async () => {
  const r = await call({ datum_vanaf: "2026-01-01", datum_tot: "2026-01-07" }, { secret: null });
  const t = await r.text();
  assertEquals(r.status, 401);
  assert(!t.includes(SECRET));
});

Deno.test("invalid input (no date) -> 400", async () => {
  const r = await call({});
  await r.text();
  assertEquals(r.status, 400);
});

Deno.test("extra fields -> 400 (strict)", async () => {
  const r = await call({ datum_vanaf: "2026-01-01", datum_tot: "2026-01-07", extra: 1 });
  await r.text();
  assertEquals(r.status, 400);
});

Deno.test("range >93 days -> 400", async () => {
  const r = await call({ datum_vanaf: "2026-01-01", datum_tot: "2026-05-01" });
  await r.text();
  assertEquals(r.status, 400);
});

Deno.test("datum_tot < datum_vanaf -> 400", async () => {
  const r = await call({ datum_vanaf: "2026-02-01", datum_tot: "2026-01-01" });
  await r.text();
  assertEquals(r.status, 400);
});

Deno.test("empty/valid range -> 200 met exacte top-level keys", async () => {
  const r = await call({ datum_vanaf: "2026-01-05", datum_tot: "2026-01-11" });
  const j = await r.json();
  assertEquals(r.status, 200);
  assertEquals(Object.keys(j).sort(), ["planning", "problemen", "uitgesloten"]);
  assert(Array.isArray(j.planning));
  assert(Array.isArray(j.problemen));
  assert(Array.isArray(j.uitgesloten));
});

// Uitgesloten monteur: verschijnt in uitgesloten, niet in planning, niet als MONTEUR_NIET_GEKOPPELD
Deno.test("uitgesloten monteur wordt nooit naar urenapp gestuurd en niet als probleem geteld", async () => {
  const { data: proj } = await admin.from("projecten").insert({
    case_nummer: `TPX-${Date.now()}`, station_naam: "X", jaar: 2026, status: "concept",
    urenapp_project_id: UA_P,
  }).select("id").single();
  const projectId = proj!.id as string;

  // monteur uitgesloten met reden
  const { data: mEx } = await admin.from("monteurs").insert({
    naam: `EX-${Date.now()}`, type: "montagemonteur", actief: true, werkdagen: [1,2,3,4,5],
    urenapp_sync_enabled: false,
    urenapp_sync_exclusion_reason: "sporadisch_ingehuurd",
  }).select("id").single();
  // monteur uitgesloten + tegelijk gekoppeld: nog steeds nooit syncen
  const { data: mExLinked } = await admin.from("monteurs").insert({
    naam: `EXL-${Date.now()}`, type: "montagemonteur", actief: true, werkdagen: [1,2,3,4,5],
    urenapp_profile_id: UA_M,
    urenapp_sync_enabled: false,
    urenapp_sync_exclusion_reason: "anders",
  }).select("id").single();
  const mExId = mEx!.id as string;
  const mExLinkedId = mExLinked!.id as string;

  const { data: week } = await admin.from("project_weken").insert({
    project_id: projectId, week_nr: 25, positie: 0,
  }).select("id").single();
  const { data: cMa } = await admin.from("planning_cellen").insert({
    week_id: week!.id, dag_index: 0,
  }).select("id").single();
  const cMaId = cMa!.id as string;
  await admin.from("cel_monteurs").insert([
    { cel_id: cMaId, monteur_id: mExId },
    { cel_id: cMaId, monteur_id: mExLinkedId },
  ]);

  try {
    const r = await call({
      datum_vanaf: "2026-06-15", datum_tot: "2026-06-19",
      planner_project_ids: [projectId],
      planner_monteur_ids: [mExId, mExLinkedId],
    });
    const j = await r.json();
    assertEquals(r.status, 200);
    assertEquals(Object.keys(j).sort(), ["planning", "problemen", "uitgesloten"]);

    // planning bevat geen uitgesloten monteurs
    const mine = j.planning.filter((p: any) => p.planner_project_id === projectId);
    assertEquals(mine.length, 0);

    // geen MONTEUR_NIET_GEKOPPELD voor deze cel
    const probs = j.problemen.filter(
      (p: any) => p.planning_cel_id === cMaId && p.code === "MONTEUR_NIET_GEKOPPELD"
    );
    assertEquals(probs.length, 0);

    // beide monteurs in uitgesloten, met exact de afgesproken velden
    const ex = j.uitgesloten.filter((u: any) => u.planning_cel_id === cMaId);
    assertEquals(ex.length, 2);
    for (const u of ex) {
      assertEquals(Object.keys(u).sort(), ["datum", "planner_monteur_id", "planning_cel_id", "reden"]);
      assertEquals(u.datum, "2026-06-15");
      assert(["sporadisch_ingehuurd", "anders"].includes(u.reden));
    }
    // urenapp_profile_id mag NOOIT in uitgesloten zitten (geen PII / koppelinfo lekken)
    for (const u of ex) assert(!("urenapp_profile_id" in u));
  } finally {
    await admin.from("cel_monteurs").delete().eq("cel_id", cMaId);
    await admin.from("planning_cellen").delete().eq("id", cMaId);
    await admin.from("project_weken").delete().eq("project_id", projectId);
    await admin.from("projecten").delete().eq("id", projectId);
    await admin.from("monteurs").delete().eq("id", mExId);
    await admin.from("monteurs").delete().eq("id", mExLinkedId);
  }
});

// Volledige scenariotest: koppel een testproject + monteur + week + cellen
Deno.test("gekoppelde + niet-gekoppelde + meerdere monteurs + iso-week ma/vr + sortering + exacte velden + geen pii/financieel", async () => {
  // create linked project (jaar 2026) + linked monteur + unlinked monteur
  const { data: proj } = await admin.from("projecten").insert({
    case_nummer: `TPL-${Date.now()}`, station_naam: "X", jaar: 2026, status: "concept",
    urenapp_project_id: UA_P,
  }).select("id").single();
  const projectId = proj!.id as string;

  const { data: m1 } = await admin.from("monteurs").insert({
    naam: `TM1-${Date.now()}`, type: "schakelmonteur", actief: true, werkdagen: [1,2,3,4,5],
    urenapp_profile_id: UA_M,
  }).select("id").single();
  const { data: m2 } = await admin.from("monteurs").insert({
    naam: `TM2-${Date.now()}`, type: "schakelmonteur", actief: true, werkdagen: [1,2,3,4,5],
  }).select("id").single();
  const m1Id = m1!.id as string;
  const m2Id = m2!.id as string;

  // week 25 of 2026 -> monday=2026-06-15
  const { data: week } = await admin.from("project_weken").insert({
    project_id: projectId, week_nr: 25, positie: 0,
  }).select("id").single();
  const weekId = week!.id as string;

  // cells: monday(0) + friday(4)
  const { data: cMa } = await admin.from("planning_cellen").insert({
    week_id: weekId, dag_index: 0, kleur_code: "c5", notitie: null,
  }).select("id").single();
  const { data: cVr } = await admin.from("planning_cellen").insert({
    week_id: weekId, dag_index: 4, kleur_code: "c2", notitie: null,
  }).select("id").single();
  const cMaId = cMa!.id as string;
  const cVrId = cVr!.id as string;

  // assign both monteurs to monday cell (one linked, one unlinked)
  await admin.from("cel_monteurs").insert([
    { cel_id: cMaId, monteur_id: m1Id },
    { cel_id: cMaId, monteur_id: m2Id },
    { cel_id: cVrId, monteur_id: m1Id },
  ]);

  try {
    const monday = fmt(isoMonday(2026, 25));            // 2026-06-15
    const friday = fmt(new Date(Date.UTC(2026, 5, 19))); // 2026-06-19

    const r = await call({
      datum_vanaf: monday,
      datum_tot: friday,
      planner_project_ids: [projectId],
      planner_monteur_ids: [m1Id, m2Id],
    });
    const j = await r.json();
    assertEquals(r.status, 200);

    // expect 2 planning records (m1 on monday + m1 on friday); m2 -> probleem
    const mine = j.planning.filter((p: any) => p.planner_project_id === projectId);
    assertEquals(mine.length, 2);

    // dates correct
    const mondayRec = mine.find((p: any) => p.dag_index === 0);
    const fridayRec = mine.find((p: any) => p.dag_index === 4);
    assertEquals(mondayRec.datum, monday);
    assertEquals(fridayRec.datum, friday);
    assertEquals(mondayRec.weeknummer, 25);

    // exact record keys
    for (const rec of mine) {
      assertEquals(Object.keys(rec).sort(), [
        "activiteit","dag_index","datum","external_id","kleur",
        "notitie","planner_monteur_id","planner_project_id",
        "planning_cel_id","urenapp_profile_id","urenapp_project_id","weeknummer",
      ]);
      // no PII / financial
      for (const forbidden of ["monteur_naam","project_naam","naam","tarief","uurtarief","kostprijs","capaciteit","email","telefoon"]) {
        assert(!(forbidden in rec), `unexpected field ${forbidden}`);
      }
    }

    // stable external_id
    assertEquals(mondayRec.external_id, `${cMaId}:${m1Id}`);

    // sort order: by datum then project then monteur then external_id
    const sorted = [...mine].sort((a, b) =>
      (`${a.datum}|${a.planner_project_id}|${a.planner_monteur_id}|${a.external_id}` <
       `${b.datum}|${b.planner_project_id}|${b.planner_monteur_id}|${b.external_id}`) ? -1 : 1
    );
    assertEquals(mine.map((x: any) => x.external_id), sorted.map((x: any) => x.external_id));

    // probleem voor unlinked monteur
    const probs = j.problemen.filter((p: any) => p.planning_cel_id === cMaId);
    assert(probs.some((p: any) => p.code === "MONTEUR_NIET_GEKOPPELD"));

    // ===== iso-week rond jaargrens (week 53 2026 begint 2026-12-28) =====
    const { data: w53 } = await admin.from("project_weken").insert({
      project_id: projectId, week_nr: 53, positie: 1,
    }).select("id").single();
    const { data: cW53 } = await admin.from("planning_cellen").insert({
      week_id: w53!.id, dag_index: 0,
    }).select("id").single();
    await admin.from("cel_monteurs").insert({ cel_id: cW53!.id, monteur_id: m1Id });

    const r2 = await call({
      datum_vanaf: "2026-12-28", datum_tot: "2027-01-03",
      planner_project_ids: [projectId], planner_monteur_ids: [m1Id],
    });
    const j2 = await r2.json();
    const w53rec = j2.planning.find((p: any) => p.planning_cel_id === cW53!.id);
    assertEquals(w53rec?.datum, "2026-12-28");

    // ===== dubbele toewijzing kan in cel_monteurs niet via unique key,
    // dus we testen sortering deterministisch via output: rerun en vergelijk
    const r3a = await call({
      datum_vanaf: monday, datum_tot: friday,
      planner_project_ids: [projectId], planner_monteur_ids: [m1Id, m2Id],
    });
    const r3b = await call({
      datum_vanaf: monday, datum_tot: friday,
      planner_project_ids: [projectId], planner_monteur_ids: [m1Id, m2Id],
    });
    const j3a = await r3a.json();
    const j3b = await r3b.json();
    assertEquals(
      j3a.planning.map((p: any) => p.external_id),
      j3b.planning.map((p: any) => p.external_id),
    );

    // ===== read-only: niets veranderd in projecten/monteurs/cellen =====
    const { data: p2 } = await admin.from("projecten").select("urenapp_project_id, jaar").eq("id", projectId).single();
    assertEquals(p2!.urenapp_project_id, UA_P);
    assertEquals(p2!.jaar, 2026);
  } finally {
    await admin.from("cel_monteurs").delete().eq("monteur_id", m1Id);
    await admin.from("cel_monteurs").delete().eq("monteur_id", m2Id);
    await admin.from("planning_cellen").delete().eq("week_id", weekId);
    // also w53 cells via project cascade isn't guaranteed; cleanup by project
    const { data: weeks } = await admin.from("project_weken").select("id").eq("project_id", projectId);
    for (const w of weeks ?? []) {
      await admin.from("planning_cellen").delete().eq("week_id", w.id);
    }
    await admin.from("project_weken").delete().eq("project_id", projectId);
    await admin.from("projecten").delete().eq("id", projectId);
    await admin.from("monteurs").delete().eq("id", m1Id);
    await admin.from("monteurs").delete().eq("id", m2Id);
  }
});
