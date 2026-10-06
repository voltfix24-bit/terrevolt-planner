import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMondayOfWeek, isoWeekPartsOf } from "@/lib/planning-types";
import type { IsoWeek } from "@/lib/mobile-planning";
import { formatShort } from "./MobileShared";

export function MobileWeekNavigation({ selected, onMove, onSelect }: { selected: IsoWeek; onMove: (delta: number) => void; onSelect: (week: IsoWeek) => void }) {
  const monday = getMondayOfWeek(selected.week_nr, selected.jaar);
  const friday = new Date(monday); friday.setDate(friday.getDate() + 4);
  return <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between gap-1 border-y border-border bg-background/95 px-1 py-1 backdrop-blur">
    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => onMove(-1)} aria-label="Vorige week"><ChevronLeft /></Button>
    <Button variant="ghost" className="h-11 min-w-0 flex-1 px-1" onClick={() => onSelect(isoWeekPartsOf(new Date()))} aria-label="Naar huidige week"><span className="text-center"><strong className="block text-sm">Week {selected.week_nr} · {selected.jaar}</strong><span className="block text-xs text-muted-foreground">{formatShort(monday)}–{formatShort(friday)}</span></span></Button>
    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => onMove(1)} aria-label="Volgende week"><ChevronRight /></Button>
  </div>;
}