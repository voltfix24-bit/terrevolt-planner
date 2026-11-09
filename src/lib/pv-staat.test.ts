import { describe, it, expect } from "vitest";
import { buildPvWeken, buildPvStaatHtml } from "./pv-staat";

const bron = [
  { monteur_id: "b", naam: "Yazan Jaber", datum: "2026-08-27", uren: 8 },
  { monteur_id: "a", naam: "Samir Lhafi", datum: "2026-08-26", uren: 8 },
  { monteur_id: "a", naam: "Samir Lhafi", datum: "2026-09-01", uren: 0 },
  { monteur_id: "a", naam: "Samir Lhafi", datum: "2026-09-02", uren: 4 },
];

describe("PV-staat", () => {
  it("rekent uren × tarief per week en laat dagen zonder uren weg", () => {
    const w = buildPvWeken(bron, 90);
    expect(w.map((x) => x.weekNr)).toEqual([35, 36]);
    expect(w[0].regels.map((r) => r.naam)).toEqual(["Samir Lhafi", "Yazan Jaber"]);
    expect(w[0].totaal).toBe(1440);
    expect(w[1].totaal).toBe(360);
    expect(w[1].regels).toHaveLength(1);
  });
  it("zet WBS en weeknummer in het document", () => {
    const html = buildPvStaatHtml({ project: { case_nummer: "Fjodor", station_naam: "Fjodor", locatie: "Schagen", opdrachtgever: "Heijmans" }, wbs: "WBS-1", tarief: 90, bron });
    expect(html).toContain("WBS-1");
    expect(html).toContain("Week 35");
    expect(html).toContain("€ 1.440,00");
  });
});
