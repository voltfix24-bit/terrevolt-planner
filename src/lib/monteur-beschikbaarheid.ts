// Helpers voor het bepalen of een monteur op een specifieke (week, dag) beschikbaar is.
// Houdt rekening met:
//  - vaste werkdagen van de monteur (ma=1..vr=5)
//  - verlof / afwezigheid (datum_van .. datum_tot inclusief)
//  - feestdagen (datum)
//
// dag_index in de planning is 0-based (0 = MA .. 4 = VR).

import { getMondayOfWeek } from "./planning-types";

export interface AfwezigheidPeriode {
  monteur_id: string;
  datum_van: string; // YYYY-MM-DD
  datum_tot: string; // YYYY-MM-DD (inclusief)
  type: string;
  omschrijving?: string | null;
}

export interface FeestdagItem {
  datum: string; // YYYY-MM-DD
  naam: string;
}

export type OnbeschikbaarReden =
  | { kind: "vrije_dag"; label: string }
  | { kind: "feestdag"; label: string; naam: string }
  | { kind: "verlof"; label: string; type: string; omschrijving?: string | null };

export interface BeschikbaarheidResultaat {
  beschikbaar: boolean;
  redenen: OnbeschikbaarReden[];
}

export function dateForWeekDag(weekNr: number, jaar: number, dagIndex: number): Date {
  const monday = getMondayOfWeek(weekNr, jaar);
  const d = new Date(monday);
  d.setDate(monday.getDate() + dagIndex);
  return d;
}

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAG_LABEL: Record<number, string> = {
  0: "MA",
  1: "DI",
  2: "WO",
  3: "DO",
  4: "VR",
};

export function isFeestdag(
  feestdagenMap: Map<string, string>,
  weekNr: number,
  jaar: number,
  dagIndex: number,
): { isFeestdag: boolean; naam?: string } {
  const key = ymd(dateForWeekDag(weekNr, jaar, dagIndex));
  const naam = feestdagenMap.get(key);
  return naam ? { isFeestdag: true, naam } : { isFeestdag: false };
}

/**
 * Bepaal beschikbaarheid van één monteur voor één (week, dag).
 * @param werkdagen monteur.werkdagen (1=ma..7=zo). Default [1..5].
 * @param afwezigheid afwezigheidsperiodes (alleen die van deze monteur, of all — wordt gefilterd).
 * @param feestdagenMap map van YYYY-MM-DD → feestdag-naam
 */
export function checkBeschikbaarheid(args: {
  monteurId: string;
  werkdagen: number[] | null | undefined;
  weekNr: number;
  jaar: number;
  dagIndex: number;
  afwezigheid: AfwezigheidPeriode[];
  feestdagenMap: Map<string, string>;
}): BeschikbaarheidResultaat {
  const redenen: OnbeschikbaarReden[] = [];
  const wd = args.werkdagen && args.werkdagen.length ? args.werkdagen : [1, 2, 3, 4, 5];
  // dag_index 0=MA → werkdag 1
  const werkdagNr = args.dagIndex + 1;
  if (!wd.includes(werkdagNr)) {
    redenen.push({ kind: "vrije_dag", label: `Vaste vrije dag (${DAG_LABEL[args.dagIndex]})` });
  }

  const datum = ymd(dateForWeekDag(args.weekNr, args.jaar, args.dagIndex));

  const feest = args.feestdagenMap.get(datum);
  if (feest) {
    redenen.push({ kind: "feestdag", label: `Feestdag: ${feest}`, naam: feest });
  }

  for (const a of args.afwezigheid) {
    if (a.monteur_id !== args.monteurId) continue;
    if (datum >= a.datum_van && datum <= a.datum_tot) {
      redenen.push({
        kind: "verlof",
        label: a.omschrijving ? `${a.type} — ${a.omschrijving}` : a.type,
        type: a.type,
        omschrijving: a.omschrijving ?? null,
      });
    }
  }

  return { beschikbaar: redenen.length === 0, redenen };
}

export function shortReason(r: OnbeschikbaarReden): string {
  switch (r.kind) {
    case "vrije_dag":
      return "Vrije dag";
    case "feestdag":
      return "Feestdag";
    case "verlof":
      return r.type || "Verlof";
  }
}
