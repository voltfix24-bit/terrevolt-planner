import { describe, it, expect } from "vitest";
import { decideImpactWarning } from "./urenboek-impact-dialog";
import type { ImpactResult } from "./urenboek-impact";

function r(
  external_id: string,
  status: ImpactResult["status"],
  uren_totaal = 0,
  status_uren: ImpactResult["status_uren"] = "geen",
): ImpactResult {
  return { external_id, status, uren_totaal, status_uren, laatste_boeking_at: null };
}

describe("decideImpactWarning", () => {
  it("returns geen when all niet_gesynced", () => {
    const d = decideImpactWarning([r("a:1", "niet_gesynced"), r("a:2", "niet_gesynced")]);
    expect(d.severity).toBe("geen");
    expect(d.needsConfirm).toBe(false);
  });

  it("returns geen for empty input", () => {
    expect(decideImpactWarning([]).severity).toBe("geen");
  });

  it("returns info when at least one gesynced_geen_uren and no higher", () => {
    const d = decideImpactWarning([r("a:1", "niet_gesynced"), r("a:2", "gesynced_geen_uren")]);
    expect(d.severity).toBe("info");
    expect(d.needsConfirm).toBe(true);
  });

  it("escalates to sterk when uren_geregistreerd present", () => {
    const d = decideImpactWarning([
      r("a:1", "gesynced_geen_uren"),
      r("a:2", "uren_geregistreerd", 4.5, "ingediend"),
    ]);
    expect(d.severity).toBe("sterk");
    expect(d.uren_totaal).toBe(4.5);
    expect(d.status_uren).toBe("ingediend");
  });

  it("sums uren_totaal and merges mixed status_uren", () => {
    const d = decideImpactWarning([
      r("a:1", "uren_geregistreerd", 2, "concept"),
      r("a:2", "uren_geregistreerd", 3, "goedgekeurd"),
    ]);
    expect(d.severity).toBe("sterk");
    expect(d.uren_totaal).toBe(5);
    expect(d.status_uren).toBe("gemengd");
  });

  it("prefers sterk over onbekend", () => {
    const d = decideImpactWarning([
      r("a:1", "onbekend"),
      r("a:2", "uren_geregistreerd", 1, "concept"),
    ]);
    expect(d.severity).toBe("sterk");
  });

  it("returns fail_safe when only onbekend (no uren)", () => {
    const d = decideImpactWarning([r("a:1", "onbekend"), r("a:2", "niet_gesynced")]);
    expect(d.severity).toBe("fail_safe");
    expect(d.needsConfirm).toBe(true);
  });

  it("counts statuses correctly", () => {
    const d = decideImpactWarning([
      r("a:1", "niet_gesynced"),
      r("a:2", "gesynced_geen_uren"),
      r("a:3", "uren_geregistreerd", 1, "concept"),
      r("a:4", "onbekend"),
    ]);
    expect(d.counts).toEqual({
      niet_gesynced: 1,
      gesynced_geen_uren: 1,
      uren_geregistreerd: 1,
      onbekend: 1,
    });
  });
});
