import { describe, expect, it } from "vitest";
import { TERREVOLT_ICON_DATA_URI } from "./brand-assets";
import {
  assertClientSafeExport,
  buildExportPages,
  buildGanttHtml,
  chunkWeken,
  filterProjectsForExport,
  groupProjectsByOpdrachtgever,
  paginateProjectRows,
  sortProjectsByFirstPlannedDate,
  type GanttCel,
  type GanttActiviteit,
  type GanttProject,
} from "./gantt-export";

const project = (id: string, opdrachtgeverId: string | null, naam: string | null): GanttProject => ({
  id, case_nummer: id, station_naam: id, wv_naam: null,
  opdrachtgever_id: opdrachtgeverId, opdrachtgever_naam: naam,
});

describe("Gantt chronological order and brand", () => {
  const weeks = [{ week_nr: 43, jaar: 2026 }, { week_nr: 44, jaar: 2026 }];
  const activities = ["A", "B", "C"].map((id) => ({ id: `act-${id}`, project_id: id, naam: id, positie: 0 }));
  const cell = (id: string, week: number, day = 0): GanttCel => ({
    project_id: id, activiteit_id: `act-${id}`, week_nr: week, dag_index: day, kleur_code: "c5", monteur_ids: [],
  });
  const projects = [project("A", "c", "Client"), project("B", "c", "Client"), project("C", "c", "Client")];
  const htmlFor = (items: GanttProject[], cells: GanttCel[], mode: "intern" | "opdrachtgever" = "opdrachtgever") => buildGanttHtml({
    titel: "Planning", weken: weeks, projecten: items, activiteiten: activities, cellen: cells,
    monteurs: [], monteurWeergave: "geen", exportMode: mode, opdrachtgeverId: "c", opdrachtgeverNaam: "Client",
  });

  it("sorts by the first selected planned weekday without mutating inputs", () => {
    const cells = [cell("A", 44), cell("B", 43, 2)];
    const snapshot = JSON.stringify({ projects, activities, cells, weeks });
    expect(sortProjectsByFirstPlannedDate(projects, activities, cells, weeks).map((p) => p.id)).toEqual(["B", "A", "C"]);
    expect(sortProjectsByFirstPlannedDate([...projects].reverse(), activities, cells, weeks).map((p) => p.id)).toEqual(["B", "A", "C"]);
    expect(JSON.stringify({ projects, activities, cells, weeks })).toBe(snapshot);
    const html = htmlFor(projects, cells);
    expect(html.indexOf("B — B")).toBeLessThan(html.indexOf("A — A"));
  });

  it("ignores outside-period cells and non-workday indexes", () => {
    expect(sortProjectsByFirstPlannedDate(projects, activities, [cell("A", 42), cell("A", 43, 5), cell("B", 44)], weeks).map((p) => p.id)).toEqual(["B", "A", "C"]);
  });

  it("breaks equal dates by case number, then station, retaining exact ties", () => {
    const sameCase = projects.map((p) => ({ ...p, case_nummer: "001", station_naam: p.id === "A" ? "Zulu" : "Alpha" }));
    const cells = projects.map((p) => cell(p.id, 43));
    expect(sortProjectsByFirstPlannedDate([...projects].reverse(), activities, cells, weeks).map((p) => p.id)).toEqual(["A", "B", "C"]);
    expect(sortProjectsByFirstPlannedDate(sameCase, activities, cells, weeks).map((p) => p.id)).toEqual(["B", "C", "A"]);
  });

  it("retains customer groups while ordering projects inside each group", () => {
    const grouped = [{ ...projects[0], opdrachtgever_naam: "Alfa" }, { ...projects[2], opdrachtgever_id: "other", opdrachtgever_naam: "Beta" }, { ...projects[1], opdrachtgever_naam: "Alfa" }];
    const html = htmlFor(grouped, [cell("C", 43), cell("A", 44), cell("B", 43, 2)], "intern");
    expect(html.indexOf("B — B")).toBeLessThan(html.indexOf("A — A"));
    expect(html.indexOf("A — A")).toBeLessThan(html.indexOf("C — C"));
    expect(html).toContain("Opdrachtgever · Beta");
  });

  it("keeps global order across horizontal chunks instead of re-sorting each chunk", () => {
    const allWeeks = Array.from({ length: 8 }, (_, i) => ({ week_nr: 43 + i, jaar: 2026 }));
    const cells = [cell("A", 43), cell("B", 44), cell("C", 49), cell("A", 50), cell("B", 49, 2)];
    const ordered = sortProjectsByFirstPlannedDate([...projects].reverse(), activities, cells, allWeeks);
    const pages = buildExportPages(ordered, activities, cells, allWeeks, "standaard");
    expect(pages[0].rows.map((r) => r.project.id)).toEqual(["A", "B"]);
    expect(pages[1].rows.map((r) => r.project.id)).toEqual(["A", "B", "C"]);
  });

  it("uses real calendar dates across an ISO-year boundary", () => {
    expect(sortProjectsByFirstPlannedDate(projects, activities, [cell("A", 1), cell("B", 53, 4)], [{ week_nr: 53, jaar: 2026 }, { week_nr: 1, jaar: 2027 }]).map((p) => p.id)).toEqual(["B", "A", "C"]);
  });

  it("renders the existing proportional icon on every page without the old mark", () => {
    const html = htmlFor(projects, [cell("A", 43)]);
    expect(html).toContain(`<img class="brand-logo" src="${TERREVOLT_ICON_DATA_URI}"`);
    expect(html).not.toContain("brand-mark");
    expect(html).toContain("object-fit:contain");
    expect(html).toContain("<strong>TERREVOLT</strong><small>Projectplanning</small>");
    expect(html).toContain("@page{size:A3 landscape;margin:9mm}");
    const multipage = buildGanttHtml({ titel: "T", weken: Array.from({ length: 8 }, (_, i) => ({ week_nr: 43 + i, jaar: 2026 })), projecten: projects, activiteiten: activities, cellen: [cell("A", 43), cell("B", 50)], monteurs: [], monteurWeergave: "geen", exportMode: "intern" });
    expect(multipage.match(/<img class="brand-logo"/g)).toHaveLength(2);
  });
});

describe("Gantt export safety", () => {
  const projects = [project("a", "client-a", "A"), project("b", "client-b", "B"), project("c", null, null)];

  it("keeps only the selected opdrachtgever in client mode", () => {
    expect(filterProjectsForExport(projects, "opdrachtgever", "client-a").map((item) => item.id)).toEqual(["a"]);
  });

  it("never includes a project without opdrachtgever in client mode", () => {
    expect(filterProjectsForExport(projects, "opdrachtgever", "client-a")).not.toContainEqual(expect.objectContaining({ id: "c" }));
    expect(() => assertClientSafeExport([projects[0], projects[2]], "client-a")).toThrow(/geblokkeerd/);
  });

  it("blocks mixed client data before rendering any HTML", () => {
    expect(() => buildGanttHtml({
      titel: "Klantplanning",
      weken: [{ week_nr: 40, jaar: 2026 }],
      projecten: [projects[0], projects[1]],
      activiteiten: [], monteurs: [], cellen: [], monteurWeergave: "geen",
      exportMode: "opdrachtgever", opdrachtgeverId: "client-a", opdrachtgeverNaam: "A",
    })).toThrow(/geblokkeerd/);
  });

  it("groups internal projects by opdrachtgever and puts missing last", () => {
    expect(groupProjectsByOpdrachtgever(projects).map((group) => group.opdrachtgever)).toEqual(["A", "B", "Geen opdrachtgever"]);
  });
});

describe("Gantt pagination", () => {
  it.each([4, 6, 8] as const)("chunks weeks in blocks of %i", (size) => {
    expect(chunkWeken([1, 2, 3, 4, 5, 6, 7, 8, 9], size).map((chunk) => chunk.length)).toEqual(
      size === 4 ? [4, 4, 1] : size === 6 ? [6, 3] : [8, 1],
    );
  });

  it("keeps a project header with activities and repeats it after a split", () => {
    const projects = [project("p", "client", "Client")];
    const activities: GanttActiviteit[] = Array.from({ length: 7 }, (_, index) => ({
      id: `a-${index}`, project_id: "p", naam: `Act ${index}`, positie: index,
    }));
    const pages = paginateProjectRows(projects, activities, 4);
    expect(pages).toHaveLength(3);
    expect(pages.every((page) => page[0].activiteiten.length > 0)).toBe(true);
    expect(pages.map((page) => page[0].continued)).toEqual([false, true, true]);
  });
});
describe("Gantt per-weekchunk pagination", () => {
  const act = (id: string, projectId: string): GanttActiviteit => ({ id, project_id: projectId, naam: id, positie: 0 });
  const cel = (projectId: string, activiteitId: string, week: number) => ({
    project_id: projectId, activiteit_id: activiteitId, week_nr: week, dag_index: 0, kleur_code: null, monteur_ids: [],
  });
  const weeks = Array.from({ length: 12 }, (_, i) => ({ week_nr: 40 + i, jaar: 2026 }));

  it("only shows projects in chunks where they have cells", () => {
    const pages = buildExportPages(
      [project("A", "c", "C"), project("B", "c", "C")],
      [act("a1", "A"), act("b1", "B")],
      [cel("A", "a1", 40), cel("B", "b1", 47)],
      weeks, "standaard",
    );
    expect(pages).toHaveLength(2);
    expect(pages[0].rows.map((r) => r.project.id)).toEqual(["A"]);
    expect(pages[1].rows.map((r) => r.project.id)).toEqual(["B"]);
  });

  it("renders a fully empty chunk as an empty page", () => {
    const pages = buildExportPages([project("A", "c", "C")], [act("a1", "A")], [cel("A", "a1", 40)], weeks, "standaard");
    expect(pages[1].rows).toEqual([]);
    const html = buildGanttHtml({
      titel: "T", weken: weeks, projecten: [project("A", "c", "C")], activiteiten: [act("a1", "A")],
      monteurs: [], cellen: [cel("A", "a1", 40)], monteurWeergave: "geen", exportMode: "intern",
    });
    expect(html).toContain("Geen planning in week 46–51");
    expect(html).toContain("Pagina 2 / 2");
  });

  it("keeps internal grouping after chunk filtering", () => {
    const ordered = groupProjectsByOpdrachtgever([
      project("x", null, null), project("b", "cb", "Beta"), project("a", "ca", "Alfa"), project("a2", "ca", "Alfa"),
    ]).flatMap((g) => g.projects);
    const pages = buildExportPages(
      ordered, [act("x1", "x"), act("b1", "b"), act("a1", "a"), act("a21", "a2")],
      [cel("x", "x1", 41), cel("b", "b1", 41), cel("a2", "a21", 41), cel("a", "a1", 48)],
      weeks, "standaard",
    );
    expect(pages[0].rows.map((r) => r.project.opdrachtgever_naam)).toEqual(["Alfa", "Beta", null]);
    expect(pages[1].rows.map((r) => r.project.id)).toEqual(["a"]);
  });
});
