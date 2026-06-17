export interface ColorEntry {
  hex: string;
  naam: string;
}

export const COLOR_MAP: Record<string, ColorEntry> = {
  c1: { hex: "#00642f", naam: "Uitgevoerd" },
  c2: { hex: "#fdcb35", naam: "Schakeldagen" },
  c3: { hex: "#1a4a2e", naam: "Diverse" },
  c4: { hex: "#0f766e", naam: "Schakelen" },
  c5: { hex: "#1d4ed8", naam: "Montagedagen" },
  c6: { hex: "#dc2626", naam: "Blokkade" },
  c7: { hex: "#9333ea", naam: "Transport" },
  c8: { hex: "#ea580c", naam: "Bouwkunde" },
  c9: { hex: "#0891b2", naam: "Levering" },
  c10: { hex: "#65a30d", naam: "Civiel" },
  c11: { hex: "#be185d", naam: "Asbest" },
  c12: { hex: "#78716c", naam: "Overig" },
};

export const COLOR_CODES = Object.keys(COLOR_MAP);

export const DAG_LABELS = ["MA", "DI", "WO", "DO", "VR"] as const;

export function getMondayOfWeek(weekNr: number, jaar: number): Date {
  const jan4 = new Date(jaar, 0, 4);
  const dow = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dow + 1 + (weekNr - 1) * 7);
  return monday;
}

export function formatDate(d: Date): string {
  return d.getDate() + "/" + (d.getMonth() + 1);
}

export function wrapWeek(n: number): number {
  return ((n - 1 + 53) % 53) + 1;
}

/** ISO-week-onderdelen (jaar + weeknummer) van een datum. */
export function isoWeekPartsOf(d: Date): { jaar: number; week_nr: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { jaar: date.getUTCFullYear(), week_nr: week };
}

/** Verschuif een ISO-week met N weken, met correcte jaargrens. */
export function addIsoWeeks(
  jaar: number,
  weekNr: number,
  delta: number,
): { jaar: number; week_nr: number } {
  const m = getMondayOfWeek(weekNr, jaar);
  m.setDate(m.getDate() + delta * 7);
  return isoWeekPartsOf(m);
}

/** Verschil in ISO-weken tussen twee (jaar, week_nr) tupels. */
export function weekDeltaIso(
  fromJaar: number,
  fromWeek: number,
  toJaar: number,
  toWeek: number,
): number {
  const a = getMondayOfWeek(fromWeek, fromJaar);
  const b = getMondayOfWeek(toWeek, toJaar);
  return Math.round((b.getTime() - a.getTime()) / (7 * 86400000));
}

export function initialen(naam: string): string {
  const parts = naam.trim().split(/\s+/);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
