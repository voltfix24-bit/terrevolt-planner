import { describe, expect, it } from "vitest";
import {
  capacityForWeek, groupDayBlocks, monteurWeekStates, projectPlanningSummary, swipeDirection, targetWeekForDays,
  type MobilePlanningDay,
} from "./mobile-planning";
import { getMondayOfWeek } from "./planning-types";

const mk = (projectId: string, dayIndex: number, monteurIds: string[], activity = "Montage", week = 41, year = 2026): MobilePlanningDay => {
  const date = getMondayOfWeek(week, year); date.setDate(date.getDate() + dayIndex);
  return { projectId, activityId: activity, activity, cellId: `${projectId}-${activity}-${week}-${dayIndex}`, year, week, dayIndex, date, colorCode: "c5", monteurIds };
};
const m = (id: string, werkdagen: number[] | null = null) => ({ id, werkdagen });

describe("case detail helpers", () => {
  it("counts unique calendar days, not planning cells", () => {
    const days = [mk("p", 0, ["a"], "Montage"), mk("p", 0, ["b"], "Schakelen"), mk("p", 1, ["a"]), mk("p", 0, [], "Montage", 42)];
    expect(projectPlanningSummary(days)).toMatchObject({ uniqueDays: 3, weeks: 2 });
  });
  it("groups multiple activities on the same day with unique monteurs", () => {
    const blocks = groupDayBlocks([mk("p", 2, ["a", "b"], "Montage"), mk("p", 2, ["b", "c"], "Schakelen")]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].activities).toEqual(["Montage", "Schakelen"]);
    expect(blocks[0].monteurIds).toEqual(["a", "b", "c"]);
  });
});

describe("project query target week", () => {
  const today = new Date(2026, 9, 6); // week 41
  it("prefers current or next planned week", () => {
    expect(targetWeekForDays([mk("p", 0, [], "x", 38), mk("p", 0, [], "x", 44), mk("p", 0, [], "x", 43)], today)).toEqual({ jaar: 2026, week_nr: 43 });
    expect(targetWeekForDays([mk("p", 0, [], "x", 41)], today)).toEqual({ jaar: 2026, week_nr: 41 });
  });
  it("falls back to most recent past week, then current week", () => {
    expect(targetWeekForDays([mk("p", 0, [], "x", 30), mk("p", 0, [], "x", 38)], today)).toEqual({ jaar: 2026, week_nr: 38 });
    expect(targetWeekForDays([], today)).toEqual({ jaar: 2026, week_nr: 41 });
  });
  it("handles the year boundary", () => {
    expect(targetWeekForDays([mk("p", 0, [], "x", 1, 2027)], new Date(2026, 11, 30))).toEqual({ jaar: 2027, week_nr: 1 });
  });
});

describe("capacity correctness", () => {
  it("free only subtracts planned slots that were actually available", () => {
    const absence = [{ monteur_id: "a", datum_van: "2026-10-05", datum_tot: "2026-10-05", type: "Verlof" }];
    const cap = capacityForWeek([mk("p", 0, ["a"]), mk("p", 0, ["b"])], 2026, 41, [m("a"), m("b")], absence, []);
    expect(cap).toMatchObject({ available: 9, plannedUnique: 2, plannedAvailable: 1, overplannedUnavailable: 1, free: 8 });
    expect(cap.days[0]).toMatchObject({ available: 1, plannedUnique: 2, free: 0, overplannedUnavailable: 1 });
  });
  it("detects the same monteur on two cases on one day as a conflict", () => {
    const cap = capacityForWeek([mk("p1", 3, ["a"]), mk("p2", 3, ["a"]), mk("p1", 3, ["b"], "Schakelen")], 2026, 41, [m("a"), m("b")], [], []);
    expect(cap.conflicts).toBe(1);
    expect(cap.days[3].conflicts).toEqual([{ monteurId: "a", projectIds: ["p1", "p2"] }]);
    expect(cap.plannedUnique).toBe(2);
  });
  it("ignores on-hold projects for planning and conflicts", () => {
    const cap = capacityForWeek([mk("p1", 3, ["a"]), mk("hold", 3, ["a"])], 2026, 41, [m("a")], [], [], new Set(["hold"]));
    expect(cap).toMatchObject({ plannedUnique: 1, conflicts: 0, free: 4 });
    expect(cap.days[3].freeMonteurIds).toEqual([]);
  });
  it("lists only available unplanned monteurs as free", () => {
    const cap = capacityForWeek([mk("p", 0, ["a"])], 2026, 41, [m("a"), m("b"), m("c", [2, 3, 4, 5])], [], []);
    expect(cap.days[0].freeMonteurIds).toEqual(["b"]);
  });
});

describe("per-monteur daily state", () => {
  it("marks planned, free, fixed day off, holiday, absence, on-hold exclusion and conflict", () => {
    const states = monteurWeekStates(
      [mk("p1", 0, ["a"]), mk("p2", 0, ["a"]), mk("hold", 1, ["a"])],
      2026, 41, [m("a", [1, 2, 3, 4]), m("b")],
      [{ monteur_id: "b", datum_van: "2026-10-07", datum_tot: "2026-10-07", type: "Verlof" }],
      [{ datum: "2026-10-08", naam: "Testdag" }],
      new Set(["hold"]),
    );
    const a = states.get("a") ?? []; const b = states.get("b") ?? [];
    expect(a[0]).toMatchObject({ kind: "planned", conflict: true });
    expect(a[1]).toMatchObject({ kind: "free", conflict: false, entries: [] });
    expect(a[3]).toMatchObject({ kind: "unavailable", reasons: ["Feestdag: Testdag"] });
    expect(a[4]).toMatchObject({ kind: "unavailable", reasons: ["Vrije dag"] });
    expect(b[0].kind).toBe("free");
    expect(b[2]).toMatchObject({ kind: "unavailable", reasons: ["Verlof"] });
  });
});

describe("swipe helper", () => {
  it("requires horizontal threshold and dominance", () => {
    expect(swipeDirection(-80, 10)).toBe(1);
    expect(swipeDirection(90, 5)).toBe(-1);
    expect(swipeDirection(-40, 0)).toBe(0);
    expect(swipeDirection(-80, 70)).toBe(0);
  });
});
