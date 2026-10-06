import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { capacityForWeek, groupDayBlocks, monteurWeekStates, targetWeekForDays, type IsoWeek } from "@/lib/mobile-planning";
import { addIsoWeeks, getMondayOfWeek, isoWeekPartsOf } from "@/lib/planning-types";
import { FreshnessBar, formatShort, SwipeArea } from "./MobileShared";
import { useMobilePlanningData } from "./useMobilePlanningData";
import { CaseWeekCard, MonteurWeekCard } from "./MobileWeekCards";

type Mode = "case" | "monteur";

export function MobileWeekPlanning() {
  const data = useMobilePlanningData();
  const [params, setParams] = useSearchParams();
  const projectId = params.get("project");
  const contextProject = projectId ? data.projectById.get(projectId) : undefined;
  const [selected, setSelected] = useState<IsoWeek>(() => isoWeekPartsOf(new Date()));
  const [query, setQuery] = useState(""); const [mode, setMode] = useState<Mode>("case"); const [open, setOpen] = useState<string | null>(null);
  const [jumpedFor, setJumpedFor] = useState<string | null>(null);

  // Spring één keer per case naar de relevante week zodra de data er is.
  useEffect(() => {
    if (!projectId || data.loading || jumpedFor === projectId) return;
    setSelected(targetWeekForDays(data.daysByProject.get(projectId) ?? [], new Date()));
    setOpen(projectId); setMode("case"); setJumpedFor(projectId);
  }, [projectId, data.loading, data.daysByProject, jumpedFor]);

  const monday = getMondayOfWeek(selected.week_nr, selected.jaar); const friday = new Date(monday); friday.setDate(friday.getDate() + 4);
  const weekDays = useMemo(() => data.daysByWeek.get(`${selected.jaar}-${selected.week_nr}`) ?? [], [data.daysByWeek, selected]);
  const term = query.trim().toLowerCase();

  const caseRows = useMemo(() => {
    const blocks = groupDayBlocks(projectId ? weekDays.filter((d) => d.projectId === projectId) : weekDays);
    const byProject = new Map<string, typeof blocks>();
    for (const b of blocks) byProject.set(b.projectId, [...(byProject.get(b.projectId) ?? []), b]);
    return [...byProject].flatMap(([id, dayBlocks]) => {
      const project = data.projectById.get(id); if (!project) return [];
      if (!projectId && term) {
        const hay = `${project.case_nummer ?? ""} ${project.station_naam ?? ""} ${project.opdrachtgever_id ? data.opdrachtgeverNameById.get(project.opdrachtgever_id) ?? "" : ""}`.toLowerCase();
        if (!hay.includes(term)) return [];
      }
      return [{ project, blocks: dayBlocks }];
    }).sort((a, b) => (a.project.case_nummer ?? "").localeCompare(b.project.case_nummer ?? "", "nl"));
  }, [weekDays, projectId, term, data.projectById, data.opdrachtgeverNameById]);

  const monteurStates = useMemo(() => mode === "monteur" ? monteurWeekStates(weekDays, selected.jaar, selected.week_nr, data.monteurs, data.absences, data.holidays, data.onHoldProjectIds) : new Map(), [mode, weekDays, selected, data.monteurs, data.absences, data.holidays, data.onHoldProjectIds]);
  const monteurRows = useMemo(() => data.monteurs.filter((m) => {
    if (!term) return true;
    if (m.naam.toLowerCase().includes(term)) return true;
    return (monteurStates.get(m.id) ?? []).some((s: { entries: { projectId: string }[] }) => s.entries.some((e) => {
      const p = data.projectById.get(e.projectId); return `${p?.case_nummer ?? ""} ${p?.station_naam ?? ""}`.toLowerCase().includes(term);
    }));
  }), [data.monteurs, data.projectById, monteurStates, term]);

  const cap = useMemo(() => capacityForWeek(weekDays, selected.jaar, selected.week_nr, data.monteurs, data.absences, data.holidays, data.onHoldProjectIds), [weekDays, selected, data.monteurs, data.absences, data.holidays, data.onHoldProjectIds]);
  const move = (delta: number) => setSelected((s) => addIsoWeeks(s.jaar, s.week_nr, delta));
  const clearProject = () => { const next = new URLSearchParams(params); next.delete("project"); setParams(next, { replace: true }); setJumpedFor(null); setOpen(null); };
  const contextTitle = contextProject ? (contextProject.case_nummer || contextProject.station_naam || "Case") : null;

  return <div className="space-y-4">
    <div>
      <h1 className="font-display text-2xl font-bold">{contextTitle ? `Planning · ${contextTitle}` : "Planning"}</h1>
      <p className="text-sm text-muted-foreground">{contextProject ? contextProject.station_naam || "Naamloos station" : "Alle ingeplande cases per werkdag"}</p>
    </div>
    {projectId && <button type="button" onClick={clearProject} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-card text-sm font-medium text-primary"><X className="h-4 w-4" />Alle cases tonen</button>}
    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-1">
      <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => move(-1)} aria-label="Vorige week"><ChevronLeft /></Button>
      <button className="min-h-11 px-2 text-center" onClick={() => setSelected(isoWeekPartsOf(new Date()))} aria-label="Naar huidige week"><strong className="block text-sm">Week {selected.week_nr} · {formatShort(monday)}–{formatShort(friday)}</strong><span className="text-xs text-muted-foreground">{cap.percentage}% bezet{cap.conflicts ? ` · ⚠ ${cap.conflicts} conflicten` : ""}</span></button>
      <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => move(1)} aria-label="Volgende week"><ChevronRight /></Button>
    </div>
    {!projectId && <>
      <div className="grid grid-cols-2 rounded-lg bg-muted p-1" role="tablist" aria-label="Weergave">
        {(["case", "monteur"] as const).map((m) => <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`min-h-11 rounded-md text-sm font-medium ${mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>{m === "case" ? "Per case" : "Per monteur"}</button>)}
      </div>
      <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input className="h-11 pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={mode === "case" ? "Zoek case, station of opdrachtgever" : "Zoek monteur of case"} /></div>
    </>}
    <SwipeArea onSwipe={move} label="Veeg om van week te wisselen">
      <div className="space-y-3">
        {data.loading ? <p className="py-12 text-center text-sm text-muted-foreground">Planning laden…</p>
          : mode === "case" || projectId ? (caseRows.length === 0 ? <p className="rounded-lg border border-border bg-card py-12 text-center text-sm text-muted-foreground">Geen planning in deze week</p>
            : caseRows.map(({ project, blocks }) => <CaseWeekCard key={project.id} project={project} blocks={blocks} monday={monday} data={data} open={open === project.id} onToggle={() => setOpen(open === project.id ? null : project.id)} />))
          : monteurRows.length === 0 ? <p className="rounded-lg border border-border bg-card py-12 text-center text-sm text-muted-foreground">Geen monteurs gevonden</p>
            : monteurRows.map((m) => <MonteurWeekCard key={m.id} name={m.naam} states={monteurStates.get(m.id) ?? []} data={data} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} />)}
      </div>
    </SwipeArea>
    <FreshnessBar data={data} />
  </div>;
}
