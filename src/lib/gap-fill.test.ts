import { describe, it, expect } from "vitest";
import { decideGapFill, GAP_FILL_MAX_WEEKS } from "./gap-fill";

describe("decideGapFill", () => {
  it("staat normale projecten (≤ 104w) toe", () => {
    const r = decideGapFill(5, 30);
    expect(r.allow).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it("blokkeert extreem grote span (zoals Lordensweg 1013w)", () => {
    const r = decideGapFill(969, 1013);
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/1013 weken/);
    expect(r.reason).toMatch(/max 104/);
  });

  it("staat exact de drempel toe", () => {
    expect(decideGapFill(50, GAP_FILL_MAX_WEEKS).allow).toBe(true);
  });

  it("blokkeert net boven de drempel", () => {
    expect(decideGapFill(50, GAP_FILL_MAX_WEEKS + 1).allow).toBe(false);
  });

  it("doet niets als er niets te fillen valt", () => {
    expect(decideGapFill(0, 50).allow).toBe(false);
    expect(decideGapFill(0, 5000).allow).toBe(false);
  });

  it("respecteert een custom max", () => {
    expect(decideGapFill(10, 60, 50).allow).toBe(false);
    expect(decideGapFill(10, 60, 100).allow).toBe(true);
  });

  it("rapporteert missing en span altijd", () => {
    const r = decideGapFill(700, 1013);
    expect(r.missing).toBe(700);
    expect(r.span).toBe(1013);
  });
});
