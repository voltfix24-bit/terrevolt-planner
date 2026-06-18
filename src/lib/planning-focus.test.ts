import { describe, it, expect } from "vitest";
import { findInitialPlanningFocus, computeWindowOffsetForWeek } from "./planning-focus";
import { getPlanningWindow, isWeekInWindow } from "./planning-window";
import { getMondayOfWeek } from "./planning-types";

const today = new Date(2026, 5, 18); // 18 juni 2026 (do)

describe("findInitialPlanningFocus", () => {
  it("project met planning → focust op vroegste planningweek", () => {
    const f = findInitialPlanningFocus(
      { gsu_datum: "2026-07-01" },
      [
        { id: "w1", jaar: 2026, week_nr: 26 },
        { id: "w2", jaar: 2026, week_nr: 30 },
      ],
      [
        { week_id: "w2", dag_index: 1, kleur_code: "c1" },
        { week_id: "w1", dag_index: 4, kleur_code: "c2" },
      ],
      today,
    );
    expect(f.source).toBe("planning");
    expect(f.jaar).toBe(2026);
    expect(f.week_nr).toBe(26);
  });

  it("vroegste cel houdt rekening met dag_index", () => {
    // Beide in week 26: cel op dag 0 < cel op dag 3
    const f = findInitialPlanningFocus(
      null,
      [{ id: "w", jaar: 2026, week_nr: 26 }],
      [
        { week_id: "w", dag_index: 3, kleur_code: "x" },
        { week_id: "w", dag_index: 0, kleur_code: "x" },
      ],
      today,
    );
    expect(f.week_nr).toBe(26);
    expect(f.source).toBe("planning");
  });

  it("project zonder planning maar met GSU → focust op GSU-week", () => {
    const f = findInitialPlanningFocus(
      { gsu_datum: "2026-09-07" }, // ma 7 sep = ISO-week 37
      [],
      [],
      today,
    );
    expect(f.source).toBe("gsu");
    expect(f.jaar).toBe(2026);
    expect(f.week_nr).toBe(37);
  });

  it("project zonder planning en zonder GSU → focust op huidige week", () => {
    const f = findInitialPlanningFocus(null, [], [], today);
    expect(f.source).toBe("today");
    expect(f.jaar).toBe(2026);
    expect(f.week_nr).toBe(25); // 18 juni 2026 = week 25
    expect(f.windowOffsetWeeks).toBe(0);
    expect(f.outsideStandardWindow).toBe(false);
  });

  it("planning buiten standaard window → outsideStandardWindow=true en offset berekend", () => {
    const f = findInitialPlanningFocus(
      null,
      [{ id: "w", jaar: 2032, week_nr: 27 }],
      [{ week_id: "w", dag_index: 0, kleur_code: "c1" }],
      today,
    );
    expect(f.source).toBe("planning");
    expect(f.outsideStandardWindow).toBe(true);
    expect(f.windowOffsetWeeks).not.toBe(0);
    // Met deze offset moet de focus-week binnen het verschoven venster vallen
    const shifted = getPlanningWindow(today, f.windowOffsetWeeks);
    expect(isWeekInWindow(2032, 27, shifted)).toBe(true);
  });

  it("ISO-jaargrens: planning in W1 2027 wordt herkend", () => {
    const f = findInitialPlanningFocus(
      null,
      [
        { id: "a", jaar: 2026, week_nr: 52 },
        { id: "b", jaar: 2027, week_nr: 1 },
      ],
      [
        { week_id: "b", dag_index: 0, kleur_code: "c1" },
        { week_id: "a", dag_index: 0, kleur_code: "c1" },
      ],
      today,
    );
    expect(f.jaar).toBe(2026);
    expect(f.week_nr).toBe(52);
  });

  it("cellen zonder kleur_code (null) tellen niet mee", () => {
    const f = findInitialPlanningFocus(
      { gsu_datum: "2026-08-03" },
      [{ id: "w", jaar: 2026, week_nr: 30 }],
      [{ week_id: "w", dag_index: 0, kleur_code: null }],
      today,
    );
    // Geen geldige cel → valt terug op GSU
    expect(f.source).toBe("gsu");
  });

  it("computeWindowOffsetForWeek: in-window levert 0 op", () => {
    // GSU 1 juli 2026 ligt binnen +9mnd venster
    const t = isoWeekPartsOfHelper(new Date(2026, 6, 1));
    expect(computeWindowOffsetForWeek(t.jaar, t.week_nr, today)).toBe(0);
  });

  it("computeWindowOffsetForWeek: ver-toekomst → niet-nul, plaatst week in-window", () => {
    const offset = computeWindowOffsetForWeek(2032, 27, today);
    expect(offset).toBeGreaterThan(0);
    const win = getPlanningWindow(today, offset);
    expect(isWeekInWindow(2032, 27, win)).toBe(true);
  });
});

// kleine helper voor de test (vermijdt re-export uit module)
function isoWeekPartsOfHelper(d: Date): { jaar: number; week_nr: number } {
  // bereken via getMondayOfWeek + brute forward search
  for (let y = d.getFullYear() - 1; y <= d.getFullYear() + 1; y++) {
    for (let w = 1; w <= 53; w++) {
      const m = getMondayOfWeek(w, y);
      const diff = (d.getTime() - m.getTime()) / 86400000;
      if (diff >= 0 && diff < 7) return { jaar: y, week_nr: w };
    }
  }
  return { jaar: d.getFullYear(), week_nr: 1 };
}
