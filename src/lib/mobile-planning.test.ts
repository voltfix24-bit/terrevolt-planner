import { describe, expect, it } from "vitest";
import { aggregateMobilePlanning, availableMonteurSlotsForWeek, capacityForWeek, mobileWeekSequence, uniqueMonteursForProject } from "./mobile-planning";

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
    const monteurs = [{ id: "m1", werkdagen: null }, { id: "m2", werkdagen: null }];
    expect(capacityForWeek(days, 2026, 41, monteurs, [], [])).toMatchObject({ planned: 2, available: 10, free: 8, percentage: 20 });
    expect(capacityForWeek(days, 2026, 41, monteurs, [], [], new Set(["p"]))).toMatchObject({ planned: 0, free: 10 });
  });
  it("excludes a part-time fixed day off from available slots", () => {
    const result = availableMonteurSlotsForWeek(2026, 41, [{ id: "m1", werkdagen: [1, 2, 3, 4] }], [], []);
    expect(result[4].availableMonteurIds).toEqual([]);
    expect(result.reduce((sum, day) => sum + day.availableMonteurIds.length, 0)).toBe(4);
  });
  it("reduces availability for an absence period", () => {
    const cap = capacityForWeek([], 2026, 41, [{ id: "m1", werkdagen: null }], [{ monteur_id: "m1", datum_van: "2026-10-06", datum_tot: "2026-10-07", type: "Verlof" }], []);
    expect(cap.available).toBe(3);
  });
  it("reduces availability for a public holiday", () => {
    const cap = capacityForWeek([], 2026, 41, [{ id: "m1", werkdagen: null }, { id: "m2", werkdagen: null }], [], [{ datum: "2026-10-05", naam: "Testfeestdag" }]);
    expect(cap.available).toBe(8);
    expect(cap.days[0].holidayName).toBe("Testfeestdag");
  });
  it("shows overplanning when someone is planned while unavailable", () => {
    const unavailable = [{ monteur_id: "m1", datum_van: "2026-10-05", datum_tot: "2026-10-09", type: "Verlof" }];
    const plannedDays = Array.from({ length: 2 }, (_, index) => ({ ...aggregateMobilePlanning(weeks, acts, cells, links)[0], cellId: `x${index}`, dayIndex: index, monteurIds: ["m1"] }));
    const cap = capacityForWeek(plannedDays, 2026, 41, [{ id: "m1", werkdagen: null }, { id: "m2", werkdagen: [1] }], unavailable, []);
    expect(cap).toMatchObject({ planned: 2, plannedUnique: 2, plannedAvailable: 0, overplannedUnavailable: 2, available: 1, free: 1, percentage: 200 });
  });
  it("crosses the ISO year boundary", () => {
    expect(mobileWeekSequence(new Date(2026, 11, 31), 2)).toEqual([{ jaar: 2026, week_nr: 53 }, { jaar: 2027, week_nr: 1 }]);
  });
});