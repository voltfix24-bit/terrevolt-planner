import { addIsoWeeks, getMondayOfWeek, isoWeekPartsOf } from "./planning-types";
import {
  checkBeschikbaarheid,
  type AfwezigheidPeriode,
  type FeestdagItem,
} from "./monteur-beschikbaarheid";

export interface MobileWeek { id: string; project_id: string | null; jaar: number; week_nr: number }
export interface MobileActivity { id: string; project_id: string | null; naam: string }
export interface MobileCell { id: string; activiteit_id: string | null; week_id: string | null; dag_index: number; kleur_code: string | null }
export interface MobileCellMonteur { cel_id: string; monteur_id: string }
export interface MobileCapacityMonteur { id: string; werkdagen: number[] | null | undefined }

export interface MobileAvailabilityDay {
  year: number;
  week: number;
  dayIndex: number;
  date: Date;
  holidayName: string | null;
  availableMonteurIds: string[];
  unavailableMonteurIds: string[];
}

export interface MobilePlanningDay {
  projectId: string; activityId: string; activity: string; cellId: string;
  year: number; week: number; dayIndex: number; date: Date; colorCode: string | null; monteurIds: string[];
}

export function aggregateMobilePlanning(
  weeks: MobileWeek[], activities: MobileActivity[], cells: MobileCell[], links: MobileCellMonteur[],
): MobilePlanningDay[] {
  const weekById = new Map(weeks.map((w) => [w.id, w]));
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const monteursByCell = new Map<string, string[]>();
  for (const link of links) monteursByCell.set(link.cel_id, [...(monteursByCell.get(link.cel_id) ?? []), link.monteur_id]);
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

export function uniqueMonteursForProject(days: MobilePlanningDay[], projectId: string): Map<string, number> {
  const result = new Map<string, Set<string>>();
  for (const day of days) if (day.projectId === projectId) for (const id of day.monteurIds) {
    const dates = result.get(id) ?? new Set<string>(); dates.add(day.date.toISOString().slice(0, 10)); result.set(id, dates);
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
    for (const monteur of monteurs) {
      const result = checkBeschikbaarheid({
        monteurId: monteur.id,
        werkdagen: monteur.werkdagen,
        weekNr: week,
        jaar: year,
        dagIndex,
        afwezigheid: absences,
        feestdagenMap: holidayMap,
      });
      (result.beschikbaar ? availableMonteurIds : unavailableMonteurIds).push(monteur.id);
    }
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { year, week, dayIndex, date, holidayName: holidayMap.get(dateKey) ?? null, availableMonteurIds, unavailableMonteurIds };
  });
}

export function capacityForWeek(
  days: MobilePlanningDay[],
  year: number,
  week: number,
  monteurs: MobileCapacityMonteur[],
  absences: AfwezigheidPeriode[],
  holidays: FeestdagItem[],
  onHoldProjectIds = new Set<string>(),
) {
  const planned = new Set<string>();
  for (const day of days) if (day.year === year && day.week === week && !onHoldProjectIds.has(day.projectId)) {
    for (const monteurId of day.monteurIds) planned.add(`${monteurId}|${day.dayIndex}`);
  }
  const availability = availableMonteurSlotsForWeek(year, week, monteurs, absences, holidays);
  const available = availability.reduce((total, day) => total + day.availableMonteurIds.length, 0);
  return {
    planned: planned.size,
    available,
    free: Math.max(0, available - planned.size),
    percentage: available ? Math.round(planned.size / available * 100) : planned.size ? 100 : 0,
    days: availability,
  };
}

export function mobileWeekSequence(from: Date, count: number) {
  const first = isoWeekPartsOf(from);
  return Array.from({ length: count }, (_, index) => index === 0 ? first : addIsoWeeks(first.jaar, first.week_nr, index));
}