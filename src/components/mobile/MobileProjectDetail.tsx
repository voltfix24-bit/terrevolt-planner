import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, ChevronDown, FileText, MapPin } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { groupDayBlocks, projectPlanningSummary, uniqueMonteursForProject } from "@/lib/mobile-planning";
import { capacityLink, caseTitle, formatWeekParam, mobileBackTarget, selectMobileWeek, showPlanningStats, splitMobileWeeks, latentOnHoldOverlap } from "@/lib/mobile-ux";
import { MobileDataGate, formatShort, StatusChip } from "./MobileShared";
import { useMobilePlanningData } from "./useMobilePlanningData";

const fmtDate = (d: Date | null) => d ? d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function MobileProjectDetail() {
  const { id } = useParams(); const navigate = useNavigate(); const data = useMobilePlanningData();
  const project = id ? data.projectById.get(id) : undefined;
  const days = useMemo(() => (id ? data.daysByProject.get(id) : undefined) ?? [], [data.daysByProject, id]);
  const blocks = useMemo(() => groupDayBlocks(days), [days]);
  const overlap = useMemo(() => id ? latentOnHoldOverlap(data.days, id, data.onHoldProjectIds) : { count: 0, rows: [] }, [data.days, id, data.onHoldProjectIds]);
  const summary = useMemo(() => projectPlanningSummary(days), [days]);
  const crew = useMemo(() => id ? uniqueMonteursForProject(days, id) : new Map<string, number>(), [days, id]);
  const weekGroups = useMemo(() => {
    const groups = new Map<string, typeof blocks>();
    for (const b of blocks) groups.set(`${b.year}-${b.week}`, [...(groups.get(`${b.year}-${b.week}`) ?? []), b]);
    return [...groups].map(([key, items]) => ({ key, items, year: items[0].year, week: items[0].week }));
  }, [blocks]);
  const split = useMemo(() => splitMobileWeeks(weekGroups), [weekGroups]);
  const defaultOpen = split.upcoming[0]?.key ?? null;
  const caseWeek = project?.status !== "on_hold" && split.upcoming[0] ? { jaar: split.upcoming[0].year, week_nr: split.upcoming[0].week } : selectMobileWeek(null, null);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [openWeeks, setOpenWeeks] = useState<Set<string> | null>(null);
  useEffect(() => { setOpenWeeks(null); setEarlierOpen(false); }, [id]);
  const isOpen = (key: string) => openWeeks ? openWeeks.has(key) : key === defaultOpen;
  const toggle = (key: string) => setOpenWeeks((prev) => { const next = new Set(prev ?? (defaultOpen ? [defaultOpen] : [])); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const address = project ? [project.straat, project.postcode, project.stad].filter(Boolean).join(", ") : "";

  if (!data.hasData) return <MobileDataGate data={data} />;
  if (!project) return <MobileDataGate data={data}><p className="py-16 text-center text-sm text-muted-foreground">Case niet gevonden</p></MobileDataGate>;
  return <MobileDataGate data={data}><div className="space-y-5"><Button variant="ghost" className="h-11 -ml-3" onClick={() => { const target = mobileBackTarget(window.history.state?.idx, "/projecten"); if (target === -1) navigate(-1); else navigate(target); }}><ArrowLeft className="mr-2 h-4 w-4" />Terug</Button>
    <section><div className="flex items-start justify-between gap-3"><div><h1 className="break-words font-display text-xl font-bold">{caseTitle(project)}</h1></div><StatusChip status={project.status} /></div><p className="mt-2 text-sm text-muted-foreground">{project.opdrachtgever_id ? data.opdrachtgeverNameById.get(project.opdrachtgever_id) : "Geen opdrachtgever"}</p></section>
    <div className="flex flex-wrap gap-2">{project.status !== "on_hold" && <Button className="min-h-11" onClick={() => navigate(`/plannen?project=${project.id}&week=${formatWeekParam(caseWeek)}`)}><CalendarDays className="h-4 w-4" />Planning bekijken</Button>}<Button variant="outline" className="min-h-11" onClick={() => navigate(`/projecten/${project.id}/dossier`)}><FileText className="h-4 w-4" />Dossier</Button>{address && <Button variant="outline" className="min-h-11" asChild><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer"><MapPin className="h-4 w-4" />Navigeer</a></Button>}</div>
    {project.status === "on_hold" && <p role="status" className="border-l-2 border-warning-text pl-3 text-sm">Niet opgenomen in actuele planning/capaciteit.</p>}
    {project.status === "on_hold" && <section className="border-l-2 border-warning-text pl-3 text-sm text-warning-text"><p>Bij heractivering overlapt deze planning met {overlap.count} monteurdagen op andere actieve cases</p>{overlap.rows.slice(0, 5).map((row) => <p key={`${row.monteurId}-${row.date.toISOString()}`} className="mt-2 text-xs">{data.monteurNameById.get(row.monteurId) ?? "Monteur"} · {formatShort(row.date)} · {row.projectIds.map((id) => caseTitle(data.projectById.get(id))).join(" + ")}</p>)}</section>}
    {showPlanningStats(summary) && <section className="rounded-lg border border-border bg-card p-4"><div className="grid grid-cols-2 gap-3 text-sm">
      <div><span className="block text-[11px] text-muted-foreground">Eerste dag</span><strong>{fmtDate(summary.first)}</strong></div>
      <div><span className="block text-[11px] text-muted-foreground">Laatste dag</span><strong>{fmtDate(summary.last)}</strong></div>
      <div><span className="block text-[11px] text-muted-foreground">Werkdagen</span><strong>{summary.uniqueDays}</strong></div>
      <div><span className="block text-[11px] text-muted-foreground">Weken · monteurs</span><strong>{summary.weeks} · {crew.size}</strong></div>
    </div></section>}
    <section><h2 className="mb-2 font-display text-lg font-bold">{project.status === "on_hold" ? "Vastgelegde planning" : "Actuele planning"}</h2>{weekGroups.length === 0 ? <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Nog geen planning</p> : <div className="space-y-2">{split.upcoming.map((group) => { const open = isOpen(group.key); const first = group.items[0]; return <article key={group.key} className="overflow-hidden rounded-lg border border-border bg-card">
      <Button variant="ghost" className="flex h-auto min-h-12 w-full items-center justify-between whitespace-normal px-4 py-2 text-left" onClick={() => toggle(group.key)} aria-expanded={open}><span><strong>Week {first.week} · {first.year}</strong><span className="ml-2 text-xs text-muted-foreground">{group.items.length} {group.items.length === 1 ? "dag" : "dagen"} · vanaf {formatShort(first.date)}</span></span><ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} /></Button>
      {open && <div className="divide-y divide-border border-t border-border">{group.items.map((block) => <div key={block.key} className="p-4"><strong className="text-sm capitalize">{block.date.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</strong><p className="mt-1 text-sm">{block.activities.join(" · ")}</p><p className="text-sm text-muted-foreground">{block.monteurIds.map((m) => data.monteurNameById.get(m)).filter(Boolean).join(", ") || "Nog geen monteurs"}</p></div>)}</div>}
    </article>; })}{split.earlier.length > 0 && <Button variant="outline" className="min-h-11 w-full justify-between" aria-expanded={earlierOpen} onClick={() => setEarlierOpen(!earlierOpen)}>Eerdere weken ({split.earlier.length})<ChevronDown className={`h-4 w-4 ${earlierOpen ? "rotate-180" : ""}`} /></Button>}{earlierOpen && split.earlier.map((group) => { const open = isOpen(group.key); const first = group.items[0]; return <article key={group.key} className="overflow-hidden rounded-lg border border-border bg-card">
      <Button variant="ghost" className="flex h-auto min-h-12 w-full items-center justify-between whitespace-normal px-4 py-2 text-left" onClick={() => toggle(group.key)} aria-expanded={open}><span><strong>Week {first.week} · {first.year}</strong><span className="ml-2 text-xs text-muted-foreground">{group.items.length} {group.items.length === 1 ? "dag" : "dagen"} · vanaf {formatShort(first.date)}</span></span><ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} /></Button>
      {open && <div className="divide-y divide-border border-t border-border">{group.items.map((block) => <div key={block.key} className="p-4"><strong className="text-sm capitalize">{block.date.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</strong><p className="mt-1 text-sm">{block.activities.join(" · ")}</p><p className="text-sm text-muted-foreground">{block.monteurIds.map((m) => data.monteurNameById.get(m)).filter(Boolean).join(", ") || "Nog geen monteurs"}</p></div>)}</div>}
    </article>; })}</div>}</section>
    <section><h2 className="mb-2 font-display text-lg font-bold">Ploeg / monteurs</h2><div className="divide-y divide-border rounded-lg border border-border bg-card">{crew.size ? [...crew].sort((a, b) => b[1] - a[1]).map(([monteurId, count]) => <Button variant="ghost" onClick={() => navigate(capacityLink(caseWeek, monteurId))} key={monteurId} className="flex h-auto min-h-12 w-full items-center justify-between gap-2 whitespace-normal px-4 text-left text-sm text-primary-text"><span>{data.monteurNameById.get(monteurId) || "Onbekende monteur"}</span><span className="text-muted-foreground">{count} {count === 1 ? "dag" : "dagen"}</span></Button>) : <p className="p-4 text-sm text-muted-foreground">Nog geen monteurs gekoppeld</p>}</div></section>
  </div></MobileDataGate>;
}
