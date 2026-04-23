import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Check,
  Layers,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedProject } from "@/stores/selectedProject";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type Status = "concept" | "gepland" | "in_uitvoering" | "afgerond";
type CaseType = "NSA" | "provisorium" | "compact" | "custom";
type LsRek = "ja" | "nee";

interface Project {
  id: string;
  case_nummer: string | null;
  station_naam: string | null;
  gsu_geu: string | null;
  ms_type: string | null;
  trafo_kva: string | null;
  case_type: CaseType | null;
  ls_rek_vervangen: LsRek | null;
  wv_naam: string | null;
  status: Status | null;
  jaar: number | null;
  werkplan_msh: boolean | null;
  werkplan_lsh: boolean | null;
  werkplan_msr: boolean | null;
  werkplan_lsr: boolean | null;
  notities: string | null;
  template_id: string | null;
  straat: string | null;
  postcode: string | null;
  stad: string | null;
  gemeente: string | null;
  created_at: string;
}

interface ProjectTemplate {
  id: string;
  naam: string;
  type: CaseType;
  omschrijving: string | null;
  activiteit_type_ids: string[] | null;
}

interface ActiviteitType {
  id: string;
  naam: string;
  capaciteit_type: string | null;
  min_personen: number | null;
  min_personen_totaal: number | null;
  min_personen_gekwalificeerd: number | null;
  min_aanwijzing_ls: string | null;
  min_aanwijzing_ms: string | null;
  positie: number | null;
}

const TRAFO_OPTIONS = ["160 kVA", "250 kVA", "400 kVA", "630 kVA", "800 kVA", "1000 kVA"];
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
  if (s === "afgerond")
    return { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" };
  return { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" };
};

const caseTypeLabel = (c: CaseType | null) =>
  c === "NSA" ? "NSA" : c === "provisorium" ? "Provisorium" : c === "compact" ? "Compact" : c === "custom" ? "Custom" : "—";

// Get current ISO week number
const getIsoWeek = (date = new Date()): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

const Projecten = () => {
  const navigate = useNavigate();
  const setSelectedProjectId = useSelectedProject((s) => s.setProjectId);

  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<"alle" | Status>("alle");
  const [zoek, setZoek] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedLocation, setSavedLocation] = useState<{ straat: string; stad: string } | null>(null);

  // form state
  const [caseNummer, setCaseNummer] = useState("");
  const [stationNaam, setStationNaam] = useState("");
  const [gsuGeu, setGsuGeu] = useState("");
  const [msType, setMsType] = useState("");
  const [trafoKva, setTrafoKva] = useState<string>("");
  const [lsRek, setLsRek] = useState<LsRek | null>(null);
  const [wvNaam, setWvNaam] = useState("");
  const [status, setStatus] = useState<Status>("concept");
  const [caseType, setCaseType] = useState<CaseType | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [werkplanMsh, setWerkplanMsh] = useState(false);
  const [werkplanLsh, setWerkplanLsh] = useState(false);
  const [werkplanMsr, setWerkplanMsr] = useState(false);
  const [werkplanLsr, setWerkplanLsr] = useState(false);
  const [notities, setNotities] = useState("");
  const [straat, setStraat] = useState("");
  const [postcode, setPostcode] = useState("");
  const [stad, setStad] = useState("");
  const [gemeente, setGemeente] = useState("");

  const loadAll = async () => {
    setLoading(true);
    const [pRes, tRes] = await Promise.all([
      supabase.from("projecten").select("*").order("created_at", { ascending: false }),
      supabase.from("project_templates").select("*").order("naam", { ascending: true }),
    ]);
    if (pRes.error) toast.error("Kon projecten niet laden");
    else setProjects((pRes.data ?? []) as Project[]);
    if (tRes.error) toast.error("Kon templates niet laden");
    else setTemplates((tRes.data ?? []) as ProjectTemplate[]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filtered = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== "alle" && p.status !== statusFilter) return false;
      if (term) {
        const a = (p.case_nummer ?? "").toLowerCase();
        const b = (p.station_naam ?? "").toLowerCase();
        if (!a.includes(term) && !b.includes(term)) return false;
      }
      return true;
    });
  }, [projects, statusFilter, zoek]);

  const templateById = useMemo(() => {
    const m = new Map<string, ProjectTemplate>();
    templates.forEach((t) => m.set(t.id, t));
    return m;
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    if (!caseType) return [];
    if (caseType === "custom") return templates;
    return templates.filter((t) => t.type === caseType);
  }, [templates, caseType]);

  const handleCaseTypeSelect = (c: CaseType) => {
    setCaseType(c);
  };

  // Auto-select matching template whenever case type changes for new projects.
  // Also re-applies when switching from Custom back to NSA/Provisorium/Compact.
  useEffect(() => {
    if (!modalOpen) return;
    if (editing) return;
    if (!caseType) return;
    if (caseType === "custom") {
      setTemplateId(null);
      return;
    }
    const match = templates.find((t) => t.type === caseType);
    setTemplateId(match ? match.id : null);
  }, [caseType, modalOpen, editing, templates]);

  const openNew = () => {
    setEditing(null);
    setCaseNummer("");
    setStationNaam("");
    setGsuGeu("");
    setMsType("");
    setTrafoKva("");
    setLsRek(null);
    setWvNaam("");
    setStatus("concept");
    setCaseType(null);
    setTemplateId(null);
    setWerkplanMsh(false);
    setWerkplanLsh(false);
    setWerkplanMsr(false);
    setWerkplanLsr(false);
    setNotities("");
    setStraat("");
    setPostcode("");
    setStad("");
    setGemeente("");
    setModalOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    setCaseNummer(p.case_nummer ?? "");
    setStationNaam(p.station_naam ?? "");
    setGsuGeu(p.gsu_geu ?? "");
    setMsType(p.ms_type ?? "");
    setTrafoKva(p.trafo_kva ?? "");
    setLsRek(p.ls_rek_vervangen);
    setWvNaam(p.wv_naam ?? "");
    setStatus((p.status ?? "concept") as Status);
    setCaseType(p.case_type);
    setTemplateId(p.template_id);
    setWerkplanMsh(!!p.werkplan_msh);
    setWerkplanLsh(!!p.werkplan_lsh);
    setWerkplanMsr(!!p.werkplan_msr);
    setWerkplanLsr(!!p.werkplan_lsr);
    setNotities(p.notities ?? "");
    setStraat(p.straat ?? "");
    setPostcode(p.postcode ?? "");
    setStad(p.stad ?? "");
    setGemeente(p.gemeente ?? "");
    setModalOpen(true);
  };

  const seedTemplateForProject = async (projectId: string, template: ProjectTemplate) => {
    const ids = template.activiteit_type_ids ?? [];
    if (ids.length > 0) {
      const { data: types } = await supabase
        .from("activiteit_types")
        .select("*")
        .in("id", ids);
      const typesArr = (types ?? []) as ActiviteitType[];
      const ordered = ids
        .map((id) => typesArr.find((t) => t.id === id))
        .filter((t): t is ActiviteitType => !!t);
      if (ordered.length > 0) {
        const rows = ordered.map((t, idx) => ({
          project_id: projectId,
          activiteit_type_id: t.id,
          naam: t.naam,
          capaciteit_type: t.capaciteit_type,
          min_personen: t.min_personen ?? 1,
          min_personen_totaal: t.min_personen_totaal ?? t.min_personen ?? 1,
          min_personen_gekwalificeerd:
            t.min_personen_gekwalificeerd ?? t.min_personen ?? 1,
          min_aanwijzing_ls: t.min_aanwijzing_ls,
          min_aanwijzing_ms: t.min_aanwijzing_ms,
          positie: idx,
        }));
        await supabase.from("project_activiteiten").insert(rows);
      }
    }
    // 6 weeks starting at current ISO week
    const startWeek = getIsoWeek();
    const weekRows = Array.from({ length: 6 }).map((_, i) => ({
      project_id: projectId,
      week_nr: startWeek + i,
      positie: i,
      opmerking: "",
    }));
    await supabase.from("project_weken").insert(weekRows);
  };

  const handleSave = async () => {
    if (!caseType) {
      toast.error("Kies een case type");
      return;
    }
    setSaving(true);
    const payload = {
      case_nummer: caseNummer.trim() || null,
      station_naam: stationNaam.trim() || null,
      gsu_geu: gsuGeu.trim() || null,
      ms_type: msType.trim() || null,
      trafo_kva: trafoKva || null,
      case_type: caseType,
      ls_rek_vervangen: lsRek,
      wv_naam: wvNaam.trim() || null,
      status,
      werkplan_msh: werkplanMsh,
      werkplan_lsh: werkplanLsh,
      werkplan_msr: werkplanMsr,
      werkplan_lsr: werkplanLsr,
      notities: notities.trim() || null,
      template_id: templateId,
      straat: straat.trim() || null,
      postcode: postcode.trim() || null,
      stad: stad.trim() || null,
      gemeente: gemeente.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (editing) {
      const { error } = await supabase
        .from("projecten")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        toast.error("Opslaan mislukt");
      } else {
        toast.success("Project opgeslagen");
        setModalOpen(false);
        await loadAll();
      }
    } else {
      const { data, error } = await supabase
        .from("projecten")
        .insert(payload)
        .select()
        .single();
      if (error || !data) {
        toast.error("Opslaan mislukt");
      } else {
        if (templateId) {
          const tpl = templateById.get(templateId);
          if (tpl) {
            try {
              await seedTemplateForProject(data.id, tpl);
            } catch {
              toast.error("Template kon niet volledig worden toegepast");
            }
          }
        }
        toast.success("Project opgeslagen");
        setModalOpen(false);
        await loadAll();
      }
    }
    setSaving(false);
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

  const openInPlanner = (p: Project) => {
    setSelectedProjectId(p.id);
    navigate(`/plannen?project=${p.id}`);
  };

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <PageHeader title="Projecten" description="Overzicht van alle TerreVolt-projecten." />
        <Button
          onClick={openNew}
          className="font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
        >
          <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} /> Project toevoegen
        </Button>
      </div>

      {/* Filter bar */}
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
            placeholder="Zoek op casenummer of stationsnaam"
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
          {projects.length === 0 && (
            <Button
              onClick={openNew}
              className="mt-6 font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
            >
              <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} /> Project toevoegen
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              p={p}
              templateNaam={p.template_id ? templateById.get(p.template_id)?.naam ?? null : null}
              onEdit={() => openEdit(p)}
              onDelete={() => setDeleteTarget(p)}
              onPlan={() => openInPlanner(p)}
            />
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="max-w-[640px] gap-0 border-0 p-0 [&>button]:hidden"
          style={{
            backgroundColor: "rgba(10, 26, 48, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            backdropFilter: "blur(18px)",
          }}
        >
          <div className="flex items-start justify-between px-6 pt-6">
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
              {editing ? "Project wijzigen" : "Project toevoegen"}
            </h2>
            <button
              onClick={() => setModalOpen(false)}
              className="-mr-2 -mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Annuleren
            </button>
          </div>

          <div className="space-y-5 px-6 py-6 max-h-[75vh] overflow-y-auto">
            {/* Two columns */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Case nummer">
                <Input
                  value={caseNummer}
                  onChange={(e) => setCaseNummer(e.target.value)}
                  placeholder="bijv. 0321609"
                  className={inputCls}
                />
              </Field>
              <Field label="Te plaatsen trafo">
                <Select value={trafoKva} onValueChange={(v) => setTrafoKva(v === "_geen" ? "" : v)}>
                  <SelectTrigger className={inputCls + " h-10"}>
                    <SelectValue placeholder="Selecteer trafo" />
                  </SelectTrigger>
                  <SelectContent
                    className="border-white/10 bg-[#0a1a30] text-foreground"
                  >
                    <SelectItem value="_geen">—</SelectItem>
                    {TRAFO_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Stationsnaam">
                <Input
                  value={stationNaam}
                  onChange={(e) => setStationNaam(e.target.value)}
                  placeholder="bijv. KOPPOELLN"
                  className={inputCls}
                />
              </Field>
              <Field label="LS-rek vervangen">
                <div className="flex gap-2">
                  {(["ja", "nee"] as LsRek[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setLsRek(lsRek === v ? null : v)}
                      className={[
                        "flex-1 rounded-md px-4 py-2 text-sm font-display font-semibold transition-all",
                        lsRek === v
                          ? "bg-primary text-primary-foreground"
                          : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
                      ].join(" ")}
                    >
                      {v === "ja" ? "Ja" : "Nee"}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="GSU / GEU">
                <Input
                  value={gsuGeu}
                  onChange={(e) => setGsuGeu(e.target.value)}
                  placeholder="bijv. W40 / W51"
                  className={inputCls}
                />
              </Field>
              <Field label="WV / Uitvoerder">
                <Input
                  value={wvNaam}
                  onChange={(e) => setWvNaam(e.target.value)}
                  placeholder="Naam"
                  className={inputCls}
                />
              </Field>

              <Field label="Type MS installatie">
                <Input
                  value={msType}
                  onChange={(e) => setMsType(e.target.value)}
                  placeholder="bijv. ABB FCVVV"
                  className={inputCls}
                />
              </Field>
              <Field label="Status">
                <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                  <SelectTrigger className={inputCls + " h-10"}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#0a1a30] text-foreground">
                    <SelectItem value="concept">Concept</SelectItem>
                    <SelectItem value="gepland">Gepland</SelectItem>
                    <SelectItem value="in_uitvoering">In uitvoering</SelectItem>
                    <SelectItem value="afgerond">Afgerond</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Locatie */}
            <Field label="Locatie">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  value={straat}
                  onChange={(e) => setStraat(e.target.value)}
                  placeholder="bijv. Kalverstraat 12"
                  className={inputCls}
                />
                <Input
                  value={stad}
                  onChange={(e) => setStad(e.target.value)}
                  placeholder="bijv. Amsterdam"
                  className={inputCls}
                />
                <Input
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  placeholder="bijv. 1012 NX"
                  className={inputCls}
                />
                <Input
                  value={gemeente}
                  onChange={(e) => setGemeente(e.target.value)}
                  placeholder="bijv. Amsterdam"
                  className={inputCls}
                />
              </div>
            </Field>

            {/* Case type */}
            <Field label="Case type">
              <div className="grid grid-cols-4 gap-2">
                {(["NSA", "provisorium", "compact", "custom"] as CaseType[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleCaseTypeSelect(c)}
                    className={[
                      "rounded-md px-4 py-3 text-sm font-display font-bold tracking-tight transition-all",
                      caseType === c
                        ? "bg-primary text-primary-foreground"
                        : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
                    ].join(" ")}
                  >
                    {caseTypeLabel(c)}
                  </button>
                ))}
              </div>
            </Field>

            {/* Template selector */}
            {caseType && (
              <Field label="Planningtemplate">
                <div className="grid grid-cols-1 gap-2">
                  <TemplateOption
                    selected={templateId === null}
                    title="Geen template"
                    description="Begin met een leeg planbord"
                    onClick={() => setTemplateId(null)}
                  />
                  {filteredTemplates.map((t) => (
                    <TemplateOption
                      key={t.id}
                      selected={templateId === t.id}
                      title={t.naam}
                      description={t.omschrijving ?? ""}
                      onClick={() => setTemplateId(t.id)}
                    />
                  ))}
                  {filteredTemplates.length === 0 && (
                    <div className="text-xs text-muted-foreground px-1">
                      Geen templates beschikbaar voor dit case type.
                    </div>
                  )}
                </div>
              </Field>
            )}

            {/* Werkplan toggles */}
            <Field label="Werkplan vereist">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { k: "MSH", v: werkplanMsh, set: setWerkplanMsh },
                  { k: "LSH", v: werkplanLsh, set: setWerkplanLsh },
                  { k: "MSR", v: werkplanMsr, set: setWerkplanMsr },
                  { k: "LSR", v: werkplanLsr, set: setWerkplanLsr },
                ].map((w) => (
                  <button
                    key={w.k}
                    type="button"
                    onClick={() => w.set(!w.v)}
                    className={[
                      "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-display font-semibold transition-all",
                      w.v
                        ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                        : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
                    ].join(" ")}
                  >
                    {w.v && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    {w.k}
                  </button>
                ))}
              </div>
            </Field>

            {/* Notities */}
            <Field label="Notities">
              <Textarea
                value={notities}
                onChange={(e) => setNotities(e.target.value)}
                rows={3}
                placeholder="Aanvullende opmerkingen..."
                className={inputCls + " min-h-[84px] resize-none"}
              />
            </Field>
          </div>

          <div className="px-6 pb-6">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
            >
              {saving ? "Bezig met opslaan…" : "Project opslaan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent
          style={{
            backgroundColor: "rgba(10, 26, 48, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            backdropFilter: "blur(18px)",
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-foreground">
              Weet je zeker dat je project '{deleteTarget?.case_nummer ?? "—"}' wilt verwijderen?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Alle planning data voor dit project wordt permanent verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md border-white/10 bg-transparent text-foreground hover:bg-white/[0.06]">
              Annuleren
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const inputCls =
  "rounded-md border-white/10 bg-white/[0.04] text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-primary";

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-2">
    <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </Label>
    {children}
  </div>
);

const TemplateOption = ({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      "flex items-start gap-3 rounded-md border px-4 py-3 text-left transition-all",
      selected
        ? "border-primary bg-primary/10"
        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
    ].join(" ")}
  >
    <div
      className={[
        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
        selected ? "border-primary bg-primary" : "border-white/20",
      ].join(" ")}
    >
      {selected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
    </div>
    <div>
      <div className="font-display text-sm font-bold text-foreground">{title}</div>
      {description && (
        <div className="text-xs text-muted-foreground">{description}</div>
      )}
    </div>
  </button>
);

const ProjectCard = ({
  p,
  templateNaam,
  onEdit,
  onDelete,
  onPlan,
}: {
  p: Project;
  templateNaam: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onPlan: () => void;
}) => {
  return (
    <div className="surface-card group p-5 transition-colors hover:border-white/[0.15]"
      style={{ transition: "border-color 0.15s ease" }}
    >
      {/* Top row */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="font-display text-2xl font-extrabold tracking-tight text-primary">
          {p.case_nummer || "—"}
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-display font-semibold"
          style={statusStyle(p.status)}
        >
          {p.status === "afgerond" && <Check className="h-3 w-3" strokeWidth={3} />}
          {statusLabel(p.status)}
        </span>
      </div>

      {/* Second row */}
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="font-display text-base font-semibold text-foreground">
          {p.station_naam || <span className="text-muted-foreground">Geen stationsnaam</span>}
        </div>
        {p.case_type && (
          <span className="inline-flex items-center rounded-md border border-white/15 px-2 py-0.5 text-[11px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
            {caseTypeLabel(p.case_type)}
          </span>
        )}
      </div>

      {/* Adres row */}
      {p.straat && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span>
            {p.straat}
            {p.stad ? `, ${p.stad}` : ""}
          </span>
        </div>
      )}
      {!p.straat && <div className="mb-3" />}

      {/* Info row */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          {p.jaar ?? "—"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" />
          {p.wv_naam || "Geen WV"}
        </span>
        {p.ms_type && (
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            {p.ms_type}
          </span>
        )}
        {p.trafo_kva && (
          <span className="inline-flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            {p.trafo_kva}
          </span>
        )}
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {templateNaam && (
            <>
              <Layers className="h-3 w-3" />
              <span className="font-medium">{templateNaam}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onPlan}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            aria-label="Plannen"
            title="Open in Plannen"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
          <button
            onClick={onEdit}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            aria-label="Wijzigen"
            title="Wijzigen"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
            aria-label="Verwijderen"
            title="Verwijderen"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Projecten;
