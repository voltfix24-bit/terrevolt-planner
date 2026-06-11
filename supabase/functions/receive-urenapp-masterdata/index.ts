import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const ALLOWED_PROJECT_FIELDS = new Set([
  "urenapp_project_id",
  "nummer",
  "naam",
  "stationsnaam",
  "straat",
  "postcode",
  "stad",
  "jaar",
  "actief",
]);

const ALLOWED_MONTEUR_FIELDS = new Set([
  "urenapp_profile_id",
  "naam",
  "type",
  "actief",
  "werkdagen",
]);

const projectSchema = z
  .object({
    urenapp_project_id: z.string().uuid(),
    nummer: z.string().min(1).max(64),
    naam: z.string().min(1).max(255),
    stationsnaam: z.string().max(255).nullable().optional(),
    straat: z.string().max(255).nullable().optional(),
    postcode: z.string().max(32).nullable().optional(),
    stad: z.string().max(128).nullable().optional(),
    jaar: z.number().int().min(2000).max(2100),
    actief: z.boolean(),
  })
  .strict();

const monteurSchema = z
  .object({
    urenapp_profile_id: z.string().uuid(),
    naam: z.string().min(1).max(255),
    type: z.enum(["schakelmonteur", "montagemonteur"]),
    actief: z.boolean(),
    werkdagen: z.array(z.number().int().min(1).max(7)).min(0).max(7),
  })
  .strict();

const envelopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("project"), data: projectSchema }),
  z.object({ type: z.literal("monteur"), data: monteurSchema }),
]);

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

// In-memory rate limit per process (per source IP), 60 req/min
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

function composeLocatie(p: {
  straat?: string | null;
  postcode?: string | null;
  stad?: string | null;
}): string | null {
  const parts: string[] = [];
  if (p.straat) parts.push(p.straat);
  const pc = [p.postcode, p.stad].filter(Boolean).join(" ").trim();
  if (pc) parts.push(pc);
  const out = parts.join(", ").trim();
  return out.length ? out : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  // Block ordinary browser requests
  const secFetchMode = req.headers.get("sec-fetch-mode");
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchMode === "navigate" || secFetchSite === "cross-site") {
    return json(403, { error: "Forbidden" });
  }

  const expected = Deno.env.get("URENAPP_SYNC_SECRET");
  if (!expected) {
    return json(500, { error: "Server misconfigured" });
  }

  const provided = req.headers.get("x-urenapp-secret") ?? "";
  // Constant-time-ish compare
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  let ok = a.length === b.length;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  ok = ok && diff === 0;
  if (!ok) {
    return json(401, { error: "Unauthorized" });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  if (rateLimited(ip)) {
    return json(429, { error: "Too Many Requests" });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  // Reject unknown / financial fields early
  if (
    raw &&
    typeof raw === "object" &&
    (raw as Record<string, unknown>).data &&
    typeof (raw as Record<string, unknown>).data === "object"
  ) {
    const t = (raw as { type?: unknown }).type;
    const data = (raw as { data: Record<string, unknown> }).data;
    const allowed =
      t === "project"
        ? ALLOWED_PROJECT_FIELDS
        : t === "monteur"
        ? ALLOWED_MONTEUR_FIELDS
        : null;
    if (allowed) {
      for (const k of Object.keys(data)) {
        if (!allowed.has(k)) {
          return json(400, { error: `Unsupported field: ${k}` });
        }
      }
    }
  }

  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { error: "Validation failed", details: parsed.error.flatten() });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  if (parsed.data.type === "project") {
    const d = parsed.data.data;
    const station_naam = (d.stationsnaam && d.stationsnaam.trim()) || d.naam;
    const locatie = composeLocatie(d);
    const row = {
      urenapp_project_id: d.urenapp_project_id,
      case_nummer: d.nummer,
      station_naam,
      straat: d.straat ?? null,
      postcode: d.postcode ?? null,
      stad: d.stad ?? null,
      locatie,
      jaar: d.jaar,
      status: d.actief ? "concept" : "inactief",
    };

    const { data: existing, error: selErr } = await supabase
      .from("projecten")
      .select("id")
      .eq("urenapp_project_id", d.urenapp_project_id)
      .maybeSingle();
    if (selErr) return json(500, { error: "DB error" });

    if (existing) {
      const { error } = await supabase
        .from("projecten")
        .update(row)
        .eq("id", existing.id);
      if (error) return json(500, { error: "DB error" });
      return json(200, {
        success: true,
        type: "project",
        planner_id: existing.id,
        urenapp_id: d.urenapp_project_id,
        action: "updated",
      });
    } else {
      const { data: ins, error } = await supabase
        .from("projecten")
        .insert(row)
        .select("id")
        .single();
      if (error) return json(500, { error: "DB error" });
      return json(200, {
        success: true,
        type: "project",
        planner_id: ins.id,
        urenapp_id: d.urenapp_project_id,
        action: "created",
      });
    }
  }

  // monteur
  const d = parsed.data.data;
  const row = {
    urenapp_profile_id: d.urenapp_profile_id,
    naam: d.naam,
    type: d.type,
    actief: d.actief,
    werkdagen: d.werkdagen,
  };

  const { data: existing, error: selErr } = await supabase
    .from("monteurs")
    .select("id")
    .eq("urenapp_profile_id", d.urenapp_profile_id)
    .maybeSingle();
  if (selErr) return json(500, { error: "DB error" });

  if (existing) {
    const { error } = await supabase
      .from("monteurs")
      .update(row)
      .eq("id", existing.id);
    if (error) return json(500, { error: "DB error" });
    return json(200, {
      success: true,
      type: "monteur",
      planner_id: existing.id,
      urenapp_id: d.urenapp_profile_id,
      action: "updated",
    });
  }

  const { data: ins, error } = await supabase
    .from("monteurs")
    .insert(row)
    .select("id")
    .single();
  if (error) return json(500, { error: "DB error" });
  return json(200, {
    success: true,
    type: "monteur",
    planner_id: ins.id,
    urenapp_id: d.urenapp_profile_id,
    action: "created",
  });
});
