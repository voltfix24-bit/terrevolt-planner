import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { capacityForWeek, mobileWeekSequence, monteurWeekStates, type IsoWeek } from "@/lib/mobile-planning";
import { addIsoWeeks, getMondayOfWeek, isoWeekPartsOf } from "@/lib/planning-types";
import { FreshnessBar, SwipeArea } from "./MobileShared";
import { useMobilePlanningData } from "./useMobilePlanningData";

import { Button } from "@/components/ui/button";
import { MobileWeekNavigation } from "./MobileWeekNavigation";
import { MonteurWeekCard } from "./MobileWeekCards";

export function MobileCapacity() {
  const data = useMobilePlanningData(); const [count, setCount] = useState(8); const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<"week" | "overview">("week");
  const [selected, setSelected] = useState<IsoWeek>(() => isoWeekPartsOf(new Date()));
  const [openMonteur, setOpenMonteur] = useState<string | null>(null);
  const selectedDays = useMemo(() => data.activeDaysByWeek.get(`${selected.jaar}-${selected.week_nr}`) ?? [], [data.activeDaysByWeek, selected]);
  const selectedCapacity = useMemo(() => capacityForWeek(selectedDays, selected.jaar, selected.week_nr, data.monteurs, data.absences, data.holidays), [selectedDays, selected, data.monteurs, data.absences, data.holidays]);
  const states = useMemo(() => monteurWeekStates(selectedDays, selected.jaar, selected.week_nr, data.monteurs, data.absences, data.holidays), [selectedDays, selected, data.monteurs, data.absences, data.holidays]);
  const move = (delta: number) => { setSelected((week) => addIsoWeeks(week.jaar, week.week_nr, delta)); setOpenMonteur(null); setOpen(null); };
  const weeks = useMemo(() => mobileWeekSequence(getMondayOfWeek(selected.week_nr, selected.jaar), count).map((w) => {
    const days = data.activeDaysByWeek.get(`${w.jaar}-${w.week_nr}`) ?? [];
    return { ...w, days, cap: capacityForWeek(days, w.jaar, w.week_nr, data.monteurs, data.absences, data.holidays, data.onHoldProjectIds) };
  }), [count, selected, data.activeDaysByWeek, data.monteurs, data.absences, data.holidays, data.onHoldProjectIds]);
  const names = data.monteurNameById; const caseLabel = (id: string) => data.projectById.get(id)?.case_nummer || data.projectById.get(id)?.station_naam || "Case";

  return <div className="space-y-4">
    <h1 className="font-display text-2xl font-bold">Capaciteit</h1>
    <MobileWeekNavigation selected={selected} onMove={move} onSelect={(week) => { setSelected(week); setOpenMonteur(null); setOpen(null); }} />
    <div className="grid grid-cols-2 rounded-lg bg-muted p-1" role="tablist" aria-label="Capaciteitsweergave">{(["week", "overview"] as const).map((value) => <Button variant="ghost" key={value} role="tab" aria-selected={mode === value} onClick={() => { setMode(value); setOpenMonteur(null); }} className={`h-11 ${mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>{value === "week" ? "Weekkalender" : "Komende weken"}</Button>)}</div>
    {mode === "week" ? <>
      <div className="grid grid-cols-4 gap-1 border-y border-border py-3 text-center">{[[selectedCapacity.available, "beschikbaar"], [selectedCapacity.plannedUnique, "ingepland"], [selectedCapacity.free, "vrij"], [selectedCapacity.conflicts, "conflicten"]].map(([value, label]) => <div key={label} className={label === "conflicten" && selectedCapacity.conflicts > 0 ? "text-destructive" : "text-foreground"}><strong className="block text-lg">{value}</strong><span className="text-[10px] text-muted-foreground">{label}</span></div>)}</div>
      {selectedCapacity.overplannedUnavailable > 0 && <p className="text-xs text-destructive">{selectedCapacity.overplannedUnavailable} ingepland terwijl niet beschikbaar</p>}
      {selectedCapacity.days.filter((day) => day.holidayName).map((day) => <p key={day.dayIndex} className="text-xs text-muted-foreground">{day.date.toLocaleDateString("nl-NL", { weekday: "long" })}: {day.holidayName}</p>)}
      <SwipeArea onSwipe={move} label="Capaciteit weekkalender"><div className="space-y-2">{data.loading ? <p className="py-12 text-center text-sm text-muted-foreground">Capaciteit laden…</p> : data.monteurs.map((monteur) => <MonteurWeekCard key={monteur.id} name={monteur.naam} states={states.get(monteur.id) ?? []} data={data} open={openMonteur === monteur.id} onToggle={() => setOpenMonteur(openMonteur === monteur.id ? null : monteur.id)} />)}</div></SwipeArea>
    </> : <>
    <div className="grid grid-cols-3 rounded-lg bg-muted p-1">{[6, 8, 12].map((n) => <Button variant="ghost" key={n} className={`min-h-11 rounded-md text-sm font-medium ${count === n ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => setCount(n)}>{n} weken</Button>)}</div>
    {data.loading ? <p className="py-12 text-center text-sm text-muted-foreground">Capaciteit laden…</p> : weeks.map(({ jaar, week_nr, days, cap }) => {
      const key = `${jaar}-${week_nr}`; const monday = getMondayOfWeek(week_nr, jaar);
      const active = days;
      const byDay = new Map<number, typeof days>(); for (const day of active) { const list = byDay.get(day.dayIndex) ?? []; list.push(day); byDay.set(day.dayIndex, list); }
      return <article key={key} className="overflow-hidden rounded-lg border border-border bg-card">
        <Button variant="ghost" className="block h-auto min-h-11 w-full whitespace-normal p-4 text-left font-normal" onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}>
          <div className="flex items-center justify-between gap-2"><div><strong>Week {week_nr}</strong><p className="text-xs text-muted-foreground">vanaf {monday.toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}</p></div>
            <div className="flex items-center gap-2">{cap.conflicts > 0 && <span className="flex items-center gap-1 rounded bg-destructive/15 px-2 py-1 text-xs font-semibold text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{cap.conflicts} {cap.conflicts === 1 ? "conflict" : "conflicten"}</span>}<strong>{cap.percentage}%</strong><ChevronDown className={`h-5 w-5 transition-transform ${open === key ? "rotate-180" : ""}`} /></div></div>
          <div className="mt-3 h-2 overflow-hidden rounded bg-muted"><div className={`h-full ${cap.percentage > 100 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, cap.percentage)}%` }} /></div>
          <p className="mt-2 text-xs text-muted-foreground">{cap.plannedUnique} ingepland · {cap.free} vrij · {cap.available} beschikbaar{cap.overplannedUnavailable ? ` · ${cap.overplannedUnavailable} ingepland terwijl afwezig` : ""}</p>
        </Button>
        {open === key && <div className="divide-y divide-border border-t border-border">{cap.days.map((day) => {
          const items = byDay.get(day.dayIndex) ?? [];
          return <div key={day.dayIndex} className="p-4">
            <strong className="text-sm capitalize">{day.date.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "short" })}</strong>
            {day.holidayName && <p className="mt-1 text-xs font-semibold text-primary">Feestdag: {day.holidayName}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{day.available} beschikbaar · {day.plannedUnique} ingepland · {day.free} vrij{day.unavailableMonteurIds.length ? ` · ${day.unavailableMonteurIds.length} onbeschikbaar` : ""}</p>
            {day.conflicts.map((c) => <p key={c.monteurId} className="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">⚠ {names.get(c.monteurId) ?? "Monteur"} dubbel: {c.projectIds.map(caseLabel).join(" + ")}</p>)}
            {day.overplannedUnavailable > 0 && <p className="mt-2 text-xs text-destructive">Ingepland maar niet beschikbaar: {day.plannedMonteurIds.filter((id) => !day.availableMonteurIds.includes(id)).map((id) => names.get(id)).filter(Boolean).join(", ")}</p>}
            {items.length ? items.map((d) => <p key={d.cellId} className="mt-2 text-xs"><span className="font-medium">{d.monteurIds.map((id) => names.get(id)).filter(Boolean).join(", ") || "Geen ploeg"}</span><span className="text-muted-foreground"> · {caseLabel(d.projectId)} · {d.activity}</span></p>) : <p className="mt-2 text-xs text-muted-foreground">Niets ingepland</p>}
            {day.available > 0 && <p className="mt-2 text-xs text-muted-foreground">Vrij: {day.freeMonteurIds.map((id) => names.get(id)).filter(Boolean).join(", ") || "niemand"}</p>}
          </div>;
        })}</div>}
      </article>;
    })}
    </>}
    <FreshnessBar data={data} />
    <p className="pb-2 text-center text-xs text-muted-foreground">Beheer van monteurs, ploegen en vrije dagen is beschikbaar op desktop.</p>
  </div>;
}
