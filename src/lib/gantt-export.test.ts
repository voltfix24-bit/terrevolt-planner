import { describe, expect, it } from "vitest";
import {
  assertClientSafeExport,
  buildExportPages,
  buildGanttHtml,
  chunkWeken,
  filterProjectsForExport,
  groupProjectsByOpdrachtgever,
  paginateProjectRows,
  type GanttActiviteit,
  type GanttProject,
} from "./gantt-export";

const project = (id: string, opdrachtgeverId: string | null, naam: string | null): GanttProject => ({
  id, case_nummer: id, station_naam: id, wv_naam: null,
  opdrachtgever_id: opdrachtgeverId, opdrachtgever_naam: naam,
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
