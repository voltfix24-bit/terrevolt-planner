import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-urenapp-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const RATE_LIMIT = 60;
const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= RATE_LIMIT) {
    buckets.set(key, arr);
    return true;
  }
  arr.push(now);
  buckets.set(key, arr);
  return false;
}

function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const len = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < len; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const schema = z
  .object({
    datum_vanaf: z.string().regex(dateRe),
    datum_tot: z.string().regex(dateRe),
    planner_project_ids: z.array(z.string().uuid()).max(100).optional(),
    planner_monteur_ids: z.array(z.string().uuid()).max(100).optional(),
  })
  .strict()
  .refine((d) => d.datum_tot >= d.datum_vanaf, { message: "datum_tot < datum_vanaf" })
  .refine(
    (d) =>
      (Date.parse(d.datum_tot) - Date.parse(d.datum_vanaf)) / 86_400_000 <= 92,
    { message: "max 93 dagen" },
  )
  .refine((d) => !d.planner_project_ids || new Set(d.planner_project_ids).size === d.planner_project_ids.length, { message: "duplicate project ids" })
  .refine((d) => !d.planner_monteur_ids || new Set(d.planner_monteur_ids).size === d.planner_monteur_ids.length, { message: "duplicate monteur ids" });

// ISO-week monday: returns YYYY-MM-DD for ISO-week (year, week, dayIndex 0..6 mon..sun)
function isoWeekDate(year: number, week: number, dayIndex: number): string | null {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(week) || week < 1 || week > 53) return null;
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return null;
  // ISO: Jan 4 is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7; // 1..7 Mon..Sun
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7 + dayIndex);
  // validate week exists in given iso year by checking that target's iso year matches
  const iso = getISOYear(target);
  if (iso !== year) return null;
  return target.toISOString().slice(0, 10);
}

function getISOYear(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  return t.getUTCFullYear();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  const secFetchMode = req.headers.get("sec-fetch-mode");
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchMode === "navigate" || secFetchSite === "cross-site") {
    return json(403, { error: "Forbidden" });
  }

  const expected = Deno.env.get("URENAPP_SYNC_SECRET");
  if (!expected) return json(500, { error: "Server misconfigured" });
  const provided = req.headers.get("x-urenapp-secret") ?? "";
  if (!constantTimeEqual(provided, expected)) return json(401, { error: "Unauthorized" });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  if (rateLimited(ip)) return json(429, { error: "Too Many Requests" });

  let raw: unknown;
  try { raw = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return json(400, { error: "Validation failed" });

  const { datum_vanaf, datum_tot, planner_project_ids, planner_monteur_ids } = parsed.data;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // 1) Load projecten + monteurs (so we can flag unlinked)
  let projQ = supabase.from("projecten").select("id, jaar, urenapp_project_id");
  if (planner_project_ids?.length) projQ = projQ.in("id", planner_project_ids);
  const { data: projecten, error: projErr } = await projQ;
  if (projErr) return json(500, { error: "DB error (projecten)" });

  let montQ = supabase.from("monteurs").select("id, urenapp_profile_id, urenapp_sync_enabled, urenapp_sync_exclusion_reason");
  if (planner_monteur_ids?.length) montQ = montQ.in("id", planner_monteur_ids);
  const { data: monteurs, error: montErr } = await montQ;
  if (montErr) return json(500, { error: "DB error (monteurs)" });

  const projMap = new Map<string, { jaar: number | null; urenapp_project_id: string | null }>();
  for (const p of projecten ?? []) projMap.set(p.id as string, { jaar: p.jaar as number | null, urenapp_project_id: p.urenapp_project_id as string | null });
  const montMap = new Map<string, { urenapp_profile_id: string | null; sync_enabled: boolean; reason: string | null }>();
  for (const m of monteurs ?? []) montMap.set(m.id as string, {
    urenapp_profile_id: m.urenapp_profile_id as string | null,
    sync_enabled: (m.urenapp_sync_enabled as boolean | null) ?? true,
    reason: (m.urenapp_sync_exclusion_reason as string | null) ?? null,
  });

  const projectIds = [...projMap.keys()];
  if (projectIds.length === 0) return json(200, { planning: [], problemen: [], uitgesloten: [] });

  // 2) Load weken for these projects
  let wekenQ = supabase.from("project_weken").select("id, project_id, week_nr");
  wekenQ = wekenQ.in("project_id", projectIds);
  const { data: weken, error: wkErr } = await wekenQ;
  if (wkErr) return json(500, { error: "DB error (weken)" });
  if (!weken || weken.length === 0) return json(200, { planning: [], problemen: [], uitgesloten: [] });

  const weekMap = new Map<string, { project_id: string; week_nr: number | null }>();
  for (const w of weken) weekMap.set(w.id as string, { project_id: w.project_id as string, week_nr: w.week_nr as number | null });

  // 3) Load planning_cellen for these weken
  const weekIds = [...weekMap.keys()];
  const { data: cellen, error: celErr } = await supabase
    .from("planning_cellen")
    .select("id, week_id, dag_index, kleur_code, notitie, activiteit_id")
    .in("week_id", weekIds);
  if (celErr) return json(500, { error: "DB error (planning_cellen)" });

  const celIds = (cellen ?? []).map((c) => c.id as string);
  if (celIds.length === 0) return json(200, { planning: [], problemen: [], uitgesloten: [] });

  // 4) cel_monteurs
  let cmQ = supabase.from("cel_monteurs").select("cel_id, monteur_id").in("cel_id", celIds);
  if (planner_monteur_ids?.length) cmQ = cmQ.in("monteur_id", planner_monteur_ids);
  const { data: celMonteurs, error: cmErr } = await cmQ;
  if (cmErr) return json(500, { error: "DB error (cel_monteurs)" });

  // 5) activiteiten
  const actIds = [...new Set((cellen ?? []).map((c) => c.activiteit_id).filter(Boolean) as string[])];
  const actMap = new Map<string, string | null>();
  if (actIds.length) {
    const { data: acts, error: aErr } = await supabase
      .from("project_activiteiten")
      .select("id, naam")
      .in("id", actIds);
    if (aErr) return json(500, { error: "DB error (activiteiten)" });
    for (const a of acts ?? []) actMap.set(a.id as string, (a.naam as string | null) ?? null);
  }

  const planning: Array<Record<string, unknown>> = [];
  const problemen: Array<{ code: string; planning_cel_id: string | null; uitleg: string }> = [];
  const uitgesloten: Array<{ planner_monteur_id: string; planning_cel_id: string; datum: string; reden: string }> = [];
  const seen = new Set<string>();

  // Group cel_monteurs by cel_id
  const cmByCel = new Map<string, string[]>();
  for (const cm of celMonteurs ?? []) {
    const arr = cmByCel.get(cm.cel_id as string) ?? [];
    arr.push(cm.monteur_id as string);
    cmByCel.set(cm.cel_id as string, arr);
  }

  for (const cel of cellen ?? []) {
    const celId = cel.id as string;
    const week = weekMap.get(cel.week_id as string);
    if (!week) continue;
    const proj = projMap.get(week.project_id);
    if (!proj) continue;

    // weeknr / dag_index / jaar validatie
    const dagIndex = cel.dag_index as number | null;
    if (dagIndex === null || !Number.isInteger(dagIndex) || dagIndex < 0 || dagIndex > 4) {
      problemen.push({ code: "DAGINDEX_ONGELDIG", planning_cel_id: celId, uitleg: "dag_index buiten 0..4" });
      continue;
    }
    if (week.week_nr === null || !Number.isInteger(week.week_nr) || week.week_nr < 1 || week.week_nr > 53) {
      problemen.push({ code: "WEEKNUMMER_ONGELDIG", planning_cel_id: celId, uitleg: "week_nr ontbreekt of ongeldig" });
      continue;
    }
    if (proj.jaar === null || !Number.isInteger(proj.jaar)) {
      problemen.push({ code: "PROJECTJAAR_ONGELDIG", planning_cel_id: celId, uitleg: "project jaar ontbreekt of ongeldig" });
      continue;
    }

    const datum = isoWeekDate(proj.jaar, week.week_nr, dagIndex);
    if (!datum) {
      problemen.push({ code: "WEEKNUMMER_ONGELDIG", planning_cel_id: celId, uitleg: "week bestaat niet in iso-jaar" });
      continue;
    }
    if (datum < datum_vanaf || datum > datum_tot) continue;

    const monteurIdsForCel = cmByCel.get(celId) ?? [];
    if (monteurIdsForCel.length === 0) continue;

    if (!proj.urenapp_project_id) {
      problemen.push({ code: "PROJECT_NIET_GEKOPPELD", planning_cel_id: celId, uitleg: "project zonder urenapp_project_id" });
      continue;
    }

    const activiteit = cel.activiteit_id ? actMap.get(cel.activiteit_id as string) ?? null : null;
    if (cel.activiteit_id && activiteit === null) {
      problemen.push({ code: "ACTIVITEIT_ONTBREEKT", planning_cel_id: celId, uitleg: "activiteit niet gevonden" });
    }

    for (const monteurId of monteurIdsForCel) {
      const mont = montMap.get(monteurId);
      if (!mont) {
        // not in selected/loaded monteurs (e.g. filtered out)
        continue;
      }
      if (!mont.urenapp_profile_id) {
        problemen.push({ code: "MONTEUR_NIET_GEKOPPELD", planning_cel_id: celId, uitleg: "monteur zonder urenapp_profile_id" });
        continue;
      }
      const external_id = `${celId}:${monteurId}`;
      if (seen.has(external_id)) {
        problemen.push({ code: "DUBBELE_TOEWIJZING", planning_cel_id: celId, uitleg: "dubbele cel-monteur combinatie" });
        continue;
      }
      seen.add(external_id);
      planning.push({
        external_id,
        planning_cel_id: celId,
        planner_project_id: week.project_id,
        urenapp_project_id: proj.urenapp_project_id,
        planner_monteur_id: monteurId,
        urenapp_profile_id: mont.urenapp_profile_id,
        datum,
        weeknummer: week.week_nr,
        dag_index: dagIndex,
        activiteit,
        kleur: (cel.kleur_code as string | null) ?? null,
        notitie: (cel.notitie as string | null) ?? null,
      });
    }
  }

  planning.sort((a, b) => {
    const ka = `${a.datum}|${a.planner_project_id}|${a.planner_monteur_id}|${a.external_id}`;
    const kb = `${b.datum}|${b.planner_project_id}|${b.planner_monteur_id}|${b.external_id}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  return json(200, { planning, problemen });
});
