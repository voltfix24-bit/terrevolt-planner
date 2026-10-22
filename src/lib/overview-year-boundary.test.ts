import { describe, expect, it } from "vitest";
import { consecutiveIsoWeeks, getMondayOfWeek } from "./planning-types";

describe("overview consecutive ISO weeks", () => {
  it("continues 2026 week 53 into 2027 week 1, without repeating 1 January", () => {
    const weeks = consecutiveIsoWeeks(2026, 52, 4);
    expect(weeks).toEqual([
      { jaar: 2026, week_nr: 52 }, { jaar: 2026, week_nr: 53 },
      { jaar: 2027, week_nr: 1 }, { jaar: 2027, week_nr: 2 },
    ]);
    const dates = weeks.flatMap((week) => Array.from({ length: 5 }, (_, day) => {
      const date = getMondayOfWeek(week.week_nr, week.jaar);
      date.setDate(date.getDate() + day);
      return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    }));
    expect(dates[9]).toBe("2027-1-1");
    expect(dates[10]).toBe("2027-1-4");
    expect(dates.filter((date) => date === "2027-1-1")).toHaveLength(1);
    expect(new Set(dates).size).toBe(20);
  });

  it("continues a 52-week year into the next year", () => {
    expect(consecutiveIsoWeeks(2025, 52, 2)).toEqual([
      { jaar: 2025, week_nr: 52 }, { jaar: 2026, week_nr: 1 },
    ]);
    const monday = getMondayOfWeek(1, 2026);
    expect([monday.getFullYear(), monday.getMonth() + 1, monday.getDate()]).toEqual([2025, 12, 29]);
  });

  it("keeps a quarter-length range chronological across the year boundary", () => {
    const weeks = consecutiveIsoWeeks(2026, 48, 26);
    const dates = weeks.map((week) => getMondayOfWeek(week.week_nr, week.jaar).getTime());
    expect(weeks[6]).toEqual({ jaar: 2027, week_nr: 1 });
    for (let index = 1; index < dates.length; index++) expect(dates[index]).toBeGreaterThan(dates[index - 1]);
  });
});