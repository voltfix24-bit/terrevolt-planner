import { describe, it, expect } from "vitest";
import {
  assessPlanningRange,
  isoWeekMonday,
  isValidIsoWeek,
  PLANNING_SAFETY_LIMITS,
} from "./planning-safety";

describe("isoWeekMonday", () => {
  it("returns Monday of ISO week 36 of 2026 = 2026-08-31", () => {
    expect(isoWeekMonday(2026, 36).toISOString().slice(0, 10)).toBe("2026-08-31");
  });
  it("week 1 of 2024 starts 2024-01-01 (Monday)", () => {
    expect(isoWeekMonday(2024, 1).toISOString().slice(0, 10)).toBe("2024-01-01");
  });
});

describe("isValidIsoWeek", () => {
  it("accepts normal ISO weeks", () => {
    expect(isValidIsoWeek(2026, 36)).toBe(true);
  });

  it("rejects week 0 and week 54", () => {
    expect(isValidIsoWeek(2026, 0)).toBe(false);
    expect(isValidIsoWeek(2026, 54)).toBe(false);
  });

  it("rejects week 53 in years without ISO week 53", () => {
    expect(isValidIsoWeek(2026, 53)).toBe(false);
  });

  it("accepts week 53 in years that have ISO week 53", () => {
    expect(isValidIsoWeek(2020, 53)).toBe(true);
  });
});

describe("assessPlanningRange", () => {
  it("empty → safe with zeros", () => {
    const a = assessPlanningRange([]);
    expect(a.status).toBe("safe");
    expect(a.weekCount).toBe(0);
    expect(a.reasons).toEqual([]);
  });

  it("normal short range → safe", () => {
    const a = assessPlanningRange([
      { jaar: 2026, week_nr: 36 },
      { jaar: 2026, week_nr: 40 },
    ]);
    expect(a.status).toBe("safe");
    expect(a.weekCount).toBe(2);
    expect(a.rangeWeeks).toBe(5);
  });

  it("vroegste vóór 2024 → blocked", () => {
    const a = assessPlanningRange([
      { jaar: 2019, week_nr: 32 },
      { jaar: 2026, week_nr: 1 },
    ]);
    expect(a.status).toBe("blocked");
    expect(a.reasons.some((r) => r.includes("vóór 2024"))).toBe(true);
  });

  it("laatste na 2028 → blocked", () => {
    const a = assessPlanningRange([
      { jaar: 2026, week_nr: 1 },
      { jaar: 2032, week_nr: 8 },
    ]);
    expect(a.status).toBe("blocked");
    expect(a.reasons.some((r) => r.includes("na 2028"))).toBe(true);
  });

  it("range > 80 → blocked", () => {
    const a = assessPlanningRange([
      { jaar: 2025, week_nr: 1 },
      { jaar: 2026, week_nr: 40 },
    ]);
    expect(a.status).toBe("blocked");
    expect(a.reasons.some((r) => r.includes("range"))).toBe(true);
  });

  it("aantal > 100 → blocked", () => {
    const many = Array.from({ length: 110 }, (_, i) => ({
      jaar: 2025,
      week_nr: ((i % 50) + 1),
    }));
    const a = assessPlanningRange(many);
    expect(a.status).toBe("blocked");
    expect(a.reasons.some((r) => r.includes("aantal weken"))).toBe(true);
  });

  it("limieten on the edge zijn nog safe", () => {
    const a = assessPlanningRange([
      { jaar: 2026, week_nr: 1 },
      { jaar: 2027, week_nr: 27 }, // 79 weken later → range 80
    ]);
    expect(a.rangeWeeks).toBeLessThanOrEqual(PLANNING_SAFETY_LIMITS.maxRangeWeeks);
    expect(a.status).toBe("safe");
  });

  it("dubbele jaar/week-combinaties → blocked", () => {
    const a = assessPlanningRange([
      { jaar: 2026, week_nr: 36 },
      { jaar: 2026, week_nr: 36 },
    ]);
    expect(a.status).toBe("blocked");
    expect(a.reasons.some((r) => r.includes("dubbele projectweek"))).toBe(true);
  });

  it("ongeldige ISO-week → blocked", () => {
    const a = assessPlanningRange([
      { jaar: 2026, week_nr: 36 },
      { jaar: 2026, week_nr: 53 },
    ]);
    expect(a.status).toBe("blocked");
    expect(a.reasons.some((r) => r.includes("ongeldige ISO-week"))).toBe(true);
  });

  it("dubbele positie → blocked", () => {
    const a = assessPlanningRange([
      { jaar: 2026, week_nr: 36, positie: 0 },
      { jaar: 2026, week_nr: 37, positie: 0 },
    ]);
    expect(a.status).toBe("blocked");
    expect(a.reasons.some((r) => r.includes("dubbele weekpositie"))).toBe(true);
  });

  it("niet-aaneengesloten posities → blocked", () => {
    const a = assessPlanningRange([
      { jaar: 2026, week_nr: 36, positie: 0 },
      { jaar: 2026, week_nr: 37, positie: 2 },
    ]);
    expect(a.status).toBe("blocked");
    expect(a.reasons.some((r) => r.includes("niet aaneengesloten"))).toBe(true);
  });
});
