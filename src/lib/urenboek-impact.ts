/**
 * Client helper voor de read-only urenboek impact-check.
 *
 * Bouwt external_ids zoals de urenboek-app ze verwacht
 * (`${planningCelId}:${monteurId}`) en roept een Planner-side proxy
 * edge function aan die op zijn beurt de urenboek-app aanspreekt.
 *
 * - Geen persoonsgegevens worden geretourneerd of gelogd.
 * - Bij netwerkfout/timeout/non-2xx wordt elke gevraagde id `onbekend`.
 * - Nog geen cache (komt in een latere fase).
 */
import { supabase } from "@/integrations/supabase/client";

export type ImpactStatus =
  | "niet_gesynced"
  | "gesynced_geen_uren"
  | "uren_geregistreerd"
  | "onbekend";

export type UrenStatus =
  | "geen"
  | "concept"
  | "ingediend"
  | "goedgekeurd"
  | "afgekeurd"
  | "gemengd";

export interface ImpactResult {
  external_id: string;
  status: ImpactStatus;
  uren_totaal: number;
  status_uren: UrenStatus;
  laatste_boeking_at: string | null;
}

/** Bouw een stabiele external_id voor een (cel, monteur)-combinatie. */
export function buildExternalId(celId: string, monteurId: string): string {
  return `${celId}:${monteurId}`;
}

/** Bouw external_ids voor een cel met meerdere monteurs. */
export function buildExternalIdsForCell(
  celId: string,
  monteurIds: readonly string[],
): string[] {
  return monteurIds.map((m) => buildExternalId(celId, m));
}

const REQUEST_TIMEOUT_MS = 6_000;

function onbekendFor(ids: readonly string[]): ImpactResult[] {
  return ids.map((external_id) => ({
    external_id,
    status: "onbekend" as const,
    uren_totaal: 0,
    status_uren: "geen" as const,
    laatste_boeking_at: null,
  }));
}

function isImpactResult(x: unknown): x is ImpactResult {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.external_id === "string" &&
    typeof r.status === "string" &&
    typeof r.uren_totaal === "number" &&
    typeof r.status_uren === "string"
  );
}

/**
 * Vraag de impactstatus op voor een set external_ids.
 * Input wordt gededupliceerd. Lege input → [].
 * Onbekende of ontbrekende ids in het antwoord krijgen status "onbekend".
 */
export async function checkUrenboekImpact(
  externalIds: readonly string[],
): Promise<ImpactResult[]> {
  const unique = Array.from(new Set(externalIds.filter((x) => typeof x === "string" && x.length > 0)));
  if (unique.length === 0) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const { data, error } = await supabase.functions.invoke(
      "urenboek-impact-check",
      {
        body: { external_ids: unique },
      },
    );
    if (error) return onbekendFor(unique);

    const raw = (data as { results?: unknown })?.results;
    if (!Array.isArray(raw)) return onbekendFor(unique);

    const byId = new Map<string, ImpactResult>();
    for (const item of raw) {
      if (isImpactResult(item)) byId.set(item.external_id, item);
    }
    return unique.map((id) => byId.get(id) ?? onbekendFor([id])[0]);
  } catch {
    return onbekendFor(unique);
  } finally {
    clearTimeout(timer);
  }
}
