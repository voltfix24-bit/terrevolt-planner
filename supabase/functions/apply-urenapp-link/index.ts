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

const schema = z
  .object({
    kind: z.enum(["project", "monteur"]),
    planner_id: z.string().uuid(),
    urenapp_id: z.string().uuid(),
    expected_current_urenapp_id: z.string().uuid().nullable(),
  })
  .strict();

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
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return json(400, { error: "Validation failed" });

  const { kind, planner_id, urenapp_id, expected_current_urenapp_id } = parsed.data;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const table = kind === "project" ? "projecten" : "monteurs";
  const col = kind === "project" ? "urenapp_project_id" : "urenapp_profile_id";

  const { data: current, error: selErr } = await supabase
    .from(table)
    .select(`id, ${col}`)
    .eq("id", planner_id)
    .maybeSingle();
  if (selErr) return json(500, { error: "Internal error" });
  if (!current) return json(404, { error: "Not found" });

  const currentVal = (current as Record<string, unknown>)[col] as string | null;

  if (currentVal === urenapp_id) {
    return json(200, {
      success: true,
      kind,
      planner_id,
      urenapp_id,
      action: "already_linked",
    });
  }

  if (currentVal !== expected_current_urenapp_id) {
    return json(409, { error: "Conflict" });
  }

  // Conditional update: both planner id AND expected value must match
  let q = supabase.from(table).update({ [col]: urenapp_id }).eq("id", planner_id);
  q = expected_current_urenapp_id === null ? q.is(col, null) : q.eq(col, expected_current_urenapp_id);
  const { data: updated, error: updErr } = await q.select("id");
  if (updErr) return json(500, { error: "Internal error" });
  if (!updated || updated.length !== 1) return json(409, { error: "Conflict" });

  return json(200, {
    success: true,
    kind,
    planner_id,
    urenapp_id,
    action: "linked",
  });
});
