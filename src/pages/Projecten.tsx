import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  FileText,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedProject } from "@/stores/selectedProject";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { assessPlanningRange, type PlanningWeek } from "@/lib/planning-safety";
import { buildProjectCellDates } from "@/lib/project-overview-sort";

type Status = "concept" | "gepland" | "in_uitvoering" | "on_hold" | "afgerond";

interface Opdrachtgever {
  id: string;
  naam: string;
}

interface Project {
  id: string;
  case_nummer: string | null;
  station_naam: string | null;
  gsu_geu: string | null;
  wv_naam: string | null;
  status: Status | null;
  jaar: number | null;
  notities: string | null;
  straat: string | null;
  postcode: string | null;
  stad: string | null;
  gemeente: string | null;
  opdrachtgever_id: string | null;
  tijdelijke_situatie: string | null;
  def_trafo_vervangen: string | null;
  def_trafo_type: string | null;
  def_ls_situatie: string | null;
  created_at: string;
}

const STATUS_FILTERS: { key: "alle" | Status; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "concept", label: "Concept" },
  { key: "gepland", label: "Gepland" },
  { key: "in_uitvoering", label: "In uitvoering" },
  { key: "on_hold", label: "On hold" },
  { key: "afgerond", label: "Afgerond" },
];

const statusLabel = (s: Status | null) =>
  s === "gepland"
    ? "Gepland"
    : s === "in_uitvoering"
    ? "In uitvoering"
    : s === "on_hold"
    ? "On hold"
    : s === "afgerond"
    ? "Afgerond"
    : "Concept";

const statusStyle = (s: Status | null): React.CSSProperties => {
  if (s === "gepland") return { backgroundColor: "#feb300", color: "var(--surface-solid)" };
  if (s === "in_uitvoering") return { backgroundColor: "#10b981", color: "var(--surface-solid)" };
  if (s === "on_hold")
    return { backgroundColor: "rgb(var(--fg-rgb) / 0.12)", color: "rgb(var(--fg-rgb) / 0.7)" };
  return { backgroundColor: "rgb(var(--fg-rgb) / 0.08)", color: "rgb(var(--fg-rgb) / 0.6)" };
};

const DAY_MS = 86_400_000;

type GroupKey = "deze_week" | "binnenkort" | "later" | "verleden" | "geen";

const GROUPS: { key: GroupKey; label: string; hint: string }[] = [
  { key: "deze_week", label: "Deze week", hint: "planning binnen 7 dagen" },
  { key: "binnenkort", label: "Binnenkort", hint: "komende 4 weken" },
  { key: "later", label: "Later", hint: "verder in de toekomst" },
  { key: "verleden", label: "Afgelopen", hint: "planning volledig in het verleden" },
  { key: "geen", label: "Zonder planning", hint: "nog niet ingepland" },
];

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });

const fmtRange = (dates: number[] | undefined) => {
  if (!dates || dates.length === 0) return "—";
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first === last ? fmtDate(first) : `${fmtDate(first)} – ${fmtDate(last)}`;
};

const Projecten = () => {
  const navigate = useNavigate();
  const setSelectedProjectId = useSelectedProject((s) => s.setProjectId);

  const [projects, setProjects] = useState<Project[]>([]);
  const [opdrachtgevers, setOpdrachtgevers] = useState<Opdrachtgever[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [wekenByProject, setWekenByProject] = useState<Map<string, PlanningWeek[]>>(new Map());
  const [cellDates, setCellDates] = useState<Map<string, number[]>>(new Map());

  const [statusFilter, setStatusFilter] = useState<"alle" | Status>("alle");
  const [zoek, setZoek] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const loadAll = async () => {
    setLoading(true);
    const [pRes, oRes, wRes, aRes, cRes] = await Promise.all([
      supabase.from("projecten").select("*").order("created_at", { ascending: false }),
      supabase.from("opdrachtgevers").select("id, naam").order("positie"),
      supabase.from("project_weken").select("id, project_id, jaar, week_nr"),
      supabase.from("project_activiteiten").select("id, project_id"),
      supabase
        .from("planning_cellen")
        .select("activiteit_id, week_id, dag_index")
        .not("kleur_code", "is", null),
    ]);
    if (pRes.error) toast.error("Kon projecten niet laden");
    else setProjects((pRes.data ?? []) as unknown as Project[]);
    if (!oRes.error) setOpdrachtgevers((oRes.data ?? []) as Opdrachtgever[]);
    if (!wRes.error) {
      const rows = (wRes.data ?? []) as { id: string; project_id: string; jaar: number; week_nr: number }[];
      const map = new Map<string, PlanningWeek[]>();
      for (const row of rows) {
        const list = map.get(row.project_id) ?? [];
        list.push({ jaar: row.jaar, week_nr: row.week_nr });
        map.set(row.project_id, list);
      }
      setWekenByProject(map);
      if (!aRes.error && !cRes.error) {
        setCellDates(
          buildProjectCellDates(
            rows,
            (aRes.data ?? []) as { id: string; project_id: string | null }[],
            (cRes.data ?? []) as { activiteit_id: string | null; week_id: string | null; dag_index: number }[],
          ),
        );
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const opdrachtgeverById = useMemo(() => {
    const m = new Map<string, string>();
    opdrachtgevers.forEach((o) => m.set(o.id, o.naam));
    return m;
  }, [opdrachtgevers]);

  const filtered = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== "alle" && p.status !== statusFilter) return false;
      if (term) {
        const fields = [p.case_nummer, p.station_naam, p.straat, p.postcode, p.stad, p.gemeente];
        const hit = fields.some((f) => (f ?? "").toLowerCase().includes(term));
        if (!hit) return false;
      }
      return true;
    });
  }, [projects, statusFilter, zoek]);

  const grouped = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const weekMs = todayMs + 7 * DAY_MS;
    const monthMs = todayMs + 28 * DAY_MS;

    const buckets = new Map<GroupKey, Project[]>(GROUPS.map((g) => [g.key, [] as Project[]]));

    for (const p of filtered) {
      const dates = cellDates.get(p.id);
      let key: GroupKey = "geen";
      if (dates && dates.length > 0) {
        const nextFuture = dates.find((d) => d >= todayMs);
        if (nextFuture == null) key = "verleden";
        else if (nextFuture < weekMs) key = "deze_week";
        else if (nextFuture < monthMs) key = "binnenkort";
        else key = "later";
      }
      buckets.get(key)!.push(p);
    }

    for (const [key, list] of buckets) {
      list.sort((a, b) => {
        const da = cellDates.get(a.id);
        const db = cellDates.get(b.id);
        if (key === "verleden") {
          const va = da ? da[da.length - 1] : 0;
          const vb = db ? db[db.length - 1] : 0;
          if (va !== vb) return vb - va;
        } else if (key !== "geen") {
          const va = da?.find((d) => d >= todayMs) ?? Number.POSITIVE_INFINITY;
          const vb = db?.find((d) => d >= todayMs) ?? Number.POSITIVE_INFINITY;
          if (va !== vb) return va - vb;
        }
        return (a.station_naam ?? "").localeCompare(b.station_naam ?? "");
      });
    }

    return GROUPS.map((g) => ({ ...g, items: buckets.get(g.key) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [filtered, cellDates]);

  const handleNewProject = async () => {
    setCreating(true);
    const { data, error } = await supabase
      .from("projecten")
      .insert({ status: "concept", jaar: new Date().getFullYear() })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error("Kon project niet aanmaken");
      return;
    }
    setSelectedProjectId(data.id);
    navigate(`/projecten/${data.id}`);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const prev = projects;
    setProjects(projects.filter((p) => p.id !== deleteTarget.id));
    const { error } = await supabase.from("projecten").delete().eq("id", deleteTarget.id);
    if (error) {
      setProjects(prev);
      toast.error("Verwijderen mislukt");
    } else {
      toast.success("Project verwijderd");
    }
    setDeleteTarget(null);
  };

  const openProject = (p: Project) => {
    setSelectedProjectId(p.id);
    navigate(`/projecten/${p.id}`);
  };

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <PageHeader
          title="Projecten"
          description="Overzicht van alle TerreVolt-projecten, gesorteerd op planning."
        />
        <Button
          onClick={handleNewProject}
          disabled={creating}
          className="font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
        >
          <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} /> Project toevoegen
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={[
                "rounded-md px-3.5 py-1.5 text-xs font-display font-semibold tracking-wide transition-all",
                statusFilter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-fg/[0.04] text-muted-foreground hover:bg-fg/[0.08] hover:text-foreground",
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek op casenummer, station, straat, postcode of plaats"
            className="rounded-md border-fg/10 bg-fg/[0.04] pl-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="surface-card px-6 py-16 text-center text-sm text-muted-foreground">Laden…</div>
      ) : filtered.length === 0 ? (
        <div className="surface-card flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Plus className="h-7 w-7" strokeWidth={2} />
          </div>
          <h3 className="font-display text-lg font-bold text-foreground">
            {projects.length === 0 ? "Nog geen projecten" : "Geen projecten gevonden"}
          </h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            {projects.length === 0
              ? "Maak je eerste project aan om te beginnen"
              : "Pas je filters of zoekopdracht aan"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <section key={g.key}>
              <div className="mb-2 flex items-baseline gap-2 px-1">
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
                  {g.label}
                </h2>
                <span className="rounded-md bg-fg/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {g.items.length}
                </span>
                <span className="text-[11px] text-muted-foreground/70">{g.hint}</span>
              </div>

              <div className="surface-card overflow-hidden rounded-lg">
                <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1.6fr)_auto] gap-3 border-b border-fg/10 px-4 py-2 text-[10px] font-display font-semibold uppercase tracking-wider text-muted-foreground md:grid">
                  <div>Station / casenummer</div>
                  <div>Status</div>
                  <div>Opdrachtgever</div>
                  <div>Planning</div>
                  <div className="text-right">Acties</div>
                </div>

                {g.items.map((p) => {
                  const dates = cellDates.get(p.id);
                  const opdr = p.opdrachtgever_id ? opdrachtgeverById.get(p.opdrachtgever_id) : null;
                  const a = assessPlanningRange(wekenByProject.get(p.id) ?? []);
                  return (
                    <div
                      key={p.id}
                      onClick={() => openProject(p)}
                      className="group grid cursor-pointer grid-cols-1 gap-1.5 border-b border-fg/5 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-fg/[0.04] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1.6fr)_auto] md:items-center md:gap-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-display text-sm font-bold text-foreground">
                          {p.station_naam || "Naamloos station"}
                        </div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                          {p.case_nummer || "Geen casenummer"}
                          {p.stad ? ` · ${p.stad}` : ""}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className="rounded-md px-2 py-0.5 text-[10px] font-display font-semibold uppercase tracking-wider"
                          style={statusStyle(p.status)}
                        >
                          {statusLabel(p.status)}
                        </span>
                        {a.status === "blocked" && (
                          <span
                            title={a.reasons.join("; ")}
                            className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {a.rangeWeeks}w
                          </span>
                        )}
                      </div>

                      <div className="truncate text-xs text-muted-foreground">{opdr || "—"}</div>

                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{fmtRange(dates)}</span>
                      </div>

                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/projecten/${p.id}/dossier`);
                          }}
                          className="rounded-md border border-fg/10 bg-fg/[0.03] p-1.5 text-foreground/80 transition-colors hover:bg-fg/[0.07]"
                          title="Open dossier"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProjectId(p.id);
                            navigate(`/plannen?project=${p.id}`);
                          }}
                          className="rounded-md bg-primary/15 p-1.5 text-primary transition-colors hover:bg-primary/25"
                          title="Inplannen"
                        >
                          <CalendarDays className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(p);
                          }}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                          title="Verwijderen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <ChevronRight className="h-4 w-4 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Project verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit verwijdert "{deleteTarget?.station_naam || deleteTarget?.case_nummer || "dit project"}"
              en alle bijbehorende data. Deze actie kan niet ongedaan gemaakt worden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Projecten;
