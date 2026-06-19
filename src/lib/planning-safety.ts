/**
 * Planning-veiligheid helpers — spiegelt de DB-functie `assess_project_planning`
 * en voegt client-side integriteitschecks toe voor UI-waarschuwingen.
 *
 * Grenzen (hard → status 'blocked' bij overschrijding):
 *  - vroegste project_week vóór jaar 2024
 *  - laatste project_week na jaar 2028
 *  - range (eerste tot laatste week) > 80 weken
 *  - aantal project_weken > 100
 *  - ongeldige ISO-weeknummers
 *  - dubbele jaar/week-combinaties
 *  - dubbele of niet-aaneengesloten posities wanneer positie is meegegeven
 */

export type PlanningWeek = { jaar: number; week_nr: number; positie?: number | null };
export type PlanningRiskStatus = "safe" | "blocked";

export interface PlanningAssessment {
  status: PlanningRiskStatus;
  weekCount: number;
  rangeWeeks: number;
  firstDate: Date | null;
  lastDate: Date | null;
  minYear: number | null;
  maxYear: number | null;
  reasons: string[];
}

export const PLANNING_SAFETY_LIMITS = {
  minYear: 2024,
  maxYear: 2028,
  maxRangeWeeks: 80,
  maxWeekCount: 100,
} as const;

function has53IsoWeeks(isoYear: number): boolean {
  // ISO-year has 53 weeks when Jan 1 is Thursday, or Wednesday in a leap year.
  const jan1 = new Date(Date.UTC(isoYear, 0, 1));
  const dow = jan1.getUTCDay() || 7;
  const leap = new Date(Date.UTC(isoYear, 1, 29)).getUTCMonth() === 1;
  return dow === 4 || (dow === 3 && leap);
}

export function isValidIsoWeek(isoYear: number, isoWeek: number): boolean {
  if (!Number.isInteger(isoYear) || !Number.isInteger(isoWeek)) return false;
  if (isoWeek < 1 || isoWeek > 53) return false;
  if (isoWeek === 53 && !has53IsoWeeks(isoYear)) return false;
  return true;
}

/** Maandag (UTC) van een ISO-week. */
export function isoWeekMonday(isoYear: number, isoWeek: number): Date {
  // Jan 4 ligt altijd in ISO-week 1 van isoYear.
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7; // ma = 0
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Dow);
  const result = new Date(week1Mon);
  result.setUTCDate(week1Mon.getUTCDate() + (isoWeek - 1) * 7);
  return result;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addIntegrityReasons(weken: PlanningWeek[], reasons: string[]) {
  const weekKeys = new Set<string>();
  const duplicateWeekKeys = new Set<string>();
  const invalidWeeks: string[] = [];

  for (const w of weken) {
    const key = `${w.jaar}-W${String(w.week_nr).padStart(2, "0")}`;
    if (!isValidIsoWeek(w.jaar, w.week_nr)) invalidWeeks.push(key);
    if (weekKeys.has(key)) duplicateWeekKeys.add(key);
    weekKeys.add(key);
  }

  if (invalidWeeks.length > 0) {
    reasons.push(`ongeldige ISO-week: ${invalidWeeks.slice(0, 3).join(", ")}`);
  }
  if (duplicateWeekKeys.size > 0) {
    reasons.push(`dubbele projectweek: ${Array.from(duplicateWeekKeys).slice(0, 3).join(", ")}`);
  }

  const positioned = weken.filter((w) => w.positie !== undefined && w.positie !== null);
  if (positioned.length === 0) return;

  const positions = positioned.map((w) => Number(w.positie));
  if (positions.some((p) => !Number.isInteger(p) || p < 0)) {
    reasons.push("ongeldige weekpositie gevonden");
    return;
  }

  const positionSet = new Set<number>();
  const duplicatePositions = new Set<number>();
  for (const p of positions) {
    if (positionSet.has(p)) duplicatePositions.add(p);
    positionSet.add(p);
  }
  if (duplicatePositions.size > 0) {
    reasons.push(`dubbele weekpositie: ${Array.from(duplicatePositions).slice(0, 3).join(", ")}`);
  }

  if (positioned.length === weken.length) {
    const sorted = [...positions].sort((a, b) => a - b);
    const contiguous = sorted.every((p, i) => p === i);
    if (!contiguous) reasons.push("weekposities zijn niet-aaneengesloten vanaf 0");
  }
}

export function assessPlanningRange(weken: PlanningWeek[]): PlanningAssessment {
  if (!weken || weken.length === 0) {
    return {
      status: "safe",
      weekCount: 0,
      rangeWeeks: 0,
      firstDate: null,
      lastDate: null,
      minYear: null,
      maxYear: null,
      reasons: [],
    };
  }

  const validForRange = weken.filter((w) => isValidIsoWeek(w.jaar, w.week_nr));
  const rangeSource = validForRange.length > 0 ? validForRange : weken;
  const dates = rangeSource.map((w) => isoWeekMonday(w.jaar, w.week_nr));
  let first = dates[0];
  let last = dates[0];
  let minYear = weken[0].jaar;
  let maxYear = weken[0].jaar;
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] < first) first = dates[i];
    if (dates[i] > last) last = dates[i];
  }
  for (let i = 1; i < weken.length; i++) {
    if (weken[i].jaar < minYear) minYear = weken[i].jaar;
    if (weken[i].jaar > maxYear) maxYear = weken[i].jaar;
  }
  const rangeWeeks =
    Math.floor((last.getTime() - first.getTime()) / (7 * 86400000)) + 1;

  const reasons: string[] = [];
  addIntegrityReasons(weken, reasons);

  if (minYear < PLANNING_SAFETY_LIMITS.minYear) {
    reasons.push(`vroegste week vóór ${PLANNING_SAFETY_LIMITS.minYear} (${fmt(first)})`);
  }
  if (maxYear > PLANNING_SAFETY_LIMITS.maxYear) {
    reasons.push(`laatste week na ${PLANNING_SAFETY_LIMITS.maxYear} (${fmt(last)})`);
  }
  if (rangeWeeks > PLANNING_SAFETY_LIMITS.maxRangeWeeks) {
    reasons.push(`range ${rangeWeeks} weken > ${PLANNING_SAFETY_LIMITS.maxRangeWeeks}`);
  }
  if (weken.length > PLANNING_SAFETY_LIMITS.maxWeekCount) {
    reasons.push(`aantal weken ${weken.length} > ${PLANNING_SAFETY_LIMITS.maxWeekCount}`);
  }

  return {
    status: reasons.length > 0 ? "blocked" : "safe",
    weekCount: weken.length,
    rangeWeeks,
    firstDate: first,
    lastDate: last,
    minYear,
    maxYear,
    reasons,
  };
}

export function formatPlanningRange(a: PlanningAssessment): string {
  if (!a.firstDate || !a.lastDate) return "geen planning";
  return `${fmt(a.firstDate)} → ${fmt(a.lastDate)} · ${a.weekCount} weken · range ${a.rangeWeeks}`;
}
