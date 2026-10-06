import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { swipeDirection } from "@/lib/mobile-planning";
import type { MobilePlanningData } from "./useMobilePlanningData";

export function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export function OfflineNotice() {
  const online = useOnline();
  if (online) return null;
  return <div role="status" className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
    <WifiOff className="h-4 w-4 shrink-0" />Geen verbinding — planning kan verouderd zijn
  </div>;
}

/** "Bijgewerkt HH:MM" + vernieuwknop (≥44px). */
export function FreshnessBar({ data }: { data: Pick<MobilePlanningData, "lastUpdated" | "fetching" | "refresh" | "error"> }) {
  return <div className="space-y-2">
    <OfflineNotice />
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span aria-live="polite">{data.error ? "Vernieuwen mislukt" : data.lastUpdated ? `Bijgewerkt ${data.lastUpdated.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}` : "Laden…"}</span>
      <button type="button" onClick={data.refresh} disabled={data.fetching} aria-label="Planning vernieuwen" className="flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-muted disabled:opacity-60">
        <RefreshCw className={`h-4 w-4 ${data.fetching ? "animate-spin" : ""}`} />
      </button>
    </div>
  </div>;
}

/** Horizontale swipe op content; verticaal scrollen en tikken blijven werken. */
export function SwipeArea({ onSwipe, children, label }: { onSwipe: (direction: -1 | 1) => void; children: ReactNode; label?: string }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return <div
    aria-label={label}
    style={{ touchAction: "pan-y" }}
    onTouchStart={(e) => { const t = e.touches[0]; start.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null; }}
    onTouchEnd={(e) => {
      const s = start.current; start.current = null; if (!s) return;
      const t = e.changedTouches[0]; const dir = swipeDirection(t.clientX - s.x, t.clientY - s.y);
      if (dir !== 0) onSwipe(dir);
    }}
    onTouchCancel={() => { start.current = null; }}
  >{children}</div>;
}

export function StatusChip({ status }: { status: string | null }) {
  if (!status) return null;
  const hold = status === "on_hold";
  return <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-semibold uppercase ${hold ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>{hold ? "On hold" : status.replace("_", " ")}</span>;
}

export const DAY_LABELS = ["MA", "DI", "WO", "DO", "VR"] as const;
export const DAY_NAMES = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"] as const;

export function formatShort(date: Date) {
  return date.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

export function DesktopOnly({ title }: { title: string }) {
  return <div className="mx-auto max-w-sm space-y-2 py-16 text-center">
    <h1 className="font-display text-xl font-bold">{title}</h1>
    <p className="text-sm text-muted-foreground">Dit onderdeel bevat beheer- en bewerkfuncties en is alleen beschikbaar op desktop.</p>
  </div>;
}

/** Compacte actualiteit voor de sticky weekbalk: HH:MM + vernieuwen (44px). */
export function FreshnessCompact({ data }: { data: Pick<MobilePlanningData, "lastUpdated" | "fetching" | "refresh" | "error"> }) {
  const online = useOnline();
  const time = data.lastUpdated ? data.lastUpdated.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "…";
  return <button type="button" onClick={data.refresh} disabled={data.fetching} aria-label={`Planning vernieuwen, bijgewerkt ${time}`} className={`flex h-11 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium ${!online || data.error ? "text-destructive" : "text-muted-foreground"} disabled:opacity-60`}>
    {!online ? <WifiOff className="h-3.5 w-3.5" /> : <RefreshCw className={`h-3.5 w-3.5 ${data.fetching ? "animate-spin" : ""}`} />}<span>{time}</span>
  </button>;
}

/** Operationele toestanden van compacte dagcellen. */
export const CELL_TONE = {
  planned: "bg-primary/15 text-foreground",
  free: "border border-dashed border-border bg-background text-muted-foreground",
  unavailable: "bg-muted text-foreground/80 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,hsl(var(--border))_6px_7px)]",
  conflict: "bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive",
} as const;

export function CellLegend({ withUnavailable = true }: { withUnavailable?: boolean }) {
  const items: [keyof typeof CELL_TONE, string][] = [["planned", "Gepland"], ["free", "Vrij"], ...(withUnavailable ? [["unavailable", "Niet beschikbaar"] as [keyof typeof CELL_TONE, string]] : []), ["conflict", "Conflict"]];
  return <ul aria-label="Legenda" className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">{items.map(([k, l]) => <li key={k} className="flex items-center gap-1"><span className={`h-3 w-3 rounded-sm ${CELL_TONE[k]}`} aria-hidden="true" />{l}</li>)}</ul>;
}
