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

import { prepareFillTargets } from "./cell-conflicts";

describe("prepareFillTargets", () => {
  const weken = [{ id: "w0" }, { id: "w1" }, { id: "w2" }];

  it("leeg bij bron === doel", () => {
    expect(prepareFillTargets(0, 0, 0, 0, weken)).toEqual([]);
  });

  it("vooruit binnen één week", () => {
    expect(prepareFillTargets(0, 0, 0, 2, weken)).toEqual([
      { week_id: "w0", dag_index: 1 },
      { week_id: "w0", dag_index: 2 },
    ]);
  });

  it("vooruit over weekgrens", () => {
    expect(prepareFillTargets(0, 3, 1, 1, weken)).toEqual([
      { week_id: "w0", dag_index: 4 },
      { week_id: "w1", dag_index: 0 },
      { week_id: "w1", dag_index: 1 },
    ]);
  });

  it("achteruit", () => {
    expect(prepareFillTargets(1, 2, 0, 4, weken)).toEqual([
      { week_id: "w1", dag_index: 1 },
      { week_id: "w1", dag_index: 0 },
      { week_id: "w0", dag_index: 4 },
    ]);
  });

  it("slots buiten zichtbaar bereik worden overgeslagen", () => {
    // weken bevat maar 3 weken (0..14), vraag tot slot 20
    const res = prepareFillTargets(2, 4, 4, 0, weken);
    expect(res).toEqual([]);
  });

  it("geen output bij negatieve week-index", () => {
    expect(prepareFillTargets(-1, 0, 0, 1, weken)).toEqual([]);
  });
});
