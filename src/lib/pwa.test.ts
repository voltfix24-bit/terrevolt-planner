import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isServiceWorkerAllowed } from "./pwa-register";

describe("PWA manifest", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
  it("is installable as standalone TerreVolt app starting at /overzicht", () => {
    expect(manifest).toMatchObject({ name: "TerreVolt Planner", short_name: "TerreVolt", display: "standalone", start_url: "/overzicht" });
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });
});

describe("service worker guard", () => {
  const prod = { prod: true, inIframe: false };
  it("only registers on the published production host", () => {
    expect(isServiceWorkerAllowed({ hostname: "planning-terrevolt.lovable.app", search: "" }, prod)).toBe(true);
    expect(isServiceWorkerAllowed({ hostname: "id-preview--abc.lovable.app", search: "" }, prod)).toBe(false);
    expect(isServiceWorkerAllowed({ hostname: "x.lovableproject.com", search: "" }, prod)).toBe(false);
    expect(isServiceWorkerAllowed({ hostname: "planning-terrevolt.lovable.app", search: "?sw=off" }, prod)).toBe(false);
    expect(isServiceWorkerAllowed({ hostname: "planning-terrevolt.lovable.app", search: "" }, { prod: false, inIframe: false })).toBe(false);
    expect(isServiceWorkerAllowed({ hostname: "planning-terrevolt.lovable.app", search: "" }, { prod: true, inIframe: true })).toBe(false);
  });
});
