import { useMemo } from "react";
import { Search, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { capacityForWeek, caseWeekMatrix, mobileProjectContext, type IsoWeek } from "@/lib/mobile-planning";
import { caseTitle, matchesSearch, capacityLink, mobileBackTarget, planningEmptyState } from "@/lib/mobile-ux";
import { addIsoWeeks } from "@/lib/planning-types";
import { CellLegend, MobileSearchEmpty, MobileDataGate, SwipeArea } from "./MobileShared";
import { useMobilePlanningData } from "./useMobilePlanningData";
import { CaseWeekCard } from "./MobileWeekCards";
import { MobileWeekNavigation } from "./MobileWeekNavigation";
import { useMobileWeekView } from "./useMobileWeekView";



export function MobileWeekPlanning() {
  const data = useMobilePlanningData(); const navigate = useNavigate();
  const [params, setParams] = useSearchParams(); const projectId = params.get("project");
  const contextProject = projectId ? data.projectById.get(projectId) : undefined;
  const contextState = mobileProjectContext(contextProject);
  const state = useMobileWeekView();
  const { selected, query, open, update } = state;
  const setQuery = (query: string) => update({ query });
  const setOpen = (open: string | null) => update({ open });

  const weekDays = useMemo(() => data.activeDaysByWeek.get(`${selected.jaar}-${selected.week_nr}`) ?? [], [data.activeDaysByWeek, selected]);
  const term = query.trim();
  const caseRows = useMemo(() => caseWeekMatrix(weekDays, selected.jaar, selected.week_nr).flatMap((row) => {
    if (projectId && row.projectId !== projectId) return [];
    const project = data.projectById.get(row.projectId); if (!project) return [];
    const hay = `${caseTitle(project)} ${project.opdrachtgever_id ? data.opdrachtgeverNameById.get(project.opdrachtgever_id) ?? "" : ""} ${row.blocks.flatMap((block) => block.monteurIds).map((id) => data.monteurNameById.get(id) ?? "").join(" ")}`;
    if (!projectId && term && !matchesSearch(hay, term)) return [];
    return [{ ...row, project }];
  }).sort((a, b) => (a.project.case_nummer ?? "").localeCompare(b.project.case_nummer ?? "", "nl")), [weekDays, selected, projectId, term, data.projectById, data.opdrachtgeverNameById, data.monteurNameById]);
  const cap = useMemo(() => capacityForWeek(weekDays, selected.jaar, selected.week_nr, data.monteurs, data.absences, data.holidays), [weekDays, selected, data.monteurs, data.absences, data.holidays]);
  const empty = planningEmptyState(projectId, projectId ? (data.activeDaysByProject.get(projectId)?.length ?? 0) > 0 : true);
  const move = (delta: number) => { update({ week: addIsoWeeks(selected.jaar, selected.week_nr, delta), open: null }); };
  const select = (week: IsoWeek) => { update({ week, open: null }); };
  const clearProject = () => { const next = new URLSearchParams(params); next.delete("project"); next.delete("open"); next.delete("q"); setParams(next, { replace: true });  };
  const contextTitle = contextProject ? caseTitle(contextProject) : null;
  const backToCase = () => { const target = mobileBackTarget(window.history.state?.idx, `/projecten/${projectId}`); if (target === -1) navigate(-1); else navigate(target); };

  if (!data.hasData) return <MobileDataGate data={data} />;
  if (!data.loading && contextState === "blocked") return <MobileDataGate data={data}><div className="space-y-4"><h1 className="font-display text-xl font-bold">Planning · {contextTitle}</h1><p role="status" className="border-l-2 border-warning-text pl-3 text-sm">Deze case staat on hold en wordt niet meegenomen in de actuele planning</p><div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => navigate("/projecten")}>Terug naar cases</Button><Button className="min-h-11" onClick={clearProject}>Alle planning</Button></div></div></MobileDataGate>;
  if (!data.loading && empty === "no-case-planning") return <MobileDataGate data={data}><div className="space-y-4"><h1 className="font-display text-xl font-bold">Planning · {contextTitle}</h1><p role="status" className="rounded-lg border border-border bg-card p-4 text-sm">Deze case heeft nog geen actieve planning.</p><div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => { const target = mobileBackTarget(window.history.state?.idx, `/projecten/${projectId}`); if (target === -1) navigate(-1); else navigate(target); }}>Terug naar case</Button><Button className="min-h-11" onClick={clearProject}>Alle planning</Button></div></div></MobileDataGate>;
  return <MobileDataGate data={data}><div className="space-y-3">
    <h1 className="break-words font-display text-xl font-bold">{contextTitle ? `Planning · ${contextTitle}` : "Planning"}</h1>
    {projectId && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={backToCase} className="min-h-11">Terug naar case</Button><Button variant="outline" onClick={clearProject} className="min-h-11"><X className="mr-2 h-4 w-4" />Alle cases tonen</Button></div>}
    <MobileWeekNavigation selected={selected} onMove={move} onSelect={select} />
    {!projectId && <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input className="h-11 pl-9 pr-11" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek case, station, opdrachtgever of monteur" aria-label="Planning zoeken" />{query && <Button variant="ghost" onClick={() => setQuery("")} aria-label="Zoekopdracht wissen" className="absolute right-0 top-0 h-11 w-11 p-0"><X className="h-4 w-4" /></Button>}</div>}
    <p className="text-xs text-muted-foreground">Week: {cap.plannedUnique} mandagen ingepland · {cap.free} vrij · {cap.percentage}% bezet{cap.conflicts ? ` · ${cap.conflicts} conflicten` : ""}</p>
    <CellLegend withUnavailable={false} />
    <Button variant="link" className="h-auto min-h-11 max-w-full whitespace-normal px-0 text-left text-xs text-primary-text" onClick={() => navigate(capacityLink(selected))}>Monteurs per dag bekijken → Capaciteit</Button>
    <SwipeArea onSwipe={move} label="Weekplanning"><div className="space-y-2">
      {caseRows.length === 0 ? term ? <MobileSearchEmpty term={query} onClear={() => setQuery("")} /> : <p className="py-12 text-center text-sm text-muted-foreground">Geen actieve planning in week {selected.week_nr}</p>
        : caseRows.map(({ project, blocks, cells }) => <CaseWeekCard key={project.id} project={project} blocks={blocks} cells={cells} data={data} open={open === project.id} onToggle={() => setOpen(open === project.id ? null : project.id)} />)}
    </div></SwipeArea>
  </div></MobileDataGate>;
}
