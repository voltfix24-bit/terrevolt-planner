import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { capacityForWeek, mobileWeekSequence } from "@/lib/mobile-planning";
import { getMondayOfWeek } from "@/lib/planning-types";
import { FreshnessBar } from "./MobileShared";
import { useMobilePlanningData } from "./useMobilePlanningData";

export function MobileCapacity() {
  const data = useMobilePlanningData(); const [count, setCount] = useState(8); const [open, setOpen] = useState<string | null>(null);
  const weeks = useMemo(() => mobileWeekSequence(new Date(), count).map((w) => {
    const days = data.daysByWeek.get(`${w.jaar}-${w.week_nr}`) ?? [];
    return { ...w, days, cap: capacityForWeek(days, w.jaar, w.week_nr, data.monteurs, data.absences, data.holidays, data.onHoldProjectIds) };
  }), [count, data.daysByWeek, data.monteurs, data.absences, data.holidays, data.onHoldProjectIds]);
  const names = data.monteurNameById; const caseLabel = (id: string) => data.projectById.get(id)?.case_nummer || data.projectById.get(id)?.station_naam || "Case";

  return <div className="space-y-4">
    <div><h1 className="font-display text-2xl font-bold">Capaciteit</h1><p className="text-sm text-muted-foreground">Bezetting en vrije ruimte per week</p></div>
    <div className="grid grid-cols-3 rounded-lg bg-muted p-1">{[6, 8, 12].map((n) => <button key={n} className={`min-h-11 rounded-md text-sm font-medium ${count === n ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => setCount(n)}>{n} weken</button>)}</div>
    {data.loading ? <p className="py-12 text-center text-sm text-muted-foreground">Capaciteit laden…</p> : weeks.map(({ jaar, week_nr, days, cap }) => {
      const key = `${jaar}-${week_nr}`; const monday = getMondayOfWeek(week_nr, jaar);
      const active = days.filter((d) => !data.onHoldProjectIds.has(d.projectId));
      return <article key={key} className="overflow-hidden rounded-lg border border-border bg-card">
        <button className="min-h-11 w-full p-4 text-left" onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}>
          <div className="flex items-center justify-between gap-2"><div><strong>Week {week_nr}</strong><p className="text-xs text-muted-foreground">vanaf {monday.toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}</p></div>
            <div className="flex items-center gap-2">{cap.conflicts > 0 && <span className="flex items-center gap-1 rounded bg-destructive/15 px-2 py-1 text-xs font-semibold text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{cap.conflicts} {cap.conflicts === 1 ? "conflict" : "conflicten"}</span>}<strong>{cap.percentage}%</strong><ChevronDown className={`h-5 w-5 transition-transform ${open === key ? "rotate-180" : ""}`} /></div></div>
          <div className="mt-3 h-2 overflow-hidden rounded bg-muted"><div className={`h-full ${cap.percentage > 100 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, cap.percentage)}%` }} /></div>
          <p className="mt-2 text-xs text-muted-foreground">{cap.plannedUnique} ingepland · {cap.free} vrij · {cap.available} beschikbaar{cap.overplannedUnavailable ? ` · ${cap.overplannedUnavailable} ingepland terwijl afwezig` : ""}</p>
        </button>
        {open === key && <div className="divide-y divide-border border-t border-border">{cap.days.map((day) => {
          const items = active.filter((d) => d.dayIndex === day.dayIndex);
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
    <FreshnessBar data={data} />
    <p className="pb-2 text-center text-xs text-muted-foreground">Beheer van monteurs, ploegen en vrije dagen is beschikbaar op desktop.</p>
  </div>;
}
