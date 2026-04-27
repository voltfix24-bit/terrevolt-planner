import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  Circle,
  AlertCircle,
  CalendarRange,
  Archive,
  FileText,
  Layers,
  Wrench,
  Target,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { nl } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectTekeningen } from "@/components/ProjectTekeningen";

// =====================================================
// Types
// =====================================================
type Status = "concept" | "gepland" | "in_uitvoering" | "afgerond";
type SectionState = "empty" | "partial" | "complete";

interface Lookup {
  id: string;
  naam: string;
}

interface Kabel {
  id?: string;
  diameter: string;
  positie: number;
}

type ProjectRow = Record<string, unknown> & { id: string };

// =====================================================
// UI primitives
// =====================================================
const STATE_STYLES: Record<SectionState, { dot: string; label: string; ring: string; accent: string }> = {
  empty: {
    dot: "bg-muted-foreground/40",
    label: "Niet gestart",
    ring: "border-white/10",
    accent: "bg-muted-foreground/40",
  },
  partial: {
    dot: "bg-amber-400",
    label: "Deels",
    ring: "border-amber-400/30",
    accent: "bg-amber-400",
  },
  complete: {
    dot: "bg-emerald-400",
    label: "Compleet",
    ring: "border-emerald-400/30",
    accent: "bg-emerald-400",
  },
};

const StateIcon: React.FC<{ state: SectionState; className?: string }> = ({ state, className }) => {
  if (state === "complete")
    return <CheckCircle2 className={`h-3.5 w-3.5 text-emerald-400 ${className ?? ""}`} />;
  if (state === "partial")
    return <AlertCircle className={`h-3.5 w-3.5 text-amber-400 ${className ?? ""}`} />;
  return <Circle className={`h-3.5 w-3.5 text-muted-foreground/50 ${className ?? ""}`} />;
};

const Section: React.FC<{
  id: string;
  title: string;
  subtitle?: string;
  state: SectionState;
  issues?: string[];
  children: React.ReactNode;
  tone?: "default" | "temp" | "final";
}> = ({ id, title, subtitle, state, issues, children, tone = "default" }) => {
  const s = STATE_STYLES[state];
  const toneRing =
    tone === "temp"
      ? "border-sky-400/15"
      : tone === "final"
        ? "border-violet-400/15"
        : "";
  const toneAccent =
    tone === "temp"
      ? "bg-gradient-to-b from-sky-400/80 to-sky-400/20"
      : tone === "final"
        ? "bg-gradient-to-b from-violet-400/80 to-violet-400/20"
        : `${s.accent} opacity-70`;
  return (
    <section
      id={id}
      className={cn(
        "surface-card scroll-mt-24 relative overflow-hidden rounded-lg border px-4 py-3.5",
        toneRing || s.ring,
      )}
    >
      <div className={cn("absolute left-0 top-0 h-full w-[3px]", toneAccent)} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StateIcon state={state} />
          <h2 className="font-display text-base font-bold tracking-tight text-foreground">
            {title}
          </h2>
          {subtitle && (
            <span className="hidden text-[11px] text-muted-foreground md:inline">
              · {subtitle}
            </span>
          )}
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      </div>
      {issues && issues.length > 0 && (
        <ul className="mb-3 space-y-0.5 rounded-md border border-amber-400/20 bg-amber-400/[0.04] px-2.5 py-1.5">
          {issues.map((iss) => (
            <li key={iss} className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-200/90">
              <AlertCircle className="mt-[2px] h-3 w-3 shrink-0" />
              <span>{iss}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2.5">{children}</div>
    </section>
  );
};

const SubBlock: React.FC<{
  title: string;
  children: React.ReactNode;
  dense?: boolean;
  muted?: boolean;
}> = ({ title, children, dense, muted }) => (
  <div
    className={cn(
      "rounded-md border px-3 py-2",
      muted ? "border-white/[0.04] bg-white/[0.008]" : "border-white/5 bg-white/[0.015]",
    )}
  >
    <div className="mb-2 flex items-center gap-1.5">
      <span className="h-1 w-1 rounded-full bg-primary/60" />
      <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.08em] text-primary/90">
        {title}
      </div>
    </div>
    <div className={dense ? "space-y-2" : "space-y-2.5"}>{children}</div>
  </div>
);

const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  className?: string;
  inline?: boolean;
}> = ({ label, children, className, inline }) =>
  inline ? (
    <div className={`flex items-center justify-between gap-3 ${className ?? ""}`}>
      <Label className="text-[11px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div className="flex-shrink-0">{children}</div>
    </div>
  ) : (
    <div className={className}>
      <Label className="mb-1 block text-[11px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );

interface OptionPickerProps {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  options: { value: string; label: string }[];
  allowDeselect?: boolean;
  size?: "sm" | "md";
}

const OptionPicker: React.FC<OptionPickerProps> = ({
  value,
  onChange,
  options,
  allowDeselect = true,
  size = "md",
}) => {
  const sz = size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs";
  return (
    <div className="inline-flex flex-wrap gap-1">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(active && allowDeselect ? null : o.value)}
            className={[
              "rounded-md border font-display font-semibold transition-all duration-100",
              sz,
              active
                ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.4),0_2px_8px_-2px_hsl(var(--primary)/0.4)]"
                : "border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:bg-white/[0.06] hover:text-foreground",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
};

const YESNO = [
  { value: "ja", label: "Ja" },
  { value: "nee", label: "Nee" },
];

// =====================================================
// Big "card-style" picker (used for tijdelijke situatie main choice)
// =====================================================
const ChoiceCardGroup: React.FC<{
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  options: { value: string; label: string; description?: string; icon?: React.ReactNode }[];
}> = ({ value, onChange, options }) => (
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
    {options.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(active ? null : o.value)}
          className={cn(
            "group rounded-lg border px-3 py-2.5 text-left transition-all",
            active
              ? "border-primary/60 bg-primary/[0.08] shadow-[0_0_0_1px_hsl(var(--primary)/0.35),0_4px_18px_-8px_hsl(var(--primary)/0.4)]"
              : "border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]",
          )}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-display font-bold",
                active
                  ? "border-primary/60 bg-primary text-primary-foreground"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground",
              )}
            >
              {o.icon ?? o.label.charAt(0)}
            </span>
            <span
              className={cn(
                "font-display text-[13px] font-semibold tracking-tight",
                active ? "text-foreground" : "text-foreground/85",
              )}
            >
              {o.label}
            </span>
          </div>
          {o.description && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {o.description}
            </p>
          )}
        </button>
      );
    })}
  </div>
);

// =====================================================
// Execution date range picker (GSU → GEU)
// =====================================================
const parseDate = (v: string | null | undefined): Date | undefined => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};
const toIso = (d: Date | undefined): string | null => (d ? format(d, "yyyy-MM-dd") : null);

const ExecutionRangePicker: React.FC<{
  start: string | null;
  end: string | null;
  onChange: (start: string | null, end: string | null) => void;
  compact?: boolean;
}> = ({ start, end, onChange, compact }) => {
  const from = parseDate(start);
  const to = parseDate(end);
  const range: DateRange | undefined = from || to ? { from, to } : undefined;
  const hasBoth = !!from && !!to;
  const days = hasBoth ? differenceInCalendarDays(to!, from!) + 1 : 0;

  const labelText = hasBoth
    ? `${format(from!, "d MMM yyyy", { locale: nl })} → ${format(to!, "d MMM yyyy", { locale: nl })}`
    : from
      ? `Vanaf ${format(from, "d MMM yyyy", { locale: nl })}`
      : "Selecteer uitvoeringsperiode";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "justify-start gap-2 border-white/10 bg-white/[0.03] text-left font-normal hover:bg-white/[0.07]",
              compact ? "h-8 px-2.5" : "h-9 px-3",
              !hasBoth && "text-muted-foreground",
            )}
          >
            <CalendarRange className="h-4 w-4 text-primary" />
            <span className="text-xs">{labelText}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={range}
            onSelect={(r) => onChange(toIso(r?.from), toIso(r?.to))}
            numberOfMonths={2}
            weekStartsOn={1}
            locale={nl}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      {hasBoth && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/[0.08] px-2 py-0.5 text-[11px] font-display font-semibold text-primary">
          {days} {days === 1 ? "dag" : "dagen"}
        </span>
      )}
      {(from || to) && (
        <button
          type="button"
          onClick={() => onChange(null, null)}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          wissen
        </button>
      )}
    </div>
  );
};

// =====================================================
// Page
// =====================================================
const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [opdrachtgevers, setOpdrachtgevers] = useState<Lookup[]>([]);
  const [percelen, setPercelen] = useState<Lookup[]>([]);
  const [msKabels, setMsKabels] = useState<Kabel[]>([]);
  const [lsKabels, setLsKabels] = useState<Kabel[]>([]);
  const [activeSection, setActiveSection] = useState<string>("deel-a");

  const dirtyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track active section via IntersectionObserver
  useEffect(() => {
    if (loading) return;
    const ids = ["deel-a", "deel-b", "deel-c", "deel-d", "archief"];
    const els = ids
      .map((i) => document.getElementById(i))
      .filter((e): e is HTMLElement => !!e);
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-140px 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [loading]);

  // ---------- Load ----------
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [pRes, oRes, peRes, msRes, lsRes] = await Promise.all([
      supabase.from("projecten").select("*").eq("id", id).maybeSingle(),
      supabase.from("opdrachtgevers").select("id, naam").order("positie"),
      supabase.from("percelen").select("id, naam").order("positie"),
      supabase
        .from("project_ms_kabels")
        .select("*")
        .eq("project_id", id)
        .eq("soort", "huidig")
        .order("positie"),
      supabase
        .from("project_ls_kabels")
        .select("*")
        .eq("project_id", id)
        .eq("soort", "huidig")
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
    setMsKabels(
      ((msRes.data ?? []) as { id: string; diameter: string | null; positie: number }[]).map(
        (k) => ({ id: k.id, diameter: k.diameter ?? "", positie: k.positie }),
      ),
    );
    setLsKabels(
      ((lsRes.data ?? []) as { id: string; diameter: string | null; positie: number }[]).map(
        (k) => ({ id: k.id, diameter: k.diameter ?? "", positie: k.positie }),
      ),
    );
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key: string, value: unknown) => {
    setProject((prev) => (prev ? { ...prev, [key]: value } : prev));
    if (dirtyTimer.current) clearTimeout(dirtyTimer.current);
    dirtyTimer.current = setTimeout(() => {
      void persist({ [key]: value });
    }, 600);
  };

  const persist = async (patch: Record<string, unknown>) => {
    if (!id) return;
    setSaving(true);
    const { error } = await supabase
      .from("projecten")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    setSaving(false);
    if (error) toast.error("Opslaan mislukt");
  };

  const get = <T,>(key: string): T | null => (project ? ((project[key] as T) ?? null) : null);

  const syncKabels = async (
    table: "project_ms_kabels" | "project_ls_kabels",
    rows: Kabel[],
  ) => {
    if (!id) return;
    await supabase.from(table).delete().eq("project_id", id).eq("soort", "huidig");
    if (rows.length > 0) {
      await supabase.from(table).insert(
        rows.map((k, i) => ({
          project_id: id,
          soort: "huidig",
          positie: i,
          diameter: k.diameter || null,
        })),
      );
    }
  };

  const ensureKabelCount = (
    list: Kabel[],
    setList: (rows: Kabel[]) => void,
    target: number,
  ) => {
    const safe = Math.max(0, Math.min(50, Math.floor(target)));
    if (safe === list.length) return list;
    let next: Kabel[];
    if (safe > list.length) {
      next = [...list];
      for (let i = list.length; i < safe; i++) next.push({ diameter: "", positie: i });
    } else {
      next = list.slice(0, safe);
    }
    setList(next);
    return next;
  };

  // =====================================================
  // Completeness analysis
  // =====================================================
  const completeness = useMemo(() => {
    if (!project) {
      return {
        A: { state: "empty" as SectionState, issues: [] as string[], score: 0, total: 1 },
        B: { state: "empty" as SectionState, issues: [] as string[], score: 0, total: 1 },
        C: { state: "empty" as SectionState, issues: [] as string[], score: 0, total: 1 },
        D: { state: "empty" as SectionState, issues: [] as string[], score: 0, total: 1 },
      };
    }

    const filled = (v: unknown) => v !== null && v !== undefined && v !== "" && !(typeof v === "number" && Number.isNaN(v));
    const g = (k: string) => project[k];

    // ---- Deel A ----
    const aRequired = ["case_nummer", "station_naam", "opdrachtgever_id", "perceel_id", "gsu_datum", "geu_datum"];
    const aOptional = ["wv_naam", "straat", "postcode", "stad"];
    const aFilled = aRequired.filter((k) => filled(g(k))).length;
    const aOpt = aOptional.filter((k) => filled(g(k))).length;
    const aIssues: string[] = [];
    if (!filled(g("case_nummer"))) aIssues.push("Case nummer ontbreekt");
    if (!filled(g("station_naam"))) aIssues.push("Stationsnaam ontbreekt");
    if (!filled(g("opdrachtgever_id"))) aIssues.push("Opdrachtgever niet gekozen");
    if (!filled(g("perceel_id"))) aIssues.push("Perceel niet gekozen");
    if (!filled(g("gsu_datum")) || !filled(g("geu_datum")))
      aIssues.push("Uitvoeringsperiode (GSU/GEU) ontbreekt");
    const aScore = aFilled + Math.min(aOpt, 4);
    const aTotal = aRequired.length + 4;
    const aState: SectionState =
      aFilled === 0 && aOpt === 0 ? "empty" : aFilled === aRequired.length ? "complete" : "partial";

    // ---- Deel B ----
    const bIssues: string[] = [];
    let bScore = 0;
    let bTotal = 0;
    const touchedB =
      filled(g("huidig_rmu_type")) ||
      filled(g("huidig_trafo_aanwezig")) ||
      filled(g("huidig_lsrek_aanwezig")) ||
      filled(g("huidig_ms_kabels_aanwezig")) ||
      filled(g("huidig_ls_kabels_aanwezig")) ||
      filled(g("huidig_flex_ov_aanwezig"));

    bTotal += 1;
    if (filled(g("huidig_rmu_type"))) bScore += 1;
    else bIssues.push("Huidige RMU/MS-installatie niet gekozen");

    bTotal += 1;
    if (filled(g("huidig_rmu_aantal_richtingen"))) bScore += 1;

    bTotal += 1;
    if (filled(g("huidig_trafo_aanwezig"))) {
      bScore += 1;
      if (g("huidig_trafo_aanwezig") === "ja" && !filled(g("huidig_trafo_type")))
        bIssues.push("Trafo aanwezig maar geen type ingevuld");
    }

    bTotal += 1;
    if (filled(g("huidig_lsrek_aanwezig"))) {
      bScore += 1;
      if (g("huidig_lsrek_aanwezig") === "ja" && !filled(g("huidig_lsrek_type")))
        bIssues.push("LS-rek aanwezig maar type niet gekozen");
    }

    bTotal += 1;
    if (filled(g("huidig_ms_kabels_aanwezig"))) {
      bScore += 1;
      if (g("huidig_ms_kabels_aanwezig") === "ja") {
        if (!filled(g("huidig_ms_kabels_type")))
          bIssues.push("MS-kabels aanwezig maar type niet gekozen");
        if (!filled(g("huidig_ms_kabels_aantal")))
          bIssues.push("MS-kabels aanwezig maar aantal niet ingevuld");
        if (msKabels.length > 0 && msKabels.some((k) => !k.diameter))
          bIssues.push("MS-kabel diameter(s) ontbreken");
      }
    }

    bTotal += 1;
    if (filled(g("huidig_ls_kabels_aanwezig"))) {
      bScore += 1;
      if (g("huidig_ls_kabels_aanwezig") === "ja") {
        if (!filled(g("huidig_ls_kabels_type")))
          bIssues.push("LS-kabels aanwezig maar type niet gekozen");
        if (!filled(g("huidig_ls_kabels_aantal")))
          bIssues.push("LS-kabels aanwezig maar aantal niet ingevuld");
        if (lsKabels.length > 0 && lsKabels.some((k) => !k.diameter))
          bIssues.push("LS-kabel diameter(s) ontbreken");
      }
    }

    const bState: SectionState = !touchedB
      ? "empty"
      : bIssues.length === 0 && bScore >= bTotal - 1
        ? "complete"
        : "partial";

    // ---- Deel C ----
    const cIssues: string[] = [];
    let cScore = 0;
    let cTotal = 1;
    const tijd = g("tijdelijke_situatie");
    if (filled(tijd)) cScore += 1;

    if (tijd === "nsa") {
      cTotal += 1;
      if (filled(g("nsa_luik_aanwezig"))) cScore += 1;
      else cIssues.push("NSA gekozen — geef aan of er een NSA-luik is");
    }
    if (tijd === "provisorium") {
      const provFields = [
        "prov_ms_eindsluitingen_aantal",
        "prov_ms_eindsluitingen_type",
        "prov_ms_moffen_aantal",
        "prov_ls_eindsluitingen_aantal",
        "prov_ls_moffen_aantal",
        "prov_tijdelijke_lskast",
      ];
      cTotal += provFields.length;
      provFields.forEach((f) => {
        if (filled(g(f))) cScore += 1;
      });
      if (!filled(g("prov_ms_eindsluitingen_aantal")))
        cIssues.push("Provisorium: aantal MS-eindsluitingen ontbreekt");
      if (!filled(g("prov_ms_eindsluitingen_type")))
        cIssues.push("Provisorium: type MS-eindsluitingen ontbreekt");
      if (!filled(g("prov_ls_eindsluitingen_aantal")))
        cIssues.push("Provisorium: aantal LS-eindsluitingen ontbreekt");
      if (!filled(g("prov_tijdelijke_lskast")))
        cIssues.push("Provisorium: tijdelijke LS-kast keuze ontbreekt");
    }

    const cState: SectionState = !filled(tijd)
      ? "empty"
      : cIssues.length === 0 && cScore >= cTotal
        ? "complete"
        : "partial";

    // ---- Deel D ----
    const dIssues: string[] = [];
    let dScore = 0;
    let dTotal = 0;

    const dKeys = [
      "def_rmu_vervangen",
      "def_ombouw_ims",
      "def_aantal_ms_richtingen",
      "def_vermogensveld",
      "def_trafo_vervangen",
      "def_trafo_gedraaid",
      "def_ls_situatie",
      "def_zekeringen_wisselen",
      "def_ggi_nieuw",
      "def_vereffening_vernieuwen",
      "def_aardelektrode",
      "def_aardmeting",
      "def_flex_ov_nieuw",
      "def_ov_kwh_meter_nieuw",
      "def_opleverdossier",
    ];
    dTotal = dKeys.length;
    dKeys.forEach((k) => {
      if (filled(g(k))) dScore += 1;
    });

    if (g("def_rmu_vervangen") === "ja" && !filled(g("def_rmu_merk_configuratie")))
      dIssues.push("RMU wordt vervangen — geef gewenste merk/configuratie op");
    if (g("def_trafo_vervangen") === "ja" && !filled(g("def_trafo_type")))
      dIssues.push("Trafo wordt vervangen — geef gewenst trafotype op");
    if (g("def_ls_situatie") === "herschikken" && !filled(g("def_ls_aantal_stroken_herschikken")))
      dIssues.push("LS-rek herschikken gekozen — vul aantal stroken in");
    if (g("def_ggi_nieuw") === "ja" && !filled(g("def_ggi_aantal")))
      dIssues.push("GGI nieuw gekozen — geef aantal op");

    const touchedD = dScore > 0;
    const dState: SectionState = !touchedD
      ? "empty"
      : dIssues.length === 0 && dScore >= dTotal - 2
        ? "complete"
        : "partial";

    return {
      A: { state: aState, issues: aIssues, score: aScore, total: aTotal },
      B: { state: bState, issues: bIssues, score: bScore, total: bTotal },
      C: { state: cState, issues: cIssues, score: cScore, total: cTotal },
      D: { state: dState, issues: dIssues, score: dScore, total: dTotal },
    };
  }, [project, msKabels, lsKabels]);

  const overallProgress = useMemo(() => {
    const total = completeness.A.total + completeness.B.total + completeness.C.total + completeness.D.total;
    const score = completeness.A.score + completeness.B.score + completeness.C.score + completeness.D.score;
    return total === 0 ? 0 : Math.round((score / total) * 100);
  }, [completeness]);

  const opdrachtgeverNaam = useMemo(
    () => opdrachtgevers.find((o) => o.id === get<string>("opdrachtgever_id"))?.naam,
    [opdrachtgevers, project],
  );
  const perceelNaam = useMemo(
    () => percelen.find((p) => p.id === get<string>("perceel_id"))?.naam,
    [percelen, project],
  );

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // =====================================================
  // Render
  // =====================================================
  if (loading || !project) {
    return (
      <div className="surface-card px-6 py-16 text-center text-sm text-muted-foreground">
        Laden…
      </div>
    );
  }

  const tijdSit = get<string>("tijdelijke_situatie");
  const huidigTrafo = get<string>("huidig_trafo_aanwezig");
  const huidigLs = get<string>("huidig_lsrek_aanwezig");
  const huidigMsKabels = get<string>("huidig_ms_kabels_aanwezig");
  const huidigLsKabels = get<string>("huidig_ls_kabels_aanwezig");
  const huidigOv = get<string>("huidig_flex_ov_aanwezig");
  const defRmuVerv = get<string>("def_rmu_vervangen");
  const defTrafoVerv = get<string>("def_trafo_vervangen");
  const defLsSit = get<string>("def_ls_situatie");
  const defGgi = get<string>("def_ggi_nieuw");

  const navItems: {
    id: string;
    key: "A" | "B" | "C" | "D" | "X";
    label: string;
    sub: string;
    icon: React.ReactNode;
    soon?: boolean;
  }[] = [
    { id: "deel-a", key: "A", label: "Projectgegevens", sub: "Deel A", icon: <FileText className="h-3.5 w-3.5" /> },
    { id: "deel-b", key: "B", label: "Huidige situatie", sub: "Deel B", icon: <Layers className="h-3.5 w-3.5" /> },
    { id: "deel-c", key: "C", label: "Tijdelijke situatie", sub: "Deel C", icon: <Wrench className="h-3.5 w-3.5" /> },
    { id: "deel-d", key: "D", label: "Gewenste situatie", sub: "Deel D", icon: <Target className="h-3.5 w-3.5" /> },
    { id: "archief", key: "X", label: "Project Archief", sub: "Documenten", icon: <Archive className="h-3.5 w-3.5" />, soon: true },
  ];

  // Summary chips
  const summaryChips: { label: string; value: string }[] = [];
  const gsuD = parseDate(get<string>("gsu_datum"));
  const geuD = parseDate(get<string>("geu_datum"));
  if (gsuD && geuD) {
    summaryChips.push({
      label: "Uitvoering",
      value: `${format(gsuD, "d MMM", { locale: nl })} → ${format(geuD, "d MMM yyyy", { locale: nl })}`,
    });
  }
  if (get<string>("huidig_rmu_type"))
    summaryChips.push({ label: "Huidig MS", value: String(get<string>("huidig_rmu_type")) });
  if (get<string>("huidig_trafo_type"))
    summaryChips.push({ label: "Huidige trafo", value: String(get<string>("huidig_trafo_type")) });
  if (tijdSit) summaryChips.push({ label: "Tijdelijk", value: tijdSit });
  if (defRmuVerv === "ja")
    summaryChips.push({
      label: "Nieuwe RMU",
      value: String(get<string>("def_rmu_merk_configuratie") || "ja"),
    });
  if (defTrafoVerv === "ja")
    summaryChips.push({
      label: "Nieuwe trafo",
      value: String(get<string>("def_trafo_type") || "ja"),
    });
  if (defLsSit) summaryChips.push({ label: "LS definitief", value: defLsSit });

  return (
    <div className="space-y-3">
      {/* ============================================ */}
      {/* PROJECT HEADER / ACTION BAR                  */}
      {/* ============================================ */}
      <div className="surface-card rounded-lg px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <button
              onClick={() => navigate("/projecten")}
              className="mt-0.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              title="Terug naar cases"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-primary/30 bg-primary/[0.07] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-primary">
                  {(get<string>("case_nummer") as string) || "—"}
                </span>
                <h1 className="truncate font-display text-lg font-bold tracking-tight text-foreground">
                  {(get<string>("station_naam") as string) || "Nieuwe case"}
                </h1>
                <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9.5px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
                  {(get<string>("status") as string) || "concept"}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {opdrachtgeverNaam ? <>Opdrachtgever: <span className="text-foreground/85">{opdrachtgeverNaam}</span></> : "Opdrachtgever niet gekozen"}
                {perceelNaam && <> · Perceel: <span className="text-foreground/85">{perceelNaam}</span></>}
                {(get<string>("wv_naam") as string) && <> · WV: <span className="text-foreground/85">{get<string>("wv_naam")}</span></>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden min-w-[160px] items-center gap-2 md:flex">
              <Progress value={overallProgress} className="h-1" />
              <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
                {overallProgress}%
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[11px] text-muted-foreground">
              <Save className={`h-3.5 w-3.5 ${saving ? "animate-pulse text-primary" : "text-emerald-400/80"}`} />
              {saving ? "Opslaan…" : "Autosave aan"}
            </div>
          </div>
        </div>

        {/* Execution period strip */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/15 bg-primary/[0.04] px-2.5 py-1.5">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.08em] text-primary/90">
              Uitvoeringsperiode (GSU → GEU)
            </span>
          </div>
          <ExecutionRangePicker
            start={get<string>("gsu_datum")}
            end={get<string>("geu_datum")}
            onChange={(s, e) => {
              setField("gsu_datum", s);
              setField("geu_datum", e);
            }}
            compact
          />
        </div>

        {/* Live summary chips */}
        {summaryChips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {summaryChips.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.025] px-1.5 py-0.5 text-[10.5px]"
              >
                <span className="font-display font-semibold uppercase tracking-wider text-muted-foreground">
                  {c.label}
                </span>
                <span className="text-foreground">{c.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ============================================ */}
      {/* TWO-COLUMN: LEFT NAV + MAIN WORKSPACE        */}
      {/* ============================================ */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        {/* Left intake nav */}
        <aside className="lg:sticky lg:top-3 lg:w-[224px] lg:shrink-0">
          <div className="surface-card rounded-lg border border-white/10 p-2">
            <div className="mb-1.5 px-1.5 pt-0.5">
              <div className="font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Case intake
              </div>
            </div>
            <nav className="space-y-0.5">
              {navItems.map((item) => {
                const c = item.key !== "X" ? completeness[item.key as "A" | "B" | "C" | "D"] : null;
                const isActive = activeSection === item.id;
                const isComplete = c?.state === "complete";
                const pct = c && c.total > 0 ? Math.round((c.score / c.total) * 100) : 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToSection(item.id)}
                    className={cn(
                      "group relative flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-all",
                      isActive
                        ? "bg-primary/[0.08] ring-1 ring-primary/30"
                        : "hover:bg-white/[0.04]",
                    )}
                  >
                    {/* status dot or icon */}
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                        isComplete
                          ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300"
                          : c?.state === "partial"
                            ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                            : isActive
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-white/10 bg-white/[0.03] text-muted-foreground",
                      )}
                    >
                      {item.soon ? (
                        item.icon
                      ) : isComplete ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        item.icon
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-1">
                        <span
                          className={cn(
                            "block truncate font-display text-[12px] font-semibold leading-tight",
                            isActive ? "text-foreground" : "text-foreground/85",
                          )}
                        >
                          {item.label}
                        </span>
                        {item.soon && (
                          <span className="rounded border border-white/10 bg-white/[0.04] px-1 py-0 text-[8.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Soon
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
                          {item.sub}
                        </span>
                        {c && (
                          <>
                            <span className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                              <span
                                className={cn(
                                  "block h-full rounded-full transition-all",
                                  isComplete
                                    ? "bg-emerald-400/80"
                                    : c.state === "partial"
                                      ? "bg-amber-400/70"
                                      : "bg-muted-foreground/30",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                            <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                              {c.score}/{c.total}
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* Mini live summary */}
            <div className="mt-3 border-t border-white/[0.06] pt-2">
              <div className="mb-1.5 px-1.5 font-display text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Live samenvatting
              </div>
              <div className="space-y-1 px-1.5 text-[10.5px]">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Voortgang</span>
                  <span className="font-mono font-semibold tabular-nums text-foreground">{overallProgress}%</span>
                </div>
                {gsuD && geuD && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Periode</span>
                    <span className="text-foreground/85">{differenceInCalendarDays(geuD, gsuD) + 1}d</span>
                  </div>
                )}
                {tijdSit && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Tijdelijk</span>
                    <span className="text-foreground/85 capitalize">{tijdSit}</span>
                  </div>
                )}
                {defLsSit && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">LS def.</span>
                    <span className="text-foreground/85 truncate max-w-[110px]" title={defLsSit}>{defLsSit}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Main workspace */}
        <div className="min-w-0 flex-1 space-y-3">
          {/* ============================================ */}
          {/* DEEL A — PROJECTGEGEVENS                     */}
          {/* ============================================ */}
          <Section
            id="deel-a"
            title="Deel A — Projectgegevens"
            subtitle="Project- en case-context"
            state={completeness.A.state}
            issues={completeness.A.issues}
          >
            <SubBlock title="A1. Basisgegevens">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Case nummer">
                  <Input
                    value={(get<string>("case_nummer") as string) || ""}
                    onChange={(e) => setField("case_nummer", e.target.value)}
                  />
                </Field>
                <Field label="Case naam / stationsnaam">
                  <Input
                    value={(get<string>("station_naam") as string) || ""}
                    onChange={(e) => setField("station_naam", e.target.value)}
                  />
                </Field>
                <Field label="Opdrachtgever">
                  <Select
                    value={(get<string>("opdrachtgever_id") as string) || ""}
                    onValueChange={(v) => setField("opdrachtgever_id", v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecteer opdrachtgever" />
                    </SelectTrigger>
                    <SelectContent>
                      {opdrachtgevers.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.naam}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Perceel">
                  <Select
                    value={(get<string>("perceel_id") as string) || ""}
                    onValueChange={(v) => setField("perceel_id", v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecteer perceel" />
                    </SelectTrigger>
                    <SelectContent>
                      {percelen.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.naam}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="WV / uitvoerder">
                  <Input
                    value={(get<string>("wv_naam") as string) || ""}
                    onChange={(e) => setField("wv_naam", e.target.value)}
                  />
                </Field>
                <Field label="Status">
                  <OptionPicker
                    value={(get<string>("status") as Status) || "concept"}
                    onChange={(v) => setField("status", v || "concept")}
                    allowDeselect={false}
                    options={[
                      { value: "concept", label: "Concept" },
                      { value: "gepland", label: "Gepland" },
                      { value: "in_uitvoering", label: "In uitvoering" },
                      { value: "afgerond", label: "Afgerond" },
                    ]}
                  />
                </Field>
                <Field label="Straat">
                  <Input
                    value={(get<string>("straat") as string) || ""}
                    onChange={(e) => setField("straat", e.target.value)}
                  />
                </Field>
                <Field label="Postcode">
                  <Input
                    value={(get<string>("postcode") as string) || ""}
                    onChange={(e) => setField("postcode", e.target.value)}
                  />
                </Field>
                <Field label="Stad">
                  <Input
                    value={(get<string>("stad") as string) || ""}
                    onChange={(e) => setField("stad", e.target.value)}
                  />
                </Field>
                <Field label="Notities" className="md:col-span-2">
                  <Textarea
                    value={(get<string>("notities") as string) || ""}
                    onChange={(e) => setField("notities", e.target.value)}
                    rows={3}
                  />
                </Field>
              </div>
            </SubBlock>

            <SubBlock title="A2. Projectrandvoorwaarden">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
                  <Field label="Bouwkundige werkzaamheden benodigd?" inline>
                    <OptionPicker
                      value={get<string>("bouwkundig_benodigd")}
                      onChange={(v) => setField("bouwkundig_benodigd", v)}
                      options={YESNO}
                      size="sm"
                    />
                  </Field>
                  {get<string>("bouwkundig_benodigd") === "ja" && (
                    <div className="mt-2.5 grid grid-cols-1 gap-2.5">
                      <Field label="Bouwkundige aannemer">
                        <Input
                          value={(get<string>("bouwkundig_aannemer") as string) || ""}
                          onChange={(e) => setField("bouwkundig_aannemer", e.target.value)}
                          placeholder="Naam aannemer"
                        />
                      </Field>
                      <Field label="Gewenst aantal dagen">
                        <Input
                          type="number"
                          min={0}
                          value={(get<number>("bouwkundig_dagen") as number) ?? ""}
                          onChange={(e) =>
                            setField(
                              "bouwkundig_dagen",
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                        />
                      </Field>
                    </div>
                  )}
                </div>

                <div className="rounded border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
                  <Field label="Asbestsanering benodigd?" inline>
                    <OptionPicker
                      value={get<string>("asbest_benodigd")}
                      onChange={(v) => setField("asbest_benodigd", v)}
                      options={YESNO}
                      size="sm"
                    />
                  </Field>
                  {get<string>("asbest_benodigd") === "ja" && (
                    <div className="mt-2.5 grid grid-cols-1 gap-2.5">
                      <Field label="Uitvoerder asbestsanering">
                        <Input
                          value={(get<string>("asbest_uitvoerder") as string) || ""}
                          onChange={(e) => setField("asbest_uitvoerder", e.target.value)}
                          placeholder="Naam uitvoerder"
                        />
                      </Field>
                      <Field label="Gewenst aantal dagen">
                        <Input
                          type="number"
                          min={0}
                          value={(get<number>("asbest_dagen") as number) ?? ""}
                          onChange={(e) =>
                            setField(
                              "asbest_dagen",
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            </SubBlock>
          </Section>

          {/* ============================================ */}
          {/* DEEL B — HUIDIGE SITUATIE                    */}
          {/* ============================================ */}
          <Section
            id="deel-b"
            title="Deel B — Huidige situatie"
            subtitle="Wat is er nu aanwezig op het station"
            state={completeness.B.state}
            issues={completeness.B.issues}
          >
            <SubBlock title="B1. MS / RMU huidig">
              <Field label="Huidige RMU / MS-installatie">
                <OptionPicker
                  value={get<string>("huidig_rmu_type")}
                  onChange={(v) => setField("huidig_rmu_type", v)}
                  options={[
                    { value: "prefab_hoog", label: "Prefab hoog" },
                    { value: "prefab_laag", label: "Prefab laag" },
                    { value: "magnefix_md", label: "Magnefix MD" },
                    { value: "magnefix_mf", label: "Magnefix MF" },
                    { value: "coq", label: "Coq" },
                    { value: "abb", label: "ABB" },
                    { value: "siemens", label: "Siemens" },
                    { value: "anders", label: "Anders" },
                  ]}
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Aantal MS-richtingen / velden">
                  <Input
                    type="number"
                    value={(get<number>("huidig_rmu_aantal_richtingen") as number) ?? ""}
                    onChange={(e) =>
                      setField(
                        "huidig_rmu_aantal_richtingen",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </Field>
                <Field label="Vermogensveld aanwezig?">
                  <OptionPicker
                    value={get<string>("huidig_vermogensveld")}
                    onChange={(v) => setField("huidig_vermogensveld", v)}
                    options={YESNO}
                  />
                </Field>
              </div>
            </SubBlock>

            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              <SubBlock title="B2. Trafo huidig" dense>
                <Field label="Trafo aanwezig?" inline>
                  <OptionPicker
                    value={huidigTrafo}
                    onChange={(v) => setField("huidig_trafo_aanwezig", v)}
                    options={YESNO}
                    size="sm"
                  />
                </Field>
                {huidigTrafo === "ja" && (
                  <Field label="Huidig trafotype / vermogen">
                    <Input
                      value={(get<string>("huidig_trafo_type") as string) || ""}
                      onChange={(e) => setField("huidig_trafo_type", e.target.value)}
                      placeholder="Bv. 400 kVA"
                    />
                  </Field>
                )}
              </SubBlock>

              <SubBlock title="B3. LS huidig" dense>
                <Field label="LS-rek aanwezig?" inline>
                  <OptionPicker
                    value={huidigLs}
                    onChange={(v) => setField("huidig_lsrek_aanwezig", v)}
                    options={YESNO}
                    size="sm"
                  />
                </Field>
                {huidigLs === "ja" && (
                  <Field label="Type LS-rek" inline>
                    <OptionPicker
                      value={get<string>("huidig_lsrek_type")}
                      onChange={(v) => setField("huidig_lsrek_type", v)}
                      options={[
                        { value: "open", label: "Open" },
                        { value: "gesloten", label: "Gesloten" },
                      ]}
                      size="sm"
                    />
                  </Field>
                )}
              </SubBlock>
            </div>

            <SubBlock title="B4. OV huidig" dense>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                <Field label="Flex OV kast aanwezig?" inline>
                  <OptionPicker
                    value={huidigOv}
                    onChange={(v) => setField("huidig_flex_ov_aanwezig", v)}
                    options={YESNO}
                    size="sm"
                  />
                </Field>
                <Field label="OV kWh-meter" inline>
                  <OptionPicker
                    value={get<string>("huidig_ov_kwh_meter")}
                    onChange={(v) => setField("huidig_ov_kwh_meter", v)}
                    options={[
                      { value: "nee", label: "Nee" },
                      { value: "1_fase", label: "1-fase" },
                      { value: "3_fase", label: "3-fase" },
                    ]}
                    size="sm"
                  />
                </Field>
              </div>
            </SubBlock>

            <SubBlock title="B5. Kabels huidig">
              {/* MS-kabels group */}
              <div className="rounded border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/80">
                    MS-kabels
                  </span>
                  <OptionPicker
                    value={huidigMsKabels}
                    onChange={(v) => {
                      setField("huidig_ms_kabels_aanwezig", v);
                      if (v !== "ja") {
                        setMsKabels([]);
                        void syncKabels("project_ms_kabels", []);
                        setField("huidig_ms_kabels_aantal", null);
                        setField("huidig_ms_kabels_type", null);
                      }
                    }}
                    options={YESNO}
                    size="sm"
                  />
                </div>
                {huidigMsKabels === "ja" && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                      <Field label="Type">
                        <OptionPicker
                          value={get<string>("huidig_ms_kabels_type")}
                          onChange={(v) => setField("huidig_ms_kabels_type", v)}
                          options={[
                            { value: "gplk", label: "GPLK" },
                            { value: "kunststof", label: "Kunststof" },
                            { value: "gemengd", label: "Gemengd" },
                          ]}
                          size="sm"
                        />
                      </Field>
                      <Field label="Aantal richtingen / sets">
                        <Input
                          type="number"
                          min={0}
                          value={(get<number>("huidig_ms_kabels_aantal") as number) ?? ""}
                          onChange={(e) => {
                            const n = e.target.value ? Number(e.target.value) : 0;
                            setField("huidig_ms_kabels_aantal", n || null);
                            const next = ensureKabelCount(msKabels, setMsKabels, n);
                            void syncKabels("project_ms_kabels", next);
                          }}
                        />
                      </Field>
                    </div>
                    {msKabels.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
                          Diameter per MS-kabel
                        </Label>
                        {msKabels.map((k, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="w-8 shrink-0 text-xs text-muted-foreground">#{i + 1}</span>
                            <Input
                              value={k.diameter}
                              placeholder="Bv. 3x95 Al"
                              onChange={(e) => {
                                const next = msKabels.map((row, idx) =>
                                  idx === i ? { ...row, diameter: e.target.value } : row,
                                );
                                setMsKabels(next);
                              }}
                              onBlur={() => void syncKabels("project_ms_kabels", msKabels)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* LS-kabels group */}
              <div className="rounded border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/80">
                    LS-kabels
                  </span>
                  <OptionPicker
                    value={huidigLsKabels}
                    onChange={(v) => {
                      setField("huidig_ls_kabels_aanwezig", v);
                      if (v !== "ja") {
                        setLsKabels([]);
                        void syncKabels("project_ls_kabels", []);
                        setField("huidig_ls_kabels_aantal", null);
                        setField("huidig_ls_kabels_type", null);
                      }
                    }}
                    options={YESNO}
                    size="sm"
                  />
                </div>
                {huidigLsKabels === "ja" && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                      <Field label="Type">
                        <OptionPicker
                          value={get<string>("huidig_ls_kabels_type")}
                          onChange={(v) => setField("huidig_ls_kabels_type", v)}
                          options={[
                            { value: "gplk", label: "GPLK" },
                            { value: "kunststof", label: "Kunststof" },
                            { value: "gemengd", label: "Gemengd" },
                          ]}
                          size="sm"
                        />
                      </Field>
                      <Field label="Aantal kabels / groepen">
                        <Input
                          type="number"
                          min={0}
                          value={(get<number>("huidig_ls_kabels_aantal") as number) ?? ""}
                          onChange={(e) => {
                            const n = e.target.value ? Number(e.target.value) : 0;
                            setField("huidig_ls_kabels_aantal", n || null);
                            const next = ensureKabelCount(lsKabels, setLsKabels, n);
                            void syncKabels("project_ls_kabels", next);
                          }}
                        />
                      </Field>
                    </div>
                    {lsKabels.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
                          Diameter per LS-kabel
                        </Label>
                        {lsKabels.map((k, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="w-8 shrink-0 text-xs text-muted-foreground">#{i + 1}</span>
                            <Input
                              value={k.diameter}
                              placeholder="Bv. 4x150 Al"
                              onChange={(e) => {
                                const next = lsKabels.map((row, idx) =>
                                  idx === i ? { ...row, diameter: e.target.value } : row,
                                );
                                setLsKabels(next);
                              }}
                              onBlur={() => void syncKabels("project_ls_kabels", lsKabels)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </SubBlock>

            <SubBlock title="B6. Herbruikbaarheid huidig" dense>
              <Field label="Bestaande kabels herbruikbaar?" inline>
                <OptionPicker
                  value={get<string>("huidig_kabels_herbruikbaar")}
                  onChange={(v) => setField("huidig_kabels_herbruikbaar", v)}
                  options={[
                    { value: "ja", label: "Ja" },
                    { value: "nee", label: "Nee" },
                    { value: "deels", label: "Deels" },
                    { value: "onbekend", label: "?" },
                  ]}
                  size="sm"
                />
              </Field>
            </SubBlock>
          </Section>

          {/* ============================================ */}
          {/* DEEL C — TIJDELIJKE SITUATIE                 */}
          {/* ============================================ */}
          <Section
            id="deel-c"
            title="Deel C — Tijdelijke situatie"
            subtitle="Hoe wordt het project tijdens uitvoering opgevangen"
            state={completeness.C.state}
            issues={completeness.C.issues}
            tone="temp"
          >
            <SubBlock title="C1. Tijdelijke situatie tijdens uitvoering">
              <ChoiceCardGroup
                value={tijdSit}
                onChange={(v) => setField("tijdelijke_situatie", v)}
                options={[
                  { value: "geen", label: "Geen", description: "Geen tijdelijke voorziening nodig." },
                  { value: "nsa", label: "NSA", description: "Niet-spanningsloos aansluiten via NSA-luik." },
                  { value: "provisorium", label: "Provisorium", description: "Tijdelijke MS/LS-opstelling tijdens werk." },
                ]}
              />
            </SubBlock>

            {tijdSit === "nsa" && (
              <SubBlock title="C2. NSA">
                <Field label="Is er al een NSA-luik?">
                  <OptionPicker
                    value={get<string>("nsa_luik_aanwezig")}
                    onChange={(v) => setField("nsa_luik_aanwezig", v)}
                    options={YESNO}
                  />
                </Field>
              </SubBlock>
            )}

            {tijdSit === "provisorium" && (
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                <SubBlock title="C3a. MS tijdelijk">
                  <div className="grid grid-cols-1 gap-2.5">
                    <Field label="Aantal MS-eindsluitingen">
                      <Input
                        type="number"
                        value={(get<number>("prov_ms_eindsluitingen_aantal") as number) ?? ""}
                        onChange={(e) =>
                          setField(
                            "prov_ms_eindsluitingen_aantal",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      />
                    </Field>
                    <Field label="Type MS-eindsluitingen">
                      <OptionPicker
                        value={get<string>("prov_ms_eindsluitingen_type")}
                        onChange={(v) => setField("prov_ms_eindsluitingen_type", v)}
                        options={[
                          { value: "magnefix", label: "Magnefix" },
                          { value: "anders", label: "Anders" },
                        ]}
                        size="sm"
                      />
                    </Field>
                    <Field label="Aantal MS-moffen">
                      <Input
                        type="number"
                        value={(get<number>("prov_ms_moffen_aantal") as number) ?? ""}
                        onChange={(e) =>
                          setField(
                            "prov_ms_moffen_aantal",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      />
                    </Field>
                  </div>
                </SubBlock>

                <SubBlock title="C3b. LS tijdelijk">
                  <div className="grid grid-cols-1 gap-2.5">
                    <Field label="Aantal LS-eindsluitingen">
                      <Input
                        type="number"
                        value={(get<number>("prov_ls_eindsluitingen_aantal") as number) ?? ""}
                        onChange={(e) =>
                          setField(
                            "prov_ls_eindsluitingen_aantal",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      />
                    </Field>
                    <Field label="Aantal LS-moffen">
                      <Input
                        type="number"
                        value={(get<number>("prov_ls_moffen_aantal") as number) ?? ""}
                        onChange={(e) =>
                          setField(
                            "prov_ls_moffen_aantal",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      />
                    </Field>
                    <Field label="Tijdelijke LS-kast aansluiten / ontkoppelen?" inline>
                      <OptionPicker
                        value={get<string>("prov_tijdelijke_lskast")}
                        onChange={(v) => setField("prov_tijdelijke_lskast", v)}
                        options={YESNO}
                        size="sm"
                      />
                    </Field>
                  </div>
                </SubBlock>
              </div>
            )}

            {(tijdSit === "provisorium" || tijdSit === "nsa") && (
              <SubBlock title="C4. Werktekeningen tijdelijke situatie">
                <Field label="Zijn er werktekeningen voor de tijdelijke situatie?" inline>
                  <OptionPicker
                    value={get<string>("tijd_tekeningen_aanwezig")}
                    onChange={(v) => setField("tijd_tekeningen_aanwezig", v)}
                    options={YESNO}
                    size="sm"
                  />
                </Field>
                {get<string>("tijd_tekeningen_aanwezig") === "ja" && (
                  <div className="mt-3">
                    <ProjectTekeningen
                      projectId={id!}
                      soort="tijdelijk"
                      emptyHint="PDF, DWG, DXF of afbeeldingen — meerdere bestanden tegelijk mogelijk"
                    />
                  </div>
                )}
              </SubBlock>
            )}
          </Section>

          {/* ============================================ */}
          {/* DEEL D — DEFINITIEVE SITUATIE                */}
          {/* ============================================ */}
          <Section
            id="deel-d"
            title="Deel D — Gewenste definitieve situatie"
            subtitle="Hoe ziet het station eruit na renovatie"
            state={completeness.D.state}
            issues={completeness.D.issues}
            tone="final"
          >
            {/* Primary technical decisions: D1-D3 */}
            <SubBlock title="D1. MS / RMU definitief">
              <Field label="RMU vervangen?" inline>
                <OptionPicker
                  value={defRmuVerv}
                  onChange={(v) => setField("def_rmu_vervangen", v)}
                  options={YESNO}
                  size="sm"
                />
              </Field>
              {defRmuVerv === "ja" && (
                <Field label="Gewenst merk / configuratie">
                  <Input
                    value={(get<string>("def_rmu_merk_configuratie") as string) || ""}
                    onChange={(e) => setField("def_rmu_merk_configuratie", e.target.value)}
                    placeholder="Bv. ABB SafeRing 4-veld"
                  />
                </Field>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Ombouw naar iMS?">
                  <OptionPicker
                    value={get<string>("def_ombouw_ims")}
                    onChange={(v) => setField("def_ombouw_ims", v)}
                    options={YESNO}
                  />
                </Field>
                <Field label="MS-richtingen incl. trafoveld">
                  <Input
                    type="number"
                    value={(get<number>("def_aantal_ms_richtingen") as number) ?? ""}
                    onChange={(e) =>
                      setField(
                        "def_aantal_ms_richtingen",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </Field>
                <Field label="Vermogensveld definitief?">
                  <OptionPicker
                    value={get<string>("def_vermogensveld")}
                    onChange={(v) => setField("def_vermogensveld", v)}
                    options={YESNO}
                  />
                </Field>
              </div>
            </SubBlock>

            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              <SubBlock title="D2. Trafo definitief">
                <Field label="Trafo vervangen?" inline>
                  <OptionPicker
                    value={defTrafoVerv}
                    onChange={(v) => setField("def_trafo_vervangen", v)}
                    options={YESNO}
                    size="sm"
                  />
                </Field>
                {defTrafoVerv === "ja" && (
                  <Field label="Gewenst trafotype / vermogen">
                    <Input
                      value={(get<string>("def_trafo_type") as string) || ""}
                      onChange={(e) => setField("def_trafo_type", e.target.value)}
                      placeholder="Bv. 630 kVA"
                    />
                  </Field>
                )}
                <Field label="Trafo gedraaid?" inline>
                  <OptionPicker
                    value={get<string>("def_trafo_gedraaid")}
                    onChange={(v) => setField("def_trafo_gedraaid", v)}
                    options={YESNO}
                    size="sm"
                  />
                </Field>
              </SubBlock>

              <SubBlock title="D3. LS definitief">
                <Field label="Gewenste definitieve LS-situatie">
                  <OptionPicker
                    value={defLsSit}
                    onChange={(v) => setField("def_ls_situatie", v)}
                    options={[
                      { value: "behouden", label: "Behouden" },
                      { value: "herschikken", label: "Herschikken" },
                      { value: "uitbreidingsrek", label: "Uitbreidingsrek" },
                      { value: "nieuw_le630", label: "Nieuw ≤630" },
                      { value: "nieuw_gt630_le1000", label: "Nieuw >630 ≤1000" },
                    ]}
                    size="sm"
                  />
                </Field>
                {defLsSit === "herschikken" && (
                  <Field label="Aantal stroken / posities herschikken">
                    <Input
                      type="number"
                      value={(get<number>("def_ls_aantal_stroken_herschikken") as number) ?? ""}
                      onChange={(e) =>
                        setField(
                          "def_ls_aantal_stroken_herschikken",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                    />
                  </Field>
                )}
                <Field label="Zekeringen wisselen?" inline>
                  <OptionPicker
                    value={get<string>("def_zekeringen_wisselen")}
                    onChange={(v) => setField("def_zekeringen_wisselen", v)}
                    options={YESNO}
                    size="sm"
                  />
                </Field>
              </SubBlock>
            </div>

            {/* Supporting systems D4-D6 */}
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
              <SubBlock title="D4. GGI definitief" dense muted>
                <Field label="Verlichting / WCD / schakelaar nieuw?" inline>
                  <OptionPicker
                    value={defGgi}
                    onChange={(v) => setField("def_ggi_nieuw", v)}
                    options={YESNO}
                    size="sm"
                  />
                </Field>
                {defGgi === "ja" && (
                  <Field label="Hoeveel?" inline>
                    <OptionPicker
                      value={(get<number>("def_ggi_aantal") as number)?.toString() ?? null}
                      onChange={(v) => setField("def_ggi_aantal", v ? Number(v) : null)}
                      options={[
                        { value: "1", label: "1" },
                        { value: "2", label: "2" },
                      ]}
                      size="sm"
                    />
                  </Field>
                )}
              </SubBlock>

              <SubBlock title="D5. Vereffening / aarding" dense muted>
                <Field label="Vereffeningsleiding vernieuwen?" inline>
                  <OptionPicker
                    value={get<string>("def_vereffening_vernieuwen")}
                    onChange={(v) => setField("def_vereffening_vernieuwen", v)}
                    options={YESNO}
                    size="sm"
                  />
                </Field>
                <Field label="Aardelektrode nodig?" inline>
                  <OptionPicker
                    value={get<string>("def_aardelektrode")}
                    onChange={(v) => setField("def_aardelektrode", v)}
                    options={YESNO}
                    size="sm"
                  />
                </Field>
                <Field label="Aardmeting uitvoeren?" inline>
                  <OptionPicker
                    value={get<string>("def_aardmeting")}
                    onChange={(v) => setField("def_aardmeting", v)}
                    options={YESNO}
                    size="sm"
                  />
                </Field>
              </SubBlock>

              <SubBlock title="D6. OV definitief" dense muted>
                <Field label="Nieuwe Flex OV?" inline>
                  <OptionPicker
                    value={get<string>("def_flex_ov_nieuw")}
                    onChange={(v) => setField("def_flex_ov_nieuw", v)}
                    options={YESNO}
                    size="sm"
                  />
                </Field>
                <Field label="Nieuwe OV kWh-meter?" inline>
                  <OptionPicker
                    value={get<string>("def_ov_kwh_meter_nieuw")}
                    onChange={(v) => setField("def_ov_kwh_meter_nieuw", v)}
                    options={YESNO}
                    size="sm"
                  />
                </Field>
              </SubBlock>
            </div>

            <SubBlock title="D7. Opleverdossier" dense>
              <Field label="Scope opleverdossier" inline>
                <OptionPicker
                  value={get<string>("def_opleverdossier")}
                  onChange={(v) => setField("def_opleverdossier", v)}
                  options={[
                    { value: "inclusief_civiel", label: "Incl. civiel" },
                    { value: "exclusief_civiel", label: "Excl. civiel" },
                  ]}
                  size="sm"
                />
              </Field>
            </SubBlock>

            <SubBlock title="D8. Werktekeningen definitieve situatie">
              <Field label="Zijn er werktekeningen voor de definitieve situatie?" inline>
                <OptionPicker
                  value={get<string>("def_tekeningen_aanwezig")}
                  onChange={(v) => setField("def_tekeningen_aanwezig", v)}
                  options={YESNO}
                  size="sm"
                />
              </Field>
              {get<string>("def_tekeningen_aanwezig") === "ja" && (
                <div className="mt-3">
                  <ProjectTekeningen
                    projectId={id!}
                    soort="definitief"
                    emptyHint="PDF, DWG, DXF of afbeeldingen — meerdere bestanden tegelijk mogelijk"
                  />
                </div>
              )}
            </SubBlock>
          </Section>

          {/* ============================================ */}
          {/* PROJECT ARCHIEF (placeholder)                */}
          {/* ============================================ */}
          <section
            id="archief"
            className="surface-card scroll-mt-24 relative overflow-hidden rounded-lg border border-white/10 px-4 py-3.5"
          >
            <div className="absolute left-0 top-0 h-full w-[3px] bg-muted-foreground/30" />
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                  Project Archief
                </h2>
                <span className="hidden text-[11px] text-muted-foreground md:inline">
                  · Documenten, oplevering & historie
                </span>
              </div>
              <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9.5px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
                Binnenkort
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Hier komt later het volledige projectarchief: opleverdossiers, foto's, gerelateerde documenten en
              een tijdlijn van wijzigingen aan deze case.
            </p>
          </section>

          <div className="flex justify-end pt-1">
            <Button
              variant="outline"
              onClick={() => navigate("/projecten")}
              className="rounded-md"
            >
              Terug naar projectenlijst
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetail;
