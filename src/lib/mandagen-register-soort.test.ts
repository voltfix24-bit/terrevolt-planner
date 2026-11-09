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
