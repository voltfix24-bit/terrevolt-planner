import { createClient } from "npm:@supabase/supabase-js@2";

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: projecten, error: pErr } = await supabase
    .from("projecten")
    .select("id, case_nummer, station_naam, straat, postcode, stad, jaar, status, urenapp_project_id")
    .order("case_nummer", { ascending: true });
  if (pErr) return json(500, { error: "DB error (projecten)" });

  const { data: monteurs, error: mErr } = await supabase
    .from("monteurs")
    .select("id, naam, type, actief, werkdagen, urenapp_profile_id")
    .order("naam", { ascending: true });
  if (mErr) return json(500, { error: "DB error (monteurs)" });

  return json(200, {
    projecten: (projecten ?? []).map((p) => ({
      planner_id: p.id,
      case_nummer: p.case_nummer,
      station_naam: p.station_naam,
      straat: p.straat,
      postcode: p.postcode,
      stad: p.stad,
      jaar: p.jaar,
      status: p.status,
      urenapp_project_id: p.urenapp_project_id,
    })),
    monteurs: (monteurs ?? []).map((m) => ({
      planner_id: m.id,
      naam: m.naam,
      type: m.type,
      actief: m.actief,
      werkdagen: m.werkdagen,
      urenapp_profile_id: m.urenapp_profile_id,
    })),
  });
});
