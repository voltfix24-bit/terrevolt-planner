import { describe, it, expect } from "vitest";
import { hasCellContent, formatOverwritePrompt } from "./cell-conflicts";

describe("hasCellContent", () => {
  it("leeg bij alles leeg/null", () => {
    expect(hasCellContent({}, [])).toBe(false);
    expect(hasCellContent({ kleur_code: null, notitie: null }, null)).toBe(false);
    expect(hasCellContent({ kleur_code: "", notitie: "" }, undefined)).toBe(false);
  });

  it("witruimte telt niet als notitie/kleur", () => {
    expect(hasCellContent({ kleur_code: "  ", notitie: "\n" }, [])).toBe(false);
  });

  it("kleur vult cel", () => {
    expect(hasCellContent({ kleur_code: "rood" }, [])).toBe(true);
  });

  it("notitie vult cel", () => {
    expect(hasCellContent({ notitie: "x" }, [])).toBe(true);
  });

  it("monteur vult cel", () => {
    expect(hasCellContent({}, ["m1"])).toBe(true);
  });
});

describe("formatOverwritePrompt", () => {
  it("singular vs plural", () => {
    expect(formatOverwritePrompt(1)).toContain("doel-dag is");
    expect(formatOverwritePrompt(3)).toContain("doel-dagen zijn");
    expect(formatOverwritePrompt(3)).toMatch(/^3 /);
  });
  it("0 → lege tekst", () => {
    expect(formatOverwritePrompt(0)).toBe("");
  });
});
