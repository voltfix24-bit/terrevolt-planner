import { describe, it, expect } from "vitest";
import {
  buildProjectCellDates,
  cellDateMs,
  compareOverviewProjects,
  getProjectOverviewSortKey,
  type OverviewProject,
} from "./project-overview-sort";
import { getMondayOfWeek } from "./planning-types";

const today = new Date(2026, 5, 18); // 18 juni 2026
const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

function p(id: string, status: OverviewProject["status"], cn = id): OverviewProject {
  return { id, status, case_nummer: cn };
}

function mkDate(daysFromToday: number): number {
  const d = new Date(today);
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

describe("getProjectOverviewSortKey", () => {
  it("gepland staat boven concept binnen dezelfde groep", () => {
    const cmp = compareOverviewProjects(
      p("a", "concept"),
      p("b", "gepland"),
      new Map([
        ["a", [mkDate(7)]],
        ["b", [mkDate(14)]],
      ]),
      todayMs,
    );
    expect(cmp).toBeGreaterThan(0); // a (concept) na b (gepland)
  });

  it("toekomstplanning boven verledenplanning binnen dezelfde status", () => {
    const cmp = compareOverviewProjects(
      p("past", "gepland"),
      p("future", "gepland"),
      new Map([
        ["past", [mkDate(-30)]],
        ["future", [mkDate(5)]],
      ]),
      todayMs,
    );
    expect(cmp).toBeGreaterThan(0);
  });

  it("vroegste toekomstige activiteit eerst", () => {
    const cmp = compareOverviewProjects(
      p("later", "gepland"),
      p("sooner", "gepland"),
      new Map([
        ["later", [mkDate(20)]],
        ["sooner", [mkDate(2)]],
      ]),
      todayMs,
    );
    expect(cmp).toBeGreaterThan(0);
  });

  it("projecten zonder planning komen onderaan binnen status", () => {
    const cmp = compareOverviewProjects(
      p("none", "gepland"),
      p("some", "gepland"),
      new Map([["some", [mkDate(-5)]]]), // verleden, maar wel iets
      todayMs,
    );
    expect(cmp).toBeGreaterThan(0); // none → na some
  });

  it("zonder planning gepland staat nog steeds boven concept zonder planning", () => {
    const cmp = compareOverviewProjects(
      p("c", "concept"),
      p("g", "gepland"),
      new Map(),
      todayMs,
    );
    expect(cmp).toBeGreaterThan(0);
  });

  it("ISO-jaargrens werkt: cel in week 1 van volgend jaar is toekomst", () => {
    const dec = new Date(2026, 11, 28); // di 29 dec ligt in week 53 of 1...
    const decMs = new Date(dec.getFullYear(), dec.getMonth(), dec.getDate()).getTime();
    // Project A: cel op ma in ISO-week 1 van 2027 (= 4 jan 2027)
    // Project B: cel op ma in ISO-week 52 van 2026
    const aMs = cellDateMs({ jaar: 2027, week_nr: 1 }, 0);
    const bMs = cellDateMs({ jaar: 2026, week_nr: 52 }, 0);
    expect(aMs).toBeGreaterThan(bMs);
    const cmp = compareOverviewProjects(
      p("a", "gepland"),
      p("b", "gepland"),
      new Map([
        ["a", [aMs]],
        ["b", [bMs]],
      ]),
      decMs,
    );
    expect(cmp).toBeGreaterThan(0); // b (eerder) komt eerst
  });

  it("buildProjectCellDates groepeert via activiteit_id → project_id", () => {
    const monday = getMondayOfWeek(26, 2026);
    const map = buildProjectCellDates(
      [{ id: "w1", project_id: "P", jaar: 2026, week_nr: 26 }],
      [{ id: "a1", project_id: "P" }],
      [{ activiteit_id: "a1", week_id: "w1", dag_index: 2 }],
    );
    const arr = map.get("P");
    expect(arr).toBeDefined();
    const expected = new Date(monday);
    expected.setDate(expected.getDate() + 2);
    expected.setHours(0, 0, 0, 0);
    expect(arr![0]).toBe(expected.getTime());
  });

  it("key tiebreaker valt op case_nummer", () => {
    const k1 = getProjectOverviewSortKey({ id: "1", status: "gepland", case_nummer: "100" }, undefined, todayMs);
    const k2 = getProjectOverviewSortKey({ id: "2", status: "gepland", case_nummer: "200" }, undefined, todayMs);
    expect(k1[3] < k2[3]).toBe(true);
  });
});
