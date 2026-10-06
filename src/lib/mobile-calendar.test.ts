import { describe, expect, it } from "vitest";
import { activeMobilePlanningDays, capacityForWeek, caseWeekMatrix, compactCaseLabels, compactMonteurLabels, mobileProjectContext, monteurWeekStates, type MobilePlanningDay } from "./mobile-planning";
import { getMondayOfWeek } from "./planning-types";

const hold = new Set(["hold"]);
const monteurs = [{ id: "a", werkdagen: null }, { id: "b", werkdagen: null }];
const projects = new Map([
  ["active", { case_nummer: "0332473", station_naam: "Station" }],
  ["second", { case_nummer: "0332474", station_naam: "Andere" }],
]);
function day(projectId: string, dayIndex: number, monteurIds = ["a"], activity = "Montage"): MobilePlanningDay {
  const date = getMondayOfWeek(41, 2026); date.setDate(date.getDate() + dayIndex);
  return { projectId, dayIndex, monteurIds, activity, date, year: 2026, week: 41, activityId: activity, cellId: `${projectId}-${dayIndex}-${activity}`, colorCode: "c5" };
}

describe("active compact mobile calendars", () => {
  it("excludes on-hold from active days without mutating original records", () => {
    const days = [day("active", 0), day("hold", 0)];
    expect(activeMobilePlanningDays(days, hold).map((item) => item.projectId)).toEqual(["active"]);
    expect(days).toHaveLength(2);
  });
  it("excludes on-hold from case week matrix", () => {
    expect(caseWeekMatrix([day("hold", 0)], 2026, 41, hold)).toEqual([]);
  });
  it("excludes on-hold from monteur week matrix and leaves the slot free", () => {
    const states = monteurWeekStates([day("hold", 0)], 2026, 41, monteurs, [], [], hold);
    expect(states.get("a")?.[0]).toMatchObject({ kind: "free", entries: [], conflict: false });
  });
  it("on-hold changes neither planned, free nor conflicts", () => {
    const days = [day("active", 0), day("hold", 0), day("hold", 1, ["b"])];
    const cap = capacityForWeek(days, 2026, 41, monteurs, [], [], hold);
    expect(cap).toMatchObject({ available: 10, plannedUnique: 1, plannedAvailable: 1, free: 9, conflicts: 0 });
  });
  it("places an active case in the correct fixed day cell and combines activities", () => {
    const rows = caseWeekMatrix([day("active", 2, ["a"]), day("active", 2, ["b"], "Schakelen")], 2026, 41);
    expect(rows).toHaveLength(1);
    expect(rows[0].cells).toHaveLength(5);
    expect(rows[0].cells[0]).toBeNull();
    expect(rows[0].cells[2]).toMatchObject({ activities: ["Montage", "Schakelen"], monteurIds: ["a", "b"] });
  });
  it("places the correct active case and status color in monteur's day cell", () => {
    const states = monteurWeekStates([day("active", 3, ["b"])], 2026, 41, monteurs, [], []);
    expect(states.get("b")?.[3].entries).toEqual([{ projectId: "active", activities: ["Montage"], colorCodes: ["c5"], onHold: false }]);
    expect(states.get("a")?.[3].kind).toBe("free");
  });
  it("compacts unique monteurs to two initials and the remaining count", () => {
    const names = new Map([["a", "Anna Bakker"], ["b", "Chris Dijk"], ["c", "Eva Vos"], ["d", "Fred Jansen"]]);
    expect(compactMonteurLabels(["a", "b", "a", "c", "d"], names)).toEqual({ labels: ["AB", "CD"], extra: 2 });
  });
  it("compacts multiple active cases with +N and conflict but not duplicate activities", () => {
    const states = monteurWeekStates([day("active", 0), day("active", 0, ["a"], "Schakelen"), day("second", 0), day("hold", 0)], 2026, 41, monteurs, [], [], hold);
    const state = states.get("a")?.[0];
    expect(state?.conflict).toBe(true);
    expect(compactCaseLabels(state?.entries ?? [], projects)).toEqual({ label: "0332473", extra: 1, conflict: true });
    expect(state?.entries[0].activities).toEqual(["Montage", "Schakelen"]);
  });
  it("blocks on-hold case context while allowing active and global contexts", () => {
    expect(mobileProjectContext({ status: "on_hold" })).toBe("blocked");
    expect(mobileProjectContext({ status: "in_uitvoering" })).toBe("active");
    expect(mobileProjectContext(undefined)).toBe("global");
  });
});