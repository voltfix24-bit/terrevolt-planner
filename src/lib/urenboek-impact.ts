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

export type ImpactLevel = "safe" | "warning" | "strong" | "unknown";

export interface ImpactResult {
  external_id: string;
  status: ImpactStatus;
  uren_totaal: number;
  status_uren: UrenStatus;
  laatste_boeking_at: string | null;
}

export interface ImpactSummary {
  level: ImpactLevel;
  requiresConfirmation: boolean;
  title: string;
  description: string;
  totalIds: number;
  syncedCount: number;
  bookedCount: number;
  unknownCount: number;
  totalHours: number;
  statuses: UrenStatus[];
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
  return dedupeExternalIds(monteurIds.map((m) => buildExternalId(celId, m)));
}

export function dedupeExternalIds(externalIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of externalIds) {
    const externalId = String(raw ?? "").trim();
    if (!externalId || seen.has(externalId)) continue;
    seen.add(externalId);
    result.push(externalId);
  }

  return result;
}

export function summarizeImpact(results: readonly ImpactResult[]): ImpactSummary {
  const totalIds = results.length;
  const totalHours = results.reduce((sum, row) => sum + Number(row.uren_totaal || 0), 0);
  const unknownCount = results.filter((row) => row.status === "onbekend").length;
  const bookedCount = results.filter((row) => row.status === "uren_geregistreerd").length;
  const syncedCount = results.filter(
    (row) => row.status === "gesynced_geen_uren" || row.status === "uren_geregistreerd",
  ).length;
  const statuses = Array.from(
    new Set(
      results
        .map((row) => row.status_uren)
        .filter((status): status is UrenStatus => status !== "geen"),
    ),
  );

  if (unknownCount > 0) {
    return {
      level: "unknown",
      requiresConfirmation: true,
      title: "Impact op urenboek onbekend",
      description:
        "De urenboek-check kon niet bepalen of hier al uren op staan. Controleer dit bewust voordat je doorgaat.",
      totalIds,
      syncedCount,
      bookedCount,
      unknownCount,
      totalHours,
      statuses,
    };
  }

  if (bookedCount > 0) {
    return {
      level: "strong",
      requiresConfirmation: true,
      title: "Deze planning heeft geregistreerde uren",
      description: `Er staan ${formatHours(totalHours)} uur in het urenboek gekoppeld aan deze planning. Wijzigen kan verschillen veroorzaken tussen planning en urenregistratie.`,
      totalIds,
      syncedCount,
      bookedCount,
      unknownCount,
      totalHours,
      statuses,
    };
  }

  if (syncedCount > 0) {
    return {
      level: "warning",
      requiresConfirmation: true,
      title: "Deze planning is al zichtbaar in het urenboek",
      description:
        "Er zijn nog geen uren geregistreerd, maar de regel is wel al gesynchroniseerd. De monteur kan de wijziging terugzien in de urenboek-app.",
      totalIds,
      syncedCount,
      bookedCount,
      unknownCount,
      totalHours,
      statuses,
    };
  }

  return {
    level: "safe",
    requiresConfirmation: false,
    title: "Geen urenboek-impact",
    description: "Deze planning is nog niet gesynchroniseerd met het urenboek.",
    totalIds,
    syncedCount,
    bookedCount,
    unknownCount,
    totalHours,
    statuses,
  };
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
    isImpactStatus(r.status) &&
    typeof r.uren_totaal === "number" &&
    isUrenStatus(r.status_uren)
  );
}

/**
 * Vraag de impactstatus op voor een set external_ids.
 * Input wordt gededupliceerd. Lege input -> [].
 * Onbekende of ontbrekende ids in het antwoord krijgen status "onbekend".
 */
export async function checkUrenboekImpact(
  externalIds: readonly string[],
): Promise<ImpactResult[]> {
  const unique = dedupeExternalIds(externalIds);
  if (unique.length === 0) return [];

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ImpactResult[]>((resolve) => {
    timer = setTimeout(() => resolve(onbekendFor(unique)), REQUEST_TIMEOUT_MS);
  });

  const request = supabase.functions
    .invoke("urenboek-impact-check", {
      body: { external_ids: unique },
    })
    .then(({ data, error }) => {
      if (error) return onbekendFor(unique);

      const raw = (data as { results?: unknown })?.results;
      if (!Array.isArray(raw)) return onbekendFor(unique);

      const byId = new Map<string, ImpactResult>();
      for (const item of raw) {
        if (isImpactResult(item)) byId.set(item.external_id, item);
      }
      return unique.map((id) => byId.get(id) ?? onbekendFor([id])[0]);
    })
    .catch(() => onbekendFor(unique));

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isImpactStatus(status: unknown): status is ImpactStatus {
  return (
    status === "niet_gesynced" ||
    status === "gesynced_geen_uren" ||
    status === "uren_geregistreerd" ||
    status === "onbekend"
  );
}

function isUrenStatus(status: unknown): status is UrenStatus {
  return (
    status === "geen" ||
    status === "concept" ||
    status === "ingediend" ||
    status === "goedgekeurd" ||
    status === "afgekeurd" ||
    status === "gemengd"
  );
}

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
