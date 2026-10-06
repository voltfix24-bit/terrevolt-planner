import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, FileText, Search, SlidersHorizontal, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { caseTitle, caseSection, formatWeekParam, matchesSearch, sortCaseWeekOptions, activeFilterCount, casePlanningLabel, compareCases, EMPTY_CASE_FILTERS, type CaseFilters, type CasePlanningLabel } from "@/lib/mobile-ux";
import { targetWeekForDays } from "@/lib/mobile-planning";
import { isoWeekPartsOf } from "@/lib/planning-types";
import { MobileSearchEmpty, MobileDataGate, StatusChip } from "./MobileShared";
import { useMobilePlanningData } from "./useMobilePlanningData";

const STATUSES: [string, string][] = [["concept", "Concept"], ["gepland", "Gepland"], ["in_uitvoering", "In uitvoering"], ["on_hold", "On hold"], ["afgerond", "Afgerond"]];
const fmt = (d: Date) => d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });

function labelText(label: CasePlanningLabel, onHold: boolean) {
  if (label.kind === "next") return `${onHold ? "Vastgelegd" : "Volgende"}: ${fmt(label.date)} · week ${label.week}`;
  if (label.kind === "past") return `Afgelopen · laatste ${fmt(label.date)}`;
  return "Geen planning";
}

/** Mobiele, read-only Cases-lijst. On hold blijft zichtbaar als case, nooit als actieve planning. */
export function MobileCases() {
  const data = useMobilePlanningData(); const navigate = useNavigate();
  const [query, setQuery] = useState(""); const [filters, setFilters] = useState<CaseFilters>(EMPTY_CASE_FILTERS); const [showFilters, setShowFilters] = useState(false);
  const today = useMemo(() => new Date(), []);
  const weekOptions = useMemo(() => sortCaseWeekOptions([...new Set(data.days.map((d) => `${d.year}-${String(d.week).padStart(2, "0")}`))], isoWeekPartsOf(today)), [data.days, today]);
  const rows = useMemo(() => data.projects.map((project) => {
    const days = data.daysByProject.get(project.id) ?? [];
    const opdrachtgever = project.opdrachtgever_id ? data.opdrachtgeverNameById.get(project.opdrachtgever_id) ?? "" : "";
    return { project, opdrachtgever, days, label: casePlanningLabel(days, today), hay: [project.case_nummer, project.station_naam, project.straat, project.postcode, project.stad, opdrachtgever].filter(Boolean).join(" ").toLowerCase() };
  }).sort((a, b) => compareCases({ status: a.project.status, label: a.label, code: a.project.case_nummer ?? "" }, { status: b.project.status, label: b.label, code: b.project.case_nummer ?? "" })), [data.projects, data.daysByProject, data.opdrachtgeverNameById, today]);
  const term = query.trim();
  const visible = useMemo(() => rows.filter((r) => {
    if (term && !matchesSearch(r.hay, term)) return false;
    if (filters.status && r.project.status !== filters.status) return false;
    if (filters.opdrachtgeverId && r.project.opdrachtgever_id !== filters.opdrachtgeverId) return false;
    if (filters.week && !r.days.some((d) => `${d.year}-${String(d.week).padStart(2, "0")}` === filters.week)) return false;
    return true;
  }), [rows, term, filters]);
  const sections = useMemo(() => {
    const grouped = new Map<string, typeof visible>();
    for (const row of visible) { const title = caseSection({ status: row.project.status, label: row.label }); const list = grouped.get(title) ?? []; list.push(row); grouped.set(title, list); }
    return [...grouped];
  }, [visible]);
  const count = activeFilterCount(filters);
  const chips: [keyof CaseFilters, string][] = [
    ...(filters.status ? [["status", STATUSES.find(([k]) => k === filters.status)?.[1] ?? filters.status] as [keyof CaseFilters, string]] : []),
    ...(filters.opdrachtgeverId ? [["opdrachtgeverId", data.opdrachtgeverNameById.get(filters.opdrachtgeverId) ?? "Opdrachtgever"] as [keyof CaseFilters, string]] : []),
    ...(filters.week ? [["week", `Week ${Number(filters.week.split("-")[1])} · ${filters.week.split("-")[0]}`] as [keyof CaseFilters, string]] : []),
  ];
  const selectCls = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";

  if (!data.hasData) return <MobileDataGate data={data} />;
  return <MobileDataGate data={data}><div className="space-y-3">
    <h1 className="font-display text-xl font-bold">Cases</h1>
    <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input className="h-11 pl-9 pr-11" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek case, station, adres of opdrachtgever" aria-label="Cases zoeken" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Zoekopdracht wissen" className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground"><X className="h-4 w-4" /></button>}</div>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" className="h-11" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}><SlidersHorizontal className="mr-2 h-4 w-4" />Filters{count ? ` · ${count}` : ""}<ChevronDown className={`ml-1 h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`} /></Button>
      {chips.map(([key, label]) => <button key={key} type="button" onClick={() => setFilters((f) => ({ ...f, [key]: "" }))} aria-label={`Filter ${label} verwijderen`} className="flex h-11 items-center gap-1 rounded-full bg-primary/10 px-3 text-xs font-medium text-primary-text">{label}<X className="h-3.5 w-3.5" /></button>)}
      {count > 0 && <Button variant="ghost" className="h-11 text-sm" onClick={() => setFilters(EMPTY_CASE_FILTERS)}>Wissen</Button>}
    </div>
    {showFilters && <div className="grid gap-2 rounded-lg border border-border bg-card p-3">
      <label className="text-xs text-muted-foreground">Status<select className={selectCls} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}><option value="">Alle statussen</option>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="text-xs text-muted-foreground">Opdrachtgever<select className={selectCls} value={filters.opdrachtgeverId} onChange={(e) => setFilters((f) => ({ ...f, opdrachtgeverId: e.target.value }))}><option value="">Alle opdrachtgevers</option>{data.opdrachtgevers.map((o) => <option key={o.id} value={o.id}>{o.naam}</option>)}</select></label>
      <label className="text-xs text-muted-foreground">Week<select className={selectCls} value={filters.week} onChange={(e) => setFilters((f) => ({ ...f, week: e.target.value }))}><option value="">Alle weken</option>{weekOptions.map((w) => <option key={w} value={w}>Week {Number(w.split("-")[1])} · {w.split("-")[0]}</option>)}</select></label>
    </div>}
    <p className="text-xs text-muted-foreground" aria-live="polite">{visible.length} {visible.length === 1 ? "case" : "cases"}</p>
    {data.loading ? <p className="py-12 text-center text-sm text-muted-foreground">Cases laden…</p> : visible.length === 0 ? term ? <MobileSearchEmpty term={query} onClear={() => setQuery("")} /> : <p className="rounded-lg border border-border bg-card py-12 text-center text-sm text-muted-foreground">Geen cases gevonden</p> :
      <div className="space-y-4">{sections.map(([title, items]) => <section key={title} aria-label={title}><h2 className="mb-2 text-sm font-semibold">{title} · {items.length}</h2><ul className="space-y-2">{items.map(({ project, opdrachtgever, label }) => <li key={project.id} className="overflow-hidden rounded-lg border border-border bg-card">
        <button type="button" onClick={() => navigate(`/projecten/${project.id}`)} className="block min-h-11 w-full px-3 pb-1 pt-2.5 text-left">
          <span className="flex items-start justify-between gap-2"><strong className="min-w-0 text-sm">{caseTitle(project)}</strong><StatusChip status={project.status} /></span>
          <span className="block truncate text-xs text-muted-foreground">{opdrachtgever || "Geen opdrachtgever"}</span>
          <span className={`mt-1 block text-xs ${label.kind === "next" && project.status !== "on_hold" ? "font-medium text-foreground" : "text-muted-foreground"}`}>{labelText(label, project.status === "on_hold")}</span>
        </button>
        <div className="flex border-t border-border text-xs">
          <button type="button" onClick={() => navigate(`/projecten/${project.id}/dossier`)} className="flex h-11 flex-1 items-center justify-center gap-1.5 text-muted-foreground"><FileText className="h-3.5 w-3.5" />Dossier</button>
          {project.status !== "on_hold" && <Button variant="ghost" onClick={() => navigate(`/plannen?project=${project.id}&week=${formatWeekParam(targetWeekForDays(data.activeDaysByProject.get(project.id) ?? [], today))}`)} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-none border-l border-border text-xs text-primary-text"><CalendarDays className="h-3.5 w-3.5" />Planning</Button>}
        </div>
      </li>)}</ul></section>)}</div>}
  </div></MobileDataGate>;
}
