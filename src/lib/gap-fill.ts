/**
 * Pure helper: bepaal of een gap-fill veilig automatisch mag draaien.
 *
 * Achtergrond: `loadAll()` in /plannen vult automatisch tussenliggende weken
 * tussen de eerste en laatste week van een project. Bij een corrupte staat
 * (bv. een verdwaalde week jaren in de toekomst) zou dat duizenden lege
 * weken aanmaken. Deze cap voorkomt dat.
 */

export const GAP_FILL_MAX_WEEKS = 104; // ~2 jaar

export interface GapFillDecision {
  /** True = gap-fill mag doorgaan. */
  allow: boolean;
  /** Aantal ontbrekende weken dat de fill zou aanmaken. */
  missing: number;
  /** Totale span tussen eerste en laatste week in weken. */
  span: number;
  /** NL-vriendelijke reden bij allow=false. */
  reason?: string;
}

/**
 * Pure beslissing: alleen automatisch gap-fillen als de span beheersbaar is.
 *
 * @param missingCount aantal ontbrekende weken (na dedupe vs. bestaande).
 * @param spanInWeeks  totale span eerste→laatste week in weken.
 * @param max          drempel; standaard {@link GAP_FILL_MAX_WEEKS}.
 */
export function decideGapFill(
  missingCount: number,
  spanInWeeks: number,
  max: number = GAP_FILL_MAX_WEEKS,
): GapFillDecision {
  if (missingCount <= 0) {
    return { allow: false, missing: 0, span: spanInWeeks };
  }
  if (spanInWeeks > max) {
    return {
      allow: false,
      missing: missingCount,
      span: spanInWeeks,
      reason: `Week-bereik is ${spanInWeeks} weken (max ${max}). Automatisch aanvullen overgeslagen om te voorkomen dat per ongeluk honderden lege weken worden aangemaakt.`,
    };
  }
  return { allow: true, missing: missingCount, span: spanInWeeks };
}
