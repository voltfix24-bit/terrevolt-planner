/**
 * Helpers om project_weken consistent te houden.
 *
 * Bewaakt de twee invarianten van een project zijn weken:
 *  1. De rijen zijn chronologisch geordend op (jaar, week_nr).
 *  2. `positie` is een contiguë reeks 0..n-1 in diezelfde chronologische volgorde.
 *
 * Iedere actie die weken toevoegt, verwijdert of verschuift moet eindigen met
 * een aanroep naar {@link normalizeProjectWeeks}, zodat de UI nooit op een
 * verkeerde positie/volgorde rekent.
 */

import { supabase } from "@/integrations/supabase/client";

export interface WeekRow {
  id: string;
  jaar: number;
  week_nr: number;
  positie: number | null;
}

/**
 * Pure helper: sorteer chronologisch en bereken de positie-correcties die nodig
 * zijn om elke rij op zijn chronologische index te zetten.
 *
 * Geeft een nieuwe array terug met genormaliseerde posities, plus de lijst
 * fixes die nog naar de database moeten.
 */
export function computeWeekPositionFixes<T extends WeekRow>(
  weken: T[],
): { sorted: T[]; fixes: { id: string; positie: number }[] } {
  const sorted = [...weken].sort(
    (a, b) => a.jaar - b.jaar || a.week_nr - b.week_nr,
  );
  const fixes: { id: string; positie: number }[] = [];
  const normalised = sorted.map((w, i) => {
    if (w.positie !== i) fixes.push({ id: w.id, positie: i });
    return { ...w, positie: i };
  });
  return { sorted: normalised, fixes };
}

/**
 * Herstelt de invarianten voor één project: leest alle weken, sorteert ze
 * chronologisch en zet `positie` opnieuw naar 0..n-1 voor zover nodig.
 *
 * Idempotent: een tweede aanroep doet niets als alles al klopt.
 */
export async function normalizeProjectWeeks(projectId: string): Promise<void> {
  const { data, error } = await supabase
    .from("project_weken")
    .select("id, jaar, week_nr, positie")
    .eq("project_id", projectId);
  if (error || !data) return;

  const { fixes } = computeWeekPositionFixes(data as WeekRow[]);
  if (fixes.length === 0) return;

  await Promise.all(
    fixes.map((f) =>
      supabase.from("project_weken").update({ positie: f.positie }).eq("id", f.id),
    ),
  );
}
