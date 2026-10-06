import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { capacityForWeek, caseWeekMatrix, mobileProjectContext, monteurWeekStates, targetWeekForDays, type IsoWeek, type MonteurDayState } from "@/lib/mobile-planning";
import { caseTitle, matchesSearch, groupResourcesForWeek, parseWeekParam, planningEmptyState } from "@/lib/mobile-ux";
import { addIsoWeeks, isoWeekPartsOf } from "@/lib/planning-types";
import { CellLegend, MobileSearchEmpty, MobileDataGate, SwipeArea } from "./MobileShared";
import { useMobilePlanningData } from "./useMobilePlanningData";
import { CaseWeekCard } from "./MobileWeekCards";
import { MobileWeekNavigation } from "./MobileWeekNavigation";
import { ResourceWeekList } from "./ResourceWeekList";

type Mode = "case" | "monteur";

export function MobileWeekPlanning() {
  const data = useMobilePlanningData(); const navigate = useNavigate();
  const [params, setParams] = useSearchParams(); const projectId = params.get("project");
  const weekParam = params.get("week");
  const contextProject = projectId ? data.projectById.get(projectId) : undefined;
  const contextState = mobileProjectContext(contextProject);
  const [selected, setSelected] = useState<IsoWeek>(() => parseWeekParam(weekParam) ?? isoWeekPartsOf(new Date()));
  const [query, setQuery] = useState(""); const [mode, setMode] = useState<Mode>("case"); const [open, setOpen] = useState<string | null>(null);
  const [jumpedFor, setJumpedFor] = useState<string | null>(null);
  useEffect(() => { const w = parseWeekParam(weekParam); if (w) { setSelected(w); setOpen(null); } }, [weekParam]);
  useEffect(() => {
    if (!projectId || !data.hasData || jumpedFor === projectId || contextState === "blocked") return;
    setSelected(targetWeekForDays(data.activeDaysByProject.get(projectId) ?? [], new Date()));
    setOpen(null); setMode("case"); setJumpedFor(projectId);
  }, [projectId, data.hasData, data.activeDaysByProject, jumpedFor, contextState]);

  const weekDays = useMemo(() => data.activeDaysByWeek.get(`${selected.jaar}-${selected.week_nr}`) ?? [], [data.activeDaysByWeek, selected]);
  const term = query.trim();
  const caseRows = useMemo(() => caseWeekMatrix(weekDays, selected.jaar, selected.week_nr).flatMap((row) => {
    if (projectId && row.projectId !== projectId) return [];
    const project = data.projectById.get(row.projectId); if (!project) return [];
    const hay = `${project.case_nummer ?? ""} ${project.station_naam ?? ""} ${project.opdrachtgever_id ? data.opdrachtgeverNameById.get(project.opdrachtgever_id) ?? "" : ""}`.toLowerCase();
    if (!projectId && term && !matchesSearch(hay, term)) return [];
    return [{ ...row, project }];
  }).sort((a, b) => (a.project.case_nummer ?? "").localeCompare(b.project.case_nummer ?? "", "nl")), [weekDays, selected, projectId, term, data.projectById, data.opdrachtgeverNameById]);
  const monteurStates = useMemo(() => mode === "monteur" ? monteurWeekStates(weekDays, selected.jaar, selected.week_nr, data.monteurs, data.absences, data.holidays) : new Map<string, MonteurDayState[]>(), [mode, weekDays, selected, data.monteurs, data.absences, data.holidays]);
  const groups = useMemo(() => groupResourcesForWeek(data.monteurs, monteurStates, (monteur) => {
    if (!term || matchesSearch(monteur.naam, term)) return true;
    return (monteurStates.get(monteur.id) ?? []).some((state) => state.entries.some((entry) => {
      const project = data.projectById.get(entry.projectId); return matchesSearch(caseTitle(project), term);
    }));
  }), [data.monteurs, data.projectById, monteurStates, term]);
  const cap = useMemo(() => capacityForWeek(weekDays, selected.jaar, selected.week_nr, data.monteurs, data.absences, data.holidays), [weekDays, selected, data.monteurs, data.absences, data.holidays]);
  const empty = planningEmptyState(projectId, projectId ? (data.activeDaysByProject.get(projectId)?.length ?? 0) > 0 : true);
  const move = (delta: number) => { setSelected((week) => addIsoWeeks(week.jaar, week.week_nr, delta)); setOpen(null); };
  const select = (week: IsoWeek) => { setSelected(week); setOpen(null); };
  const clearProject = () => { const next = new URLSearchParams(params); next.delete("project"); setParams(next, { replace: true }); setJumpedFor(null); setOpen(null); setQuery(""); };
  const contextTitle = contextProject ? caseTitle(contextProject) : null;

  if (!data.hasData) return <MobileDataGate data={data} />;
  if (!data.loading && contextState === "blocked") return <MobileDataGate data={data}><div className="space-y-4"><h1 className="font-display text-xl font-bold">Planning · {contextTitle}</h1><p role="status" className="border-l-2 border-warning-text pl-3 text-sm">Deze case staat on hold en wordt niet meegenomen in de actuele planning</p><div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => navigate("/projecten")}>Terug naar cases</Button><Button className="min-h-11" onClick={clearProject}>Alle planning</Button></div></div></MobileDataGate>;
  if (!data.loading && empty === "no-case-planning") return <MobileDataGate data={data}><div className="space-y-4"><h1 className="font-display text-xl font-bold">Planning · {contextTitle}</h1><p role="status" className="rounded-lg border border-border bg-card p-4 text-sm">Deze case heeft nog geen actieve planning.</p><div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => navigate(`/projecten/${projectId}`)}>Terug naar case</Button><Button className="min-h-11" onClick={clearProject}>Alle planning</Button></div></div></MobileDataGate>;
  return <MobileDataGate data={data}><div className="space-y-3">
    <h1 className="break-words font-display text-xl font-bold">{contextTitle ? `Planning · ${contextTitle}` : "Planning"}</h1>
    {projectId && <Button variant="outline" onClick={clearProject} className="h-11 w-full"><X className="mr-2 h-4 w-4" />Alle cases tonen</Button>}
    <MobileWeekNavigation selected={selected} onMove={move} onSelect={select} data={data}>
      {!projectId && <div className="grid grid-cols-2 rounded-lg bg-muted p-1" role="tablist" aria-label="Weergave">{(["case", "monteur"] as const).map((value) => <Button variant="ghost" key={value} role="tab" aria-selected={mode === value} onClick={() => { setMode(value); setOpen(null); }} className={`h-11 rounded-md text-sm ${mode === value ? "bg-card text-primary-text shadow-sm" : "text-muted-foreground"}`}>{value === "case" ? "Per case" : "Per monteur"}</Button>)}</div>}
    </MobileWeekNavigation>
    {!projectId && <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input className="h-11 pl-9 pr-11" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === "case" ? "Zoek case, station of opdrachtgever" : "Zoek monteur of case"} aria-label="Planning zoeken" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Zoekopdracht wissen" className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground"><X className="h-4 w-4" /></button>}</div>}
    <p className="text-xs text-muted-foreground">Week: {cap.plannedUnique} mandagen ingepland · {cap.free} vrij · {cap.percentage}% bezet{cap.conflicts ? ` · ${cap.conflicts} conflicten` : ""}</p>
    <CellLegend withUnavailable={mode === "monteur" && !projectId} />
    <SwipeArea onSwipe={move} label="Weekplanning"><div className="space-y-2">
      {data.loading ? <p className="py-12 text-center text-sm text-muted-foreground">Planning laden…</p>
        : mode === "case" || projectId ? caseRows.length === 0 ? term ? <MobileSearchEmpty term={query} onClear={() => setQuery("")} /> : <p className="py-12 text-center text-sm text-muted-foreground">Geen actieve planning in week {selected.week_nr}</p>
          : caseRows.map(({ project, blocks, cells }) => <CaseWeekCard key={project.id} project={project} blocks={blocks} cells={cells} data={data} open={open === project.id} onToggle={() => setOpen(open === project.id ? null : project.id)} />)
        : term && !Object.values(groups).some((list) => list.length) ? <MobileSearchEmpty term={query} onClear={() => setQuery("")} /> : <ResourceWeekList groups={groups} states={monteurStates} data={data} focus="planning" open={open} setOpen={setOpen} />}
    </div></SwipeArea>
  </div></MobileDataGate>;
}
