/**
 * Beslislogica voor de impact-dialog bij destructieve Planner-acties.
 *
 * Pure functie zodat dit unit-getest kan worden zonder UI.
 */
import type { ImpactResult, ImpactStatus, UrenStatus } from "./urenboek-impact";

export type ImpactSeverity =
  | "geen"        // alles niet_gesynced → geen waarschuwing
  | "info"        // gesynced, maar geen uren
  | "sterk"       // uren geregistreerd
  | "fail_safe";  // impact onbekend (fout/timeout)

export interface ImpactDecision {
  severity: ImpactSeverity;
  needsConfirm: boolean;
  title: string;
  message: string;
  uren_totaal: number;
  status_uren: UrenStatus | null;
  counts: Record<ImpactStatus, number>;
}

function emptyCounts(): Record<ImpactStatus, number> {
  return {
    niet_gesynced: 0,
    gesynced_geen_uren: 0,
    uren_geregistreerd: 0,
    onbekend: 0,
  };
}

const STATUS_UREN_LABEL: Record<UrenStatus, string> = {
  geen: "geen",
  concept: "concept",
  ingediend: "ingediend",
  goedgekeurd: "goedgekeurd",
  afgekeurd: "afgekeurd",
  gemengd: "gemengd",
};

/**
 * Bepaal welke waarschuwing nodig is voor een set impact-resultaten.
 * Volgorde (hoog → laag): uren_geregistreerd > onbekend > gesynced_geen_uren > geen.
 */
export function decideImpactWarning(results: readonly ImpactResult[]): ImpactDecision {
  const counts = emptyCounts();
  let urenTotaal = 0;
  const urenStatussen = new Set<UrenStatus>();

  for (const r of results) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    if (r.status === "uren_geregistreerd") {
      urenTotaal += Number.isFinite(r.uren_totaal) ? r.uren_totaal : 0;
      if (r.status_uren && r.status_uren !== "geen") urenStatussen.add(r.status_uren);
    }
  }

  if (counts.uren_geregistreerd > 0) {
    const samengevoegd: UrenStatus | null =
      urenStatussen.size === 0
        ? null
        : urenStatussen.size === 1
          ? Array.from(urenStatussen)[0]
          : "gemengd";
    const label = samengevoegd ? STATUS_UREN_LABEL[samengevoegd] : "onbekend";
    return {
      severity: "sterk",
      needsConfirm: true,
      title: "Let op: er zijn al uren geregistreerd",
      message:
        `Op deze planning zijn al ${urenTotaal.toLocaleString("nl-NL")} uur geboekt ` +
        `(status: ${label}). Doorgaan kan de urenregistratie ontkoppelen.`,
      uren_totaal: urenTotaal,
      status_uren: samengevoegd,
      counts,
    };
  }

  if (counts.onbekend > 0) {
    return {
      severity: "fail_safe",
      needsConfirm: true,
      title: "Impact op urenboek kon niet worden gecontroleerd",
      message:
        "De urenboek-app is nu niet bereikbaar. Doorgaan kan urenregistratie ontkoppelen. " +
        "Controleer later in de urenboek-app of er geen losse regels staan.",
      uren_totaal: 0,
      status_uren: null,
      counts,
    };
  }

  if (counts.gesynced_geen_uren > 0) {
    return {
      severity: "info",
      needsConfirm: true,
      title: "Planning staat al in de urenboek-app",
      message:
        "Deze planning is al gesynchroniseerd met de urenboek-app, maar er zijn nog geen uren geboekt. Doorgaan?",
      uren_totaal: 0,
      status_uren: null,
      counts,
    };
  }

  return {
    severity: "geen",
    needsConfirm: false,
    title: "",
    message: "",
    uren_totaal: 0,
    status_uren: null,
    counts,
  };
}
