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

import { buildPvWeken as bpw } from "./pv-staat";
describe("tarief per monteur", () => {
  it("gebruikt eigen tarief en valt terug op standaard", () => {
    const w = bpw([
      { monteur_id: "a", naam: "A", datum: "2026-11-02", uren: 8 },
      { monteur_id: "b", naam: "B", datum: "2026-11-02", uren: 8 },
    ], 90, { a: 75 });
    expect(w[0].regels.map((r) => r.totaal)).toEqual([600, 720]);
  });
});

import { buildPvBron } from "./pv-staat";
describe("klussen per dag", () => {
  const g = [{ monteur_id: "h", naam: "Hassan", datum: "2026-11-03", uren: 8 }, { monteur_id: "h", naam: "Hassan", datum: "2026-11-04", uren: 8 }];
  it("vervangt een dag door zijn klussen en telt overwerk mee", () => {
    const b = buildPvBron(g, [{ monteur_id: "h", datum: "2026-11-03", omschrijving: "Gj Scheurleerweg Amsterdam", case_nummer: "0337541", uitvoerder: "Anatole", uren: 8, overuren: 2, niet_doorgegaan: false, positie: 0 }]);
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({ uren: 10, locatie: "Gj Scheurleerweg Amsterdam - Case 0337541 - uitvoerder Anatole", opmerking: "incl. 2 uur overwerk" });
    expect(b[1].locatie).toBeUndefined();
  });
  it("markeert niet doorgegaan", () => {
    const b = buildPvBron(g.slice(0, 1), [{ monteur_id: "h", datum: "2026-11-03", omschrijving: "Zuidplein", case_nummer: null, uitvoerder: null, uren: 8, overuren: 0, niet_doorgegaan: true, positie: 0 }]);
    expect(b[0].opmerking).toBe("niet doorgegaan");
  });
});
