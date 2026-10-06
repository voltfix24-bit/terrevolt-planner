import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addIsoWeeks, getMondayOfWeek, isoWeekPartsOf } from "@/lib/planning-types";
import { useMobilePlanningData } from "./useMobilePlanningData";

const labels = ["MA", "DI", "WO", "DO", "VR"];
export function MobileWeekPlanning() {
  const navigate = useNavigate(); const data = useMobilePlanningData();
  const initial = isoWeekPartsOf(new Date()); const [selected, setSelected] = useState(initial); const [query, setQuery] = useState(""); const [open, setOpen] = useState<string | null>(null);
  const monday = getMondayOfWeek(selected.week_nr, selected.jaar); const friday = new Date(monday); friday.setDate(friday.getDate() + 4);
  const opdrachtgeverById = new Map(data.opdrachtgevers.map((o) => [o.id, o.naam])); const monteurById = new Map(data.monteurs.map((m) => [m.id, m.naam]));
  const rows = useMemo(() => data.projects.flatMap((project) => {
    const days = data.days.filter((d) => d.projectId === project.id && d.year === selected.jaar && d.week === selected.week_nr);
    const haystack = `${project.case_nummer ?? ""} ${project.station_naam ?? ""} ${project.opdrachtgever_id ? opdrachtgeverById.get(project.opdrachtgever_id) ?? "" : ""}`.toLowerCase();
    return days.length && haystack.includes(query.toLowerCase()) ? [{ project, days }] : [];
  }), [data.days, data.projects, query, selected.jaar, selected.week_nr, data.opdrachtgevers]);
  const move = (delta: number) => setSelected(addIsoWeeks(selected.jaar, selected.week_nr, delta));
  return <div className="space-y-4">
    <div><h1 className="font-display text-2xl font-bold">Planning</h1><p className="text-sm text-muted-foreground">Alle ingeplande cases per werkdag</p></div>
    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-1">
      <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => move(-1)} aria-label="Vorige week"><ChevronLeft /></Button>
      <button className="min-h-11 px-2 text-center" onClick={() => setSelected(isoWeekPartsOf(new Date()))}><strong className="block text-sm">Week {selected.week_nr}</strong><span className="text-xs text-muted-foreground">{monday.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}–{friday.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</span></button>
      <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => move(1)} aria-label="Volgende week"><ChevronRight /></Button>
    </div>
    <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"/><Input className="h-11 pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek case, station of opdrachtgever"/></div>
    {data.loading ? <p className="py-12 text-center text-sm text-muted-foreground">Planning laden…</p> : rows.length === 0 ? <p className="rounded-lg border border-border bg-card py-12 text-center text-sm text-muted-foreground">Geen planning in deze week</p> : rows.map(({ project, days }) => <article key={project.id} className="overflow-hidden rounded-lg border border-border bg-card">
      <button className="flex min-h-14 w-full items-center gap-3 px-4 text-left" onClick={() => setOpen(open === project.id ? null : project.id)}>
        <span className="min-w-0 flex-1"><strong className="block truncate">{project.case_nummer || "Geen casenummer"} · {project.station_naam || "Naamloos station"}</strong><span className="block truncate text-xs text-muted-foreground">{project.opdrachtgever_id ? opdrachtgeverById.get(project.opdrachtgever_id) : "Geen opdrachtgever"}</span></span><ChevronDown className={`h-5 w-5 transition-transform ${open === project.id ? "rotate-180" : ""}`}/>
      </button>
      <div className="grid grid-cols-5 gap-1 border-y border-border px-3 py-2">{labels.map((label, i) => <div key={label} className={`flex h-10 flex-col items-center justify-center rounded ${days.some((d) => d.dayIndex === i) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><span className="text-[10px] font-bold">{label}</span><span className="text-xs">{new Date(monday.getTime() + i * 86400000).getDate()}</span></div>)}</div>
      {open === project.id && <div className="divide-y divide-border">{days.map((day) => <div key={day.cellId} className="px-4 py-3"><div className="flex justify-between gap-3"><strong className="text-sm">{labels[day.dayIndex]} {day.date.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</strong><span className="text-xs text-muted-foreground">{day.activity}</span></div><p className="mt-1 text-sm text-muted-foreground">{day.monteurIds.map((id) => monteurById.get(id)).filter(Boolean).join(", ") || "Nog geen monteurs"}</p></div>)}</div>}
      <button className="min-h-11 w-full px-4 text-left text-sm font-medium text-primary" onClick={() => navigate(`/projecten/${project.id}`)}>Case bekijken</button>
    </article>)}
  </div>;
}