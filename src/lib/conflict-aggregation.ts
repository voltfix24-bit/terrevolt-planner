// Pure aggregation helpers for monteur dubbel-planning detectie.
// Geëxtraheerd uit src/pages/Overzicht.tsx zodat de logica testbaar is.

export function dayKey(week_nr: number, dag_index: number): string {
  return `${week_nr}-${dag_index}`;
}

export interface CelInput {
  id: string;
  activiteit_id: string;
  week_nr: number;
  dag_index: number;
  project_id: string;
  monteur_ids: string[];
}

/**
 * monteurId → dayKey → Set<project_id>
 * Geeft per monteur per dag de set van projecten waarop hij is ingepland.
 */
export function buildMonteurDayProjects(
  cellen: CelInput[],
): Map<string, Map<string, Set<string>>> {
  const m = new Map<string, Map<string, Set<string>>>();
  for (const c of cellen) {
    if (!c.monteur_ids.length) continue;
    const k = dayKey(c.week_nr, c.dag_index);
    for (const mid of c.monteur_ids) {
      let byDay = m.get(mid);
      if (!byDay) {
        byDay = new Map();
        m.set(mid, byDay);
      }
      let projs = byDay.get(k);
      if (!projs) {
        projs = new Set();
        byDay.set(k, projs);
      }
      projs.add(c.project_id);
    }
  }
  return m;
}

/**
 * dayKey → Set<monteurId> die op díe specifieke dag dubbel ingepland staan
 * (≥ 2 verschillende projecten op dezelfde dag).
 */
export function buildDayConflictMonteurs(
  monteurDayProjects: Map<string, Map<string, Set<string>>>,
): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const [mid, byDay] of monteurDayProjects.entries()) {
    for (const [k, projs] of byDay.entries()) {
      if (projs.size > 1) {
        let set = m.get(k);
        if (!set) {
          set = new Set();
          m.set(k, set);
        }
        set.add(mid);
      }
    }
  }
  return m;
}

/**
 * monteurId → Set<slotIndex> waarin de monteur op minstens één dag binnen
 * dat slot écht dubbel staat. Slots die meerdere projecten bevatten over
 * verschillende dagen (typisch in kwartaal/jaar weergave) worden NIET
 * gemarkeerd.
 */
export function buildMonteurSlotDubbel(
  dayConflictMonteurs: Map<string, Set<string>>,
  dayKeyToSlot: Map<string, number>,
): Map<string, Set<number>> {
  const m = new Map<string, Set<number>>();
  for (const [k, mids] of dayConflictMonteurs.entries()) {
    const si = dayKeyToSlot.get(k);
    if (si === undefined) continue;
    for (const mid of mids) {
      let s = m.get(mid);
      if (!s) {
        s = new Set();
        m.set(mid, s);
      }
      s.add(si);
    }
  }
  return m;
}

/**
 * monteurId → slotIndex → Set<project_id>
 * Geeft per monteur per slot welke projecten in dat slot vallen.
 * Wordt gebruikt om in kwartaal/jaar de verdeling te kunnen tonen zonder
 * dat dit als "dubbel" telt.
 */
export function buildMonteurSlotProjects(
  monteurDayProjects: Map<string, Map<string, Set<string>>>,
  dayKeyToSlot: Map<string, number>,
): Map<string, Map<number, Set<string>>> {
  const m = new Map<string, Map<number, Set<string>>>();
  for (const [mid, byDay] of monteurDayProjects.entries()) {
    for (const [k, projs] of byDay.entries()) {
      const si = dayKeyToSlot.get(k);
      if (si === undefined) continue;
      let bySlot = m.get(mid);
      if (!bySlot) {
        bySlot = new Map();
        m.set(mid, bySlot);
      }
      let set = bySlot.get(si);
      if (!set) {
        set = new Set();
        bySlot.set(si, set);
      }
      for (const p of projs) set.add(p);
    }
  }
  return m;
}
