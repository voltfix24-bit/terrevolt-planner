import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Download,
  FileText,
  Eye,
  Building2,
  MapPin,
  CalendarRange,
  Wrench,
  Cable,
  Zap,
  ShieldAlert,
  KeyRound,
  AlertTriangle,
  Layers,
  Target,
  ClipboardList,
  Truck,
  HardHat,
  Gauge,
  Activity,
  PlugZap,
  CheckCircle2,
  Circle,
  Printer,
} from "lucide-react";
import { format, parseISO, isValid, differenceInCalendarDays } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import DossierPrint from "@/components/DossierPrint";
import { printDossierInPopup } from "@/lib/print-dossier";
import { intakeLabel } from "@/lib/dossier-labels";
import { loadConceptPlanning, dagOffsetLabel, type ConceptCel } from "@/lib/concept-planning";

// =====================================================
// Types
// =====================================================
type ProjectRow = Record<string, unknown> & { id: string };

interface Lookup {
  id: string;
  naam: string;
}

interface KabelRow {
  id: string;
  diameter: string | null;
  positie: number;
}

interface TekeningRow {
  id: string;
  project_id: string;
  soort: "tijdelijk" | "definitief";
  storage_path: string;
  bestandsnaam: string;
  mime_type: string | null;
  bestandsgrootte: number | null;
  titel: string | null;
  tekening_nummer: string | null;
  revisie: string | null;
  notitie: string | null;
  positie: number;
  created_at: string;
}

// =====================================================
// Helpers
// =====================================================
const fmtDate = (d: unknown): string => {
  if (!d || typeof d !== "string") return "—";
  const parsed = parseISO(d);
  if (!isValid(parsed)) return "—";
  return format(parsed, "d MMM yyyy", { locale: nl });
};

const fmtShort = (d: unknown): string => {
  if (!d || typeof d !== "string") return "—";
  const parsed = parseISO(d);
  if (!isValid(parsed)) return "—";
  return format(parsed, "d MMM", { locale: nl });
};

const yesNoLabel = (v: unknown): string => {
  const s = (v as string | null | undefined)?.toLowerCase();
  if (s === "ja") return "Ja";
  if (s === "nee") return "Nee";
  if (s === "deels") return "Deels";
  if (s === "onbekend") return "Onbekend";
  if (s === "nvt" || s === "n.v.t.") return "N.v.t.";
  return v ? String(v) : "—";
};

const cap = (s: unknown): string => {
  if (!s || typeof s !== "string") return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const valOr = (v: unknown, fallback = "—"): string => {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
};

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  concept: { label: "Concept", cls: "border-muted-foreground/30 bg-white/[0.03] text-muted-foreground" },
  gepland: { label: "Gepland", cls: "border-sky-400/30 bg-sky-400/[0.08] text-sky-300" },
  in_uitvoering: {
    label: "In Uitvoering",
    cls: "border-primary/40 bg-primary/[0.10] text-primary",
  },
  afgerond: {
    label: "Afgerond",
    cls: "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300",
  },
};

const tijdelijkeLabel = (v: unknown): string => {
  const s = (v as string | null | undefined)?.toLowerCase();
  if (s === "nsa") return "NSA";
  if (s === "provisorium") return "Provisorium";
  if (s === "geen") return "Geen";
  return "—";
};

// =====================================================
// UI primitives
// =====================================================
const Card: React.FC<{
  title: string;
  icon?: React.ElementType;
  tone?: "default" | "temp" | "final" | "critical" | "summary";
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, icon: Icon, tone = "default", right, className, children }) => {
  const accent = {
    default: "from-primary/70 to-primary/10",
    temp: "from-amber-400/80 to-amber-400/10",
    final: "from-emerald-400/80 to-emerald-400/10",
    critical: "from-rose-400/80 to-rose-400/10",
    summary: "from-sky-400/80 to-sky-400/10",
  }[tone];
  const iconCls = {
    default: "text-primary",
    temp: "text-amber-300",
    final: "text-emerald-300",
    critical: "text-rose-300",
    summary: "text-sky-300",
  }[tone];
  return (
    <section
      className={cn(
        "surface-card relative overflow-hidden rounded-lg border border-white/[0.06] px-5 py-4",
        className,
      )}
    >
      <div className={cn("absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b", accent)} />
      <header className="mb-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {Icon && (
            <div className={cn("flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.04]", iconCls)}>
              <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
            </div>
          )}
          <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.07em] text-foreground">
            {title}
          </h2>
        </div>
        {right}
      </header>
      <div>{children}</div>
    </section>
  );
};

const KV: React.FC<{
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  strong?: boolean;
}> = ({ label, value, mono, strong }) => (
  <div className="min-w-0">
    <div className="font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {label}
    </div>
    <div
      className={cn(
        "mt-0.5 truncate text-[13px] text-foreground/90",
        mono && "font-mono tabular-nums",
        strong && "font-display font-semibold text-foreground",
      )}
      title={typeof value === "string" ? value : undefined}
    >
      {value ?? "—"}
    </div>
  </div>
);

const SubBlock: React.FC<{
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}> = ({ title, icon: Icon, children }) => (
  <div className="rounded-md border border-white/[0.05] bg-white/[0.012] px-3 py-2.5">
    <div className="mb-2 flex items-center gap-1.5">
      {Icon && <Icon className="h-3 w-3 text-primary/80" />}
      <div className="font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-primary/90">
        {title}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">{children}</div>
  </div>
);

const Pill: React.FC<{
  children: React.ReactNode;
  tone?: "default" | "primary" | "warning" | "danger" | "muted";
  mono?: boolean;
}> = ({ children, tone = "default", mono }) => {
  const cls = {
    default: "border-white/10 bg-white/[0.04] text-foreground/85",
    primary: "border-primary/30 bg-primary/[0.10] text-primary",
    warning: "border-amber-400/30 bg-amber-400/[0.08] text-amber-300",
    danger: "border-rose-400/30 bg-rose-400/[0.08] text-rose-300",
    muted: "border-white/[0.06] bg-white/[0.02] text-muted-foreground",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-display font-semibold uppercase tracking-wider",
        mono && "font-mono normal-case tracking-normal",
        cls,
      )}
    >
      {children}
    </span>
  );
};

// =====================================================
// Generate signed image URLs for tekeningen so the print/PDF
// popup can embed the actual drawing under the right header.
// PDFs are skipped (kept as table row only).
// =====================================================
async function enrichTekeningenWithPreview(items: TekeningRow[]): Promise<TekeningRow[]> {
  const enriched = await Promise.all(
    items.map(async (t) => {
      const mime = (t.mime_type ?? "").toLowerCase();
      const isImage =
        mime.startsWith("image/") ||
        /\.(png|jpe?g|webp|gif|svg)$/i.test(t.bestandsnaam ?? "");
      if (!isImage) return t;
      const { data, error } = await supabase.storage
        .from("project-tekeningen")
        .createSignedUrl(t.storage_path, 60 * 30);
      if (error || !data?.signedUrl) return t;
      return { ...t, previewUrl: data.signedUrl };
    }),
  );
  return enriched;
}

// =====================================================
// Page
// =====================================================
const ProjectDossier = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [opdrachtgevers, setOpdrachtgevers] = useState<Lookup[]>([]);
  const [percelen, setPercelen] = useState<Lookup[]>([]);
  const [msKabels, setMsKabels] = useState<KabelRow[]>([]);
  const [lsKabels, setLsKabels] = useState<KabelRow[]>([]);
  const [tekeningen, setTekeningen] = useState<TekeningRow[]>([]);
  const [conceptCellen, setConceptCellen] = useState<ConceptCel[]>([]);
  const [activiteitenMap, setActiviteitenMap] = useState<Map<string, string>>(new Map());
  const [monteursMap, setMonteursMap] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [pRes, oRes, peRes, msRes, lsRes, tkRes] = await Promise.all([
      supabase.from("projecten").select("*").eq("id", id).maybeSingle(),
      supabase.from("opdrachtgevers").select("id, naam").order("positie"),
      supabase.from("percelen").select("id, naam").order("positie"),
      supabase
        .from("project_ms_kabels")
        .select("id, diameter, positie")
        .eq("project_id", id)
        .eq("soort", "huidig")
        .order("positie"),
      supabase
        .from("project_ls_kabels")
        .select("id, diameter, positie")
        .eq("project_id", id)
        .eq("soort", "huidig")
        .order("positie"),
      supabase
        .from("project_tekeningen")
        .select("*")
        .eq("project_id", id)
        .order("soort")
        .order("positie"),
    ]);
    if (pRes.error || !pRes.data) {
      toast.error("Project niet gevonden");
      navigate("/projecten");
      return;
    }
    setProject(pRes.data as ProjectRow);
    setOpdrachtgevers((oRes.data ?? []) as Lookup[]);
    setPercelen((peRes.data ?? []) as Lookup[]);
    setMsKabels((msRes.data ?? []) as KabelRow[]);
    setLsKabels((lsRes.data ?? []) as KabelRow[]);
    setTekeningen((tkRes.data ?? []) as TekeningRow[]);

    // Concept-planning + lookup voor namen
    try {
      const [cp, actRes, mRes] = await Promise.all([
        loadConceptPlanning(id),
        supabase.from("project_activiteiten").select("id,naam").eq("project_id", id),
        supabase.from("monteurs").select("id,naam"),
      ]);
      setConceptCellen(cp);
      const am = new Map<string, string>();
      (actRes.data ?? []).forEach((a) => am.set(a.id as string, a.naam as string));
      setActiviteitenMap(am);
      const mm = new Map<string, string>();
      (mRes.data ?? []).forEach((m) => mm.set(m.id as string, m.naam as string));
      setMonteursMap(mm);
    } catch (e) {
      console.warn("Concept-planning kon niet laden", e);
    }

    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const get = <T,>(k: string): T | undefined => project?.[k] as T | undefined;

  const opdrachtgeverNaam = useMemo(
    () => opdrachtgevers.find((o) => o.id === get<string>("opdrachtgever_id"))?.naam ?? "—",
    [opdrachtgevers, project],
  );
  const perceelNaam = useMemo(
    () => percelen.find((p) => p.id === get<string>("perceel_id"))?.naam ?? "—",
    [percelen, project],
  );

  const tijdelijk = useMemo(() => {
    const t = (get<string>("tijdelijke_situatie") ?? "").toLowerCase();
    return t;
  }, [project]);

  const periodeLabel = useMemo(() => {
    const s = get<string>("gsu_datum");
    const e = get<string>("geu_datum");
    if (!s && !e) return "—";
    return `${fmtShort(s)} → ${fmtShort(e)}`;
  }, [project]);

  const periodeDuur = useMemo(() => {
    const s = get<string>("gsu_datum");
    const e = get<string>("geu_datum");
    if (!s || !e) return null;
    const ds = parseISO(s);
    const de = parseISO(e);
    if (!isValid(ds) || !isValid(de)) return null;
    return differenceInCalendarDays(de, ds) + 1;
  }, [project]);

  // Build criticals dynamically from intake
  const criticals = useMemo(() => {
    const list: { title: string; body: string; tone: "danger" | "warning" | "info" }[] = [];
    if ((get<string>("asbest_benodigd") ?? "").toLowerCase() === "ja") {
      list.push({
        title: "Asbestsanering vereist",
        body: `Uitvoerder: ${valOr(get("asbest_uitvoerder"))} · Geplande dagen: ${valOr(get("asbest_dagen"))}.`,
        tone: "danger",
      });
    }
    if ((get<string>("bouwkundig_benodigd") ?? "").toLowerCase() === "ja") {
      list.push({
        title: "Bouwkundige werkzaamheden",
        body: `Aannemer: ${valOr(get("bouwkundig_aannemer"))} · Geplande dagen: ${valOr(get("bouwkundig_dagen"))}.`,
        tone: "warning",
      });
    }
    if (tijdelijk === "nsa") {
      list.push({
        title: "NSA-inzet tijdens uitvoering",
        body: `NSA-luik aanwezig: ${yesNoLabel(get("nsa_luik_aanwezig"))}. Bereikbaarheid en plaatsing controleren.`,
        tone: "warning",
      });
    }
    if (tijdelijk === "provisorium") {
      list.push({
        title: "Provisorium opbouw",
        body: `MS eindsluitingen: ${valOr(get("prov_ms_eindsluitingen_aantal"))} · LS eindsluitingen: ${valOr(get("prov_ls_eindsluitingen_aantal"))}.`,
        tone: "warning",
      });
    }
    if ((get<string>("def_aardmeting") ?? "").toLowerCase() === "ja") {
      list.push({
        title: "Aardmeting inplannen",
        body: "Vereiste aardmeting voor oplevering — meetapparatuur en gekwalificeerd persoon meenemen.",
        tone: "info",
      });
    }
    if ((get<string>("tijd_tekeningen_aanwezig") ?? "").toLowerCase() !== "ja") {
      list.push({
        title: "Tijdelijke tekeningen ontbreken",
        body: "Controleer of tijdelijke tekeningen voor uitvoering aanwezig en goedgekeurd zijn.",
        tone: "danger",
      });
    }
    if ((get<string>("def_tekeningen_aanwezig") ?? "").toLowerCase() !== "ja") {
      list.push({
        title: "Definitieve tekeningen open",
        body: "Definitieve tekeningen nog niet bevestigd. Voor monteur briefing definitieve set vereist.",
        tone: "warning",
      });
    }
    return list;
  }, [project, tijdelijk]);

  const samenvatting = useMemo(() => {
    if (!project) return "";
    const stadje = (get<string>("stad") as string) || "";
    const huidigRmu = intakeLabel("huidig_rmu_type", get("huidig_rmu_type"));
    const huidigDeel =
      huidigRmu && huidigRmu !== "—" ? `bestaande ${huidigRmu}` : "bestaande RMU";
    const tij = tijdelijkeLabel(tijdelijk);
    const defRmu = (get<string>("def_rmu_merk_configuratie") as string) || "nieuwe definitieve RMU";
    const defTrafo = (get<string>("def_trafo_type") as string) || "definitieve trafo";
    const lsSit = intakeLabel("def_ls_situatie", get("def_ls_situatie"));
    const tijDeel =
      tij === "Geen" || tij === "—"
        ? "Geen aparte tijdelijke voorziening — werk binnen één onderbreking."
        : tij === "NSA"
          ? "Tijdens de werkzaamheden wordt een NSA-unit ingezet zodat de levering doorloopt."
          : "Een provisorium wordt opgebouwd om tijdens de ombouw door te kunnen schakelen.";
    const lsDeel =
      lsSit && lsSit !== "—" && lsSit.toLowerCase() !== "behouden"
        ? ` LS-rek: ${lsSit}.`
        : "";
    const risico: string[] = [];
    if ((get<string>("asbest_benodigd") ?? "").toLowerCase() === "ja") risico.push("asbest");
    if ((get<string>("bouwkundig_benodigd") ?? "").toLowerCase() === "ja")
      risico.push("bouwkundig");
    const risicoDeel = risico.length
      ? ` Let op: ${risico.join(" + ")}-werk parallel ingepland.`
      : "";
    return `Huidige situatie: ${huidigDeel}${stadje ? ` te ${stadje}` : ""}. ${tijDeel} Doel: opleveren met ${defRmu} en ${defTrafo}.${lsDeel}${risicoDeel}`;
  }, [project, tijdelijk]);

  if (loading || !project) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Dossier laden…
      </div>
    );
  }

  const status = (get<string>("status") as string) || "concept";
  const statusInfo = STATUS_STYLES[status] ?? { label: status, cls: STATUS_STYLES.concept.cls };

  const tijdelijkeTekeningen = tekeningen.filter((t) => t.soort === "tijdelijk");
  const definitieveTekeningen = tekeningen.filter((t) => t.soort === "definitief");

  return (
    <div className="space-y-4 pb-10">
      {/* ============================================ */}
      {/* TOP BAR                                      */}
      {/* ============================================ */}
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate("/projecten")}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            title="Terug naar cases"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Project Dossier
            </div>
            <div className="font-display text-[13px] font-bold tracking-tight text-foreground">
              TerreVolt · Operationeel project overzicht
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/projecten/${id}`)}
            className="h-8 gap-1.5 border-white/10 bg-white/[0.03] text-[12px] hover:bg-white/[0.06]"
          >
            <Pencil className="h-3.5 w-3.5" /> Bewerk intake
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const tekeningenWithPreview = await enrichTekeningenWithPreview(tekeningen);
                printDossierInPopup(
                  {
                    project,
                    opdrachtgeverNaam,
                    perceelNaam,
                    msKabels,
                    lsKabels,
                    tekeningen: tekeningenWithPreview,
                    criticals,
                    samenvatting,
                    periodeLabel,
                    periodeDuur,
                  },
                  `Dossier ${(get<string>("case_nummer") as string) || ""}`,
                );
              } catch (e) {
                toast.error("Sta popups toe om te printen");
              }
            }}
            className="h-8 gap-1.5 border-white/10 bg-white/[0.03] text-[12px] hover:bg-white/[0.06]"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              try {
                const tekeningenWithPreview = await enrichTekeningenWithPreview(tekeningen);
                printDossierInPopup(
                  {
                    project,
                    opdrachtgeverNaam,
                    perceelNaam,
                    msKabels,
                    lsKabels,
                    tekeningen: tekeningenWithPreview,
                    criticals,
                    samenvatting,
                    periodeLabel,
                    periodeDuur,
                  },
                  `Dossier ${(get<string>("case_nummer") as string) || ""}`,
                );
                toast.info("Kies 'Opslaan als PDF' in het printvenster");
              } catch (e) {
                toast.error("Sta popups toe om te downloaden");
              }
            }}
            className="h-8 gap-1.5 bg-primary text-[12px] font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Download className="h-3.5 w-3.5" /> Download PDF
          </Button>
        </div>
      </div>

      {/* ============================================ */}
      {/* DOSSIER HEADER                                */}
      {/* ============================================ */}
      <div className="surface-card relative overflow-hidden rounded-lg border border-white/[0.06] px-5 py-4">
        <div className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-primary to-primary/10" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {criticals.some((c) => c.tone === "danger") && (
                <Pill tone="danger">Kritiek</Pill>
              )}
              <Pill tone="primary" mono>
                {valOr(get("case_nummer"))}
              </Pill>
              <span
                className={cn(
                  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-display font-semibold uppercase tracking-wider",
                  statusInfo.cls,
                )}
              >
                {statusInfo.label}
              </span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
              {valOr(get("station_naam"), "Naamloos station")}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Klant:{" "}
                <span className="text-foreground/85">{opdrachtgeverNaam}</span>
              </span>
              <span className="text-white/15">|</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Perceel:{" "}
                <span className="text-foreground/85">{perceelNaam}</span>
              </span>
              {get<string>("wv_naam") && (
                <>
                  <span className="text-white/15">|</span>
                  <span className="inline-flex items-center gap-1">
                    <HardHat className="h-3 w-3" /> WV:{" "}
                    <span className="text-foreground/85">{get<string>("wv_naam")}</span>
                  </span>
                </>
              )}
            </p>
            {(get<string>("straat") || get<string>("stad")) && (
              <p className="mt-0.5 text-[11.5px] text-muted-foreground/80">
                {valOr(get("straat"), "")} {valOr(get("postcode"), "")} {valOr(get("stad"), "")}
                {get<string>("gemeente") ? ` · ${get<string>("gemeente")}` : ""}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 rounded-md border border-primary/15 bg-primary/[0.04] px-3 py-2 text-right">
            <div className="font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-primary/90">
              Executie periode
            </div>
            <div className="font-display text-[14px] font-bold text-foreground">
              {periodeLabel}
            </div>
            {periodeDuur !== null && (
              <div className="text-[10.5px] text-muted-foreground">{periodeDuur} dagen window</div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* SUMMARY STRIP                                */}
      {/* ============================================ */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {[
          { label: "Klant", value: opdrachtgeverNaam, icon: Building2 },
          { label: "Perceel", value: perceelNaam, icon: MapPin },
          { label: "GSU/GEU", value: periodeLabel, icon: CalendarRange },
          {
            label: "Tijdelijk",
            value: tijdelijkeLabel(tijdelijk),
            icon: Zap,
            highlight: tijdelijk === "nsa" || tijdelijk === "provisorium",
          },
          {
            label: "RMU type",
            value: intakeLabel("huidig_rmu_type", get("huidig_rmu_type")),
            icon: PlugZap,
          },
          {
            label: "Definitief",
            value: valOr(get("def_rmu_merk_configuratie")),
            icon: Target,
          },
          {
            label: "Scope",
            value: intakeLabel("def_opleverdossier", get("def_opleverdossier")),
            icon: ClipboardList,
          },
        ].map((item) => (
          <div
            key={item.label}
            className={cn(
              "surface-card flex flex-col gap-1 rounded-lg border border-white/[0.06] px-3 py-2.5",
              item.highlight && "border-amber-400/25 bg-amber-400/[0.03]",
            )}
          >
            <div className="flex items-center gap-1.5">
              <item.icon
                className={cn(
                  "h-3 w-3",
                  item.highlight ? "text-amber-300" : "text-primary/80",
                )}
              />
              <div className="font-display text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {item.label}
              </div>
            </div>
            <div
              className="truncate font-display text-[12.5px] font-semibold text-foreground"
              title={String(item.value)}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* ============================================ */}
      {/* MAIN GRID                                    */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* LEFT COLUMN — 2/3 */}
        <div className="space-y-3 lg:col-span-2">
          {/* Projectgegevens */}
          <Card title="Projectgegevens" icon={ClipboardList}>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-3">
              <KV label="Opdrachtgever" value={opdrachtgeverNaam} strong />
              <KV label="Perceel" value={perceelNaam} />
              <KV label="WV / Uitvoerder" value={valOr(get("wv_naam"))} />
              <KV label="GSU" value={fmtDate(get("gsu_datum"))} mono />
              <KV label="GEU" value={fmtDate(get("geu_datum"))} mono />
              <KV label="Status" value={statusInfo.label} />
              <KV label="Behuizing" value={valOr(get("behuizing_nummer"))} />
              {get<string>("locatie") && <KV label="Locatie" value={valOr(get("locatie"))} />}
              {get<string>("gsu_geu") && (
                <KV label="GSU / GEU label" value={valOr(get("gsu_geu"))} />
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2">
              <SubBlock title="Bouwkundig" icon={HardHat}>
                <KV label="Vereist" value={yesNoLabel(get("bouwkundig_benodigd"))} />
                <KV label="Aannemer" value={valOr(get("bouwkundig_aannemer"))} />
                <KV label="Aantal dagen" value={valOr(get("bouwkundig_dagen"))} mono />
              </SubBlock>
              <SubBlock title="Asbest" icon={ShieldAlert}>
                <KV label="Sanering" value={yesNoLabel(get("asbest_benodigd"))} />
                <KV label="Uitvoerder" value={valOr(get("asbest_uitvoerder"))} />
                <KV label="Aantal dagen" value={valOr(get("asbest_dagen"))} mono />
              </SubBlock>
            </div>

            {get<string>("notities") && (
              <div className="mt-3 rounded-md border border-white/[0.05] bg-white/[0.012] px-3 py-2">
                <div className="font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Notities
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground/85">
                  {get<string>("notities")}
                </p>
              </div>
            )}
          </Card>

          {/* Huidige Situatie */}
          <Card title="Huidige Situatie" icon={Activity}>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
              <SubBlock title="MS / RMU" icon={PlugZap}>
                <KV label="Type" value={intakeLabel("huidig_rmu_type", get("huidig_rmu_type"))} strong />
                <KV
                  label="Aantal richtingen"
                  value={valOr(get("huidig_rmu_aantal_richtingen"))}
                  mono
                />
                <KV label="Vermogensveld" value={valOr(get("huidig_vermogensveld"))} />
              </SubBlock>
              <SubBlock title="Transformator" icon={Gauge}>
                <KV label="Aanwezig" value={yesNoLabel(get("huidig_trafo_aanwezig"))} />
                <KV label="Type" value={valOr(get("huidig_trafo_type"))} />
              </SubBlock>
              <SubBlock title="LS-Rek / OV" icon={Zap}>
                <KV label="LS-rek aanwezig" value={yesNoLabel(get("huidig_lsrek_aanwezig"))} />
                <KV label="Type" value={intakeLabel("huidig_lsrek_type", get("huidig_lsrek_type"))} />
                <KV label="Flex OV" value={yesNoLabel(get("huidig_flex_ov_aanwezig"))} />
                <KV label="OV kWh meter" value={intakeLabel("huidig_ov_kwh_meter", get("huidig_ov_kwh_meter"))} />
              </SubBlock>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
              <SubBlock title="MS Kabels" icon={Cable}>
                <KV label="Aanwezig" value={yesNoLabel(get("huidig_ms_kabels_aanwezig"))} />
                <KV label="Type" value={intakeLabel("huidig_ms_kabels_type", get("huidig_ms_kabels_type"))} />
                <KV label="Aantal" value={valOr(get("huidig_ms_kabels_aantal"))} mono />
                <KV
                  label="Diameters"
                  value={
                    msKabels.length > 0
                      ? msKabels.map((k) => k.diameter || "?").join(" · ")
                      : "—"
                  }
                  mono
                />
              </SubBlock>
              <SubBlock title="LS Kabels" icon={Cable}>
                <KV label="Aanwezig" value={yesNoLabel(get("huidig_ls_kabels_aanwezig"))} />
                <KV label="Type" value={intakeLabel("huidig_ls_kabels_type", get("huidig_ls_kabels_type"))} />
                <KV label="Aantal" value={valOr(get("huidig_ls_kabels_aantal"))} mono />
                <KV
                  label="Diameters"
                  value={
                    lsKabels.length > 0
                      ? lsKabels.map((k) => k.diameter || "?").join(" · ")
                      : "—"
                  }
                  mono
                />
              </SubBlock>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-md border border-white/[0.05] bg-white/[0.012] px-3 py-2">
              <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Hergebruik kabels
              </div>
              <Pill tone={(get<string>("huidig_kabels_herbruikbaar") ?? "").toLowerCase() === "ja" ? "primary" : "muted"}>
                {yesNoLabel(get("huidig_kabels_herbruikbaar"))}
              </Pill>
            </div>
          </Card>

          {/* Tijdelijke Situatie */}
          <Card title="Tijdelijke Situatie" icon={Zap} tone="temp">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[12.5px] text-foreground/85">
                Type tijdelijke voorziening
              </div>
              <Pill tone={tijdelijk === "geen" ? "muted" : "warning"}>
                {tijdelijkeLabel(tijdelijk)}
              </Pill>
            </div>

            {tijdelijk === "nsa" && (
              <SubBlock title="NSA Setup" icon={Truck}>
                <KV label="NSA-luik aanwezig" value={yesNoLabel(get("nsa_luik_aanwezig"))} />
                <KV label="Tekeningen klaar" value={yesNoLabel(get("tijd_tekeningen_aanwezig"))} />
              </SubBlock>
            )}

            {tijdelijk === "provisorium" && (
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                <SubBlock title="MS provisorium" icon={Cable}>
                  <KV
                    label="Eindsluitingen"
                    value={valOr(get("prov_ms_eindsluitingen_aantal"))}
                    mono
                  />
                  <KV label="Type" value={valOr(get("prov_ms_eindsluitingen_type"))} />
                  <KV label="Moffen" value={valOr(get("prov_ms_moffen_aantal"))} mono />
                </SubBlock>
                <SubBlock title="LS provisorium" icon={Cable}>
                  <KV
                    label="Eindsluitingen"
                    value={valOr(get("prov_ls_eindsluitingen_aantal"))}
                    mono
                  />
                  <KV label="Moffen" value={valOr(get("prov_ls_moffen_aantal"))} mono />
                  <KV
                    label="Tijdelijke LS-kast"
                    value={yesNoLabel(get("prov_tijdelijke_lskast"))}
                  />
                </SubBlock>
              </div>
            )}

            {tijdelijk !== "nsa" && tijdelijk !== "provisorium" && (
              <p className="text-[12px] text-muted-foreground">
                Geen aparte tijdelijke voorziening — werkzaamheden binnen één onderbreking.
              </p>
            )}

            <div className="mt-3">
              <div className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Tijdelijke tekeningen
              </div>
              <DocumentList items={tijdelijkeTekeningen} compact />
            </div>
          </Card>

          {/* Definitieve Situatie */}
          <Card title="Definitieve Situatie" icon={Target} tone="final">
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              <SubBlock title="RMU & MS" icon={PlugZap}>
                <KV label="RMU vervangen" value={yesNoLabel(get("def_rmu_vervangen"))} />
                <KV
                  label="Merk / configuratie"
                  value={valOr(get("def_rmu_merk_configuratie"))}
                  strong
                />
                <KV label="Ombouw IMS" value={yesNoLabel(get("def_ombouw_ims"))} />
                <KV label="MS richtingen" value={valOr(get("def_aantal_ms_richtingen"))} mono />
                <KV label="Vermogensveld" value={valOr(get("def_vermogensveld"))} />
              </SubBlock>
              <SubBlock title="Trafo" icon={Gauge}>
                <KV label="Vervangen" value={yesNoLabel(get("def_trafo_vervangen"))} />
                <KV label="Type" value={valOr(get("def_trafo_type"))} strong />
                <KV label="Gedraaid" value={yesNoLabel(get("def_trafo_gedraaid"))} />
              </SubBlock>
              <SubBlock title="LS & GGI" icon={Layers}>
                <KV label="LS situatie" value={valOr(get("def_ls_situatie"))} />
                <KV
                  label="LS stroken herschikken"
                  value={valOr(get("def_ls_aantal_stroken_herschikken"))}
                  mono
                />
                <KV label="Zekeringen wisselen" value={yesNoLabel(get("def_zekeringen_wisselen"))} />
                <KV label="GGI nieuw" value={yesNoLabel(get("def_ggi_nieuw"))} />
                <KV label="GGI aantal" value={valOr(get("def_ggi_aantal"))} mono />
              </SubBlock>
              <SubBlock title="Aarding & OV" icon={ShieldAlert}>
                <KV
                  label="Vereffening vernieuwen"
                  value={yesNoLabel(get("def_vereffening_vernieuwen"))}
                />
                <KV label="Aardelektrode" value={yesNoLabel(get("def_aardelektrode"))} />
                <KV label="Aardmeting" value={yesNoLabel(get("def_aardmeting"))} />
                <KV label="Flex OV nieuw" value={yesNoLabel(get("def_flex_ov_nieuw"))} />
                <KV label="OV kWh meter" value={yesNoLabel(get("def_ov_kwh_meter_nieuw"))} />
              </SubBlock>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-md border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-2">
              <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.08em] text-emerald-300/90">
                Opleverdossier
              </div>
              <Pill tone="primary">{valOr(get("def_opleverdossier"))}</Pill>
            </div>

            <div className="mt-3">
              <div className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Definitieve tekeningen
              </div>
              <DocumentList items={definitieveTekeningen} compact />
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN — 1/3 */}
        <div className="space-y-3">
          {/* Uitvoering Criticals */}
          <Card title="Voor Uitvoering Belangrijk" icon={AlertTriangle} tone="critical">
            {criticals.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/[0.04] px-3 py-2 text-[12px] text-emerald-200/90">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Geen openstaande aandachtspunten gevonden.
              </div>
            ) : (
              <ul className="space-y-2">
                {criticals.map((c, i) => {
                  const tone = c.tone;
                  const accent =
                    tone === "danger"
                      ? "before:bg-rose-400"
                      : tone === "warning"
                        ? "before:bg-amber-400"
                        : "before:bg-sky-400";
                  return (
                    <li
                      key={i}
                      className={cn(
                        "relative rounded-md border border-white/[0.05] bg-white/[0.015] py-2 pl-4 pr-3 before:absolute before:left-0 before:top-2 before:h-[calc(100%-1rem)] before:w-[3px] before:rounded-r-sm",
                        accent,
                      )}
                    >
                      <div className="font-display text-[12px] font-bold text-foreground">
                        {c.title}
                      </div>
                      <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                        {c.body}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-3 space-y-2">
              <div className="font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Toegang & dependencies
              </div>
              <div className="flex items-center gap-2 rounded-md border border-white/[0.05] bg-white/[0.012] px-3 py-2 text-[12px]">
                <KeyRound className="h-3.5 w-3.5 text-primary/80" />
                <span className="text-muted-foreground">Sleutelbeheer:</span>
                <span className="ml-auto text-foreground/85">
                  {valOr(get("wv_naam"), "Via WV")}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-white/[0.05] bg-white/[0.012] px-3 py-2 text-[12px]">
                <MapPin className="h-3.5 w-3.5 text-primary/80" />
                <span className="text-muted-foreground">Bereikbaarheid:</span>
                <span className="ml-auto truncate text-foreground/85">
                  {valOr(get("locatie"), valOr(get("straat")))}
                </span>
              </div>
            </div>
          </Card>

          {/* Korte Samenvatting */}
          <Card title="Korte Samenvatting" icon={FileText} tone="summary">
            <p className="text-[12.5px] leading-relaxed text-foreground/85">{samenvatting}</p>
          </Card>

          {/* Quick facts */}
          <Card title="Dossier Status" icon={Wrench}>
            <div className="space-y-2">
              <Row
                label="Tijdelijke tekeningen"
                value={
                  <Pill
                    tone={
                      (get<string>("tijd_tekeningen_aanwezig") ?? "").toLowerCase() === "ja"
                        ? "primary"
                        : "warning"
                    }
                  >
                    {yesNoLabel(get("tijd_tekeningen_aanwezig"))}
                  </Pill>
                }
              />
              <Row
                label="Definitieve tekeningen"
                value={
                  <Pill
                    tone={
                      (get<string>("def_tekeningen_aanwezig") ?? "").toLowerCase() === "ja"
                        ? "primary"
                        : "warning"
                    }
                  >
                    {yesNoLabel(get("def_tekeningen_aanwezig"))}
                  </Pill>
                }
              />
              <Row
                label="Asbest"
                value={
                  <Pill
                    tone={
                      (get<string>("asbest_benodigd") ?? "").toLowerCase() === "ja"
                        ? "danger"
                        : "muted"
                    }
                  >
                    {yesNoLabel(get("asbest_benodigd"))}
                  </Pill>
                }
              />
              <Row
                label="Bouwkundig"
                value={
                  <Pill
                    tone={
                      (get<string>("bouwkundig_benodigd") ?? "").toLowerCase() === "ja"
                        ? "warning"
                        : "muted"
                    }
                  >
                    {yesNoLabel(get("bouwkundig_benodigd"))}
                  </Pill>
                }
              />
            </div>
          </Card>
        </div>
      </div>

      {/* ============================================ */}
      {/* DOCUMENTATIE                                  */}
      {/* ============================================ */}
      <Card title="Documentatie" icon={FileText}>
        <DocumentList items={tekeningen} />
      </Card>

      {/* ============================================ */}
      {/* FOOTER                                        */}
      {/* ============================================ */}
      <div className="surface-card flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2.5 text-[10.5px] font-display font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        <div>TerreVolt BV © {new Date().getFullYear()} · Project dossier systeem</div>
        <div className="flex items-center gap-3">
          <span>Case {valOr(get("case_nummer"))}</span>
          <span className="text-white/15">|</span>
          <span>Confidential</span>
        </div>
      </div>

      {/* Print-only export layout (hidden on screen, visible on print/PDF) */}
      <DossierPrint
        project={project}
        opdrachtgeverNaam={opdrachtgeverNaam}
        perceelNaam={perceelNaam}
        msKabels={msKabels}
        lsKabels={lsKabels}
        tekeningen={tekeningen}
        criticals={criticals}
        samenvatting={samenvatting}
        periodeLabel={periodeLabel}
        periodeDuur={periodeDuur}
      />
    </div>
  );
};

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 rounded-md border border-white/[0.05] bg-white/[0.012] px-3 py-1.5">
    <div className="text-[12px] text-muted-foreground">{label}</div>
    <div>{value}</div>
  </div>
);

// =====================================================
// Document list
// =====================================================
const DocumentList: React.FC<{ items: TekeningRow[]; compact?: boolean }> = ({
  items,
  compact,
}) => {
  const [busy, setBusy] = useState<string | null>(null);

  const open = async (item: TekeningRow) => {
    setBusy(item.id);
    const { data, error } = await supabase.storage
      .from("project-tekeningen")
      .createSignedUrl(item.storage_path, 60 * 5);
    setBusy(null);
    if (error || !data?.signedUrl) {
      toast.error("Kan document niet openen");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-white/[0.08] bg-white/[0.01] px-3 py-3 text-[12px] text-muted-foreground">
        Geen documenten beschikbaar.
      </div>
    );
  }

  if (compact) {
    return (
      <ul className="space-y-1">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex items-center gap-2 rounded-md border border-white/[0.05] bg-white/[0.012] px-2.5 py-1.5"
          >
            <FileText className="h-3.5 w-3.5 text-primary/80" />
            <div className="min-w-0 flex-1 truncate text-[12px] text-foreground/85">
              {it.titel || it.bestandsnaam}
              {it.revisie && (
                <span className="ml-2 text-[10.5px] text-muted-foreground">rev {it.revisie}</span>
              )}
            </div>
            <button
              onClick={() => open(it)}
              disabled={busy === it.id}
              className="rounded p-1 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
              title="Openen"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-white/[0.05]">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-white/[0.05] bg-white/[0.02] text-left">
            <th className="px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Document
            </th>
            <th className="px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Type
            </th>
            <th className="px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Revisie
            </th>
            <th className="px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Datum
            </th>
            <th className="px-3 py-2 text-right font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Acties
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr
              key={it.id}
              className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-primary/80" />
                  <span className="truncate text-foreground/90">
                    {it.titel || it.bestandsnaam}
                  </span>
                </div>
                {it.tekening_nummer && (
                  <div className="ml-5 font-mono text-[10.5px] text-muted-foreground">
                    {it.tekening_nummer}
                  </div>
                )}
              </td>
              <td className="px-3 py-2">
                <Pill tone={it.soort === "tijdelijk" ? "warning" : "primary"}>
                  {cap(it.soort)}
                </Pill>
              </td>
              <td className="px-3 py-2 font-mono tabular-nums text-foreground/85">
                {it.revisie || "—"}
              </td>
              <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">
                {fmtShort(it.created_at)}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => open(it)}
                    className="rounded p-1 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                    title="Bekijken"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => open(it)}
                    className="rounded p-1 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                    title="Downloaden"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ProjectDossier;
