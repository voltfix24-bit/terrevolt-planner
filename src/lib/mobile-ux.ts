import { activeMobilePlanningDays, type IsoWeek, type MobilePlanningDay, type MonteurDayState } from "./mobile-planning";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Eerstvolgende actieve planningdag strikt NA `after`; on-hold uitgesloten. extraCases = andere cases op die dag. */
export function nextActivePlanningAfter(days: MobilePlanningDay[], after: Date, onHoldProjectIds: ReadonlySet<string>, knownProjectIds?: ReadonlySet<string>) {
  const limit = startOfDay(after);
  let best: number | null = null;
  const active = activeMobilePlanningDays(days, onHoldProjectIds).filter((d) => !knownProjectIds || knownProjectIds.has(d.projectId));
  for (const d of active) { const t = startOfDay(d.date); if (t > limit && (best === null || t < best)) best = t; }
  if (best === null) return null;
  const onDay = active.filter((d) => startOfDay(d.date) === best);
  const projectIds = [...new Set(onDay.map((d) => d.projectId))].sort();
  const first = onDay[0];
  return { date: first.date, year: first.year, week: first.week, projectId: projectIds[0], extraCases: projectIds.length - 1 };
}

/** ?week=YYYY-WW */
export const formatWeekParam = (w: IsoWeek) => `${w.jaar}-${String(w.week_nr).padStart(2, "0")}`;
export function parseWeekParam(value: string | null): IsoWeek | null {
  const m = value?.match(/^(\d{4})-(\d{1,2})$/); if (!m) return null;
  const week_nr = Number(m[2]); if (week_nr < 1 || week_nr > 53) return null;
  return { jaar: Number(m[1]), week_nr };
}

export type ResourceWeekClass = "conflict" | "planned" | "partial" | "free";
/** conflict > ingepland > deels afwezig > hele week vrij. Naam speelt nooit een rol. */
export function classifyResourceWeek(states: Pick<MonteurDayState, "kind" | "conflict" | "plannedWhileUnavailable">[]): ResourceWeekClass {
  if (states.some((s) => s.conflict || s.plannedWhileUnavailable)) return "conflict";
  if (states.some((s) => s.kind === "planned")) return "planned";
  if (states.some((s) => s.kind === "unavailable")) return "partial";
  return "free";
}

export interface ResourceGroups<M> { conflict: M[]; planned: M[]; partial: M[]; free: M[] }
/** Groepeert resources per weekklasse met behoud van invoervolgorde; `matches` filtert alle groepen gelijk. */
export function groupResourcesForWeek<M extends { id: string }>(monteurs: M[], states: Map<string, Pick<MonteurDayState, "kind" | "conflict" | "plannedWhileUnavailable">[]>, matches: (m: M) => boolean = () => true): ResourceGroups<M> {
  const g: ResourceGroups<M> = { conflict: [], planned: [], partial: [], free: [] };
  for (const m of monteurs) if (matches(m)) g[classifyResourceWeek(states.get(m.id) ?? [])].push(m);
  return g;
}

/** Labels met expliciete eenheid. */
export const unitLabel = (scope: "day" | "week", kind: "beschikbaar" | "ingepland" | "vrij" | "conflicten") =>
  kind === "conflicten" ? "conflicten" : `${scope === "day" ? "monteurs" : "mandagen"} ${kind}`;

/** Lege staat voor /plannen. */
export function planningEmptyState(projectId: string | null, projectHasActivePlanning: boolean): "no-case-planning" | "no-week-planning" {
  return projectId && !projectHasActivePlanning ? "no-case-planning" : "no-week-planning";
}

/** Statistiekblok op case-detail alleen bij echte planningdata. */
export const showPlanningStats = (summary: { uniqueDays: number }) => summary.uniqueDays > 0;

export type CasePlanningLabel = { kind: "next"; date: Date; week: number } | { kind: "past"; date: Date } | { kind: "none" };
/** Planninglabel voor de mobiele Cases-lijst (alle vastgelegde dagen van één case). */
export function casePlanningLabel(days: Pick<MobilePlanningDay, "date" | "week">[], today: Date): CasePlanningLabel {
  const now = startOfDay(today); let next: (typeof days)[number] | null = null; let last: (typeof days)[number] | null = null;
  for (const d of days) {
    const t = startOfDay(d.date);
    if (t >= now) { if (!next || d.date < next.date) next = d; } else if (!last || d.date > last.date) last = d;
  }
  if (next) return { kind: "next", date: next.date, week: next.week };
  if (last) return { kind: "past", date: last.date };
  return { kind: "none" };
}

/** Sortering: actieve met volgende planning (vroegst eerst) → actieve zonder → on hold → afgerond. */
export function compareCases(a: { status: string | null; label: CasePlanningLabel; code: string }, b: { status: string | null; label: CasePlanningLabel; code: string }) {
  const rank = (c: typeof a) => c.status === "afgerond" ? 4 : c.status === "on_hold" ? 3 : c.label.kind === "next" ? 0 : c.label.kind === "past" ? 1 : 2;
  const r = rank(a) - rank(b); if (r) return r;
  if (a.label.kind === "next" && b.label.kind === "next") return a.label.date.getTime() - b.label.date.getTime();
  if (a.label.kind === "past" && b.label.kind === "past") return b.label.date.getTime() - a.label.date.getTime();
  return a.code.localeCompare(b.code, "nl");
}

export interface CaseFilters { status: string; opdrachtgeverId: string; week: string }
export const EMPTY_CASE_FILTERS: CaseFilters = { status: "", opdrachtgeverId: "", week: "" };
export const activeFilterCount = (f: CaseFilters) => [f.status, f.opdrachtgeverId, f.week].filter(Boolean).length;
