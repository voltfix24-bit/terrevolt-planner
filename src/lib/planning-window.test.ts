import { describe, it, expect } from "vitest";
import {
  getPlanningWindow,
  isWeekInWindow,
  PLANNING_WINDOW_DAYS_BACK,
  PLANNING_WINDOW_DAYS_FORWARD,
} from "./planning-window";

describe("getPlanningWindow", () => {
  it("dekt ~3 maanden terug en ~9 maanden vooruit", () => {
    const today = new Date(2026, 5, 18); // 18-jun-2026
    const w = getPlanningWindow(today);
    const backDays = Math.round(
      (today.getTime() - w.startDate.getTime()) / 86400000,
    );
    const fwdDays = Math.round(
      (w.endDate.getTime() - today.getTime()) / 86400000,
    );
    expect(backDays).toBe(PLANNING_WINDOW_DAYS_BACK);
    expect(fwdDays).toBe(PLANNING_WINDOW_DAYS_FORWARD);
  });

  it("verschuift het hele venster met offsetWeeks", () => {
    const today = new Date(2026, 5, 18);
    const a = getPlanningWindow(today);
    const b = getPlanningWindow(today, 13);
    const deltaDays = Math.round(
      (b.startDate.getTime() - a.startDate.getTime()) / 86400000,
    );
    expect(deltaDays).toBe(13 * 7);
  });

  it("werkt rondom jaargrens", () => {
    const today = new Date(2026, 11, 28); // 28-dec-2026
    const w = getPlanningWindow(today);
    expect(w.endJaar).toBeGreaterThanOrEqual(2027);
    expect(w.startJaar).toBeLessThanOrEqual(2026);
  });

  it("levert ISO-weeknummers tussen 1 en 53", () => {
    const w = getPlanningWindow(new Date(2026, 0, 1));
    expect(w.startWeek).toBeGreaterThanOrEqual(1);
    expect(w.startWeek).toBeLessThanOrEqual(53);
    expect(w.endWeek).toBeGreaterThanOrEqual(1);
    expect(w.endWeek).toBeLessThanOrEqual(53);
  });
});

describe("isWeekInWindow", () => {
  const today = new Date(2026, 5, 18);
  const w = getPlanningWindow(today);

  it("vandaag valt binnen het venster", () => {
    expect(isWeekInWindow(2026, 25, w)).toBe(true);
  });

  it("ver in de toekomst (Lordensweg 2032/W27) valt buiten", () => {
    expect(isWeekInWindow(2032, 27, w)).toBe(false);
  });

  it("ver in het verleden valt buiten", () => {
    expect(isWeekInWindow(2020, 10, w)).toBe(false);
  });

  it("net buiten de bovengrens is false", () => {
    expect(isWeekInWindow(w.endJaar, w.endWeek + 1, w)).toBe(false);
  });

  it("randen zijn inclusief", () => {
    expect(isWeekInWindow(w.startJaar, w.startWeek, w)).toBe(true);
    expect(isWeekInWindow(w.endJaar, w.endWeek, w)).toBe(true);
  });
});
