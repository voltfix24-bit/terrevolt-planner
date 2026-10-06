import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { capacityForWeek } from "@/lib/mobile-planning";
import { getMondayOfWeek, isoWeekPartsOf } from "@/lib/planning-types";
import { useMobilePlanningData } from "./useMobilePlanningData";

const labels = ["Ma", "Di", "Wo", "Do", "Vr"];
export function MobileToday() {
  const navigate = useNavigate(); const data = useMobilePlanningData(); const now = new Date(); const current = isoWeekPartsOf(now); const monday = getMondayOfWeek(current.week_nr, current.jaar);
  const initialDay = Math.min(4, Math.max(0, (now.getDay() + 6) % 7)); const [dayIndex, setDayIndex] = useState(initialDay);
  const projects = new Map(data.projects.map((p) => [p.id, p])); const clients = new Map(data.opdrachtgevers.map((o) => [o.id, o.naam])); const names = new Map(data.monteurs.map((m) => [m.id, m.naam]));
  const selectedDays = useMemo(() => data.days.filter((d) => d.year === current.jaar && d.week === current.week_nr && d.dayIndex === dayIndex), [data.days, current.jaar, current.week_nr, dayIndex]);
  const grouped = [...new Set(selectedDays.map((d) => d.projectId))].map((id) => ({ project: projects.get(id), days: selectedDays.filter((d) => d.projectId === id) })).filter((x) => x.project);
  const cap = capacityForWeek(data.days, current.jaar, current.week_nr, data.monteurs.map((m) => m.id), new Set(data.projects.filter((p) => p.status === "on_hold").map((p) => p.id)));
  const date = new Date(monday); date.setDate(date.getDate() + dayIndex);
  return <div className="space-y-4"><div><h1 className="font-display text-2xl font-bold">Vandaag</h1><p className="text-sm capitalize text-muted-foreground">{date.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</p></div>
    <div className="grid grid-cols-5 gap-1">{labels.map((label, index) => { const d = new Date(monday); d.setDate(d.getDate() + index); return <button key={label} onClick={() => setDayIndex(index)} className={`min-h-14 rounded-md text-center ${dayIndex === index ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}><strong className="block text-xs">{label}</strong><span className="text-xs">{d.getDate()}</span></button>; })}</div>
    <section className="rounded-lg border border-border bg-card p-4"><div className="flex justify-between"><span className="text-sm font-medium">Capaciteit week {current.week_nr}</span><span className="text-sm font-bold">{cap.percentage}% bezet</span></div><div className="mt-2 h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(100, cap.percentage)}%` }}/></div><p className="mt-2 text-xs text-muted-foreground">{cap.planned} ingepland · {cap.free} vrij van {cap.available} monteur-dagen</p></section>
    {data.loading ? <p className="py-10 text-center text-sm text-muted-foreground">Vandaag laden…</p> : grouped.length === 0 ? <p className="rounded-lg border border-border bg-card py-12 text-center text-sm text-muted-foreground">Geen projecten gepland op deze dag</p> : grouped.map(({ project, days }) => project && <button key={project.id} onClick={() => navigate(`/projecten/${project.id}`)} className="w-full rounded-lg border border-border bg-card p-4 text-left"><div className="flex items-start justify-between gap-2"><strong>{project.case_nummer || "Geen casenummer"} · {project.station_naam || "Naamloos station"}</strong><span className="rounded bg-muted px-2 py-1 text-[10px] uppercase">{project.status?.replace("_", " ")}</span></div><p className="mt-1 text-xs text-muted-foreground">{project.opdrachtgever_id ? clients.get(project.opdrachtgever_id) : "Geen opdrachtgever"}</p><div className="mt-3 space-y-2">{days.map((d) => <div key={d.cellId}><span className="text-sm font-medium">{d.activity}</span><p className="text-sm text-muted-foreground">{d.monteurIds.map((id) => names.get(id)).filter(Boolean).join(", ") || "Nog geen monteurs"}</p></div>)}</div></button>)}
  </div>;
}