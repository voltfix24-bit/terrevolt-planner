import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMondayOfWeek, isoWeekPartsOf } from "@/lib/planning-types";
import type { IsoWeek } from "@/lib/mobile-planning";
import { DAY_LABELS, formatShort } from "./MobileShared";

/** Compacte sticky weekbalk onder de vaste topbalk (h-12): week, pijlen en optionele toggle. */
export function MobileWeekNavigation({ selected, onMove, onSelect, dayHeader = false, selectedDay = null, children }: { dayHeader?: boolean; selectedDay?: number | null; selected: IsoWeek; onMove: (delta: number) => void; onSelect: (week: IsoWeek) => void; children?: ReactNode }) {
  const monday = getMondayOfWeek(selected.week_nr, selected.jaar);
  const current = isoWeekPartsOf(new Date()); const isCurrent = current.jaar === selected.jaar && current.week_nr === selected.week_nr;
  const friday = new Date(monday); friday.setDate(friday.getDate() + 4);
  return <div data-testid="mobile-week-toolbar" className="sticky top-12 z-20 -mx-3 space-y-1 border-b border-border bg-background/95 px-3 py-1 backdrop-blur">
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => onMove(-1)} aria-label="Vorige week"><ChevronLeft /></Button>
      <Button variant="ghost" className="h-11 min-w-0 flex-1 px-1" onClick={() => onSelect(isoWeekPartsOf(new Date()))} aria-label="Naar huidige week"><span className="text-center"><strong className="block text-sm">Week {selected.week_nr} · {selected.jaar}</strong><span className="block text-xs text-muted-foreground">{formatShort(monday)}–{formatShort(friday)}</span></span></Button>
      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => onMove(1)} aria-label="Volgende week"><ChevronRight /></Button>
    </div>
    <div className="flex justify-center">{isCurrent ? <span className="rounded bg-primary/10 px-2 py-1 text-[11px] text-primary-text">Deze week</span> : <Button variant="link" className="min-h-11 px-2 text-xs text-primary-text" onClick={() => onSelect(current)}>Naar deze week</Button>}</div>
    {children}
    {dayHeader && <div data-testid="mobile-day-header" className="grid grid-cols-5 gap-1 px-[5px] py-1">{DAY_LABELS.map((label, index) => { const date = new Date(monday); date.setDate(date.getDate() + index); return <span key={label} data-day-heading={index} className={`text-center text-[11px] font-semibold ${selectedDay === index ? "rounded bg-primary/15 text-primary-text" : "text-muted-foreground"}`}>{label} {date.getDate()}</span>; })}</div>}
  </div>;
}
