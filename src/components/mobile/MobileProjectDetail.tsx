import { useMemo } from "react";
import { ArrowLeft, CalendarDays, FileText, MapPin } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { uniqueMonteursForProject } from "@/lib/mobile-planning";
import { useMobilePlanningData } from "./useMobilePlanningData";

export function MobileProjectDetail() {
  const { id } = useParams(); const navigate = useNavigate(); const data = useMobilePlanningData();
  const project = data.projects.find((p) => p.id === id); const days = useMemo(() => data.days.filter((d) => d.projectId === id), [data.days, id]);
  const clients = new Map(data.opdrachtgevers.map((o) => [o.id, o.naam])); const names = new Map(data.monteurs.map((m) => [m.id, m.naam]));
  const crew = id ? uniqueMonteursForProject(days, id) : new Map<string, number>();
  const weekGroups = [...new Set(days.map((d) => `${d.year}-${d.week}`))].map((key) => ({ key, days: days.filter((d) => `${d.year}-${d.week}` === key) }));
  const address = project ? [project.straat, project.postcode, project.stad].filter(Boolean).join(", ") : "";
  if (data.loading) return <p className="py-16 text-center text-sm text-muted-foreground">Case laden…</p>;
  if (!project) return <p className="py-16 text-center text-sm text-muted-foreground">Case niet gevonden</p>;
  return <div className="space-y-5"><Button variant="ghost" className="h-11 -ml-3" onClick={() => navigate("/projecten")}><ArrowLeft className="mr-2 h-4 w-4"/>Cases</Button>
    <section><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs text-muted-foreground">{project.case_nummer || "Geen casenummer"}</p><h1 className="font-display text-2xl font-bold">{project.station_naam || "Naamloos station"}</h1></div><span className="rounded bg-muted px-2 py-1 text-[10px] uppercase">{project.status?.replace("_", " ")}</span></div><p className="mt-2 text-sm text-muted-foreground">{project.opdrachtgever_id ? clients.get(project.opdrachtgever_id) : "Geen opdrachtgever"}</p>{address && <a className="mt-3 flex min-h-11 items-center gap-2 text-sm font-medium text-primary" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer"><MapPin className="h-4 w-4"/>Navigeer naar {address}</a>}</section>
    <div className="grid grid-cols-3 gap-2">{[["Dagen", days.length], ["Weken", weekGroups.length], ["Monteurs", crew.size]].map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-card p-3 text-center"><strong className="block text-lg">{value}</strong><span className="text-[11px] text-muted-foreground">{label}</span></div>)}</div>
    <section><h2 className="mb-2 font-display text-lg font-bold">Planning</h2>{weekGroups.length === 0 ? <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Nog geen planning</p> : <div className="space-y-3">{weekGroups.map((group) => <article key={group.key} className="overflow-hidden rounded-lg border border-border bg-card"><h3 className="border-b border-border px-4 py-3 font-bold">Week {group.days[0].week} · {group.days[0].year}</h3><div className="divide-y divide-border">{group.days.map((day) => <div key={day.cellId} className="p-4"><strong className="text-sm capitalize">{day.date.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</strong><p className="mt-1 text-sm">{day.activity}</p><p className="text-sm text-muted-foreground">{day.monteurIds.map((m) => names.get(m)).filter(Boolean).join(", ") || "Nog geen monteurs"}</p></div>)}</div></article>)}</div>}</section>
    <section><h2 className="mb-2 font-display text-lg font-bold">Ploeg / monteurs</h2><div className="rounded-lg border border-border bg-card divide-y divide-border">{crew.size ? [...crew].map(([monteurId, count]) => <div key={monteurId} className="flex min-h-12 items-center justify-between px-4 text-sm"><span>{names.get(monteurId) || "Onbekende monteur"}</span><span className="text-muted-foreground">{count} {count === 1 ? "dag" : "dagen"}</span></div>) : <p className="p-4 text-sm text-muted-foreground">Nog geen monteurs gekoppeld</p>}</div></section>
    <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="h-11" onClick={() => navigate(`/projecten/${project.id}/dossier`)}><FileText className="mr-2 h-4 w-4"/>Dossier</Button><Button className="h-11" onClick={() => navigate(`/plannen?project=${project.id}`)}><CalendarDays className="mr-2 h-4 w-4"/>Planning</Button></div>
    <p className="text-center text-xs text-muted-foreground">Projectgegevens bewerken kan op desktop.</p>
  </div>;
}