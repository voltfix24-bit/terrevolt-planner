import { activeMobilePlanningDays, groupDayBlocks, monteurWeekStates, type MobileCapacityMonteur, type IsoWeek, type MobilePlanningDay, type MonteurDayState } from "./mobile-planning";
import { addIsoWeeks, COLOR_MAP, getMondayOfWeek, isoWeekPartsOf } from "./planning-types";
import { ymd, type AfwezigheidPeriode, type FeestdagItem } from "./monteur-beschikbaarheid";

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


/** Uniforme mobiele titel, zonder opslag of brondata te wijzigen. */
export function caseTitle(project?: { case_nummer?: string | null; station_naam?: string | null }) {
  const clean = (value: string | null | undefined, fallback: string) => value?.trim().replace(/\s+/g, " ") || fallback;
  return `${clean(project?.case_nummer, "Geen casenummer")} · ${clean(project?.station_naam, "Naamloos station")}`;
}

/** Zoeken is accent-, scheidingsteken- en voorloopnul-onafhankelijk. */
export function normalizeForSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[\s.\-]+/g, "").replace(/\d+/g, (digits) => digits.replace(/^0+(?=\d)/, ""));
}
export const matchesSearch = (value: string, term: string) => normalizeForSearch(value).includes(normalizeForSearch(term));

export function mobileDataState(hasData: boolean, error: string | null, online: boolean): "loading" | "error" | "stale" | "ready" {
  if (!hasData) return error || !online ? "error" : "loading";
  return error || !online ? "stale" : "ready";
}

/** Lokale kalenderdag, ook correct over middernacht en zomer-/wintertijd. */
export function freshnessLabel(updated: Date | null, now: Date = new Date()) {
  if (!updated) return "…";
  const time = updated.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  if (startOfDay(updated) === startOfDay(now)) return time;
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (startOfDay(updated) === startOfDay(yesterday)) return `gisteren ${time}`;
  return `${updated.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "")} ${time}`;
}

/** Labels interpreteren alleen bestaande beschikbaarheidsredenen, nooit resourcenamen. */
export function unavailableLabel(reasons: string[], detail = false) {
  const label = (reason: string) => {
    const text = reason.toLowerCase();
    if (text.includes("vrije dag")) return detail ? "geen werkdag (rooster)" : "—";
    if (text.includes("feestdag")) return "Feestdag";
    if (text.includes("ziek")) return "Ziek";
    if (text.includes("verlof") || text.includes("vakantie")) return "Verlof";
    if (text.includes("opleiding")) return "Opleiding";
    return "Afwezig";
  };
  const labels = [...new Set(reasons.map(label))];
  // Een werkelijke afwezigheid/feestdag blijft zichtbaar wanneer ook het rooster vrij is.
  return detail ? labels.join(", ") || "Afwezig" : labels.find((value) => value !== "—") ?? "—";
}

export function caseSection(c: { status: string | null; label: CasePlanningLabel }) {
  return c.status === "afgerond" ? "Afgerond" : c.status === "on_hold" ? "On hold" : c.label.kind === "next" ? "Komende planning" : c.label.kind === "past" ? "Afgelopen planning" : "Zonder planning";
}

/** Huidige/toekomstige ISO-weken oplopend, daarna verleden aflopend. */
export function sortCaseWeekOptions(weeks: string[], current: IsoWeek) {
  const pivot = formatWeekParam(current);
  return [...weeks].sort((a, b) => {
    const aFuture = a >= pivot, bFuture = b >= pivot;
    return aFuture !== bFuture ? (aFuture ? -1 : 1) : aFuture ? a.localeCompare(b) : b.localeCompare(a);
  });
}

export function selectMobileWeek(url: string | null, stored: IsoWeek | null, now = new Date()): IsoWeek {
  return parseWeekParam(url) ?? stored ?? isoWeekPartsOf(now);
}

export function parseMobileView(params: URLSearchParams) {
  return { week: parseWeekParam(params.get("week")), query: params.get("q") ?? "", open: params.get("open"), mode: params.get("weergave") === "komend" ? "overview" as const : "week" as const };
}

export function formatMobileView(params: URLSearchParams, state: { week: IsoWeek; query: string; open: string | null; mode?: "week" | "overview" }) {
  const next = new URLSearchParams(params);
  next.set("week", formatWeekParam(state.week));
  if (state.query) next.set("q", state.query); else next.delete("q");
  if (state.open) next.set("open", state.open); else next.delete("open");
  if (state.mode === "overview") next.set("weergave", "komend"); else next.delete("weergave");
  return next;
}

export function mobileTodayContext(now: Date) {
  const index = (now.getDay() + 6) % 7;
  const weekend = index > 4;
  const week = isoWeekPartsOf(now);
  return { week: weekend ? addIsoWeeks(week.jaar, week.week_nr, 1) : week, dayIndex: weekend ? 0 : index, weekend };
}

export function splitMobileWeeks<T extends { year: number; week: number }>(weeks: T[], now = new Date()) {
  const current = formatWeekParam(isoWeekPartsOf(now));
  const key = (w: T) => formatWeekParam({ jaar: w.year, week_nr: w.week });
  const upcoming = weeks.filter((w) => key(w) >= current).sort((a, b) => key(a).localeCompare(key(b)));
  const earlier = weeks.filter((w) => key(w) < current).sort((a, b) => key(b).localeCompare(key(a)));
  return { upcoming, earlier, defaultOpen: upcoming[0] ? key(upcoming[0]) : null };
}

export const mobileBackTarget = (index: unknown, fallback: string): -1 | string => typeof index === "number" && index > 0 ? -1 : fallback;
export const capacityLink = (week: IsoWeek, monteur?: string) => `/capaciteit?week=${formatWeekParam(week)}${monteur ? `&monteur=${encodeURIComponent(monteur)}` : ""}`;

export interface WeekException {
  type: "dubbel" | "afwezig" | "geen-ploeg";
  dayIndex: number;
  date: Date;
  monteurId?: string;
  projectIds: string[];
}

/** One exception per resource-day/type or crewless case-day; never per activity cell. */
export function weekExceptions(days: MobilePlanningDay[], week: IsoWeek, monteurs: MobileCapacityMonteur[], absences: AfwezigheidPeriode[], holidays: FeestdagItem[], onHold: ReadonlySet<string> = new Set()): WeekException[] {
  const active = activeMobilePlanningDays(days, onHold).filter((d) => d.year === week.jaar && d.week === week.week_nr);
  const result: WeekException[] = [];
  const states = monteurWeekStates(active, week.jaar, week.week_nr, monteurs, absences, holidays);
  for (const [monteurId, list] of states) for (const state of list) {
    const entry = { dayIndex: state.dayIndex, date: state.date, monteurId, projectIds: state.entries.map((e) => e.projectId).sort() };
    if (state.conflict) result.push({ ...entry, type: "dubbel" });
    if (state.plannedWhileUnavailable) result.push({ ...entry, type: "afwezig" });
  }
  for (const block of groupDayBlocks(active)) if (!block.monteurIds.length) result.push({ type: "geen-ploeg", dayIndex: block.dayIndex, date: block.date, projectIds: [block.projectId] });
  const rank = { dubbel: 0, afwezig: 1, "geen-ploeg": 2 };
  return result.sort((a, b) => a.dayIndex - b.dayIndex || rank[a.type] - rank[b.type] || (a.monteurId ?? a.projectIds[0]).localeCompare(b.monteurId ?? b.projectIds[0]));
}

const ACTIVITY_LABELS: Record<string, string> = {
  montagedagen: "Montage", montage: "Montage", schakeldagen: "Schakel", schakelen: "Schakel",
  diverse: "Diverse", blokkade: "Blokkade", uitgevoerd: "Gereed", transport: "Transport",
  bouwkunde: "Bouwk.", levering: "Levering", civiel: "Civiel", asbest: "Asbest", overig: "Overig",
};
export const shortActivityType = (name: string) => ACTIVITY_LABELS[name.trim().toLowerCase()] ?? "Overig";
/** Color code is authoritative, matching the desktop palette, not the activity row name. */
export function activityTypes(colorCodes: string[], activities: string[] = []) {
  return [...new Set((colorCodes.length ? colorCodes.map((code) => COLOR_MAP[code]?.naam ?? "Overig") : activities).map(shortActivityType))];
}
export function activityCellLabel(colorCodes: string[], activities: string[] = []) {
  const labels = activityTypes(colorCodes, activities);
  return `${labels[0] ?? "Overig"}${labels.length > 1 ? ` +${labels.length - 1}` : ""}`;
}
export const parseMobileDay = (value: string | null): number | null => value !== null && /^[0-4]$/.test(value) ? Number(value) : null;

/** Stable free → planned → unavailable ordering, independent of names or week grouping. */
export function sortResourcesForDay<M extends { id: string }>(resources: M[], states: ReadonlyMap<string, Pick<MonteurDayState, "kind" | "dayIndex">[]>, dayIndex: number) {
  const rank = { free: 0, planned: 1, unavailable: 2 };
  const score = (m: M) => rank[states.get(m.id)?.find((s) => s.dayIndex === dayIndex)?.kind ?? "unavailable"];
  return [...resources].sort((a, b) => score(a) - score(b));
}

/** Unique resource-day subtotal, even across multiple concept cases/activities. */
export function conceptManDays(days: MobilePlanningDay[], week: IsoWeek, projects: ReadonlyMap<string, { status: string | null }>, onHold: ReadonlySet<string> = new Set()) {
  const slots = new Set<string>();
  for (const day of activeMobilePlanningDays(days, onHold)) if (day.year === week.jaar && day.week === week.week_nr && projects.get(day.projectId)?.status === "concept") {
    for (const id of day.monteurIds) slots.add(`${id}|${day.dayIndex}`);
  }
  return slots.size;
}

export function hasRegisteredAbsence(week: IsoWeek, absences: AfwezigheidPeriode[], resourceIds: ReadonlySet<string>) {
  const monday = getMondayOfWeek(week.week_nr, week.jaar);
  return Array.from({ length: 5 }, (_, index) => { const date = new Date(monday); date.setDate(date.getDate() + index); return ymd(date); })
    .some((date) => absences.some((a) => resourceIds.has(a.monteur_id) && a.datum_van <= date && a.datum_tot >= date));
}

/** Raw on-hold records are used here only, never merged into active planning. */
export function latentOnHoldOverlap(days: MobilePlanningDay[], projectId: string, onHold: ReadonlySet<string>) {
  if (!onHold.has(projectId)) return { count: 0, rows: [] as { monteurId: string; date: Date; projectIds: string[] }[] };
  const activeSlots = new Map<string, Set<string>>();
  const slotKey = (d: MobilePlanningDay, id: string) => `${ymd(d.date)}|${id}`;
  for (const day of activeMobilePlanningDays(days, onHold)) for (const id of day.monteurIds) {
    const key = slotKey(day, id); const projects = activeSlots.get(key) ?? new Set<string>(); projects.add(day.projectId); activeSlots.set(key, projects);
  }
  const overlaps = new Map<string, { monteurId: string; date: Date; projectIds: string[] }>();
  for (const day of days) if (day.projectId === projectId) for (const id of day.monteurIds) {
    const key = slotKey(day, id); const projects = activeSlots.get(key);
    if (projects?.size) overlaps.set(key, { monteurId: id, date: day.date, projectIds: [...projects].sort() });
  }
  const rows = [...overlaps.values()].sort((a, b) => a.date.getTime() - b.date.getTime() || a.monteurId.localeCompare(b.monteurId));
  return { count: rows.length, rows };
}
