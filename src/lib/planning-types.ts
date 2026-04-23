export interface ColorEntry {
  hex: string;
  naam: string;
}

export const COLOR_MAP: Record<string, ColorEntry> = {
  c1: { hex: "#00642f", naam: "Uitgevoerd" },
  c2: { hex: "#fdcb35", naam: "In uitvoering" },
  c3: { hex: "#1a4a2e", naam: "Ingepland" },
  c4: { hex: "#0f766e", naam: "Schakelen" },
  c5: { hex: "#1d4ed8", naam: "Montage" },
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

export function initialen(naam: string): string {
  const parts = naam.trim().split(/\s+/);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
