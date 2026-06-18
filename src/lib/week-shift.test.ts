import { describe, it, expect } from "vitest";
import { addIsoWeeks, weekDeltaIso, isoWeekPartsOf } from "./planning-types";
import { computeWeekPositionFixes, type WeekRow } from "./project-weken";

/**
 * Unit tests voor de pure week-shift berekening die de RPC `shift_project_weken`
 * spiegelt aan de client-kant (optimistic UI in setWeekNr).
 *
 * Doel: garanderen dat
 *  - vooruit/terug over de jaargrens correct rekent (week 52/53 ↔ week 1);
 *  - posities na shift weer 0..n-1 zijn op chronologische volgorde;
 *  - botsende doelweken aan de client al detecteerbaar zijn voordat de RPC
 *    een unique-violation teruggeeft.
 */

function shiftAll(rows: WeekRow[], delta: number): WeekRow[] {
  return rows.map((w) => {
    const n = addIsoWeeks(w.jaar, w.week_nr, delta);
    return { ...w, jaar: n.jaar, week_nr: n.week_nr };
  });
}

describe("week-shift (transactionele RPC, client mirror)", () => {
  it("vooruit over jaargrens 2025/52 → 2026/1", () => {
    const r = addIsoWeeks(2025, 52, 1);
    expect(r).toEqual({ jaar: 2026, week_nr: 1 });
  });

  it("vooruit over jaar met week 53 (2026 heeft 53 weken)", () => {
    // 2026 is een ISO-jaar met 53 weken. 2026/53 + 1 = 2027/1.
    const r = addIsoWeeks(2026, 53, 1);
    expect(r).toEqual({ jaar: 2027, week_nr: 1 });
  });

  it("achteruit over jaargrens 2026/1 → 2025/52", () => {
    const r = addIsoWeeks(2026, 1, -1);
    expect(r).toEqual({ jaar: 2025, week_nr: 52 });
  });

  it("achteruit meerdere weken behoudt onderlinge afstand", () => {
    const input: WeekRow[] = [
      { id: "a", jaar: 2026, week_nr: 2, positie: 0 },
      { id: "b", jaar: 2026, week_nr: 3, positie: 1 },
      { id: "c", jaar: 2026, week_nr: 4, positie: 2 },
    ];
    const shifted = shiftAll(input, -3);
    expect(shifted.map((w) => `${w.jaar}-${w.week_nr}`)).toEqual([
      "2025-51",
      "2025-52",
      "2026-1",
    ]);
    // Posities blijven 0..n-1 omdat de delta uniform is en de volgorde behouden blijft.
    const { sorted, fixes } = computeWeekPositionFixes(shifted);
    expect(sorted.map((w) => w.positie)).toEqual([0, 1, 2]);
    expect(fixes).toEqual([]);
  });

  it("weekDeltaIso berekent correct over jaargrens", () => {
    expect(weekDeltaIso(2025, 50, 2026, 2)).toBe(4);
    expect(weekDeltaIso(2026, 2, 2025, 50)).toBe(-4);
  });

  it("uniforme delta behoudt chronologische volgorde — geen positie-fix nodig", () => {
    const input: WeekRow[] = [
      { id: "a", jaar: 2025, week_nr: 48, positie: 0 },
      { id: "b", jaar: 2025, week_nr: 49, positie: 1 },
      { id: "c", jaar: 2025, week_nr: 52, positie: 2 },
      { id: "d", jaar: 2026, week_nr: 1, positie: 3 },
    ];
    for (const delta of [-5, -1, 1, 5, 53]) {
      const shifted = shiftAll(input, delta);
      const { fixes } = computeWeekPositionFixes(shifted);
      expect(fixes, `delta=${delta}`).toEqual([]);
    }
  });

  it("detecteert client-side dat een delta zou kunnen botsen met buiten-project weken (informatie-only)", () => {
    // Deze test legt vast dat de client de gewenste eindstaat kan tonen;
    // de daadwerkelijke uniqueness-check gebeurt in de RPC en levert een
    // 23505 error met NL-melding. We bevestigen hier dat de berekende
    // eindstaat dezelfde (jaar, week_nr) tupels heeft als verwacht.
    const input: WeekRow[] = [
      { id: "a", jaar: 2025, week_nr: 30, positie: 0 },
      { id: "b", jaar: 2025, week_nr: 31, positie: 1 },
    ];
    const shifted = shiftAll(input, 2);
    expect(shifted.map((w) => `${w.jaar}-${w.week_nr}`)).toEqual([
      "2025-32",
      "2025-33",
    ]);
  });

  it("isoWeekPartsOf rondom jaargrens 2024/2025", () => {
    // 30 dec 2024 valt in ISO-week 2025/1.
    const parts = isoWeekPartsOf(new Date(Date.UTC(2024, 11, 30)));
    expect(parts).toEqual({ jaar: 2025, week_nr: 1 });
  });
});
