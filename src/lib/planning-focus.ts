/**
 * Bepaal de initiële focus-week wanneer /plannen voor een project geopend wordt.
 *
 * Prioriteit:
 *   1. Vroegste planning_cel (op basis van project_weken.jaar/week_nr + dag_index).
 *   2. ISO-week van project.gsu_datum.
 *   3. Huidige ISO-week.
 *
 * De helper is puur — geen DOM, geen netwerkcalls. Hij wordt gebruikt door
 * Plannen.tsx om bij het openen van een project de juiste week in zicht te
 * brengen, ook als die buiten het standaard rolling window valt.
 */
import { getMondayOfWeek } from "./planning-types";
import { getPlanningWindow, isWeekInWindow, type PlanningWindow } from "./planning-window";

export interface FocusProject {
  id?: string;
  gsu_datum?: string | null;
}

export interface FocusWeek {
  id: string;
  jaar: number;
  week_nr: number;
}

export interface FocusCel {
  week_id: string | null;
  dag_index: number;
  /** Optioneel: alleen "echte" cellen (kleur_code != null) tellen mee. */
  kleur_code?: string | null;
}

export type FocusSource = "planning" | "gsu" | "today";

export interface InitialPlanningFocus {
  jaar: number;
  week_nr: number;
  source: FocusSource;
  /** True als de focus-week buiten het standaard rolling window valt. */
  outsideStandardWindow: boolean;
  /** Aantal weken offset t.o.v. vandaag, om het standaard venster te verschuiven zodat de focus-week erbinnen valt. */
  windowOffsetWeeks: number;
}

function isoWeekPartsOf(d: Date): { jaar: number; week_nr: number } {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const week =
    1 +
    Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { jaar: target.getUTCFullYear(), week_nr: week };
}

/**
 * Aantal weken dat het rolling window moet opschuiven zodat (jaar, week_nr)
 * binnen het standaard venster valt. 0 wanneer dat al het geval is.
 */
export function computeWindowOffsetForWeek(
  jaar: number,
  weekNr: number,
  today: Date,
): number {
  const defaultWin = getPlanningWindow(today, 0);
  if (isWeekInWindow(jaar, weekNr, defaultWin)) return 0;
  const target = getMondayOfWeek(weekNr, jaar);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const ms = target.getTime() - todayMid.getTime();
  return Math.round(ms / (7 * 24 * 3600 * 1000));
}

export function findInitialPlanningFocus(
  project: FocusProject | null | undefined,
  weken: FocusWeek[],
  cellen: FocusCel[],
  today: Date = new Date(),
): InitialPlanningFocus {
  // 1. Vroegste planning_cel
  const weekById = new Map<string, FocusWeek>();
  for (const w of weken) weekById.set(w.id, w);
  let bestKey = Number.POSITIVE_INFINITY;
  let bestWeek: FocusWeek | null = null;
  for (const c of cellen) {
    if (!c.week_id) continue;
    if (c.kleur_code === null) continue; // expliciet ongevulde cel uitsluiten
    const w = weekById.get(c.week_id);
    if (!w) continue;
    // Sorteersleutel: ISO-maandag-ms + dag_index*86400000
    const monday = getMondayOfWeek(w.week_nr, w.jaar);
    const key = monday.getTime() + c.dag_index * 86_400_000;
    if (key < bestKey) {
      bestKey = key;
      bestWeek = w;
    }
  }
  if (bestWeek) {
    const offset = computeWindowOffsetForWeek(bestWeek.jaar, bestWeek.week_nr, today);
    return {
      jaar: bestWeek.jaar,
      week_nr: bestWeek.week_nr,
      source: "planning",
      outsideStandardWindow: offset !== 0,
      windowOffsetWeeks: offset,
    };
  }

  // 2. GSU-datum → ISO-week
  if (project?.gsu_datum) {
    const d = new Date(project.gsu_datum);
    if (!isNaN(d.getTime())) {
      const { jaar, week_nr } = isoWeekPartsOf(d);
      const offset = computeWindowOffsetForWeek(jaar, week_nr, today);
      return {
        jaar,
        week_nr,
        source: "gsu",
        outsideStandardWindow: offset !== 0,
        windowOffsetWeeks: offset,
      };
    }
  }

  // 3. Vandaag
  const { jaar, week_nr } = isoWeekPartsOf(today);
  return {
    jaar,
    week_nr,
    source: "today",
    outsideStandardWindow: false,
    windowOffsetWeeks: 0,
  };
}

export type { PlanningWindow };
