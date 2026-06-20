// Planner-side proxy voor de read-only urenboek impact-check.
// Houdt de gedeelde URENAPP_SYNC_SECRET server-side, zodat het geheim
// nooit in de browser komt. Vertaalt fouten naar een veilig "onbekend".
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BodySchema = z
  .object({
    external_ids: z.array(z.string().min(3).max(120)).min(1).max(500),
  })
  .strict();

type Status =
  | "niet_gesynced"
  | "gesynced_geen_uren"
  | "uren_geregistreerd"
  | "onbekend";
type UrenStatus =
  | "geen"
  | "concept"
  | "ingediend"
  | "goedgekeurd"
  | "afgekeurd"
  | "gemengd";

interface ImpactResult {
  external_id: string;
  status: Status;
  uren_totaal: number;
  status_uren: UrenStatus;
  laatste_boeking_at: string | null;
}

const onbekend = (ids: string[]): ImpactResult[] =>
  ids.map((id) => ({
    external_id: id,
    status: "onbekend",
    uren_totaal: 0,
    status_uren: "geen",
    laatste_boeking_at: null,
  }));

async function isManager(req: Request): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !authorization) return false;

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data, error } = await client.rpc("is_planner_manager");
  return !error && data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!(await isManager(req))) return json(403, { error: "forbidden" });

  let parsed: z.infer<typeof BodySchema>;
  try {
    const body = await req.json();
    const result = BodySchema.safeParse(body);
    if (!result.success) return json(400, { error: "invalid_body" });
    parsed = result.data;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const unique = Array.from(new Set(parsed.external_ids));

  const baseUrl = Deno.env.get("URENBOEK_BASE_URL")?.replace(/\/+$/, "");
  const secret = Deno.env.get("URENAPP_SYNC_SECRET");
  if (!baseUrl || !secret) {
    // Config nog niet rond; fail-safe zodat UI keurig kan waarschuwen.
    return json(200, { results: onbekend(unique) });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const upstream = await fetch(
      `${baseUrl}/functions/v1/planner-impact-check`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-urenapp-secret": secret,
        },
        body: JSON.stringify({ external_ids: unique }),
        signal: controller.signal,
      },
    );
    if (!upstream.ok) return json(200, { results: onbekend(unique) });
    const data = await upstream.json().catch(() => null) as
      | { results?: ImpactResult[] }
      | null;
    const arr = Array.isArray(data?.results) ? data!.results : [];
    const byId = new Map<string, ImpactResult>();
    for (const item of arr) {
      if (item && typeof item.external_id === "string") byId.set(item.external_id, item);
    }
    const merged = unique.map((id) => byId.get(id) ?? onbekend([id])[0]);
    return json(200, { results: merged });
  } catch {
    return json(200, { results: onbekend(unique) });
  } finally {
    clearTimeout(timer);
  }
});