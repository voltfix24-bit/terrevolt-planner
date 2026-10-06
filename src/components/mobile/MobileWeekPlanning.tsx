import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { capacityForWeek, caseWeekMatrix, mobileProjectContext, monteurWeekStates, targetWeekForDays, type IsoWeek, type MonteurDayState } from "@/lib/mobile-planning";
import { addIsoWeeks, isoWeekPartsOf } from "@/lib/planning-types";
import { FreshnessBar, SwipeArea } from "./MobileShared";
import { useMobilePlanningData } from "./useMobilePlanningData";
import { CaseWeekCard, MonteurWeekCard } from "./MobileWeekCards";
import { MobileWeekNavigation } from "./MobileWeekNavigation";

type Mode = "case" | "monteur";

export function MobileWeekPlanning() {
  const data = useMobilePlanningData(); const navigate = useNavigate();
  const [params, setParams] = useSearchParams(); const projectId = params.get("project");
  const contextProject = projectId ? data.projectById.get(projectId) : undefined;
  const contextState = mobileProjectContext(contextProject);
  const [selected, setSelected] = useState<IsoWeek>(() => isoWeekPartsOf(new Date()));
  const [query, setQuery] = useState(""); const [mode, setMode] = useState<Mode>("case"); const [open, setOpen] = useState<string | null>(null);
  const [jumpedFor, setJumpedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId || data.loading || jumpedFor === projectId || contextState === "blocked") return;
    setSelected(targetWeekForDays(data.activeDaysByProject.get(projectId) ?? [], new Date()));
    setOpen(null); setMode("case"); setJumpedFor(projectId);
  }, [projectId, data.loading, data.activeDaysByProject, jumpedFor, contextState]);

  const weekDays = useMemo(() => data.activeDaysByWeek.get(`${selected.jaar}-${selected.week_nr}`) ?? [], [data.activeDaysByWeek, selected]);
  const term = query.trim().toLowerCase();
  const caseRows = useMemo(() => caseWeekMatrix(weekDays, selected.jaar, selected.week_nr).flatMap((row) => {
    if (projectId && row.projectId !== projectId) return [];
    const project = data.projectById.get(row.projectId); if (!project) return [];
    const hay = `${project.case_nummer ?? ""} ${project.station_naam ?? ""} ${project.opdrachtgever_id ? data.opdrachtgeverNameById.get(project.opdrachtgever_id) ?? "" : ""}`.toLowerCase();
    if (!projectId && term && !hay.includes(term)) return [];
    return [{ ...row, project }];
  }).sort((a, b) => (a.project.case_nummer ?? "").localeCompare(b.project.case_nummer ?? "", "nl")), [weekDays, selected, projectId, term, data.projectById, data.opdrachtgeverNameById]);
  const monteurStates = useMemo(() => mode === "monteur" ? monteurWeekStates(weekDays, selected.jaar, selected.week_nr, data.monteurs, data.absences, data.holidays) : new Map<string, MonteurDayState[]>(), [mode, weekDays, selected, data.monteurs, data.absences, data.holidays]);
  const monteurRows = useMemo(() => data.monteurs.filter((monteur) => {
    if (!term || monteur.naam.toLowerCase().includes(term)) return true;
    return (monteurStates.get(monteur.id) ?? []).some((state: { entries: { projectId: string }[] }) => state.entries.some((entry) => {
      const project = data.projectById.get(entry.projectId); return `${project?.case_nummer ?? ""} ${project?.station_naam ?? ""}`.toLowerCase().includes(term);
    }));
  }), [data.monteurs, data.projectById, monteurStates, term]);
  const cap = useMemo(() => capacityForWeek(weekDays, selected.jaar, selected.week_nr, data.monteurs, data.absences, data.holidays), [weekDays, selected, data.monteurs, data.absences, data.holidays]);
  const move = (delta: number) => { setSelected((week) => addIsoWeeks(week.jaar, week.week_nr, delta)); setOpen(null); };
  const select = (week: IsoWeek) => { setSelected(week); setOpen(null); };
  const clearProject = () => { const next = new URLSearchParams(params); next.delete("project"); setParams(next, { replace: true }); setJumpedFor(null); setOpen(null); setQuery(""); };
  const contextTitle = contextProject ? (contextProject.case_nummer || contextProject.station_naam || "Case") : null;

  if (!data.loading && contextState === "blocked") return <div className="space-y-4"><h1 className="font-display text-2xl font-bold">Planning · {contextTitle}</h1><p role="status" className="border-l-2 border-warning pl-3 text-sm">Deze case staat on hold en wordt niet meegenomen in de actuele planning</p><div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => navigate("/projecten")}>Terug naar cases</Button><Button className="min-h-11" onClick={clearProject}>Alle planning</Button></div><FreshnessBar data={data} /></div>;
  return <div className="space-y-3">
    <h1 className="break-words font-display text-2xl font-bold">{contextTitle ? `Planning · ${contextTitle}` : "Planning"}</h1>
    {projectId && <Button variant="outline" onClick={clearProject} className="h-11 w-full"><X className="mr-2 h-4 w-4" />Alle cases tonen</Button>}
    <MobileWeekNavigation selected={selected} onMove={move} onSelect={select} />
    {!projectId && <>
      <div className="grid grid-cols-2 rounded-lg bg-muted p-1" role="tablist" aria-label="Weergave">{(["case", "monteur"] as const).map((value) => <Button variant="ghost" key={value} role="tab" aria-selected={mode === value} onClick={() => { setMode(value); setOpen(null); }} className={`h-11 rounded-md text-sm ${mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>{value === "case" ? "Per case" : "Per monteur"}</Button>)}</div>
      <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input className="h-11 pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === "case" ? "Zoek case, station of opdrachtgever" : "Zoek monteur of case"} aria-label="Planning zoeken" /></div>
    </>}
    <p className="text-xs text-muted-foreground">{cap.plannedUnique} ingepland · {cap.free} vrij · {cap.percentage}% bezet{cap.conflicts ? ` · ${cap.conflicts} conflicten` : ""}</p>
    <SwipeArea onSwipe={move} label="Weekplanning"><div className="space-y-2">
      {data.loading ? <p className="py-12 text-center text-sm text-muted-foreground">Planning laden…</p>
        : mode === "case" || projectId ? caseRows.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Geen actieve planning in deze week</p>
          : caseRows.map(({ project, blocks, cells }) => <CaseWeekCard key={project.id} project={project} blocks={blocks} cells={cells} data={data} open={open === project.id} onToggle={() => setOpen(open === project.id ? null : project.id)} />)
        : monteurRows.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Geen monteurs gevonden</p>
          : monteurRows.map((monteur) => <MonteurWeekCard key={monteur.id} name={monteur.naam} states={monteurStates.get(monteur.id) ?? []} data={data} open={open === monteur.id} onToggle={() => setOpen(open === monteur.id ? null : monteur.id)} />)}
    </div></SwipeArea>
    <FreshnessBar data={data} />
  </div>;
}
