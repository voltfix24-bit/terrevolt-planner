import { describe, it, expect } from "vitest";
import { buildMandagenregisterHtml } from "./mandagenregister-pdf";

const base = {
  dienstverband: "loondienst" as const,
  project: { case_nummer: "0307973", station_naam: "Snijdersplaats", locatie: "Steenderen", opdrachtgever: "van Gelder" },
  periodeVan: "2026-05-25",
  periodeTot: "2026-05-29",
  rows: [{ monteur_id: "m1", naam: "Jan", week: "2026-W22", days: [8, 8, 0, 0, 0, 0, 0], total: 16, opmerking: "" }],
};

describe("mandagenregister document", () => {
  it("contains no prices and shows week dates and totals", () => {
    const html = buildMandagenregisterHtml(base);
    expect(html).not.toContain("€");
    expect(html).toContain("Week 22, 2026");
    expect(html).toContain("25-05");
    expect(html).toContain("16.0");
    expect(html).toContain("25-05-2026");
  });
});
