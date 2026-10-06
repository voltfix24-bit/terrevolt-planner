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
