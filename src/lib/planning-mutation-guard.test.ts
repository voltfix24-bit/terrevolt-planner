import { describe, expect, it } from "vitest";
import {
  formatMutationGuardReasons,
  guardAddNextWeek,
  guardRemoveLastWeek,
  guardShiftWeeks,
} from "./planning-mutation-guard";

describe("planning mutation guard", () => {
  it("add next week keeps a normal project safe and normalizes positions", () => {
    const guard = guardAddNextWeek(
      [
        { id: "b", jaar: 2026, week_nr: 37, positie: 9 },
        { id: "a", jaar: 2026, week_nr: 36, positie: 4 },
      ],
      2026,
    );

    expect(guard.ok).toBe(true);
    expect(guard.nextWeeks.map((w) => `${w.jaar}-W${w.week_nr}:${w.positie}`)).toEqual([
      "2026-W36:0",
      "2026-W37:1",
      "2026-W38:2",
    ]);
  });

  it("add next week blocks when it would exceed the safe max year", () => {
    const guard = guardAddNextWeek([{ id: "a", jaar: 2028, week_nr: 52, positie: 0 }], 2028);

    expect(guard.ok).toBe(false);
    expect(formatMutationGuardReasons(guard)).toContain("na 2028");
  });

  it("remove last week can bring a project back inside week-count limits", () => {
    const weeks = Array.from({ length: 101 }, (_, index) => ({
      id: `w${index}`,
      jaar: 2026,
      week_nr: (index % 52) + 1,
      positie: index,
    }));
    const guard = guardRemoveLastWeek(weeks);

    // Still blocked because this fixture also contains duplicate weeks, but the
    // count reason is gone after removing one row.
    expect(guard.after.weekCount).toBe(100);
    expect(guard.reasons.some((r) => r.includes("aantal weken"))).toBe(false);
  });

  it("shift weeks blocks if target state leaves the safe year range", () => {
    const guard = guardShiftWeeks(
      [
        { id: "a", jaar: 2026, week_nr: 36, positie: 0 },
        { id: "b", jaar: 2026, week_nr: 37, positie: 1 },
      ],
      "a",
      2029,
      1,
    );

    expect(guard.ok).toBe(false);
    expect(formatMutationGuardReasons(guard)).toContain("na 2028");
  });

  it("shift weeks keeps relative week spacing and normalized positions", () => {
    const guard = guardShiftWeeks(
      [
        { id: "b", jaar: 2026, week_nr: 38, positie: 4 },
        { id: "a", jaar: 2026, week_nr: 36, positie: 2 },
      ],
      "a",
      2026,
      40,
    );

    expect(guard.ok).toBe(true);
    expect(guard.nextWeeks.map((w) => `${w.jaar}-W${w.week_nr}:${w.positie}`)).toEqual([
      "2026-W40:0",
      "2026-W42:1",
    ]);
  });
});
