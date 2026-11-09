import { describe, it, expect } from "vitest";
import { filterRegisterRows, registerSoortVoorDag } from "./mandagen-register-soort";

describe("aarding apart register", () => {
  it("dag met alleen Aarding slaan gaat naar aardingsregister", () => {
    expect(registerSoortVoorDag("Aarding slaan")).toBe("aarding");
  });
  it("aarding staat niet in het projectregister", () => {
    const rows = [{ activiteiten: "Aarding slaan" }, { activiteiten: "Montage LS (warm)" }];
    expect(filterRegisterRows(rows, "project")).toEqual([{ activiteiten: "Montage LS (warm)" }]);
    expect(filterRegisterRows(rows, "aarding")).toEqual([{ activiteiten: "Aarding slaan" }]);
  });
  it("gemengde dag blijft in projectregister (niet dubbel)", () => {
    expect(registerSoortVoorDag("Aarding slaan, Demontage")).toBe("project");
  });
});

import { opdrachtgeverBlockLines } from "./mandagenregister-pdf";
describe("opdrachtgeverBlockLines", () => {
  it("toont volledige naam en alleen ingevulde regels", () => {
    const r = opdrachtgeverBlockLines("van Gelder", { bedrijfsnaam: "Van Gelder B.V.", adres: "Sluiswachter 18", postcode_plaats: "3861 SN NIJKERK GLD", telefoon: null, email: " ", website: "www.vangelder.com" });
    expect(r).toEqual({ titel: "Van Gelder B.V.", regels: ["Sluiswachter 18", "3861 SN NIJKERK GLD", "www.vangelder.com"] });
  });
  it("valt terug op korte naam zonder gegevens", () => {
    expect(opdrachtgeverBlockLines("Enexis", null)).toEqual({ titel: "Enexis", regels: [] });
  });
});

import { weekNumbersLabel } from "./mandagenregister-pdf";
describe("weekNumbersLabel", () => {
  it("toont weeknummers gesorteerd", () => {
    expect(weekNumbersLabel(["2026-W45", "2026-W44"])).toBe("Weken 44, 45");
    expect(weekNumbersLabel(["2026-W07"])).toBe("Week 7");
  });
});
