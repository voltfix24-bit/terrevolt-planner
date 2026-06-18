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
