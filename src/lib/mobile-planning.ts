import { addIsoWeeks, getMondayOfWeek, isoWeekPartsOf } from "./planning-types";
import {
  checkBeschikbaarheid,
  shortReason,
  ymd,
  type AfwezigheidPeriode,
  type FeestdagItem,
} from "./monteur-beschikbaarheid";

export interface MobileWeek { id: string; project_id: string | null; jaar: number; week_nr: number }
export interface MobileActivity { id: string; project_id: string | null; naam: string }
export interface MobileCell { id: string; activiteit_id: string | null; week_id: string | null; dag_index: number; kleur_code: string | null }
export interface MobileCellMonteur { cel_id: string; monteur_id: string }
export interface MobileCapacityMonteur { id: string; werkdagen: number[] | null | undefined }
export interface IsoWeek { jaar: number; week_nr: number }

export interface MobileAvailabilityDay {
  year: number;
  week: number;
  dayIndex: number;
  date: Date;
  holidayName: string | null;
  availableMonteurIds: string[];
  unavailableMonteurIds: string[];
  /** Korte redenen per onbeschikbare monteur (bijv. "Vrije dag", "Verlof"). */
  reasonsByMonteur: Map<string, string[]>;
}

export interface MobilePlanningDay {
  projectId: string; activityId: string; activity: string; cellId: string;
  year: number; week: number; dayIndex: number; date: Date; colorCode: string | null; monteurIds: string[];
}

export const dayKeyOf = (year: number, week: number, dayIndex: number) => `${year}-${week}-${dayIndex}`;
export const weekKeyOf = (year: number, week: number) => `${year}-${week}`;

export function aggregateMobilePlanning(
  weeks: MobileWeek[], activities: MobileActivity[], cells: MobileCell[], links: MobileCellMonteur[],
): MobilePlanningDay[] {
  const weekById = new Map(weeks.map((w) => [w.id, w]));
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const monteursByCell = new Map<string, string[]>();
  for (const link of links) {
    const list = monteursByCell.get(link.cel_id);
    if (list) list.push(link.monteur_id); else monteursByCell.set(link.cel_id, [link.monteur_id]);
  }
  return cells.flatMap((cell) => {
    const week = cell.week_id ? weekById.get(cell.week_id) : undefined;
    const activity = cell.activiteit_id ? activityById.get(cell.activiteit_id) : undefined;
    if (!week?.project_id || !activity || activity.project_id !== week.project_id || cell.dag_index < 0 || cell.dag_index > 4) return [];
    const date = getMondayOfWeek(week.week_nr, week.jaar); date.setDate(date.getDate() + cell.dag_index);
    return [{ projectId: week.project_id, activityId: activity.id, activity: activity.naam, cellId: cell.id,
      year: week.jaar, week: week.week_nr, dayIndex: cell.dag_index, date, colorCode: cell.kleur_code,
      monteurIds: [...new Set(monteursByCell.get(cell.id) ?? [])] }];
  }).sort((a, b) => a.date.getTime() - b.date.getTime() || a.activity.localeCompare(b.activity, "nl"));
}

/** Index op project-id zodat schermen niet herhaald door alle dagen filteren. */
export function indexDaysByProject(days: MobilePlanningDay[]): Map<string, MobilePlanningDay[]> {
  const result = new Map<string, MobilePlanningDay[]>();
  for (const day of days) {
    const list = result.get(day.projectId);
    if (list) list.push(day); else result.set(day.projectId, [day]);
  }
  return result;
}

/** Index op ISO-week. */
export function indexDaysByWeek(days: MobilePlanningDay[]): Map<string, MobilePlanningDay[]> {
  const result = new Map<string, MobilePlanningDay[]>();
  for (const day of days) {
    const key = weekKeyOf(day.year, day.week);
    const list = result.get(key);
    if (list) list.push(day); else result.set(key, [day]);
  }
  return result;
}

export interface MobileDayBlock {
  key: string; projectId: string; year: number; week: number; dayIndex: number; date: Date;
  activities: string[]; colorCodes: string[]; monteurIds: string[]; cellIds: string[];
}

/** Bundel meerdere activiteiten van één case op dezelfde kalenderdag tot één dagblok. */
export function groupDayBlocks(days: MobilePlanningDay[]): MobileDayBlock[] {
  const blocks = new Map<string, MobileDayBlock>();
  for (const day of days) {
    const key = `${day.projectId}|${dayKeyOf(day.year, day.week, day.dayIndex)}`;
    let block = blocks.get(key);
    if (!block) {
      block = { key, projectId: day.projectId, year: day.year, week: day.week, dayIndex: day.dayIndex, date: day.date, activities: [], colorCodes: [], monteurIds: [], cellIds: [] };
      blocks.set(key, block);
    }
    if (!block.activities.includes(day.activity)) block.activities.push(day.activity);
    if (day.colorCode && !block.colorCodes.includes(day.colorCode)) block.colorCodes.push(day.colorCode);
    for (const id of day.monteurIds) if (!block.monteurIds.includes(id)) block.monteurIds.push(id);
    block.cellIds.push(day.cellId);
  }
  return [...blocks.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface ProjectPlanningSummary { first: Date | null; last: Date | null; uniqueDays: number; weeks: number }

/** Unieke kalenderwerkdagen en weken van een case (niet het aantal planningcellen). */
export function projectPlanningSummary(days: MobilePlanningDay[]): ProjectPlanningSummary {
  const dayKeys = new Set<string>(); const weekKeys = new Set<string>();
  let first: Date | null = null; let last: Date | null = null;
  for (const day of days) {
    dayKeys.add(dayKeyOf(day.year, day.week, day.dayIndex)); weekKeys.add(weekKeyOf(day.year, day.week));
    if (!first || day.date < first) first = day.date;
    if (!last || day.date > last) last = day.date;
  }
  return { first, last, uniqueDays: dayKeys.size, weeks: weekKeys.size };
}

const weekOrdinal = (w: IsoWeek) => w.jaar * 100 + w.week_nr;

/**
 * Kies de relevante week voor een case: huidige week of eerstvolgende geplande week;
 * anders de meest recente geplande week; zonder planning de huidige week.
 */
export function targetWeekForDays(days: Pick<MobilePlanningDay, "year" | "week">[], today: Date): IsoWeek {
  const current = isoWeekPartsOf(today);
  const now = weekOrdinal(current);
  let next: IsoWeek | null = null; let previous: IsoWeek | null = null;
  for (const day of days) {
    const w = { jaar: day.year, week_nr: day.week }; const ord = weekOrdinal(w);
    if (ord >= now) { if (!next || ord < weekOrdinal(next)) next = w; }
    else if (!previous || ord > weekOrdinal(previous)) previous = w;
  }
  return next ?? previous ?? current;
}

export function uniqueMonteursForProject(days: MobilePlanningDay[], projectId: string): Map<string, number> {
  const result = new Map<string, Set<string>>();
  for (const day of days) if (day.projectId === projectId) for (const id of day.monteurIds) {
    const dates = result.get(id) ?? new Set<string>(); dates.add(dayKeyOf(day.year, day.week, day.dayIndex)); result.set(id, dates);
  }
  return new Map([...result].map(([id, dates]) => [id, dates.size]));
}

export function availableMonteurSlotsForWeek(
  year: number,
  week: number,
  monteurs: MobileCapacityMonteur[],
  absences: AfwezigheidPeriode[],
  holidays: FeestdagItem[],
): MobileAvailabilityDay[] {
  const holidayMap = new Map(holidays.map((holiday) => [holiday.datum, holiday.naam]));
  return Array.from({ length: 5 }, (_, dayIndex) => {
    const date = getMondayOfWeek(week, year);
    date.setDate(date.getDate() + dayIndex);
    const availableMonteurIds: string[] = [];
    const unavailableMonteurIds: string[] = [];
    const reasonsByMonteur = new Map<string, string[]>();
    for (const monteur of monteurs) {
      const result = checkBeschikbaarheid({
        monteurId: monteur.id, werkdagen: monteur.werkdagen, weekNr: week, jaar: year, dagIndex: dayIndex,
        afwezigheid: absences, feestdagenMap: holidayMap,
      });
      if (result.beschikbaar) availableMonteurIds.push(monteur.id);
      else {
        unavailableMonteurIds.push(monteur.id);
        reasonsByMonteur.set(monteur.id, [...new Set(result.redenen.map((r) => r.kind === "feestdag" ? r.naam : shortReason(r)))]);
      }
    }
    return { year, week, dayIndex, date, holidayName: holidayMap.get(ymd(date)) ?? null, availableMonteurIds, unavailableMonteurIds, reasonsByMonteur };
  });
}

export interface MobileConflict { monteurId: string; projectIds: string[] }

export interface MobileDayCapacity extends MobileAvailabilityDay {
  available: number;
  plannedUnique: number;
  plannedAvailable: number;
  overplannedUnavailable: number;
  free: number;
  plannedMonteurIds: string[];
  freeMonteurIds: string[];
  conflicts: MobileConflict[];
}

export interface MobileWeekCapacity {
  available: number;
  plannedUnique: number;
  plannedAvailable: number;
  overplannedUnavailable: number;
  free: number;
  conflicts: number;
  percentage: number;
  /** Alias voor plannedUnique (compatibel met eerdere schermen). */
  planned: number;
  days: MobileDayCapacity[];
}

/**
 * Capaciteit per week volgens dezelfde beschikbaarheidsregels als desktop.
 * - available: echte beschikbare monteur-dagen (werkdagen, afwezigheid, feestdagen)
 * - plannedUnique: unieke geplande monteur-dagen (on-hold telt niet mee)
 * - free: available minus de geplande dagen die ook beschikbaar waren
 * - conflicts: monteur-dagen waarop dezelfde monteur op meer dan één case staat
 */
export function capacityForWeek(
  days: MobilePlanningDay[],
  year: number,
  week: number,
  monteurs: MobileCapacityMonteur[],
  absences: AfwezigheidPeriode[],
  holidays: FeestdagItem[],
  onHoldProjectIds = new Set<string>(),
): MobileWeekCapacity {
  const projectsBySlot = new Map<string, Set<string>>();
  for (const day of days) if (day.year === year && day.week === week && !onHoldProjectIds.has(day.projectId)) {
    for (const monteurId of day.monteurIds) {
      const key = `${monteurId}|${day.dayIndex}`;
      const set = projectsBySlot.get(key) ?? new Set<string>(); set.add(day.projectId); projectsBySlot.set(key, set);
    }
  }
  const availability = availableMonteurSlotsForWeek(year, week, monteurs, absences, holidays);
  const dayCaps: MobileDayCapacity[] = availability.map((day) => {
    const available = new Set(day.availableMonteurIds);
    const plannedMonteurIds: string[] = []; const conflicts: MobileConflict[] = [];
    for (const [key, projects] of projectsBySlot) {
      const [monteurId, dayIndex] = key.split("|");
      if (Number(dayIndex) !== day.dayIndex) continue;
      plannedMonteurIds.push(monteurId);
      if (projects.size > 1) conflicts.push({ monteurId, projectIds: [...projects] });
    }
    const plannedAvailable = plannedMonteurIds.filter((id) => available.has(id)).length;
    const planned = new Set(plannedMonteurIds);
    return {
      ...day,
      available: available.size,
      plannedUnique: plannedMonteurIds.length,
      plannedAvailable,
      overplannedUnavailable: plannedMonteurIds.length - plannedAvailable,
      free: Math.max(0, available.size - plannedAvailable),
      plannedMonteurIds,
      freeMonteurIds: day.availableMonteurIds.filter((id) => !planned.has(id)),
      conflicts,
    };
  });
  const sum = (pick: (d: MobileDayCapacity) => number) => dayCaps.reduce((total, d) => total + pick(d), 0);
  const available = sum((d) => d.available);
  const plannedUnique = sum((d) => d.plannedUnique);
  const plannedAvailable = sum((d) => d.plannedAvailable);
  return {
    available,
    plannedUnique,
    plannedAvailable,
    overplannedUnavailable: plannedUnique - plannedAvailable,
    free: Math.max(0, available - plannedAvailable),
    conflicts: sum((d) => d.conflicts.length),
    percentage: available ? Math.round(plannedUnique / available * 100) : plannedUnique ? 100 : 0,
    planned: plannedUnique,
    days: dayCaps,
  };
}

export interface MonteurDayEntry { projectId: string; activities: string[]; onHold: boolean }
export interface MonteurDayState {
  dayIndex: number;
  date: Date;
  kind: "planned" | "free" | "unavailable";
  entries: MonteurDayEntry[];
  /** Redenen van onbeschikbaarheid (vrije dag, verlof, feestdagnaam). */
  reasons: string[];
  /** Op meer dan één actieve (niet on-hold) case gepland. */
  conflict: boolean;
  /** Gepland terwijl niet beschikbaar. */
  plannedWhileUnavailable: boolean;
}

/** Dagstatus per monteur voor de "Per monteur"-weergave. */
export function monteurWeekStates(
  days: MobilePlanningDay[],
  year: number,
  week: number,
  monteurs: MobileCapacityMonteur[],
  absences: AfwezigheidPeriode[],
  holidays: FeestdagItem[],
  onHoldProjectIds = new Set<string>(),
): Map<string, MonteurDayState[]> {
  const availability = availableMonteurSlotsForWeek(year, week, monteurs, absences, holidays);
  const entriesBySlot = new Map<string, Map<string, MonteurDayEntry>>();
  for (const day of days) if (day.year === year && day.week === week) for (const monteurId of day.monteurIds) {
    const key = `${monteurId}|${day.dayIndex}`;
    const byProject = entriesBySlot.get(key) ?? new Map<string, MonteurDayEntry>();
    const entry = byProject.get(day.projectId) ?? { projectId: day.projectId, activities: [], onHold: onHoldProjectIds.has(day.projectId) };
    if (!entry.activities.includes(day.activity)) entry.activities.push(day.activity);
    byProject.set(day.projectId, entry); entriesBySlot.set(key, byProject);
  }
  const result = new Map<string, MonteurDayState[]>();
  for (const monteur of monteurs) {
    result.set(monteur.id, availability.map((day) => {
      const entries = [...(entriesBySlot.get(`${monteur.id}|${day.dayIndex}`)?.values() ?? [])];
      const reasons = day.reasonsByMonteur.get(monteur.id) ?? [];
      const unavailable = reasons.length > 0;
      const activeEntries = entries.filter((e) => !e.onHold);
      return {
        dayIndex: day.dayIndex, date: day.date,
        kind: entries.length ? "planned" : unavailable ? "unavailable" : "free",
        entries, reasons,
        conflict: activeEntries.length > 1,
        plannedWhileUnavailable: unavailable && activeEntries.length > 0,
      };
    }));
  }
  return result;
}

export function mobileWeekSequence(from: Date, count: number) {
  const first = isoWeekPartsOf(from);
  return Array.from({ length: count }, (_, index) => index === 0 ? first : addIsoWeeks(first.jaar, first.week_nr, index));
}

/**
 * Bepaal swipe-richting: 1 = volgende (naar links vegen), -1 = vorige, 0 = geen swipe.
 * Vereist voldoende horizontale afstand en duidelijk meer horizontaal dan verticaal.
 */
export function swipeDirection(dx: number, dy: number, threshold = 60): -1 | 0 | 1 {
  if (Math.abs(dx) < threshold) return 0;
  if (Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
