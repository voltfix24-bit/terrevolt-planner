import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { capacityForWeek, groupDayBlocks }
import { formatWeekParam, nextActivePlanningAfter, unitLabel } from "@/lib/mobile-ux"; from "@/lib/mobile-planning";
import { getMondayOfWeek, isoWeekPartsOf } from "@/lib/planning-types";
import { DAY_LABELS, DAY_NAMES, FreshnessBar, StatusChip, SwipeArea } from "./MobileShared";
import { useMobilePlanningData } from "./useMobilePlanningData";

export function MobileToday() {
  const navigate = useNavigate(); const data = useMobilePlanningData();
  const now = new Date(); const current = isoWeekPartsOf(now); const monday = getMondayOfWeek(current.week_nr, current.jaar);
  const todayIndex = (now.getDay() + 6) % 7; const isWeekday = todayIndex <= 4;
  const initialDay = isWeekday ? todayIndex : 0;
  const [dayIndex, setDayIndex] = useState(initialDay);
  const weekDays = data.activeDaysByWeek.get(`${current.jaar}-${current.week_nr}`);
  const blocksByProject = useMemo(() => {
    const blocks = groupDayBlocks((weekDays ?? []).filter((d) => d.dayIndex === dayIndex));
    return blocks.filter((b) => data.projectById.has(b.projectId));
  }, [weekDays, dayIndex, data.projectById]);
  const cap = useMemo(() => capacityForWeek(weekDays ?? [], current.jaar, current.week_nr, data.monteurs, data.absences, data.holidays, data.onHoldProjectIds), [weekDays, current.jaar, current.week_nr, data.monteurs, data.absences, data.holidays, data.onHoldProjectIds]);
  const dayCap = cap.days[dayIndex];
  const date = new Date(monday); date.setDate(date.getDate() + dayIndex);
  const isToday = isWeekday && dayIndex === todayIndex;
  const knownIds = useMemo(() => new Set(data.projectById.keys()), [data.projectById]);
  const dateKey = date.toDateString();
  const next = useMemo(() => blocksByProject.length || data.loading ? null : nextActivePlanningAfter(data.days, new Date(dateKey), data.onHoldProjectIds, knownIds), [blocksByProject.length, data.loading, data.days, data.onHoldProjectIds, knownIds, dateKey]);
  const nextProject = next ? data.projectById.get(next.projectId) : undefined;
  const swipe = (dir: -1 | 1) => setDayIndex((i) => Math.min(4, Math.max(0, i + dir)));

  return <div className="space-y-4">
    <div className="flex items-start justify-between gap-2">
      <div><h1 className="font-display text-2xl font-bold">{isToday ? "Vandaag" : DAY_NAMES[dayIndex]}</h1><p className="text-sm capitalize text-muted-foreground">{date.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</p></div>
      {!isToday && isWeekday && <button type="button" onClick={() => setDayIndex(todayIndex)} className="min-h-11 rounded-md border border-border bg-card px-4 text-sm font-medium text-primary">Vandaag</button>}
    </div>
    <div className="grid grid-cols-5 gap-1" role="tablist" aria-label="Werkdag kiezen">{DAY_LABELS.map((label, index) => { const d = new Date(monday); d.setDate(d.getDate() + index); const active = dayIndex === index; return <button key={label} role="tab" aria-selected={active} onClick={() => setDayIndex(index)} className={`min-h-14 rounded-md text-center ${active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"} ${isWeekday && index === todayIndex && !active ? "ring-1 ring-primary" : ""}`}><strong className="block text-xs">{label}</strong><span className="text-xs">{d.getDate()}</span></button>; })}</div>
    <SwipeArea onSwipe={swipe} label="Veeg om van werkdag te wisselen">
      <div className="space-y-4">
        {dayCap && <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between"><span className="text-sm font-medium">Capaciteit {isToday ? "vandaag" : DAY_NAMES[dayIndex].toLowerCase()}</span>{dayCap.conflicts.length > 0 && <span className="flex items-center gap-1 text-xs font-semibold text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{dayCap.conflicts.length} {dayCap.conflicts.length === 1 ? "conflict" : "conflicten"}</span>}</div>
          {dayCap.holidayName && <p className="mt-1 text-xs font-medium text-primary">Feestdag: {dayCap.holidayName}</p>}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div><strong className="block text-lg">{dayCap.available}</strong><span className="text-[11px] text-muted-foreground">{unitLabel("day", "beschikbaar")}</span></div>
            <div><strong className="block text-lg">{dayCap.plannedUnique}</strong><span className="text-[11px] text-muted-foreground">{unitLabel("day", "ingepland")}</span></div>
            <div><strong className="block text-lg">{dayCap.free}</strong><span className="text-[11px] text-muted-foreground">{unitLabel("day", "vrij")}</span></div>
          </div>
          {dayCap.overplannedUnavailable > 0 && <p className="mt-2 text-xs text-destructive">{dayCap.overplannedUnavailable} ingepland terwijl niet beschikbaar</p>}
        </section>}
        {data.loading ? <p className="py-10 text-center text-sm text-muted-foreground">Planning laden…</p> : blocksByProject.length === 0 ? <div className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground"><p>Geen actieve projecten op deze dag</p>{next && nextProject ? <button type="button" onClick={() => navigate(`/plannen?week=${formatWeekParam({ jaar: next.year, week_nr: next.week })}`)} className="mt-3 min-h-11 w-full rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-left text-foreground"><span className="block text-xs text-muted-foreground">Eerstvolgende actieve planning</span><strong className="block text-sm"><span className="capitalize">{next.date.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })}</span> · {nextProject.case_nummer || "Case"} · {nextProject.station_naam || "Naamloos station"}{next.extraCases > 0 ? ` +${next.extraCases} cases` : ""}</strong><span className="block text-xs text-primary">Bekijk week {next.week}</span></button> : <p className="mt-2 text-xs">Geen toekomstige actieve planning gevonden</p>}</div> : blocksByProject.map((block) => { const project = data.projectById.get(block.projectId); if (!project) return null; return <button key={block.key} onClick={() => navigate(`/projecten/${project.id}`)} className="w-full rounded-lg border border-border bg-card p-4 text-left">
          <div className="flex items-start justify-between gap-2"><strong className="min-w-0">{project.case_nummer || "Geen casenummer"} · {project.station_naam || "Naamloos station"}</strong><StatusChip status={project.status} /></div>
          <p className="mt-1 text-xs text-muted-foreground">{project.opdrachtgever_id ? data.opdrachtgeverNameById.get(project.opdrachtgever_id) : "Geen opdrachtgever"}</p>
          <p className="mt-3 text-sm font-medium">{block.activities.join(" · ")}</p>
          <p className="text-sm text-muted-foreground">{block.monteurIds.map((id) => data.monteurNameById.get(id)).filter(Boolean).join(", ") || "Nog geen monteurs"}</p>
        </button>; })}
      </div>
    </SwipeArea>
    <p className="text-center text-xs text-muted-foreground">Week {current.week_nr} · {cap.percentage}% van mandagen bezet{cap.conflicts > 0 ? ` · ${cap.conflicts} conflicten` : ""}</p>
    <FreshnessBar data={data} />
  </div>;
}
