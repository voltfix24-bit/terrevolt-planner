import { describe, expect, it } from "vitest";
import { offsetToWeekDag, dagOffsetLabel } from "./concept-planning";
import { addIsoWeeks, weekDeltaIso } from "./planning-types";

describe("offsetToWeekDag", () => {
  it("mapt D1..D5 naar week 0, dag 0..4", () => {
    expect(offsetToWeekDag(1)).toEqual({ week_offset: 0, dag_index: 0 });
    expect(offsetToWeekDag(5)).toEqual({ week_offset: 0, dag_index: 4 });
  });
  it("mapt D6 naar week 1, dag 0 (MA volgende week)", () => {
    expect(offsetToWeekDag(6)).toEqual({ week_offset: 1, dag_index: 0 });
  });
  it("mapt D11 naar week 2, dag 0", () => {
    expect(offsetToWeekDag(11)).toEqual({ week_offset: 2, dag_index: 0 });
  });
});

describe("dagOffsetLabel", () => {
  it("toont week 0 zonder W+ prefix", () => {
    expect(dagOffsetLabel(1)).toContain("MA");
    expect(dagOffsetLabel(1)).not.toContain("W+");
  });
  it("toont W+1 voor D6", () => {
    expect(dagOffsetLabel(6)).toContain("W+1");
  });
});

describe("ISO weken voor uitrol", () => {
  it("addIsoWeeks rolt netjes door jaargrens", () => {
    // 2024 heeft 52 ISO-weken: W52/2024 + 2 = W2/2025.
    const r = addIsoWeeks(2024, 52, 2);
    expect(r.jaar).toBe(2025);
    expect(r.week_nr).toBe(2);
  });
  it("weekDeltaIso berekent correcte span over jaren", () => {
    const d = weekDeltaIso(2024, 51, 2025, 2);
    expect(d).toBe(3);
  });
  it("uitrol-bereik vult alle tussenliggende weken (W39→W41 bevat W40)", () => {
    // simuleer cellen op D1 en D11 (week_offset 0 en 2), startweek 39
    const startJaar = 2025;
    const startWeek = 39;
    const offsets = [0, 2];
    const weken = offsets.map((o) => addIsoWeeks(startJaar, startWeek, o));
    const sorted = [...weken].sort((a, b) => a.jaar - b.jaar || a.week_nr - b.week_nr);
    const span = weekDeltaIso(
      sorted[0].jaar,
      sorted[0].week_nr,
      sorted[sorted.length - 1].jaar,
      sorted[sorted.length - 1].week_nr,
    );
    const all = Array.from({ length: span + 1 }, (_, i) =>
      addIsoWeeks(sorted[0].jaar, sorted[0].week_nr, i),
    );
    expect(all.map((w) => w.week_nr)).toEqual([39, 40, 41]);
  });
});
