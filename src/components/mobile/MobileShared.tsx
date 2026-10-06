import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { freshnessLabel, mobileDataState } from "@/lib/mobile-ux";
import { useMobilePlanningData } from "./useMobilePlanningData";
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

/** Eén gate: lege staten en KPI's mogen alleen na succesvolle data. */
export function MobileDataGate({ data, children }: { data: Pick<MobilePlanningData, "hasData" | "error" | "lastUpdated" | "fetching" | "refresh">; children?: ReactNode }) {
  const online = useOnline();
  const state = mobileDataState(data.hasData, data.error, online);
  if (state === "loading") return <p role="status" className="py-12 text-center text-sm text-muted-foreground">Planning laden…</p>;
  if (state === "error") return <section role="alert" className="space-y-3 rounded-lg border border-border bg-card p-4">
    <h1 className="font-display text-lg font-bold">Planning niet geladen</h1>
    <p className="text-sm text-muted-foreground">{online ? "Server niet bereikbaar" : "Geen verbinding"}</p>
    <Button variant="outline" className="min-h-11" onClick={data.refresh} disabled={data.fetching}><RefreshCw className={`mr-2 h-4 w-4 ${data.fetching ? "animate-spin" : ""}`} />Opnieuw proberen</Button>
  </section>;
  return <>{state === "stale" && <div role="status" className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-warning-text/40 bg-warning/10 px-3 py-2 text-warning-text">
    <div className="min-w-0 text-xs font-medium">{!online && <span className="mb-1 flex items-center gap-1"><WifiOff className="h-4 w-4" />Geen verbinding</span>}Niet vernieuwd — je ziet gegevens van {freshnessLabel(data.lastUpdated)}</div>
    <Button variant="ghost" className="min-h-11 shrink-0 px-2 text-warning-text" onClick={data.refresh} disabled={data.fetching}>Opnieuw</Button>
  </div>}{children}</>;
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
  return <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-semibold uppercase ${hold ? "bg-destructive/15 text-destructive-text" : "bg-muted text-muted-foreground"}`}>{hold ? "On hold" : status.replace("_", " ")}</span>;
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

/** Actualiteit wordt uitsluitend door de mobiele topbar gemount. */
export function MobileTopbarFreshness() {
  const data = useMobilePlanningData();
  return <FreshnessCompact data={data} />;
}

export function FreshnessCompact({ data }: { data: Pick<MobilePlanningData, "lastUpdated" | "fetching" | "refresh" | "error"> }) {
  const online = useOnline();
  const [, tick] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => tick((n) => n + 1), 60_000); return () => window.clearInterval(timer); }, []);
  const time = freshnessLabel(data.lastUpdated);
  return <Button variant="ghost" onClick={data.refresh} disabled={data.fetching} aria-label={`Planning vernieuwen, bijgewerkt ${time}${!online ? ", geen verbinding" : ""}`} className={`h-11 min-w-11 shrink-0 gap-1 px-1 text-[11px] font-medium ${!online ? "text-destructive-text" : data.error ? "text-warning-text" : "text-muted-foreground"} disabled:opacity-60`}>
    {!online ? <WifiOff className="h-3.5 w-3.5" /> : <RefreshCw className={`h-3.5 w-3.5 ${data.fetching ? "animate-spin" : ""}`} />}<span>{time}</span>
  </Button>;
}

/** Operationele toestanden van compacte dagcellen. */
export const CELL_TONE = {
  planned: "bg-primary/15 text-foreground",
  free: "border border-dashed border-border bg-background text-muted-foreground",
  unavailable: "bg-muted text-foreground/80 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,hsl(var(--border))_6px_7px)]",
  conflict: "bg-destructive/10 text-destructive-text ring-1 ring-inset ring-destructive-text",
} as const;

export function CellLegend({ withUnavailable = true }: { withUnavailable?: boolean }) {
  const items: [keyof typeof CELL_TONE, string][] = [["planned", "Gepland"], ["free", "Vrij"], ...(withUnavailable ? [["unavailable", "Niet beschikbaar"] as [keyof typeof CELL_TONE, string]] : []), ["conflict", "Conflict"]];
  return <ul aria-label="Legenda" className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">{items.map(([k, l]) => <li key={k} className="flex items-center gap-1"><span className={`h-3 w-3 rounded-sm ${CELL_TONE[k]}`} aria-hidden="true" />{l}</li>)}</ul>;
}


export function MobileSearchEmpty({ term, onClear }: { term: string; onClear: () => void }) {
  return <div role="status" className="space-y-2 py-8 text-center text-sm text-muted-foreground"><p className="break-words">Geen resultaat voor '{term}'</p><Button variant="outline" className="min-h-11" onClick={onClear}>Wissen</Button></div>;
}
