import { describe, it, expect } from "vitest";
import {
  buildProjectCellDates,
  cellDateMs,
  compareOverviewProjects,
  computeBucketClient,
  getProjectOverviewSortKey,
  planningCategory,
  bucketKey,
  type OverviewProject,
} from "./project-overview-sort";

const today = new Date(2026, 5, 18);
const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

function p(id: string, status: OverviewProject["status"], extra: Partial<OverviewProject> = {}): OverviewProject {
  return { id, status, case_nummer: id, ...extra };
}
function mkDate(days: number): number {
  const d = new Date(today); d.setDate(d.getDate() + days); d.setHours(0, 0, 0, 0); return d.getTime();
}

describe("sort helper - basis", () => {
  it("statusvolgorde: in_uitvoering → gepland → concept → afgerond", () => {
    const dates = new Map<string, number[]>([
      ["u", [mkDate(7)]], ["g", [mkDate(7)]], ["c", [mkDate(7)]], ["a", [mkDate(7)]],
    ]);
    const arr = [p("a", "afgerond"), p("c", "concept"), p("g", "gepland"), p("u", "in_uitvoering")]
      .sort((x, y) => compareOverviewProjects(x, y, dates, todayMs))
      .map((x) => x.id);
    expect(arr).toEqual(["u", "g", "c", "a"]);
  });

  it("gepland boven concept (sanity)", () => {
    const cmp = compareOverviewProjects(p("c", "concept"), p("g", "gepland"), new Map([["c",[mkDate(7)]],["g",[mkDate(7)]]]), todayMs);
    expect(cmp).toBeGreaterThan(0);
  });

  it("future → past → none binnen status", () => {
    const dates = new Map<string, number[]>([
      ["f", [mkDate(7)]],
      ["pst", [mkDate(-7)]],
    ]);
    const arr = [p("none", "gepland"), p("pst", "gepland"), p("f", "gepland")]
      .sort((x, y) => compareOverviewProjects(x, y, dates, todayMs))
      .map((x) => x.id);
    expect(arr).toEqual(["f", "pst", "none"]);
  });

  it("vroegste toekomstige cel eerst", () => {
    const dates = new Map<string, number[]>([["a", [mkDate(2)]], ["b", [mkDate(20)]]]);
    const cmp = compareOverviewProjects(p("b","gepland"), p("a","gepland"), dates, todayMs);
    expect(cmp).toBeGreaterThan(0);
  });

  it("ISO-jaargrens: cel in W1 2027 is toekomst", () => {
    const dec = new Date(2026, 11, 29).setHours(0,0,0,0);
    const aMs = cellDateMs({ jaar: 2027, week_nr: 1 }, 0);
    const bMs = cellDateMs({ jaar: 2026, week_nr: 52 }, 0);
    expect(aMs).toBeGreaterThan(bMs);
    const cmp = compareOverviewProjects(
      p("a","gepland"), p("b","gepland"),
      new Map([["a",[aMs]],["b",[bMs]]]), dec);
    expect(cmp).toBeLessThan(0);
  });

  it("buildProjectCellDates volgt activiteit_id → project_id", () => {
    const m = buildProjectCellDates(
      [{ id: "w", project_id: "P", jaar: 2026, week_nr: 26 }],
      [{ id: "a", project_id: "P" }],
      [{ activiteit_id: "a", week_id: "w", dag_index: 1 }],
    );
    expect(m.get("P")?.length).toBe(1);
  });
});

describe("sort helper - manual order", () => {
  const dates = new Map<string, number[]>([
    ["a", [mkDate(7)]], ["b", [mkDate(8)]], ["c", [mkDate(9)]],
  ]);
  const bucket = "gepland:future";

  it("manual order werkt binnen dezelfde bucket", () => {
    const arr = [
      p("c", "gepland", { planning_sort_order: 1000, planning_sort_bucket: bucket }),
      p("a", "gepland", { planning_sort_order: 3000, planning_sort_bucket: bucket }),
      p("b", "gepland", { planning_sort_order: 2000, planning_sort_bucket: bucket }),
    ].sort((x, y) => compareOverviewProjects(x, y, dates, todayMs)).map((x) => x.id);
    expect(arr).toEqual(["c", "b", "a"]);
  });

  it("oude/foute bucket valt terug op datum-sort", () => {
    // Alle 3 hebben verkeerde bucket → manualOrder negeren → datum sorteert
    const arr = [
      p("c", "gepland", { planning_sort_order: 1, planning_sort_bucket: "concept:past" }),
      p("a", "gepland", { planning_sort_order: 2, planning_sort_bucket: "gepland:past" }),
      p("b", "gepland", { planning_sort_order: 3, planning_sort_bucket: "iets:anders" }),
    ].sort((x, y) => compareOverviewProjects(x, y, dates, todayMs)).map((x) => x.id);
    expect(arr).toEqual(["a", "b", "c"]);
  });

  it("manual order overstijgt nooit status/category", () => {
    // concept met manual order 1 staat NIET boven gepland met manual order 9999
    const arr = [
      p("g", "gepland", { planning_sort_order: 9999, planning_sort_bucket: "gepland:future" }),
      p("c", "concept", { planning_sort_order: 1, planning_sort_bucket: "concept:future" }),
    ].sort((x, y) => compareOverviewProjects(x, y, dates, todayMs)).map((x) => x.id);
    expect(arr).toEqual(["g", "c"]);
  });

  it("datum-tiebreaker bij gelijke manual order", () => {
    const arr = [
      p("b", "gepland", { planning_sort_order: 1000, planning_sort_bucket: bucket }),
      p("a", "gepland", { planning_sort_order: 1000, planning_sort_bucket: bucket }),
    ].sort((x, y) => compareOverviewProjects(x, y, dates, todayMs)).map((x) => x.id);
    expect(arr).toEqual(["a", "b"]);
  });
});

describe("sort helper - bucket helpers", () => {
  it("planningCategory", () => {
    expect(planningCategory(undefined, todayMs)).toBe("none");
    expect(planningCategory([mkDate(-1)], todayMs)).toBe("past");
    expect(planningCategory([mkDate(1)], todayMs)).toBe("future");
    expect(planningCategory([mkDate(-1), mkDate(1)], todayMs)).toBe("future");
  });
  it("bucketKey en computeBucketClient", () => {
    expect(bucketKey("gepland", "future")).toBe("gepland:future");
    expect(computeBucketClient(p("x","concept"), undefined, todayMs)).toBe("concept:none");
  });
  it("key heeft 7 elementen", () => {
    const k = getProjectOverviewSortKey(p("x","gepland"), [mkDate(5)], todayMs);
    expect(k.length).toBe(7);
  });
});
