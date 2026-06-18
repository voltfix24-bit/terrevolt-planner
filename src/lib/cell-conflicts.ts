// Pure helpers voor conflict-detectie bij schuiven/doortrekken van planning_cellen.
// Geëxtraheerd uit src/pages/Plannen.tsx zodat de regels rond "wat telt als
// gevulde cel" en de bevestigings-tekst centraal en testbaar zijn.

export interface CellContentLike {
  kleur_code?: string | null;
  notitie?: string | null;
}

/**
 * Een cel telt als "gevuld" (en dus als conflict bij overschrijven) zodra
 * minstens één van kleur, notitie of monteurs aanwezig is. Lege strings en
 * lege monteurlijsten gelden als leeg.
 */
export function hasCellContent(
  cel: CellContentLike,
  monteurIds: readonly string[] | undefined | null,
): boolean {
  const kleur = (cel.kleur_code ?? "").trim();
  const notitie = (cel.notitie ?? "").trim();
  const monteurs = monteurIds ?? [];
  return kleur.length > 0 || notitie.length > 0 || monteurs.length > 0;
}

/**
 * Standaard bevestigings-tekst voor overschrijven van N gevulde doel-dagen.
 */
export function formatOverwritePrompt(conflictCount: number): string {
  if (conflictCount <= 0) return "";
  const noun = conflictCount === 1 ? "dag is" : "dagen zijn";
  return `${conflictCount} doel-${noun} al gevuld. Wil je de bestaande inhoud overschrijven?`;
}

export interface WeekRef {
  id: string;
}

export interface FillTarget {
  week_id: string;
  dag_index: number;
}

/**
 * Pure helper: bepaal alle doel-(week_id, dag_index) tussen bron-slot en doel-slot
 * (exclusief bron). Een week telt als 5 slots; richting wordt automatisch bepaald.
 * Slots buiten het zichtbare bereik worden overgeslagen. Retourneert lege array als
 * bron === doel of als de start-/eindweek niet bestaat.
 */
export function prepareFillTargets(
  srcWeekIndex: number,
  srcDagIndex: number,
  tgtWeekIndex: number,
  tgtDagIndex: number,
  weken: readonly WeekRef[],
): FillTarget[] {
  const srcSlot = srcWeekIndex * 5 + srcDagIndex;
  const tgtSlot = tgtWeekIndex * 5 + tgtDagIndex;
  if (srcSlot === tgtSlot) return [];
  if (srcWeekIndex < 0 || tgtWeekIndex < 0) return [];
  const step = tgtSlot > srcSlot ? 1 : -1;
  const out: FillTarget[] = [];
  for (let s = srcSlot + step; step > 0 ? s <= tgtSlot : s >= tgtSlot; s += step) {
    const wi = Math.floor(s / 5);
    const di = s % 5;
    const w = weken[wi];
    if (!w) continue;
    out.push({ week_id: w.id, dag_index: di });
  }
  return out;
}

