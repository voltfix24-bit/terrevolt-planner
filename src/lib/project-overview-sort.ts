import { getMondayOfWeek } from "./planning-types";

export type OverviewStatus = "gepland" | "in_uitvoering" | "afgerond" | "concept" | null | undefined;
export type PlanningCategory = "future" | "past" | "none";

export interface OverviewProject {
  id: string;
  status: OverviewStatus;
  case_nummer: string | null;
  station_naam?: string | null;
  gsu_datum?: string | null;
  planning_sort_order?: number | null;
  planning_sort_bucket?: string | null;
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

// Volgorde: in_uitvoering → gepland → concept → afgerond.
export function statusRank(status: OverviewStatus): number {
  switch (status) {
    case "in_uitvoering": return 0;
    case "gepland": return 1;
    case "concept": return 2;
    case "afgerond": return 3;
    default: return 2;
  }
}

export function statusKey(status: OverviewStatus): string {
  return status ?? "concept";
}

export function categoryRank(cat: PlanningCategory): number {
  return cat === "future" ? 0 : cat === "past" ? 1 : 2;
}

export function bucketKey(status: OverviewStatus, cat: PlanningCategory): string {
  return `${statusKey(status)}:${cat}`;
}

export function cellDateMs(week: { jaar: number; week_nr: number }, dagIndex: number): number {
  const monday = getMondayOfWeek(week.week_nr, week.jaar);
  monday.setDate(monday.getDate() + dagIndex);
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

export function buildProjectCellDates(
  weken: OverviewWeek[],
  activiteiten: OverviewActiviteit[],
  cellen: OverviewCel[],
): Map<string, number[]> {
  const weekById = new Map<string, OverviewWeek>();
  for (const w of weken) weekById.set(w.id, w);
  const actProject = new Map<string, string>();
  for (const a of activiteiten) if (a.project_id) actProject.set(a.id, a.project_id);
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

export function planningCategory(cellDates: number[] | undefined, todayMs: number): PlanningCategory {
  if (!cellDates || cellDates.length === 0) return "none";
  return cellDates.some((d) => d >= todayMs) ? "future" : "past";
}

/**
 * Sorteer-sleutel: [statusRank, categoryRank, manualOrder, dateKey, caseNr, stationNaam, id].
 *
 * - manualOrder = project.planning_sort_order indien bucket matcht met huidige bucket,
 *   anders Number.POSITIVE_INFINITY (handmatige order alleen geldig binnen huidige bucket).
 * - dateKey: future → firstFuture asc; past → -latestPast (recentste eerst); none → 0.
 */
export function getProjectOverviewSortKey(
  project: OverviewProject,
  cellDatesMs: number[] | undefined,
  todayMs: number,
): [number, number, number, number, string, string, string] {
  const sRank = statusRank(project.status);
  const cat = planningCategory(cellDatesMs, todayMs);
  const cRank = categoryRank(cat);
  const currentBucket = bucketKey(project.status, cat);

  const manualOrder =
    project.planning_sort_bucket === currentBucket && project.planning_sort_order != null
      ? project.planning_sort_order
      : Number.POSITIVE_INFINITY;

  let dateKey = 0;
  if (cellDatesMs && cellDatesMs.length > 0) {
    if (cat === "future") {
      dateKey = cellDatesMs.find((d) => d >= todayMs) ?? 0;
    } else {
      dateKey = -cellDatesMs[cellDatesMs.length - 1];
    }
  }

  // GSU als tweede datum-tiebreaker, voor "none"-categorie nuttig.
  const gsuMs = project.gsu_datum ? new Date(project.gsu_datum).getTime() : Number.POSITIVE_INFINITY;

  return [
    sRank,
    cRank,
    manualOrder,
    dateKey === 0 ? gsuMs : dateKey,
    project.case_nummer ?? "",
    project.station_naam ?? "",
    project.id,
  ];
}

export function compareOverviewProjects(
  a: OverviewProject,
  b: OverviewProject,
  cellDates: Map<string, number[]>,
  todayMs: number,
): number {
  const ka = getProjectOverviewSortKey(a, cellDates.get(a.id), todayMs);
  const kb = getProjectOverviewSortKey(b, cellDates.get(b.id), todayMs);
  for (let i = 0; i < 4; i++) {
    const va = ka[i] as number;
    const vb = kb[i] as number;
    if (va !== vb) return va - vb;
  }
  for (let i = 4; i < 7; i++) {
    const cmp = (ka[i] as string).localeCompare(kb[i] as string);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/** Bepaal de huidige bucket voor een project (client-side). */
export function computeBucketClient(
  project: OverviewProject,
  cellDatesMs: number[] | undefined,
  todayMs: number,
): string {
  return bucketKey(project.status, planningCategory(cellDatesMs, todayMs));
}
