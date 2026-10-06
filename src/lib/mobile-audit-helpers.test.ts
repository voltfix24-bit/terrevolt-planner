import { describe, expect, it } from "vitest";
import { nextActivePlanningDay, splitMonteursByWeekActivity } from "./mobile-planning";

describe("nextActivePlanningDay", () => {
  const d = (s: string) => ({ date: new Date(s + "T00:00:00") });
  it("kiest eerstvolgende dag vanaf vandaag", () => {
    expect(nextActivePlanningDay([d("2026-10-01"), d("2026-10-28"), d("2026-10-26")], new Date("2026-10-06T16:00:00"))?.date.getDate()).toBe(26);
  });
  it("vandaag telt mee, verleden niet", () => {
    expect(nextActivePlanningDay([d("2026-10-06")], new Date("2026-10-06T16:00:00"))).not.toBeNull();
    expect(nextActivePlanningDay([d("2026-10-05")], new Date("2026-10-06T16:00:00"))).toBeNull();
  });
});

describe("splitMonteursByWeekActivity", () => {
  it("zet hele-week-vrij monteurs apart", () => {
    const states = new Map([["a", [{ kind: "planned" as const }, { kind: "free" as const }]], ["b", [{ kind: "free" as const }, { kind: "free" as const }]], ["c", [{ kind: "unavailable" as const }]]]);
    const r = splitMonteursByWeekActivity([{ id: "a" }, { id: "b" }, { id: "c" }], states);
    expect(r.busy.map((m) => m.id)).toEqual(["a", "c"]);
    expect(r.free.map((m) => m.id)).toEqual(["b"]);
  });
});
