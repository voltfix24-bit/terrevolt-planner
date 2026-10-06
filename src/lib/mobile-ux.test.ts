import { describe, expect, it } from "vitest";
import type { MobilePlanningDay, MonteurDayState } from "./mobile-planning";
import { caseTitle, caseSection, matchesSearch, normalizeForSearch, freshnessLabel, mobileDataState, unavailableLabel, sortCaseWeekOptions, activeFilterCount, casePlanningLabel, classifyResourceWeek, compareCases, EMPTY_CASE_FILTERS, formatWeekParam, groupResourcesForWeek, nextActivePlanningAfter, parseWeekParam, planningEmptyState, showPlanningStats, unitLabel } from "./mobile-ux";
import { capacityLink, formatMobileView, mobileBackTarget, mobileTodayContext, parseMobileView, selectMobileWeek, splitMobileWeeks } from "./mobile-ux";
import { activityCellLabel, activityTypes, conceptManDays, hasRegisteredAbsence, latentOnHoldOverlap, parseMobileDay, shortActivityType, sortResourcesForDay, weekExceptions } from "./mobile-ux";

const day = (projectId: string, iso: string, week = 44, dayIndex = 0): MobilePlanningDay => ({ projectId, activityId: "a", activity: "X", cellId: projectId + iso, year: 2026, week, dayIndex, date: new Date(iso + "T00:00:00"), colorCode: "c1", monteurIds: [] });
const st = (kind: MonteurDayState["kind"], conflict = false): Pick<MonteurDayState, "kind" | "conflict" | "plannedWhileUnavailable"> => ({ kind, conflict, plannedWhileUnavailable: false });

describe("mobile operational signals", () => {
  const week = { jaar: 2026, week_nr: 43 };
  const d = (projectId: string, ids: string[] = [], index = 0) => ({ ...day(projectId, `2026-10-${19 + index}`, 43, index), monteurIds: ids });
  const resources = [{ id: "m", werkdagen: [1, 2, 3, 4, 5] }, { id: "free", werkdagen: [1, 2, 3, 4, 5] }];
  it("deduplicates double bookings and crewless case-days, ignoring on hold and other weeks", () => {
    const days = [d("a", ["m"]), d("a", ["m"]), d("b", ["m"]), d("empty"), d("empty"), d("hold"), { ...d("other", ["m"]), week: 44 }];
    const result = weekExceptions(days, week, resources, [], [], new Set(["hold"]));
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: "dubbel", dayIndex: 0, monteurId: "m", projectIds: ["a", "b"] });
    expect(result[1]).toMatchObject({ type: "geen-ploeg", projectIds: ["empty"] });
    expect(days).toHaveLength(7);
  });
  it("reports absence separately from double booking and never unplanned absence", () => {
    const absence = [{ monteur_id: "m", datum_van: "2026-10-19", datum_tot: "2026-10-19", type: "verlof", omschrijving: null }];
    expect(weekExceptions([d("a", ["m"]), d("b", ["m"])], week, resources, absence, []).map((e) => e.type)).toEqual(["dubbel", "afwezig"]);
    expect(weekExceptions([], week, resources, absence, [])).toEqual([]);
    expect(weekExceptions([d("hold", ["m"])], week, resources, absence, [], new Set(["hold"]))).toEqual([]);
  });
  it.each([["Montagedagen", "Montage"], ["Schakeldagen", "Schakel"], ["Schakelen", "Schakel"], ["Diverse", "Diverse"], ["Blokkade", "Blokkade"], ["Uitgevoerd", "Gereed"], ["Transport", "Transport"], ["Bouwkunde", "Bouwk."], ["Levering", "Levering"], ["Civiel", "Civiel"], ["Asbest", "Asbest"], ["Overig", "Overig"], ["unknown", "Overig"]])("maps %s to %s", (input, expected) => {
    expect(shortActivityType(input)).toBe(expected);
  });
  it("uses desktop color category, deduplicates synonyms and retains asbestos", () => {
    expect(activityCellLabel(["c5", "c11"], ["Diverse"])).toBe("Montage +1");
    expect(activityTypes(["c2", "c4", "c11"])).toEqual(["Schakel", "Asbest"]);
    expect(activityCellLabel([], ["Bouwkunde"])).toBe("Bouwk.");
  });
  it("sorts by selected day, free then planned then unavailable, preserving equal ranks", () => {
    const items = [{ id: "p" }, { id: "u" }, { id: "f" }, { id: "f2" }];
    const states = new Map(items.map((m) => [m.id, [{ dayIndex: 2, kind: m.id === "p" ? "planned" as const : m.id === "u" ? "unavailable" as const : "free" as const }]]));
    expect(sortResourcesForDay(items, states, 2).map((m) => m.id)).toEqual(["f", "f2", "p", "u"]);
    expect(items.map((m) => m.id)).toEqual(["p", "u", "f", "f2"]);
    expect(parseMobileDay("0")).toBe(0); expect(parseMobileDay("4")).toBe(4);
    for (const invalid of [null, "", "5", "-1", "2x", "00"]) expect(parseMobileDay(invalid)).toBeNull();
  });
  it("counts unique concept resource-days without excluding concepts from active planning", () => {
    const projects = new Map([["a", { status: "concept" }], ["b", { status: "concept" }], ["c", { status: "gepland" }], ["hold", { status: "concept" }]]);
    const days = [d("a", ["m"]), d("a", ["m"]), d("b", ["m"]), d("a", ["m"], 1), d("c", ["free"]), d("hold", ["free"]), { ...d("a", ["free"]), week: 44 }];
    expect(conceptManDays(days, week, projects, new Set(["hold"]))).toBe(2);
    expect(weekExceptions([d("a", ["m"]), d("c", ["m"])], week, resources, [], []).some((e) => e.type === "dubbel")).toBe(true);
  });
  it("counts latent overlaps once per resource-date against active cases only", () => {
    const days = [d("hold", ["m"]), d("hold", ["m"]), d("a", ["m"]), d("b", ["m"]), d("other-hold", ["free"]), d("hold", ["free"]), d("hold", ["m"], 1)];
    const holds = new Set(["hold", "other-hold"]);
    expect(latentOnHoldOverlap(days, "hold", holds)).toMatchObject({ count: 1, rows: [{ monteurId: "m", projectIds: ["a", "b"] }] });
    expect(latentOnHoldOverlap(days, "a", holds)).toEqual({ count: 0, rows: [] });
    expect(weekExceptions(days, week, resources, [], [], holds)).toHaveLength(1);
  });
  it("checks registered absence for existing resources on weekdays, not roster or holidays", () => {
    const ids = new Set(["m"]);
    expect(hasRegisteredAbsence(week, [], ids)).toBe(false);
    const a = { monteur_id: "m", datum_van: "2026-10-18", datum_tot: "2026-10-19", type: "verlof", omschrijving: null };
    expect(hasRegisteredAbsence(week, [a], ids)).toBe(true);
    expect(hasRegisteredAbsence(week, [{ ...a, datum_tot: "2026-10-18" }], ids)).toBe(false);
    expect(hasRegisteredAbsence(week, [{ ...a, monteur_id: "inactive" }], ids)).toBe(false);
  });
});

describe("mobile structure and navigation", () => {
  const now = new Date("2026-10-06T12:00:00");
  it("selects URL > shared week > current week and ignores invalid URLs", () => {
    const stored = { jaar: 2027, week_nr: 2 };
    expect(selectMobileWeek("2026-44", stored, now)).toEqual({ jaar: 2026, week_nr: 44 });
    expect(selectMobileWeek(null, stored, now)).toEqual(stored);
    expect(selectMobileWeek("invalid", stored, now)).toEqual(stored);
    expect(selectMobileWeek(null, null, now)).toEqual({ jaar: 2026, week_nr: 41 });
  });
  it("round-trips week/query/open/mode without changing context parameters or input", () => {
    const source = new URLSearchParams("project=p&monteur=m&dag=2");
    const state = { week: { jaar: 2026, week_nr: 44 }, query: "Ali & maat", open: "id/1", mode: "overview" as const };
    const result = formatMobileView(source, state);
    expect(parseMobileView(result)).toEqual(state);
    expect(result.get("weergave")).toBe("komend");
    expect(result.get("project")).toBe("p"); expect(result.get("dag")).toBe("2");
    expect(source.has("week")).toBe(false);
    const clean = formatMobileView(result, { ...state, query: "", open: null, mode: "week" });
    expect(clean.has("q")).toBe(false); expect(clean.has("open")).toBe(false); expect(clean.has("weergave")).toBe(false);
    expect(parseMobileView(new URLSearchParams("week=bad&weergave=bad"))).toEqual({ week: null, query: "", open: null, mode: "week" });
  });
  it.each(["2026-10-10", "2026-10-11"])("shows next Monday on weekend %s", (iso) => {
    expect(mobileTodayContext(new Date(`${iso}T12:00:00`))).toEqual({ week: { jaar: 2026, week_nr: 42 }, dayIndex: 0, weekend: true });
  });
  it("keeps weekdays and rolls weekend ISO weeks across years", () => {
    expect(mobileTodayContext(now)).toEqual({ week: { jaar: 2026, week_nr: 41 }, dayIndex: 1, weekend: false });
    expect(mobileTodayContext(new Date("2027-01-03T12:00:00"))).toEqual({ week: { jaar: 2027, week_nr: 1 }, dayIndex: 0, weekend: true });
  });
  it("splits current/future ascending from earlier descending without mutating", () => {
    const weeks = [{ year: 2027, week: 1 }, { year: 2026, week: 40 }, { year: 2026, week: 44 }, { year: 2025, week: 52 }, { year: 2026, week: 41 }];
    const original = [...weeks]; const split = splitMobileWeeks(weeks, now);
    expect(split.upcoming.map((w) => w.week)).toEqual([41, 44, 1]);
    expect(split.earlier.map((w) => w.week)).toEqual([40, 52]);
    expect(split.defaultOpen).toBe("2026-41"); expect(weeks).toEqual(original);
    expect(splitMobileWeeks([{ year: 2026, week: 44 }], now).defaultOpen).toBe("2026-44");
    expect(splitMobileWeeks([{ year: 2026, week: 40 }], now).defaultOpen).toBeNull();
    expect(splitMobileWeeks([], now)).toEqual({ upcoming: [], earlier: [], defaultOpen: null });
  });
  it("uses history only when a previous app screen exists", () => {
    expect(mobileBackTarget(1, "/projecten")).toBe(-1);
    for (const idx of [0, undefined, null, -1, "1"]) expect(mobileBackTarget(idx, "/projecten")).toBe("/projecten");
    expect(capacityLink({ jaar: 2026, week_nr: 4 }, "a/b")).toBe("/capaciteit?week=2026-04&monteur=a%2Fb");
  });
});

describe("nextActivePlanningAfter", () => {
  const today = new Date("2026-10-06T12:00:00");
  it("negeert on_hold en kiest vroegste actieve dag", () => {
    const r = nextActivePlanningAfter([day("hold", "2026-10-07"), day("a", "2026-10-26"), day("b", "2026-10-26")], today, new Set(["hold"]));
    expect(r?.projectId).toBe("a"); expect(r?.extraCases).toBe(1); expect(r?.week).toBe(44);
  });
  it("geen toekomst -> null; geselecteerde dag zelf telt niet", () => {
    expect(nextActivePlanningAfter([day("a", "2026-10-01"), day("a", "2026-10-06")], today, new Set())).toBeNull();
    expect(nextActivePlanningAfter([day("hold", "2026-11-01")], today, new Set(["hold"]))).toBeNull();
  });
});

describe("week param", () => {
  it("rondreis en ongeldig", () => {
    expect(formatWeekParam({ jaar: 2026, week_nr: 4 })).toBe("2026-04");
    expect(parseWeekParam("2026-44")).toEqual({ jaar: 2026, week_nr: 44 });
    expect(parseWeekParam("2026-60")).toBeNull(); expect(parseWeekParam(null)).toBeNull();
  });
});

describe("resource groepering", () => {
  const states = new Map([
    ["free", [st("free"), st("free")]],
    ["absent1", [st("unavailable"), st("free")]],
    ["planned", [st("planned"), st("free")]],
    ["conflict", [st("planned", true), st("free")]],
  ]);
  const ms = [{ id: "free", naam: "Smart Infra" }, { id: "absent1", naam: "Ali" }, { id: "planned", naam: "Cevdet" }, { id: "conflict", naam: "Samir" }];
  it("classificeert zonder naamheuristiek", () => {
    const g = groupResourcesForWeek(ms, states);
    expect(g.free.map((m) => m.id)).toEqual(["free"]);
    expect(g.partial.map((m) => m.id)).toEqual(["absent1"]);
    expect(g.planned.map((m) => m.id)).toEqual(["planned"]);
    expect(g.conflict.map((m) => m.id)).toEqual(["conflict"]);
  });
  it("één afwezigheidsdag blijft individueel; conflict gaat voor", () => {
    expect(classifyResourceWeek([st("unavailable"), st("free")])).toBe("partial");
    expect(classifyResourceWeek([st("planned", true)])).toBe("conflict");
  });
  it("zoekfilter werkt op vrije groep en drukke kaarten", () => {
    const g = groupResourcesForWeek(ms, states, (m) => m.naam.toLowerCase().includes("smart"));
    expect(g.free).toHaveLength(1); expect(g.planned).toHaveLength(0);
    const g2 = groupResourcesForWeek(ms, states, (m) => m.naam === "Cevdet");
    expect(g2.free).toHaveLength(0); expect(g2.planned).toHaveLength(1);
  });
});

describe("lege staten en labels", () => {
  it("case-context zonder planning", () => {
    expect(planningEmptyState("p", false)).toBe("no-case-planning");
    expect(planningEmptyState("p", true)).toBe("no-week-planning");
    expect(planningEmptyState(null, false)).toBe("no-week-planning");
  });
  it("eenheden", () => {
    expect(unitLabel("day", "vrij")).toBe("monteurs vrij");
    expect(unitLabel("week", "beschikbaar")).toBe("mandagen beschikbaar");
  });
  it("detail-stats verborgen zonder planning", () => {
    expect(showPlanningStats({ uniqueDays: 0 })).toBe(false); expect(showPlanningStats({ uniqueDays: 3 })).toBe(true);
  });
});

describe("Cases-lijst", () => {
  const today = new Date("2026-10-06T12:00:00");
  it("planninglabels", () => {
    expect(casePlanningLabel([day("a", "2026-10-26"), day("a", "2026-10-01")], today).kind).toBe("next");
    expect(casePlanningLabel([day("a", "2026-10-01")], today).kind).toBe("past");
    expect(casePlanningLabel([], today).kind).toBe("none");
  });
  it("sortering: volgende actief eerst, on hold en afgerond achteraan", () => {
    const mk = (code: string, status: string, iso?: string, past = false) => ({ code, status, label: iso ? casePlanningLabel([day(code, iso)], past ? new Date("2027-01-01") : today) : casePlanningLabel([], today) });
    const list = [mk("hold", "on_hold", "2026-10-20"), mk("late", "gepland", "2026-11-20"), mk("done", "afgerond"), mk("none", "concept"), mk("soon", "gepland", "2026-10-20")];
    expect(list.sort(compareCases).map((c) => c.code)).toEqual(["soon", "late", "none", "hold", "done"]);
  });
  it("actieve filtertelling", () => {
    expect(activeFilterCount(EMPTY_CASE_FILTERS)).toBe(0);
    expect(activeFilterCount({ status: "gepland", opdrachtgeverId: "", week: "2026-44" })).toBe(2);
  });
});


describe("mobile reliability gate", () => {
  it("never treats a first-load failure as empty planning", () => {
    expect(mobileDataState(false, null, true)).toBe("loading");
    expect(mobileDataState(false, "failed", true)).toBe("error");
    expect(mobileDataState(false, null, false)).toBe("error");
  });
  it("retains successful empty or populated data on refetch failure/offline", () => {
    expect(mobileDataState(true, "failed", true)).toBe("stale");
    expect(mobileDataState(true, null, false)).toBe("stale");
    expect(mobileDataState(true, null, true)).toBe("ready");
  });
});

describe("mobile freshness", () => {
  const now = new Date("2026-10-06T16:43:00");
  it("shows today's time, yesterday, or a full short date", () => {
    expect(freshnessLabel(new Date("2026-10-06T16:18:00"), now)).toBe("16:18");
    expect(freshnessLabel(new Date("2026-10-05T17:05:00"), now)).toBe("gisteren 17:05");
    expect(freshnessLabel(new Date("2026-10-04T17:05:00"), now)).toBe("zo 4 okt 17:05");
    expect(freshnessLabel(null, now)).toBe("…");
  });
  it("handles yesterday across month/year boundaries", () => {
    expect(freshnessLabel(new Date("2025-12-31T17:05:00"), new Date("2026-01-01T08:00:00"))).toBe("gisteren 17:05");
  });
});

describe("availability labels", () => {
  it("roster day off is not available Vrij", () => {
    expect(unavailableLabel(["Vaste vrije dag (MA)"])).toBe("—");
    expect(unavailableLabel(["Vaste vrije dag (MA)"], true)).toBe("geen werkdag (rooster)");
  });
  it.each([["vakantie", "Verlof"], ["verlof", "Verlof"], ["ziek", "Ziek"], ["opleiding", "Opleiding"], ["Feestdag: Kerstmis", "Feestdag"], ["overig", "Afwezig"]])("labels %s as %s", (reason, expected) => {
    expect(unavailableLabel([reason])).toBe(expected);
  });
  it("does not hide overlapping absence behind roster dash", () => {
    expect(unavailableLabel(["Vaste vrije dag (MA)", "ziek"])).toBe("Ziek");
    expect(unavailableLabel(["Vaste vrije dag (MA)", "ziek"], true)).toBe("geen werkdag (rooster), Ziek");
  });
});

describe("case display/search", () => {
  it("trims and collapses spaces without mutating source", () => {
    const project = { case_nummer: "0291829 ", station_naam: " SPEKHOEK   Terwolde " };
    expect(caseTitle(project)).toBe("0291829 · SPEKHOEK Terwolde");
    expect(project.station_naam).toBe(" SPEKHOEK   Terwolde ");
    expect(caseTitle({ case_nummer: "  ", station_naam: null })).toBe("Geen casenummer · Naamloos station");
  });
  it.each([["0318773", "318773"], ["318773", "0318773"], ["HELLENB.STRAAT", "hellenb straat"], ["SPEKHOEK-Térwolde", "spekhoek terwolde"], ["Apeldoorn", "APELDOORN"]])("finds %s with %s", (text, term) => {
    expect(matchesSearch(text, term)).toBe(true);
  });
  it("handles zero numeric runs and genuine no-results", () => {
    expect(normalizeForSearch("000. 001-0308029")).toBe("10308029");
    expect(matchesSearch("Smart Infra", "zzzz")).toBe(false);
    expect(matchesSearch("Smart Infra", "")).toBe(true);
  });
});

describe("Cases sections and week options", () => {
  it("maps the existing sort rank, with status taking priority over next planning", () => {
    const next = { kind: "next", date: new Date(), week: 41 } as const;
    expect(caseSection({ status: "gepland", label: next })).toBe("Komende planning");
    expect(caseSection({ status: "gepland", label: { kind: "past", date: new Date() } })).toBe("Afgelopen planning");
    expect(caseSection({ status: "concept", label: { kind: "none" } })).toBe("Zonder planning");
    expect(caseSection({ status: "on_hold", label: next })).toBe("On hold");
    expect(caseSection({ status: "afgerond", label: next })).toBe("Afgerond");
  });
  it("sorts current/future weeks first then descending past across years", () => {
    expect(sortCaseWeekOptions(["2026-40", "2027-01", "2026-44", "2025-52", "2026-41"], { jaar: 2026, week_nr: 41 })).toEqual(["2026-41", "2026-44", "2027-01", "2026-40", "2025-52"]);
  });
});
