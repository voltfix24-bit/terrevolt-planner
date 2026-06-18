/**
 * Rolling planning-window.
 *
 * Standaard tonen we ~3 maanden terug en ~9 maanden vooruit vanaf vandaag,
 * zodat de UI niet vastloopt op projecten met verdwaalde weken jaren in de
 * toekomst/verleden. Data blijft volledig in de database — we filteren alleen
 * de weergave.
 *
 * Navigatie: pas de offset (in weken) aan om verder terug of vooruit te kijken
 * zonder dat de basisbreedte van het venster verandert.
 */

import { isoWeekPartsOf } from "./planning-types";

export const PLANNING_WINDOW_DAYS_BACK = 90;     // ~3 maanden
export const PLANNING_WINDOW_DAYS_FORWARD = 270; // ~9 maanden

/** Stap waarmee Vorige/Volgende periode navigeert (~3 maanden). */
export const PLANNING_WINDOW_STEP_WEEKS = 13;

export interface PlanningWindow {
  startJaar: number;
  startWeek: number;
  endJaar: number;
  endWeek: number;
  startDate: Date;
  endDate: Date;
}

/**
 * Bereken het standaard planning-venster rond een referentiedatum.
 *
 * @param today          referentiedatum (default: nu).
 * @param offsetWeeks    aantal weken dat het hele venster opschuift (default 0).
 */
export function getPlanningWindow(
  today: Date = new Date(),
  offsetWeeks: number = 0,
): PlanningWindow {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  base.setDate(base.getDate() + offsetWeeks * 7);

  const startDate = new Date(base);
  startDate.setDate(startDate.getDate() - PLANNING_WINDOW_DAYS_BACK);
  const endDate = new Date(base);
  endDate.setDate(endDate.getDate() + PLANNING_WINDOW_DAYS_FORWARD);

  const s = isoWeekPartsOf(startDate);
  const e = isoWeekPartsOf(endDate);

  return {
    startJaar: s.jaar,
    startWeek: s.week_nr,
    endJaar: e.jaar,
    endWeek: e.week_nr,
    startDate,
    endDate,
  };
}

/**
 * True als (jaar, week_nr) binnen het venster ligt.
 *
 * We vergelijken op `jaar*100 + week` — werkt correct omdat ISO-weeknummers
 * altijd 1..53 zijn, dus geen overlap tussen jaren.
 */
export function isWeekInWindow(
  jaar: number,
  weekNr: number,
  win: PlanningWindow,
): boolean {
  const key = jaar * 100 + weekNr;
  const lo = win.startJaar * 100 + win.startWeek;
  const hi = win.endJaar * 100 + win.endWeek;
  return key >= lo && key <= hi;
}
