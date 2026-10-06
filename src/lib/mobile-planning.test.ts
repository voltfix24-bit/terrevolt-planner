import { describe, expect, it } from "vitest";
import { aggregateMobilePlanning, capacityForWeek, mobileWeekSequence, uniqueMonteursForProject } from "./mobile-planning";

const weeks = [{ id: "w", project_id: "p", jaar: 2026, week_nr: 41 }];
const acts = [{ id: "a", project_id: "p", naam: "Montage" }];
const cells = [{ id: "c", activiteit_id: "a", week_id: "w", dag_index: 1, kleur_code: "c5" }];
const links = [{ cel_id: "c", monteur_id: "m1" }, { cel_id: "c", monteur_id: "m1" }, { cel_id: "c", monteur_id: "m2" }];

describe("mobile planning aggregation", () => {
  it("groups a cell on the correct case, week and day", () => {
    const result = aggregateMobilePlanning(weeks, acts, cells, links);
    expect(result[0]).toMatchObject({ projectId: "p", activity: "Montage", week: 41, dayIndex: 1, monteurIds: ["m1", "m2"] });
  });
  it("counts unique planned days per monteur for a case", () => {
    expect([...uniqueMonteursForProject(aggregateMobilePlanning(weeks, acts, cells, links), "p")]).toEqual([["m1", 1], ["m2", 1]]);
  });
  it("calculates capacity and excludes on-hold projects", () => {
    const days = aggregateMobilePlanning(weeks, acts, cells, links);
    expect(capacityForWeek(days, 2026, 41, ["m1", "m2"])).toMatchObject({ planned: 2, available: 10, free: 8, percentage: 20 });
    expect(capacityForWeek(days, 2026, 41, ["m1", "m2"], new Set(["p"]))).toMatchObject({ planned: 0, free: 10 });
  });
  it("crosses the ISO year boundary", () => {
    expect(mobileWeekSequence(new Date(2026, 11, 31), 2)).toEqual([{ jaar: 2026, week_nr: 53 }, { jaar: 2027, week_nr: 1 }]);
  });
});