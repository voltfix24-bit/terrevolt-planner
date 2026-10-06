import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMondayOfWeek, isoWeekPartsOf } from "@/lib/planning-types";
import type { IsoWeek } from "@/lib/mobile-planning";
import { FreshnessCompact, formatShort } from "./MobileShared";
import type { MobilePlanningData } from "./useMobilePlanningData";

/** Compacte sticky weekbalk onder de vaste topbalk (h-12): week, pijlen, actualiteit en optionele toggle. */
export function MobileWeekNavigation({ selected, onMove, onSelect, data, children }: { selected: IsoWeek; onMove: (delta: number) => void; onSelect: (week: IsoWeek) => void; data?: Pick<MobilePlanningData, "lastUpdated" | "fetching" | "refresh" | "error">; children?: ReactNode }) {
  const monday = getMondayOfWeek(selected.week_nr, selected.jaar);
  const friday = new Date(monday); friday.setDate(friday.getDate() + 4);
  return <div data-testid="mobile-week-toolbar" className="sticky top-12 z-20 -mx-4 space-y-1 border-b border-border bg-background/95 px-4 py-1 backdrop-blur">
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => onMove(-1)} aria-label="Vorige week"><ChevronLeft /></Button>
      <Button variant="ghost" className="h-11 min-w-0 flex-1 px-1" onClick={() => onSelect(isoWeekPartsOf(new Date()))} aria-label="Naar huidige week"><span className="text-center"><strong className="block text-sm">Week {selected.week_nr} · {selected.jaar}</strong><span className="block text-xs text-muted-foreground">{formatShort(monday)}–{formatShort(friday)}</span></span></Button>
      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => onMove(1)} aria-label="Volgende week"><ChevronRight /></Button>
      {data && <FreshnessCompact data={data} />}
    </div>
    {children}
  </div>;
}
