import { addIsoWeeks, weekDeltaIso } from "./planning-types";
import { assessPlanningRange, type PlanningAssessment, type PlanningWeek } from "./planning-safety";

export type PlanningMutationKind = "add_week" | "remove_week" | "shift_weeks";

export type PlanningMutationGuardResult = {
  ok: boolean;
  kind: PlanningMutationKind;
  before: PlanningAssessment;
  after: PlanningAssessment;
  reasons: string[];
  nextWeeks: PlanningWeek[];
};

type WeekWithId = PlanningWeek & { id?: string | null };

function sortWeeks<T extends WeekWithId>(weeks: readonly T[]): T[] {
  return [...weeks].sort((a, b) => a.jaar - b.jaar || a.week_nr - b.week_nr);
}

function withNormalizedPositions<T extends WeekWithId>(weeks: readonly T[]): T[] {
  return sortWeeks(weeks).map((w, index) => ({ ...w, positie: index }));
}

function result(
  kind: PlanningMutationKind,
  currentWeeks: readonly WeekWithId[],
  nextWeeks: WeekWithId[],
): PlanningMutationGuardResult {
  const normalized = withNormalizedPositions(nextWeeks);
  const before = assessPlanningRange([...currentWeeks]);
  const after = assessPlanningRange(normalized);
  return {
    ok: after.status === "safe",
    kind,
    before,
    after,
    reasons: after.reasons,
    nextWeeks: normalized,
  };
}

export function guardAddNextWeek(currentWeeks: readonly WeekWithId[], fallbackYear: number): PlanningMutationGuardResult {
  const ordered = sortWeeks(currentWeeks);
  const last = ordered[ordered.length - 1];
  const next = last ? addIsoWeeks(last.jaar, last.week_nr, 1) : { jaar: fallbackYear, week_nr: 1 };
  return result("add_week", currentWeeks, [...ordered, next]);
}

export function guardRemoveWeek(currentWeeks: readonly WeekWithId[], weekId: string): PlanningMutationGuardResult {
  const next = currentWeeks.filter((w) => w.id !== weekId);
  return result("remove_week", currentWeeks, next);
}

export function guardRemoveLastWeek(currentWeeks: readonly WeekWithId[]): PlanningMutationGuardResult {
  const ordered = sortWeeks(currentWeeks);
  const last = ordered[ordered.length - 1];
  if (!last?.id) return result("remove_week", currentWeeks, ordered);
  return guardRemoveWeek(currentWeeks, last.id);
}

export function guardShiftWeeks(
  currentWeeks: readonly WeekWithId[],
  anchorWeekId: string,
  targetYear: number,
  targetWeek: number,
): PlanningMutationGuardResult {
  const anchor = currentWeeks.find((w) => w.id === anchorWeekId);
  if (!anchor) return result("shift_weeks", currentWeeks, [...currentWeeks]);
  const delta = weekDeltaIso(anchor.jaar, anchor.week_nr, targetYear, targetWeek);
  const shifted = currentWeeks.map((w) => {
    const next = addIsoWeeks(w.jaar, w.week_nr, delta);
    return { ...w, jaar: next.jaar, week_nr: next.week_nr };
  });
  return result("shift_weeks", currentWeeks, shifted);
}

export function formatMutationGuardReasons(guard: PlanningMutationGuardResult): string {
  if (guard.ok) return "";
  return guard.reasons.length > 0
    ? guard.reasons.join("; ")
    : "Deze wijziging zou de planning buiten veilige grenzen brengen.";
}
