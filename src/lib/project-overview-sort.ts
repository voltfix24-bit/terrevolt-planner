import { getMondayOfWeek } from "./planning-types";

export type OverviewStatus = "gepland" | "in_uitvoering" | "afgerond" | "concept" | null | undefined;

export interface OverviewProject {
  id: string;
  status: OverviewStatus;
  case_nummer: string | null;
}

export interface OverviewWeek {
  id: string;
  project_id: string | null;
  jaar: number;
  week_nr: number;
}

export interface OverviewActiviteit {
  id: string;
  project_id: string | null;
}

export interface OverviewCel {
  activiteit_id: string | null;
  week_id: string | null;
  dag_index: number;
}

// gepland boven alle andere, daarna in_uitvoering, daarna concept, daarna afgerond.
function statusRank(status: OverviewStatus): number {
  switch (status) {
    case "gepland": return 0;
    case "in_uitvoering": return 1;
    case "concept": return 2;
    case "afgerond": return 3;
    default: return 2; // null behandelen als concept
  }
}

/**
 * Returneert de datum (ms sinds epoch) van een planning-cel op basis van
 * de ISO-maandag van zijn week + dag_index (0=ma..4=vr).
 */
export function cellDateMs(week: { jaar: number; week_nr: number }, dagIndex: number): number {
  const monday = getMondayOfWeek(week.week_nr, week.jaar);
  monday.setDate(monday.getDate() + dagIndex);
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

/**
 * Bouwt per project een gesorteerde lijst met cel-datums (ms).
 */
export function buildProjectCellDates(
  weken: OverviewWeek[],
  activiteiten: OverviewActiviteit[],
  cellen: OverviewCel[],
): Map<string, number[]> {
  const weekById = new Map<string, OverviewWeek>();
  for (const w of weken) weekById.set(w.id, w);
  const actProject = new Map<string, string>();
  for (const a of activiteiten) {
    if (a.project_id) actProject.set(a.id, a.project_id);
  }
  const out = new Map<string, number[]>();
  for (const c of cellen) {
    if (!c.activiteit_id || !c.week_id) continue;
    const pid = actProject.get(c.activiteit_id);
    if (!pid) continue;
    const w = weekById.get(c.week_id);
    if (!w) continue;
    const t = cellDateMs(w, c.dag_index);
    const arr = out.get(pid);
    if (arr) arr.push(t);
    else out.set(pid, [t]);
  }
  for (const arr of out.values()) arr.sort((a, b) => a - b);
  return out;
}

/**
 * Sorteer-sleutel voor het projecten-overzicht.
 *
 * Volgorde (van groot naar klein):
 *  1. status (gepland → in_uitvoering → concept → afgerond)
 *  2. groep binnen status:
 *       0 = heeft een planning_cel vandaag of in de toekomst
 *       1 = heeft alleen verleden planning_cellen
 *       2 = heeft geen planning_cellen
 *  3. binnen groep 0: eerstvolgende toekomstige cel (oplopend).
 *     binnen groep 1: meest recente verleden cel eerst (aflopend → negatief).
 *     binnen groep 2: 0 (volledig aan tiebreaker overgelaten).
 *  4. tiebreaker: case_nummer alfanumeriek.
 *
 * Pure functie — geen side effects.
 */
export function getProjectOverviewSortKey(
  project: OverviewProject,
  cellDatesMs: number[] | undefined,
  todayMs: number,
): [number, number, number, string] {
  const sRank = statusRank(project.status);
  const dates = cellDatesMs ?? [];
  if (dates.length === 0) {
    return [sRank, 2, 0, project.case_nummer ?? ""];
  }
  const firstFuture = dates.find((d) => d >= todayMs);
  if (firstFuture !== undefined) {
    return [sRank, 0, firstFuture, project.case_nummer ?? ""];
  }
  // alleen verleden: meest recente eerst → negate
  const latestPast = dates[dates.length - 1];
  return [sRank, 1, -latestPast, project.case_nummer ?? ""];
}

export function compareOverviewProjects(
  a: OverviewProject,
  b: OverviewProject,
  cellDates: Map<string, number[]>,
  todayMs: number,
): number {
  const ka = getProjectOverviewSortKey(a, cellDates.get(a.id), todayMs);
  const kb = getProjectOverviewSortKey(b, cellDates.get(b.id), todayMs);
  for (let i = 0; i < 3; i++) {
    if (ka[i] !== kb[i]) return (ka[i] as number) - (kb[i] as number);
  }
  return (ka[3] as string).localeCompare(kb[3] as string);
}
