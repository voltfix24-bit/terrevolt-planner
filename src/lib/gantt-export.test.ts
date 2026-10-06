import { describe, expect, it } from "vitest";
import {
  assertClientSafeExport,
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