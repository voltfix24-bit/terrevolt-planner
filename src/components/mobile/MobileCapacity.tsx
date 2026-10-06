import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { groupResourcesForWeek, matchesSearch, unitLabel } from "@/lib/mobile-ux";
import { capacityForWeek, mobileWeekSequence, monteurWeekStates } from "@/lib/mobile-planning";
import { addIsoWeeks, getMondayOfWeek } from "@/lib/planning-types";
import { CellLegend, MobileSearchEmpty, MobileDataGate, SwipeArea } from "./MobileShared";
import { useMobilePlanningData } from "./useMobilePlanningData";
import { MobileWeekNavigation } from "./MobileWeekNavigation";
import { ResourceWeekList } from "./ResourceWeekList";
import { useMobileWeekView } from "./useMobileWeekView";

export function MobileCapacity() {
  const data = useMobilePlanningData(); const [count, setCount] = useState(8);
  const { params, selected, query, open, mode, update } = useMobileWeekView();
  const focusId = params.get("monteur"); const [highlight, setHighlight] = useState<string | null>(null);
  useEffect(() => {
    if (!focusId || !data.hasData || !data.monteurs.some((m) => m.id === focusId)) return;
    update({ open: focusId, mode: "week", query: "" }); setHighlight(focusId);
    const timer = window.setTimeout(() => document.getElementById(`mobile-monteur-${focusId}`)?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 150);
    const end = window.setTimeout(() => setHighlight(null), 2500);
    return () => { window.clearTimeout(timer); window.clearTimeout(end); };
  }, [focusId, data.hasData]);
  const selectedDays = data.activeDaysByWeek.get(`${selected.jaar}-${selected.week_nr}`) ?? [];
  const cap = useMemo(() => capacityForWeek(selectedDays, selected.jaar, selected.week_nr, data.monteurs, data.absences, data.holidays), [selectedDays, selected.jaar, selected.week_nr, data.monteurs, data.absences, data.holidays]);
  const states = useMemo(() => monteurWeekStates(selectedDays, selected.jaar, selected.week_nr, data.monteurs, data.absences, data.holidays), [selectedDays, selected.jaar, selected.week_nr, data.monteurs, data.absences, data.holidays]);
  const groups = useMemo(() => groupResourcesForWeek(data.monteurs, states, (m) => !query.trim() || matchesSearch(m.naam, query)), [data.monteurs, states, query]);
  const move = (delta: number) => update({ week: addIsoWeeks(selected.jaar, selected.week_nr, delta), open: null });
  const weeks = useMemo(() => mobileWeekSequence(getMondayOfWeek(selected.week_nr, selected.jaar), count).map((week) => ({ ...week, cap: capacityForWeek(data.activeDaysByWeek.get(`${week.jaar}-${week.week_nr}`) ?? [], week.jaar, week.week_nr, data.monteurs, data.absences, data.holidays) })), [selected.jaar, selected.week_nr, count, data.activeDaysByWeek, data.monteurs, data.absences, data.holidays]);
  if (!data.hasData) return <MobileDataGate data={data} />;
  return <MobileDataGate data={data}><div className="space-y-4">
    <h1 className="font-display text-xl font-bold">Capaciteit</h1>
    <MobileWeekNavigation selected={selected} onMove={move} onSelect={(week) => update({ week, open: null })}>
      <div className="grid grid-cols-2 rounded-lg bg-muted p-1" role="tablist" aria-label="Capaciteitsweergave">{(["week", "overview"] as const).map((value) => <Button variant="ghost" key={value} role="tab" aria-selected={mode === value} onClick={() => update({ mode: value, open: null })} className={`h-11 ${mode === value ? "bg-card text-primary-text shadow-sm" : "text-muted-foreground"}`}>{value === "week" ? "Weekkalender" : "Komende weken"}</Button>)}</div>
    </MobileWeekNavigation>
    {mode === "week" ? <>
      <div className="grid grid-cols-4 gap-1 border-y border-border py-3 text-center">{([[cap.available, "beschikbaar"], [cap.plannedUnique, "ingepland"], [cap.free, "vrij"], [cap.conflicts, "conflicten"]] as const).map(([value, kind]) => <div key={kind} className={kind === "conflicten" && value > 0 ? "text-destructive-text" : "text-foreground"}><strong className="block text-lg">{value}</strong><span className="text-[10px] text-muted-foreground">{unitLabel("week", kind)}</span></div>)}</div>
      {cap.overplannedUnavailable > 0 && <p className="text-xs text-destructive-text">{cap.overplannedUnavailable} ingepland terwijl niet beschikbaar</p>}
      {cap.days.filter((day) => day.holidayName).map((day) => <p key={day.dayIndex} className="text-xs text-muted-foreground">{day.date.toLocaleDateString("nl-NL", { weekday: "long" })}: {day.holidayName}</p>)}
      <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input className="h-11 pl-9 pr-11" value={query} onChange={(e) => update({ query: e.target.value })} placeholder="Zoek monteur" aria-label="Monteur zoeken" />{query && <Button variant="ghost" onClick={() => update({ query: "" })} aria-label="Zoekopdracht wissen" className="absolute right-0 top-0 h-11 w-11 p-0"><X className="h-4 w-4" /></Button>}</div>
      <CellLegend />
      <SwipeArea onSwipe={move} label="Capaciteit weekkalender"><div className="space-y-2">{query.trim() && !Object.values(groups).some((list) => list.length) ? <MobileSearchEmpty term={query} onClear={() => update({ query: "" })} /> : <ResourceWeekList groups={groups} states={states} data={data} highlight={highlight} open={open} setOpen={(open) => update({ open })} />}</div></SwipeArea>
    </> : <>
      <div className="grid grid-cols-3 rounded-lg bg-muted p-1">{[6, 8, 12].map((n) => <Button variant="ghost" key={n} className={`min-h-11 ${count === n ? "bg-card text-primary-text shadow-sm" : "text-muted-foreground"}`} onClick={() => setCount(n)}>{n} weken</Button>)}</div>
      {weeks.map(({ jaar, week_nr, cap }) => <article key={`${jaar}-${week_nr}`} className="overflow-hidden rounded-lg border border-border bg-card"><Button variant="ghost" className="block h-auto min-h-11 w-full whitespace-normal p-4 text-left font-normal" aria-label={`Bekijk week ${week_nr} in weekkalender`} onClick={() => { update({ week: { jaar, week_nr }, mode: "week", open: null }); window.scrollTo({ top: 0 }); }}>
        <div className="flex items-center justify-between gap-2"><div><strong>Week {week_nr}</strong><p className="text-xs text-muted-foreground">vanaf {getMondayOfWeek(week_nr, jaar).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}</p></div><div className="flex items-center gap-2">{cap.conflicts > 0 && <span className="flex items-center gap-1 text-xs font-semibold text-destructive-text"><AlertTriangle className="h-4 w-4" />{cap.conflicts}</span>}<strong>{cap.percentage}%</strong><ChevronRight className="h-5 w-5" /></div></div>
        <div className="mt-3 h-2 overflow-hidden rounded bg-muted"><div className={`h-full ${cap.percentage > 100 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, cap.percentage)}%` }} /></div>
        <p className="mt-2 text-xs text-muted-foreground">{cap.plannedUnique} ingepland · {cap.free} vrij · {cap.available} mandagen beschikbaar</p><p className="mt-1 text-xs font-medium text-primary-text">Bekijk week</p>
      </Button></article>)}
    </>}
  </div></MobileDataGate>;
}
