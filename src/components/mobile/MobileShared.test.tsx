import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileDataGate } from "./MobileShared";
import { useIsMobile } from "@/hooks/use-mobile";

const data = (hasData = false, error: string | null = null) => ({ hasData, error, fetching: false, lastUpdated: hasData ? new Date() : null, refresh: vi.fn() });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("MobileDataGate", () => {
  it("hides empty states and KPIs before the first success", () => {
    render(<MobileDataGate data={data()}><p>0 mandagen · Geen cases gevonden</p></MobileDataGate>);
    expect(screen.getByText("Planning laden…")).toBeInTheDocument();
    expect(screen.queryByText(/0 mandagen/)).not.toBeInTheDocument();
  });
  it("shows a retryable server failure instead of false emptiness", () => {
    const state = data(false, "failed");
    render(<MobileDataGate data={state}><p>Case niet gevonden</p></MobileDataGate>);
    expect(screen.getByText("Planning niet geladen")).toBeInTheDocument();
    expect(screen.getByText("Server niet bereikbaar")).toBeInTheDocument();
    expect(screen.queryByText("Case niet gevonden")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw proberen" }));
    expect(state.refresh).toHaveBeenCalledOnce();
  });
  it("retains prior data under the stale banner and retries", () => {
    const state = data(true, "failed");
    render(<MobileDataGate data={state}><p>12 mandagen</p></MobileDataGate>);
    expect(screen.getByText(/Niet vernieuwd — je ziet gegevens van/)).toBeInTheDocument();
    expect(screen.getByText("12 mandagen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw" }));
    expect(state.refresh).toHaveBeenCalledOnce();
  });
  it("responds to offline and reconnect without hiding cached data", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<MobileDataGate data={data(true)}><p>Gecachte planning</p></MobileDataGate>);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByText("Geen verbinding")).toBeInTheDocument();
    expect(screen.getByText("Gecachte planning")).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event("online")));
    expect(screen.queryByText(/Niet vernieuwd/)).not.toBeInTheDocument();
  });
  it("shows an offline initial failure even when the query is paused", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<MobileDataGate data={data()}><p>Geen cases gevonden</p></MobileDataGate>);
    expect(screen.getByText("Geen verbinding")).toBeInTheDocument();
    expect(screen.queryByText("Geen cases gevonden")).not.toBeInTheDocument();
  });
  it("allows genuine empty data after success", () => {
    render(<MobileDataGate data={data(true)}><p>Geen actieve planning</p></MobileDataGate>);
    expect(screen.getByText("Geen actieve planning")).toBeInTheDocument();
    expect(screen.queryByText("Planning laden…")).not.toBeInTheDocument();
  });
});

describe("first render mobile detection", () => {
  function Probe() { return <p>{useIsMobile() ? "mobile" : "desktop"}</p>; }
  it.each([[390, "mobile"], [767, "mobile"], [768, "desktop"], [1280, "desktop"]])("uses width %s synchronously", (width, expected) => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(width);
    render(<Probe />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});