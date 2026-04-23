import { describe, it, expect } from "vitest";
import {
  buildMonteurDayProjects,
  buildDayConflictMonteurs,
  buildMonteurSlotDubbel,
  buildMonteurSlotProjects,
  dayKey,
  type CelInput,
} from "./conflict-aggregation";

// Helpers voor het bouwen van dayKeyToSlot mappings in verschillende
// weergaven (maand = 1 slot per dag, kwartaal = 1 slot per week, jaar =
// 1 slot per maand-achtig blok).
function maandSlots(weekNrs: number[]): Map<string, number> {
  // Elke (week, dag) krijgt zijn eigen slot.
  const m = new Map<string, number>();
  let i = 0;
  for (const w of weekNrs) {
    for (let d = 0; d < 5; d++) {
      m.set(dayKey(w, d), i++);
    }
  }
  return m;
}

function kwartaalSlots(weekNrs: number[]): Map<string, number> {
  // Alle dagen binnen dezelfde week vallen in hetzelfde slot.
  const m = new Map<string, number>();
  weekNrs.forEach((w, idx) => {
    for (let d = 0; d < 5; d++) {
      m.set(dayKey(w, d), idx);
    }
  });
  return m;
}

function jaarSlots(weekGroups: number[][]): Map<string, number> {
  // Groepen weken (bv. een maand) vallen samen in één slot.
  const m = new Map<string, number>();
  weekGroups.forEach((weeks, idx) => {
    for (const w of weeks) {
      for (let d = 0; d < 5; d++) {
        m.set(dayKey(w, d), idx);
      }
    }
  });
  return m;
}

describe("conflict-aggregation", () => {
  describe("buildMonteurDayProjects", () => {
    it("groepeert projecten per monteur per dag", () => {
      const cellen: CelInput[] = [
        { id: "c1", activiteit_id: "a1", week_nr: 10, dag_index: 0, project_id: "P1", monteur_ids: ["m1"] },
        { id: "c2", activiteit_id: "a2", week_nr: 10, dag_index: 0, project_id: "P2", monteur_ids: ["m1"] },
        { id: "c3", activiteit_id: "a3", week_nr: 10, dag_index: 1, project_id: "P1", monteur_ids: ["m1"] },
      ];
      const result = buildMonteurDayProjects(cellen);
      const byDay = result.get("m1")!;
      expect(Array.from(byDay.get(dayKey(10, 0))!)).toEqual(
        expect.arrayContaining(["P1", "P2"]),
      );
      expect(byDay.get(dayKey(10, 0))!.size).toBe(2);
      expect(Array.from(byDay.get(dayKey(10, 1))!)).toEqual(["P1"]);
    });

    it("negeert cellen zonder monteurs", () => {
      const cellen: CelInput[] = [
        { id: "c1", activiteit_id: "a1", week_nr: 10, dag_index: 0, project_id: "P1", monteur_ids: [] },
      ];
      expect(buildMonteurDayProjects(cellen).size).toBe(0);
    });
  });

  describe("buildDayConflictMonteurs", () => {
    it("markeert alleen dagen met ≥2 projecten voor dezelfde monteur", () => {
      const cellen: CelInput[] = [
        { id: "c1", activiteit_id: "a1", week_nr: 10, dag_index: 0, project_id: "P1", monteur_ids: ["m1"] },
        { id: "c2", activiteit_id: "a2", week_nr: 10, dag_index: 0, project_id: "P2", monteur_ids: ["m1"] },
        { id: "c3", activiteit_id: "a3", week_nr: 10, dag_index: 1, project_id: "P1", monteur_ids: ["m1"] },
      ];
      const conflicts = buildDayConflictMonteurs(buildMonteurDayProjects(cellen));
      expect(conflicts.get(dayKey(10, 0))?.has("m1")).toBe(true);
      expect(conflicts.has(dayKey(10, 1))).toBe(false);
    });

    it("ziet hetzelfde project meerdere keren op één dag NIET als conflict", () => {
      const cellen: CelInput[] = [
        { id: "c1", activiteit_id: "a1", week_nr: 10, dag_index: 0, project_id: "P1", monteur_ids: ["m1"] },
        { id: "c2", activiteit_id: "a2", week_nr: 10, dag_index: 0, project_id: "P1", monteur_ids: ["m1"] },
      ];
      const conflicts = buildDayConflictMonteurs(buildMonteurDayProjects(cellen));
      expect(conflicts.size).toBe(0);
    });
  });

  describe("buildMonteurSlotDubbel - regressie kwartaal/jaar weergave", () => {
    // Kernscenario van de bug: één monteur werkt MA op project P1 en
    // DI op project P2, in dezelfde week. In maandweergave is dat geen
    // conflict (verschillende dag-slots). In kwartaal/jaar valt het in
    // hetzelfde slot maar mag het ook NIET als dubbel gemarkeerd worden.
    const verdeeldOverDagen: CelInput[] = [
      { id: "c1", activiteit_id: "a1", week_nr: 10, dag_index: 0, project_id: "P1", monteur_ids: ["m1"] },
      { id: "c2", activiteit_id: "a2", week_nr: 10, dag_index: 1, project_id: "P2", monteur_ids: ["m1"] },
    ];

    it("maand: geen dubbel-markering als projecten op verschillende dagen vallen", () => {
      const slots = maandSlots([10]);
      const dubbel = buildMonteurSlotDubbel(
        buildDayConflictMonteurs(buildMonteurDayProjects(verdeeldOverDagen)),
        slots,
      );
      expect(dubbel.get("m1")?.size ?? 0).toBe(0);
    });

    it("kwartaal: geen dubbel-markering als projecten op verschillende dagen vallen (zelfde week)", () => {
      const slots = kwartaalSlots([10]);
      const dubbel = buildMonteurSlotDubbel(
        buildDayConflictMonteurs(buildMonteurDayProjects(verdeeldOverDagen)),
        slots,
      );
      expect(dubbel.get("m1")?.size ?? 0).toBe(0);
    });

    it("jaar: geen dubbel-markering als projecten op verschillende dagen/weken binnen één maand vallen", () => {
      const cellen: CelInput[] = [
        { id: "c1", activiteit_id: "a1", week_nr: 10, dag_index: 0, project_id: "P1", monteur_ids: ["m1"] },
        { id: "c2", activiteit_id: "a2", week_nr: 11, dag_index: 2, project_id: "P2", monteur_ids: ["m1"] },
        { id: "c3", activiteit_id: "a3", week_nr: 12, dag_index: 4, project_id: "P3", monteur_ids: ["m1"] },
      ];
      const slots = jaarSlots([[10, 11, 12, 13]]);
      const dubbel = buildMonteurSlotDubbel(
        buildDayConflictMonteurs(buildMonteurDayProjects(cellen)),
        slots,
      );
      // In het oude (foute) gedrag zou dit slot 0 markeren omdat er
      // 3 projecten in vallen. In het nieuwe gedrag: 0 conflicten.
      expect(dubbel.get("m1")?.size ?? 0).toBe(0);
    });

    it("kwartaal: WÉL dubbel-markering als 2 projecten op exact dezelfde dag staan", () => {
      const cellen: CelInput[] = [
        { id: "c1", activiteit_id: "a1", week_nr: 10, dag_index: 0, project_id: "P1", monteur_ids: ["m1"] },
        { id: "c2", activiteit_id: "a2", week_nr: 10, dag_index: 0, project_id: "P2", monteur_ids: ["m1"] },
      ];
      const slots = kwartaalSlots([10]);
      const dubbel = buildMonteurSlotDubbel(
        buildDayConflictMonteurs(buildMonteurDayProjects(cellen)),
        slots,
      );
      expect(dubbel.get("m1")?.has(0)).toBe(true);
    });

    it("jaar: WÉL dubbel-markering als binnen het maand-slot één dag een echt conflict heeft", () => {
      const cellen: CelInput[] = [
        { id: "c1", activiteit_id: "a1", week_nr: 10, dag_index: 0, project_id: "P1", monteur_ids: ["m1"] },
        { id: "c2", activiteit_id: "a2", week_nr: 11, dag_index: 2, project_id: "P2", monteur_ids: ["m1"] },
        // Echt conflict op week 12 dag 1: zowel P3 als P4
        { id: "c3", activiteit_id: "a3", week_nr: 12, dag_index: 1, project_id: "P3", monteur_ids: ["m1"] },
        { id: "c4", activiteit_id: "a4", week_nr: 12, dag_index: 1, project_id: "P4", monteur_ids: ["m1"] },
      ];
      const slots = jaarSlots([[10, 11, 12, 13]]);
      const dubbel = buildMonteurSlotDubbel(
        buildDayConflictMonteurs(buildMonteurDayProjects(cellen)),
        slots,
      );
      expect(dubbel.get("m1")?.has(0)).toBe(true);
    });

    it("verschillende monteurs worden los beoordeeld", () => {
      const cellen: CelInput[] = [
        { id: "c1", activiteit_id: "a1", week_nr: 10, dag_index: 0, project_id: "P1", monteur_ids: ["m1"] },
        { id: "c2", activiteit_id: "a2", week_nr: 10, dag_index: 0, project_id: "P2", monteur_ids: ["m2"] },
      ];
      const slots = kwartaalSlots([10]);
      const dubbel = buildMonteurSlotDubbel(
        buildDayConflictMonteurs(buildMonteurDayProjects(cellen)),
        slots,
      );
      expect(dubbel.get("m1")?.size ?? 0).toBe(0);
      expect(dubbel.get("m2")?.size ?? 0).toBe(0);
    });
  });

  describe("buildMonteurSlotProjects", () => {
    it("verzamelt alle projecten per slot voor de niet-conflict weergave", () => {
      const cellen: CelInput[] = [
        { id: "c1", activiteit_id: "a1", week_nr: 10, dag_index: 0, project_id: "P1", monteur_ids: ["m1"] },
        { id: "c2", activiteit_id: "a2", week_nr: 10, dag_index: 1, project_id: "P2", monteur_ids: ["m1"] },
        { id: "c3", activiteit_id: "a3", week_nr: 10, dag_index: 2, project_id: "P1", monteur_ids: ["m1"] },
      ];
      const slots = kwartaalSlots([10]);
      const result = buildMonteurSlotProjects(
        buildMonteurDayProjects(cellen),
        slots,
      );
      const slot0 = result.get("m1")!.get(0)!;
      expect(slot0.size).toBe(2);
      expect(slot0.has("P1")).toBe(true);
      expect(slot0.has("P2")).toBe(true);
    });
  });
});
