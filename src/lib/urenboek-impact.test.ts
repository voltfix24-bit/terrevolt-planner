import { describe, expect, it } from "vitest";
import {
  buildExternalId,
  buildExternalIdsForCell,
  dedupeExternalIds,
  summarizeImpact,
  type ImpactResult,
} from "./urenboek-impact";

const row = (overrides: Partial<ImpactResult>): ImpactResult => ({
  external_id: "cel-1:monteur-1",
  status: "niet_gesynced",
  uren_totaal: 0,
  status_uren: "geen",
  laatste_boeking_at: null,
  ...overrides,
});

describe("urenboek impact", () => {
  it("builds the same external_id format as the urenboek sync", () => {
    expect(buildExternalId("cel-123", "monteur-456")).toBe("cel-123:monteur-456");
    expect(buildExternalIdsForCell("cel-123", ["m1", "m1", "m2"])).toEqual([
      "cel-123:m1",
      "cel-123:m2",
    ]);
  });

  it("deduplicates ids while keeping the first order", () => {
    expect(dedupeExternalIds([" a:b ", "c:d", "a:b", "", "c:d"])).toEqual(["a:b", "c:d"]);
  });

  it("marks unsynced rows as safe", () => {
    const summary = summarizeImpact([row({ external_id: "a:b" })]);

    expect(summary.level).toBe("safe");
    expect(summary.requiresConfirmation).toBe(false);
    expect(summary.totalIds).toBe(1);
  });

  it("requires a light confirmation when rows are synced without hours", () => {
    const summary = summarizeImpact([
      row({ external_id: "a:b", status: "gesynced_geen_uren" }),
      row({ external_id: "c:d", status: "niet_gesynced" }),
    ]);

    expect(summary.level).toBe("warning");
    expect(summary.requiresConfirmation).toBe(true);
    expect(summary.syncedCount).toBe(1);
  });

  it("requires a strong confirmation when hours are registered", () => {
    const summary = summarizeImpact([
      row({ external_id: "a:b", status: "uren_geregistreerd", uren_totaal: 8, status_uren: "concept" }),
      row({ external_id: "c:d", status: "uren_geregistreerd", uren_totaal: 4.5, status_uren: "goedgekeurd" }),
    ]);

    expect(summary.level).toBe("strong");
    expect(summary.requiresConfirmation).toBe(true);
    expect(summary.totalHours).toBe(12.5);
    expect(summary.bookedCount).toBe(2);
    expect(summary.statuses).toEqual(["concept", "goedgekeurd"]);
    expect(summary.description).toContain("12.5 uur");
  });

  it("treats unknown impact as fail-safe confirmation", () => {
    const summary = summarizeImpact([
      row({ external_id: "a:b", status: "onbekend" }),
      row({ external_id: "c:d", status: "gesynced_geen_uren" }),
    ]);

    expect(summary.level).toBe("unknown");
    expect(summary.requiresConfirmation).toBe(true);
    expect(summary.unknownCount).toBe(1);
  });
});
