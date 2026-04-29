import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  MapPin,
  Plus,
  Printer,
  Search,
  Trash2,
  User,
  Zap,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  exportProjectenExcel,
  exportProjectenPDF,
  type ProjectExportRow,
} from "@/lib/overview-exports";

type Status = "concept" | "gepland" | "in_uitvoering" | "afgerond";

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
  { key: "afgerond", label: "Afgerond" },
];

const statusLabel = (s: Status | null) =>
  s === "gepland"
    ? "Gepland"
    : s === "in_uitvoering"
    ? "In uitvoering"
    : s === "afgerond"
    ? "Afgerond"
    : "Concept";

const statusStyle = (s: Status | null): React.CSSProperties => {
  if (s === "gepland") return { backgroundColor: "#feb300", color: "#0a1a30" };
  if (s === "in_uitvoering") return { backgroundColor: "#3fff8b", color: "#0a1a30" };
  return { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" };
};

const lsLabel = (s: string | null): string | null => {
  if (!s) return null;
  switch (s) {
    case "behouden":
      return "LS-rek behouden";
    case "herschikken":
      return "LS-rek herschikken";
    case "uitbreidingsrek":
      return "LS uitbreidingsrek";
    case "nieuw_le630":
      return "Nieuw LS-rek ≤630 kVA";
    case "nieuw_gt630_le1000":
      return "Nieuw LS-rek >630 ≤1000 kVA";
    default:
      return s;
  }
};

const tijdelijkLabel = (s: string | null): string | null => {
  if (!s || s === "geen") return null;
  if (s === "nsa") return "NSA";
  if (s === "provisorium") return "Provisorium";
  return s;
};

const Projecten = () => {
  const navigate = useNavigate();
  const setSelectedProjectId = useSelectedProject((s) => s.setProjectId);

  const [projects, setProjects] = useState<Project[]>([]);
  const [opdrachtgevers, setOpdrachtgevers] = useState<Opdrachtgever[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"alle" | Status>("alle");
  const [zoek, setZoek] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const loadAll = async () => {
    setLoading(true);
    const [pRes, oRes] = await Promise.all([
      supabase.from("projecten").select("*").order("created_at", { ascending: false }),
      supabase.from("opdrachtgevers").select("id, naam").order("positie"),
    ]);
    if (pRes.error) toast.error("Kon projecten niet laden");
    else setProjects((pRes.data ?? []) as unknown as Project[]);
    if (!oRes.error) setOpdrachtgevers((oRes.data ?? []) as Opdrachtgever[]);
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
        const fields = [
          p.case_nummer,
          p.station_naam,
          p.straat,
          p.postcode,
          p.stad,
          p.gemeente,
        ];
        const hit = fields.some((f) => (f ?? "").toLowerCase().includes(term));
        if (!hit) return false;
      }
      return true;
    });
  }, [projects, statusFilter, zoek]);

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
        <PageHeader title="Projecten" description="Overzicht van alle TerreVolt-projecten." />
        <div className="flex items-center gap-2">
          <ProjectenDownloadMenu rows={filtered} opdrachtgeverById={opdrachtgeverById} />
          <Button
            onClick={handleNewProject}
            disabled={creating}
            className="font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
          >
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} /> Project toevoegen
          </Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={[
                "rounded-md px-3.5 py-1.5 text-xs font-display font-semibold tracking-wide transition-all",
                statusFilter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
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
            className="rounded-md border-white/10 bg-white/[0.04] pl-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="surface-card px-6 py-16 text-center text-sm text-muted-foreground">
          Laden…
        </div>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const ls = lsLabel(p.def_ls_situatie);
            const tij = tijdelijkLabel(p.tijdelijke_situatie);
            const trafo =
              p.def_trafo_vervangen === "ja"
                ? `Trafo: ${p.def_trafo_type || "vervangen"}`
                : null;
            const opdr = p.opdrachtgever_id ? opdrachtgeverById.get(p.opdrachtgever_id) : null;
            return (
              <div
                key={p.id}
                onClick={() => openProject(p)}
                className="surface-card group relative cursor-pointer rounded-lg p-5 transition-all hover:border-primary/30 hover:bg-white/[0.04]"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-lg font-bold text-foreground truncate">
                      {p.station_naam || "Naamloos station"}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      {p.case_nummer || "Geen casenummer"}
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-md px-2 py-1 text-[10px] font-display font-semibold uppercase tracking-wider"
                    style={statusStyle(p.status)}
                  >
                    {statusLabel(p.status)}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {(p.straat || p.stad) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {[p.straat, p.stad].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  )}
                  {opdr && (
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{opdr}</span>
                    </div>
                  )}
                  {p.wv_naam && (
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">WV: {p.wv_naam}</span>
                    </div>
                  )}
                  {p.jaar && (
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                      <span>{p.jaar}</span>
                    </div>
                  )}
                </div>

                {(tij || trafo || ls) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tij && (
                      <span className="inline-flex items-center rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-display font-semibold uppercase tracking-wider text-amber-300">
                        {tij}
                      </span>
                    )}
                    {trafo && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-display font-semibold uppercase tracking-wider text-primary">
                        <Zap className="h-3 w-3" /> {trafo}
                      </span>
                    )}
                    {ls && (
                      <span className="inline-flex items-center rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-display font-semibold uppercase tracking-wider text-primary">
                        {ls}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/projecten/${p.id}/dossier`);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-display font-semibold text-foreground/85 transition-colors hover:bg-white/[0.07]"
                      title="Open dossier"
                    >
                      <FileText className="h-3.5 w-3.5" /> Dossier
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProjectId(p.id);
                        navigate(`/plannen?project=${p.id}`);
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-display font-semibold text-primary transition-colors hover:bg-primary/25"
                      title="Inplannen"
                    >
                      <CalendarDays className="h-3.5 w-3.5" /> Inplannen
                    </button>
                    <div className="flex items-center gap-1 text-xs font-display font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      Open intake <ChevronRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
