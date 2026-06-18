import { describe, it, expect } from "vitest";
import { computeWeekPositionFixes, type WeekRow } from "./project-weken";

const mk = (id: string, jaar: number, week_nr: number, positie: number | null): WeekRow => ({
  id,
  jaar,
  week_nr,
  positie,
});

describe("computeWeekPositionFixes", () => {
  it("39 → 40 → 41 blijft chronologisch met posities 0,1,2", () => {
    const { sorted, fixes } = computeWeekPositionFixes([
      mk("c", 2025, 41, 2),
      mk("a", 2025, 39, 0),
      mk("b", 2025, 40, 1),
    ]);
    expect(sorted.map((w) => w.id)).toEqual(["a", "b", "c"]);
    expect(sorted.map((w) => w.positie)).toEqual([0, 1, 2]);
    expect(fixes).toEqual([]);
  });

  it("normaliseert gaten en dubbele posities", () => {
    const { sorted, fixes } = computeWeekPositionFixes([
      mk("a", 2025, 39, 0),
      mk("b", 2025, 40, 7),
      mk("c", 2025, 41, 7),
    ]);
    expect(sorted.map((w) => w.positie)).toEqual([0, 1, 2]);
    expect(fixes).toEqual([
      { id: "b", positie: 1 },
      { id: "c", positie: 2 },
    ]);
  });

  it("sorteert correct over de jaargrens (W52 → W1 volgend jaar)", () => {
    const { sorted } = computeWeekPositionFixes([
      mk("new", 2026, 1, 99),
      mk("old", 2025, 52, 0),
      mk("mid", 2025, 53, 1),
    ]);
    expect(sorted.map((w) => `${w.jaar}-${w.week_nr}`)).toEqual([
      "2025-52",
      "2025-53",
      "2026-1",
    ]);
    expect(sorted.map((w) => w.positie)).toEqual([0, 1, 2]);
  });

  it("normaliseert achteruit ingevoegde week (nieuwe week vóór bestaande)", () => {
    // Simuleer shiftProjectPlanning achteruit: een nieuwe week wordt aangemaakt
    // met positie aan het einde, maar hoort chronologisch vooraan.
    const { sorted, fixes } = computeWeekPositionFixes([
      mk("oud1", 2025, 36, 0),
      mk("oud2", 2025, 37, 1),
      mk("nieuw", 2025, 35, 2), // nieuw aangemaakt met max+1
    ]);
    expect(sorted.map((w) => w.id)).toEqual(["nieuw", "oud1", "oud2"]);
    expect(sorted.map((w) => w.positie)).toEqual([0, 1, 2]);
    expect(fixes).toContainEqual({ id: "nieuw", positie: 0 });
    expect(fixes).toContainEqual({ id: "oud1", positie: 1 });
    expect(fixes).toContainEqual({ id: "oud2", positie: 2 });
  });

  it("idempotent: tweede pass produceert geen extra fixes", () => {
    const input = [
      mk("a", 2025, 39, 0),
      mk("b", 2025, 40, 1),
      mk("c", 2025, 41, 2),
    ];
    const first = computeWeekPositionFixes(input);
    const second = computeWeekPositionFixes(first.sorted);
    expect(second.fixes).toEqual([]);
  });

  it("meerdere schuifacties achter elkaar — volgorde blijft stabiel", () => {
    let current: WeekRow[] = [
      mk("a", 2025, 39, 0),
      mk("b", 2025, 40, 1),
      mk("c", 2025, 41, 2),
    ];
    // Schuif #1: voeg week 38 toe (vooraan)
    current = computeWeekPositionFixes([
      ...current,
      mk("d", 2025, 38, 99),
    ]).sorted;
    // Schuif #2: voeg week 42 toe (achteraan)
    current = computeWeekPositionFixes([
      ...current,
      mk("e", 2025, 42, 99),
    ]).sorted;
    // Schuif #3: voeg week 1 van 2026 toe
    current = computeWeekPositionFixes([
      ...current,
      mk("f", 2026, 1, 99),
    ]).sorted;

    expect(current.map((w) => w.id)).toEqual(["d", "a", "b", "c", "e", "f"]);
    expect(current.map((w) => w.positie)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
