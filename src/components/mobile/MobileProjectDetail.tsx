import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, ChevronDown, FileText, MapPin } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { groupDayBlocks, projectPlanningSummary, targetWeekForDays, uniqueMonteursForProject } from "@/lib/mobile-planning";
import { FreshnessBar, formatShort, StatusChip } from "./MobileShared";
import { useMobilePlanningData } from "./useMobilePlanningData";

const fmtDate = (d: Date | null) => d ? d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function MobileProjectDetail() {
  const { id } = useParams(); const navigate = useNavigate(); const data = useMobilePlanningData();
  const project = id ? data.projectById.get(id) : undefined;
  const days = useMemo(() => (id ? data.daysByProject.get(id) : undefined) ?? [], [data.daysByProject, id]);
  const blocks = useMemo(() => groupDayBlocks(days), [days]);
  const summary = useMemo(() => projectPlanningSummary(days), [days]);
  const crew = useMemo(() => id ? uniqueMonteursForProject(days, id) : new Map<string, number>(), [days, id]);
  const weekGroups = useMemo(() => {
    const groups = new Map<string, typeof blocks>();
    for (const b of blocks) groups.set(`${b.year}-${b.week}`, [...(groups.get(`${b.year}-${b.week}`) ?? []), b]);
    return [...groups].map(([key, items]) => ({ key, items }));
  }, [blocks]);
  const defaultOpen = useMemo(() => { if (project?.status === "on_hold" || !days.length) return null; const t = targetWeekForDays(days, new Date()); return `${t.jaar}-${t.week_nr}`; }, [days, project?.status]);
  const [openWeeks, setOpenWeeks] = useState<Set<string> | null>(null);
  useEffect(() => { setOpenWeeks(null); }, [id]);
  const isOpen = (key: string) => openWeeks ? openWeeks.has(key) : key === defaultOpen;
  const toggle = (key: string) => setOpenWeeks((prev) => { const next = new Set(prev ?? (defaultOpen ? [defaultOpen] : [])); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const address = project ? [project.straat, project.postcode, project.stad].filter(Boolean).join(", ") : "";

  if (data.loading) return <p className="py-16 text-center text-sm text-muted-foreground">Case laden…</p>;
  if (!project) return <p className="py-16 text-center text-sm text-muted-foreground">Case niet gevonden</p>;
  return <div className="space-y-5"><Button variant="ghost" className="h-11 -ml-3" onClick={() => navigate("/projecten")}><ArrowLeft className="mr-2 h-4 w-4" />Cases</Button>
    <section><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs text-muted-foreground">{project.case_nummer || "Geen casenummer"}</p><h1 className="font-display text-2xl font-bold">{project.station_naam || "Naamloos station"}</h1></div><StatusChip status={project.status} /></div><p className="mt-2 text-sm text-muted-foreground">{project.opdrachtgever_id ? data.opdrachtgeverNameById.get(project.opdrachtgever_id) : "Geen opdrachtgever"}</p>{address && <a className="mt-3 flex min-h-11 items-center gap-2 text-sm font-medium text-primary" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer"><MapPin className="h-4 w-4" />Navigeer naar {address}</a>}</section>
    {project.status === "on_hold" && <p role="status" className="border-l-2 border-warning pl-3 text-sm">On hold — niet opgenomen in actuele planning/capaciteit.</p>}
    <section className="rounded-lg border border-border bg-card p-4">{project.status === "on_hold" && <p className="mb-3 text-xs font-medium text-muted-foreground">Niet actief — on hold · vastgelegde planning</p>}<div className="grid grid-cols-2 gap-3 text-sm">
      <div><span className="block text-[11px] text-muted-foreground">Eerste dag</span><strong>{fmtDate(summary.first)}</strong></div>
      <div><span className="block text-[11px] text-muted-foreground">Laatste dag</span><strong>{fmtDate(summary.last)}</strong></div>
      <div><span className="block text-[11px] text-muted-foreground">Werkdagen</span><strong>{summary.uniqueDays}</strong></div>
      <div><span className="block text-[11px] text-muted-foreground">Weken · monteurs</span><strong>{summary.weeks} · {crew.size}</strong></div>
    </div></section>
    <section><h2 className="mb-2 font-display text-lg font-bold">{project.status === "on_hold" ? "Vastgelegde planning · niet actief" : "Actuele planning"}</h2>{weekGroups.length === 0 ? <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Nog geen planning</p> : <div className="space-y-2">{weekGroups.map((group) => { const open = isOpen(group.key); const first = group.items[0]; return <article key={group.key} className="overflow-hidden rounded-lg border border-border bg-card">
      <button className="flex min-h-12 w-full items-center justify-between px-4 text-left" onClick={() => toggle(group.key)} aria-expanded={open}><span><strong>Week {first.week} · {first.year}</strong><span className="ml-2 text-xs text-muted-foreground">{group.items.length} {group.items.length === 1 ? "dag" : "dagen"} · vanaf {formatShort(first.date)}</span></span><ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} /></button>
      {open && <div className="divide-y divide-border border-t border-border">{group.items.map((block) => <div key={block.key} className="p-4"><strong className="text-sm capitalize">{block.date.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</strong><p className="mt-1 text-sm">{block.activities.join(" · ")}</p><p className="text-sm text-muted-foreground">{block.monteurIds.map((m) => data.monteurNameById.get(m)).filter(Boolean).join(", ") || "Nog geen monteurs"}</p></div>)}</div>}
    </article>; })}</div>}</section>
    <section><h2 className="mb-2 font-display text-lg font-bold">Ploeg / monteurs</h2><div className="divide-y divide-border rounded-lg border border-border bg-card">{crew.size ? [...crew].sort((a, b) => b[1] - a[1]).map(([monteurId, count]) => <div key={monteurId} className="flex min-h-12 items-center justify-between px-4 text-sm"><span>{data.monteurNameById.get(monteurId) || "Onbekende monteur"}</span><span className="text-muted-foreground">{count} {count === 1 ? "dag" : "dagen"}</span></div>) : <p className="p-4 text-sm text-muted-foreground">Nog geen monteurs gekoppeld</p>}</div></section>
    <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="h-11" onClick={() => navigate(`/projecten/${project.id}/dossier`)}><FileText className="mr-2 h-4 w-4" />Dossier</Button><Button className="h-11" onClick={() => navigate(`/plannen?project=${project.id}`)}><CalendarDays className="mr-2 h-4 w-4" />Planning bekijken</Button></div>
    <FreshnessBar data={data} />
    <p className="text-center text-xs text-muted-foreground">Projectgegevens bewerken kan op desktop.</p>
  </div>;
}
