import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Edit2, Plus, Power, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// Cast for tables not yet in generated types (feestdagen, monteur_afwezigheid)
// and for monteurs.werkdagen column added in migration.
const sb = supabase as any;
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type MonteurType = "schakelmonteur" | "montagemonteur";
type Aanwijzing = "VOP" | "VP" | "AVP";

interface Monteur {
  id: string;
  naam: string;
  type: MonteurType;
  aanwijzing_ls: Aanwijzing | null;
  aanwijzing_ms: Aanwijzing | null;
  actief: boolean;
  created_at: string;
  werkdagen?: number[] | null;
}

interface Feestdag {
  id: string;
  datum: string;
  naam: string;
  jaar: number;
}

type AfwezigheidType = "vakantie" | "ziek" | "opleiding" | "vrije_dag" | "overig";

interface Afwezigheid {
  id: string;
  monteur_id: string;
  datum_van: string;
  datum_tot: string;
  type: AfwezigheidType;
  omschrijving: string | null;
}

const AFWEZIGHEID_TYPES: { id: AfwezigheidType; label: string; color: string }[] = [
  { id: "vakantie", label: "Vakantie", color: "#378add" },
  { id: "ziek", label: "Ziek", color: "#ef4444" },
  { id: "opleiding", label: "Opleiding", color: "#9333ea" },
  { id: "vrije_dag", label: "Vrije dag", color: "#feb300" },
  { id: "overig", label: "Overig", color: "#9ca3af" },
];

function formatDatum(date: string): string {
  return new Date(date).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRange(van: string, tot: string): string {
  const v = new Date(van);
  const t = new Date(tot);
  if (van === tot) return formatDatum(van);
  const sameYear = v.getFullYear() === t.getFullYear();
  const sameMonth = sameYear && v.getMonth() === t.getMonth();
  if (sameMonth) {
    return `${v.getDate()} — ${t.getDate()} ${t.toLocaleDateString("nl-NL", { month: "short", year: "numeric" })}`;
  }
  if (sameYear) {
    return `${v.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} — ${t.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return `${formatDatum(van)} — ${formatDatum(tot)}`;
}

const WEEKDAG_LABELS = ["MA", "DI", "WO", "DO", "VR"] as const;
const WEEKDAG_NUMS = [1, 2, 3, 4, 5] as const;

const AANWIJZINGEN: Aanwijzing[] = ["VOP", "VP", "AVP"];

const aanwijzingStyle = (a: Aanwijzing | null): React.CSSProperties => {
  if (a === "AVP") return { backgroundColor: "#3fff8b", color: "#0a1a30" };
  if (a === "VP") return { backgroundColor: "#7cc1ff", color: "#0a1a30" };
  if (a === "VOP") return { backgroundColor: "#cbd5e1", color: "#0a1a30" };
  return { backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" };
};

const typeStyle = (t: MonteurType): React.CSSProperties =>
  t === "schakelmonteur"
    ? { backgroundColor: "#feb300", color: "#0a1a30" }
    : { backgroundColor: "#378add", color: "#0a1a30" };

const typeLabel = (t: MonteurType) =>
  t === "schakelmonteur" ? "Schakelmonteur" : "Montagemonteur";

// ===== Tijdlijn helpers =====

const DAG_LABELS = ["MA", "DI", "WO", "DO", "VR"] as const;

function getCurrentISOWeek(): { week: number; jaar: number } {
  const now = new Date();
  const target = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { week, jaar: target.getUTCFullYear() };
}

function getMondayOfISOWeek(week: number, jaar: number): Date {
  const simple = new Date(Date.UTC(jaar, 0, 4));
  const dow = (simple.getUTCDay() + 6) % 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - dow + (week - 1) * 7);
  return monday;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function fmtDayMonth(d: Date): string {
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

function isoKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftWeek(week: number, jaar: number, delta: number): { week: number; jaar: number } {
  const monday = getMondayOfISOWeek(week, jaar);
  const newMonday = addDays(monday, delta * 7);
  // Recompute ISO week of new monday
  const target = new Date(newMonday);
  target.setUTCDate(target.getUTCDate() + 3); // Thursday
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  const w =
    1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { week: w, jaar: target.getUTCFullYear() };
}

interface ProjectInfo {
  id: string;
  case_nummer: string | null;
}

const Capaciteit = () => {
  const [monteurs, setMonteurs] = useState<Monteur[]>([]);
  const [loading, setLoading] = useState(true);
  const [toonInactieven, setToonInactieven] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Monteur | null>(null);

  // tabs
  const [tab, setTab] = useState<"monteurs" | "ploegen" | "tijdlijn" | "beschikbaarheid">("monteurs");

  // form state
  const [naam, setNaam] = useState("");
  const [type, setType] = useState<MonteurType>("schakelmonteur");
  const [aanwijzingLs, setAanwijzingLs] = useState<Aanwijzing | null>(null);
  const [aanwijzingMs, setAanwijzingMs] = useState<Aanwijzing | null>(null);
  const [actief, setActief] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("monteurs")
        .select("*")
        .order("naam", { ascending: true });
      if (error) {
        toast.error("Kon monteurs niet laden");
      } else {
        setMonteurs((data ?? []) as Monteur[]);
      }
      setLoading(false);
    };
    load();
  }, []);

  const zichtbaar = useMemo(
    () => monteurs.filter((m) => (toonInactieven ? true : m.actief)),
    [monteurs, toonInactieven]
  );

  const openNew = () => {
    setEditing(null);
    setNaam("");
    setType("schakelmonteur");
    setAanwijzingLs(null);
    setAanwijzingMs(null);
    setActief(true);
    setModalOpen(true);
  };

  const openEdit = (m: Monteur) => {
    setEditing(m);
    setNaam(m.naam);
    setType(m.type);
    setAanwijzingLs(m.aanwijzing_ls);
    setAanwijzingMs(m.aanwijzing_ms);
    setActief(m.actief);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!naam.trim()) {
      toast.error("Naam is verplicht");
      return;
    }
    setSaving(true);
    const payload = {
      naam: naam.trim(),
      type,
      aanwijzing_ls: aanwijzingLs,
      aanwijzing_ms: aanwijzingMs,
      actief,
    };

    if (editing) {
      const prev = monteurs;
      const optimistic = monteurs.map((m) =>
        m.id === editing.id ? { ...m, ...payload } : m
      );
      setMonteurs(optimistic);
      const { error } = await supabase
        .from("monteurs")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        setMonteurs(prev);
        toast.error("Opslaan mislukt");
      } else {
        toast.success("Monteur opgeslagen");
        setModalOpen(false);
      }
    } else {
      const { data, error } = await supabase
        .from("monteurs")
        .insert(payload)
        .select()
        .single();
      if (error || !data) {
        toast.error("Opslaan mislukt");
      } else {
        setMonteurs((cur) =>
          [...cur, data as Monteur].sort((a, b) => a.naam.localeCompare(b.naam))
        );
        toast.success("Monteur opgeslagen");
        setModalOpen(false);
      }
    }
    setSaving(false);
  };

  const toggleActief = async (m: Monteur) => {
    const prev = monteurs;
    const next = monteurs.map((x) =>
      x.id === m.id ? { ...x, actief: !x.actief } : x
    );
    setMonteurs(next);
    const { error } = await supabase
      .from("monteurs")
      .update({ actief: !m.actief })
      .eq("id", m.id);
    if (error) {
      setMonteurs(prev);
      toast.error("Wijzigen mislukt");
    }
  };

  const PillButton = ({
    active,
    children,
    onClick,
  }: {
    active: boolean;
    children: React.ReactNode;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-md px-3.5 py-1.5 text-xs font-display font-semibold tracking-wide transition-all",
        active
          ? "bg-primary text-primary-foreground shadow-[0_0_0_1px_hsl(var(--primary))]"
          : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <PageHeader title="Capaciteit" description="Monteurs en hun beschikbaarheid." />
        {tab === "monteurs" && (
          <Button
            onClick={openNew}
            className="font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
          >
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} /> Monteur toevoegen
          </Button>
        )}
      </div>

      {/* Tab navigation */}
      <div className="mb-6 flex items-center gap-1 border-b border-white/10">
        {(
          [
            { id: "monteurs", label: "Monteurs" },
            { id: "ploegen", label: "Ploegen" },
            { id: "tijdlijn", label: "Tijdlijn" },
            { id: "beschikbaarheid", label: "Beschikbaarheid" },
          ] as const
        ).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "relative px-4 py-2.5 text-sm font-display font-semibold transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t.label}
              {active && (
                <span
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                  style={{ backgroundColor: "hsl(var(--primary))" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {tab === "monteurs" && (
        <div className="surface-card overflow-hidden">
          {/* Top bar with toggle */}
          <div className="flex items-center justify-between px-6 py-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {zichtbaar.length} monteur{zichtbaar.length === 1 ? "" : "s"}
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
              <span className="font-display">Toon inactieven</span>
              <Switch
                checked={toonInactieven}
                onCheckedChange={setToonInactieven}
                className="data-[state=checked]:bg-primary"
              />
            </label>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              Laden…
            </div>
          ) : zichtbaar.length === 0 ? (
            <EmptyState onAdd={openNew} totalCount={monteurs.length} />
          ) : (
            <div className="px-2 pb-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Naam</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Aanwijzing LS</th>
                    <th className="px-4 py-3 font-semibold">Aanwijzing MS</th>
                    <th className="px-4 py-3 text-right font-semibold">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {zichtbaar.map((m) => (
                    <tr
                      key={m.id}
                      className="group border-b transition-colors hover:bg-white/[0.04]"
                      style={{ borderColor: "rgba(255,255,255,0.06)" }}
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-display font-semibold text-foreground">
                          {m.naam}
                          {!m.actief && (
                            <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              inactief
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-display font-semibold"
                          style={typeStyle(m.type)}
                        >
                          {typeLabel(m.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {m.aanwijzing_ls ? (
                          <span
                            className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-display font-bold tracking-wide"
                            style={aanwijzingStyle(m.aanwijzing_ls)}
                          >
                            {m.aanwijzing_ls}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {m.aanwijzing_ms ? (
                          <span
                            className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-display font-bold tracking-wide"
                            style={aanwijzingStyle(m.aanwijzing_ms)}
                          >
                            {m.aanwijzing_ms}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(m)}
                            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                            aria-label="Wijzigen"
                            title="Wijzigen"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => toggleActief(m)}
                            className={[
                              "rounded-md p-2 transition-colors hover:bg-white/[0.06]",
                              m.actief
                                ? "text-primary hover:text-primary"
                                : "text-muted-foreground hover:text-foreground",
                            ].join(" ")}
                            aria-label={m.actief ? "Op inactief zetten" : "Activeren"}
                            title={m.actief ? "Op inactief zetten" : "Activeren"}
                          >
                            <Power className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "ploegen" && <PloegenView monteurs={monteurs} />}

      {tab === "tijdlijn" && (
        <TijdlijnView monteurs={monteurs.filter((m) => m.actief)} />
      )}

      {tab === "beschikbaarheid" && (
        <BeschikbaarheidView
          monteurs={monteurs}
          onMonteurUpdate={(id, patch) =>
            setMonteurs((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)))
          }
        />
      )}

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="max-w-md gap-0 border-0 p-0 [&>button]:hidden"
          style={{
            backgroundColor: "rgba(10, 26, 48, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            backdropFilter: "blur(18px)",
          }}
        >
          <div className="flex items-start justify-between px-6 pt-6">
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
              {editing ? "Monteur wijzigen" : "Monteur toevoegen"}
            </h2>
            <button
              onClick={() => setModalOpen(false)}
              className="-mr-2 -mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Annuleren
            </button>
          </div>

          <div className="space-y-5 px-6 py-6">
            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Naam
              </Label>
              <Input
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
                placeholder="Bijv. Hassan"
                className="rounded-md border-white/10 bg-white/[0.04] text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-primary"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Type
              </Label>
              <div className="flex gap-2">
                {(["schakelmonteur", "montagemonteur"] as MonteurType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={[
                      "flex-1 rounded-md px-4 py-2.5 text-sm font-display font-semibold transition-all",
                      type === t
                        ? "bg-primary text-primary-foreground"
                        : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
                    ].join(" ")}
                  >
                    {typeLabel(t)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Aanwijzing LS
              </Label>
              <div className="flex gap-2">
                {AANWIJZINGEN.map((a) => (
                  <PillButton
                    key={a}
                    active={aanwijzingLs === a}
                    onClick={() => setAanwijzingLs(aanwijzingLs === a ? null : a)}
                  >
                    {a}
                  </PillButton>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Aanwijzing MS
              </Label>
              <div className="flex gap-2">
                {AANWIJZINGEN.map((a) => (
                  <PillButton
                    key={a}
                    active={aanwijzingMs === a}
                    onClick={() => setAanwijzingMs(aanwijzingMs === a ? null : a)}
                  >
                    {a}
                  </PillButton>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md bg-white/[0.03] px-4 py-3">
              <div>
                <div className="font-display text-sm font-semibold text-foreground">
                  Actief
                </div>
                <div className="text-xs text-muted-foreground">
                  Monteur is beschikbaar voor planning
                </div>
              </div>
              <Switch
                checked={actief}
                onCheckedChange={setActief}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          </div>

          <div className="px-6 pb-6">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
            >
              {saving ? "Bezig met opslaan…" : "Opslaan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const EmptyState = ({
  onAdd,
  totalCount,
}: {
  onAdd: () => void;
  totalCount: number;
}) => (
  <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Plus className="h-7 w-7" strokeWidth={2} />
    </div>
    <h3 className="font-display text-lg font-bold text-foreground">
      {totalCount === 0
        ? "Nog geen monteurs toegevoegd"
        : "Geen actieve monteurs"}
    </h3>
    <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
      {totalCount === 0
        ? "Voeg je eerste monteur toe om te beginnen met plannen"
        : "Schakel ‘Toon inactieven’ in om inactieve monteurs te zien"}
    </p>
    {totalCount === 0 && (
      <Button
        onClick={onAdd}
        className="mt-6 font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
      >
        <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} /> Monteur toevoegen
      </Button>
    )}
  </div>
);

// ===================== Tijdlijn =====================

const SIDEBAR_W = 160;
const CELL_W = 48;
const CELL_H = 52;
const BLOCK_H = 40;

const DAG_FULL = ["MA", "DI", "WO", "DO", "VR"] as const;

// Custom scrollbar styles for the timeline scroll areas
const TIMELINE_SCROLL_STYLES = `
  .tijdlijn-scroll::-webkit-scrollbar { height: 4px; }
  .tijdlijn-scroll::-webkit-scrollbar-track { background: transparent; }
  .tijdlijn-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
  .tijdlijn-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
`;

const TijdlijnView = ({ monteurs }: { monteurs: Monteur[] }) => {
  const navigate = useNavigate();
  const initial = useMemo(() => getCurrentISOWeek(), []);
  const [startWeek, setStartWeek] = useState(initial.week);
  const [startJaar, setStartJaar] = useState(initial.jaar);
  const [numWeeks, setNumWeeks] = useState<2 | 4 | 8>(4);

  const [planMap, setPlanMap] = useState<Record<string, Record<string, string[]>>>({});
  const [projects, setProjects] = useState<Record<string, ProjectInfo>>({});
  const [loadingPlan, setLoadingPlan] = useState(false);

  // Build visible weeks
  const visibleWeeks = useMemo(() => {
    const arr: { week: number; jaar: number; monday: Date }[] = [];
    let cur = { week: startWeek, jaar: startJaar };
    for (let i = 0; i < numWeeks; i++) {
      const monday = getMondayOfISOWeek(cur.week, cur.jaar);
      arr.push({ week: cur.week, jaar: cur.jaar, monday });
      cur = shiftWeek(cur.week, cur.jaar, 1);
    }
    return arr;
  }, [startWeek, startJaar, numWeeks]);

  // All visible day dates
  const visibleDays = useMemo(() => {
    const days: { date: Date; key: string; weekIdx: number; dayIdx: number }[] = [];
    visibleWeeks.forEach((w, wi) => {
      for (let d = 0; d < 5; d++) {
        const date = addDays(w.monday, d);
        days.push({ date, key: isoKey(date), weekIdx: wi, dayIdx: d });
      }
    });
    return days;
  }, [visibleWeeks]);

  // Fetch planning data
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingPlan(true);
      const weekNrs = Array.from(new Set(visibleWeeks.map((w) => w.week)));

      const { data: weken, error: wErr } = await supabase
        .from("project_weken")
        .select("id, week_nr, project_id, positie")
        .in("week_nr", weekNrs);

      if (wErr || !weken) {
        if (!cancelled) {
          setPlanMap({});
          setProjects({});
          setLoadingPlan(false);
        }
        return;
      }

      const weekIds = weken.map((w) => w.id);
      const projectIds = Array.from(
        new Set(weken.map((w) => w.project_id).filter(Boolean) as string[])
      );

      const [cellenRes, projRes] = await Promise.all([
        weekIds.length
          ? supabase
              .from("planning_cellen")
              .select("id, week_id, dag_index")
              .in("week_id", weekIds)
          : Promise.resolve({ data: [], error: null } as any),
        projectIds.length
          ? supabase
              .from("projecten")
              .select("id, case_nummer")
              .in("id", projectIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (cellenRes.error || projRes.error) {
        if (!cancelled) {
          setPlanMap({});
          setProjects({});
          setLoadingPlan(false);
        }
        return;
      }

      const cellen = (cellenRes.data ?? []) as {
        id: string;
        week_id: string;
        dag_index: number;
      }[];
      const cellenIds = cellen.map((c) => c.id);

      const { data: celMonteurs, error: cmErr } = cellenIds.length
        ? await supabase
            .from("cel_monteurs")
            .select("cel_id, monteur_id")
            .in("cel_id", cellenIds)
        : { data: [], error: null };

      if (cmErr) {
        if (!cancelled) {
          setPlanMap({});
          setProjects({});
          setLoadingPlan(false);
        }
        return;
      }

      // Build week_id → {project_id, week_nr}
      const weekById: Record<string, { project_id: string | null; week_nr: number }> = {};
      weken.forEach((w) => {
        weekById[w.id] = { project_id: w.project_id, week_nr: w.week_nr };
      });

      // Build cel_id → {project_id, week_nr, dag_index}
      const celById: Record<string, { project_id: string | null; week_nr: number; dag_index: number }> = {};
      cellen.forEach((c) => {
        const w = weekById[c.week_id];
        if (w) {
          celById[c.id] = {
            project_id: w.project_id,
            week_nr: w.week_nr,
            dag_index: c.dag_index,
          };
        }
      });

      // Map week_nr → first matching visible monday (so we can compute date)
      const weekNrToMonday: Record<number, Date> = {};
      visibleWeeks.forEach((w) => {
        weekNrToMonday[w.week] = w.monday;
      });

      // Build monteur_id → date_key → Set<project_id>
      const map: Record<string, Record<string, Set<string>>> = {};
      const cms = (celMonteurs ?? []) as { cel_id: string; monteur_id: string }[];
      cms.forEach((cm) => {
        const cel = celById[cm.cel_id];
        if (!cel || !cel.project_id) return;
        const monday = weekNrToMonday[cel.week_nr];
        if (!monday) return;
        const date = addDays(monday, cel.dag_index);
        const key = isoKey(date);
        if (!map[cm.monteur_id]) map[cm.monteur_id] = {};
        if (!map[cm.monteur_id][key]) map[cm.monteur_id][key] = new Set();
        map[cm.monteur_id][key].add(cel.project_id);
      });

      const finalMap: Record<string, Record<string, string[]>> = {};
      Object.entries(map).forEach(([mid, days]) => {
        finalMap[mid] = {};
        Object.entries(days).forEach(([k, set]) => {
          finalMap[mid][k] = Array.from(set);
        });
      });

      const projMap: Record<string, ProjectInfo> = {};
      ((projRes.data ?? []) as ProjectInfo[]).forEach((p) => {
        projMap[p.id] = p;
      });

      if (!cancelled) {
        setPlanMap(finalMap);
        setProjects(projMap);
        setLoadingPlan(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [visibleWeeks]);

  // Order monteurs: schakel first, then montage; alphabetic per group
  const orderedGroups = useMemo(() => {
    const sch = monteurs
      .filter((m) => m.type === "schakelmonteur")
      .sort((a, b) => a.naam.localeCompare(b.naam));
    const mon = monteurs
      .filter((m) => m.type === "montagemonteur")
      .sort((a, b) => a.naam.localeCompare(b.naam));
    return { sch, mon };
  }, [monteurs]);

  // Scroll sync
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef(false);

  useEffect(() => {
    const h = headerRef.current;
    const b = bodyRef.current;
    if (!h || !b) return;
    const onH = () => {
      if (lockRef.current) return;
      lockRef.current = true;
      b.scrollLeft = h.scrollLeft;
      requestAnimationFrame(() => (lockRef.current = false));
    };
    const onB = () => {
      if (lockRef.current) return;
      lockRef.current = true;
      h.scrollLeft = b.scrollLeft;
      requestAnimationFrame(() => (lockRef.current = false));
    };
    h.addEventListener("scroll", onH);
    b.addEventListener("scroll", onB);
    return () => {
      h.removeEventListener("scroll", onH);
      b.removeEventListener("scroll", onB);
    };
  }, []);

  const shiftBy = (delta: number) => {
    const next = shiftWeek(startWeek, startJaar, delta);
    setStartWeek(next.week);
    setStartJaar(next.jaar);
  };

  const totalGridWidth = visibleDays.length * CELL_W;

  // Precompute per-week day metadata (keys, labels, borders) once.
  // This is shared across every monteur row, so we build it once per
  // visibleWeeks change rather than per-row per-render.
  const weekStructures = useMemo<WeekStructure[]>(() => {
    return visibleWeeks.map((w) => {
      const days: WeekStructure["days"] = [];
      for (let d = 0; d < 5; d++) {
        const date = addDays(w.monday, d);
        days.push({
          dayIdx: d,
          dateKey: isoKey(date),
          dayLabel: DAG_FULL[d],
          dateLabel: fmtDayMonth(date),
          isWeekEnd: d === 4,
        });
      }
      return { weekKey: `${w.jaar}-${w.week}`, days };
    });
  }, [visibleWeeks]);

  const handleNavigate = useCallback(
    (id: string) => navigate(`/plannen?project=${id}`),
    [navigate]
  );

  if (monteurs.length === 0) {
    return (
      <div className="surface-card px-6 py-16 text-center text-sm text-muted-foreground">
        Voeg eerst monteurs toe op het Monteurs tabblad
      </div>
    );
  }

  const renderRow = (m: Monteur) => (
    <MonteurRow
      key={m.id}
      monteur={m}
      days={planMap[m.id]}
      weekStructures={weekStructures}
      projects={projects}
      onNavigate={handleNavigate}
    />
  );

  return (
    <TooltipProvider delayDuration={200}>
      <style>{TIMELINE_SCROLL_STYLES}</style>
      <div className="space-y-4">
        {/* Controls bar */}
        <div className="surface-card sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => shiftBy(-1)}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              aria-label="Vorige week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[140px] text-center font-display text-sm font-semibold text-foreground">
              Week {startWeek} {startJaar}
            </div>
            <button
              onClick={() => shiftBy(1)}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              aria-label="Volgende week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {([2, 4, 8] as const).map((n) => {
              const active = numWeeks === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNumWeeks(n)}
                  className={[
                    "rounded-md px-3 py-1.5 text-xs font-display font-semibold transition-all",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
                  ].join(" ")}
                >
                  {n} weken
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid */}
        <div className="surface-card overflow-hidden">
          {/* Header */}
          <div className="flex border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div
              className="shrink-0"
              style={{
                width: SIDEBAR_W,
                minWidth: SIDEBAR_W,
                borderRight: "1px solid rgba(255,255,255,0.08)",
              }}
            />
            <div
              ref={headerRef}
              className="overflow-x-auto tijdlijn-scroll"
              style={{ scrollbarWidth: "thin" }}
            >
              <div style={{ width: totalGridWidth }}>
                {/* Week headers */}
                <div className="flex">
                  {visibleWeeks.map((w, i) => (
                    <div
                      key={`${w.jaar}-${w.week}-${i}`}
                      className="flex items-center justify-center border-l py-1.5 font-display text-xs font-bold text-foreground"
                      style={{
                        width: 5 * CELL_W,
                        borderColor: "rgba(255,255,255,0.08)",
                      }}
                    >
                      Week {w.week}
                    </div>
                  ))}
                </div>
                {/* Day headers */}
                <div className="flex">
                  {visibleDays.map((d, i) => (
                    <div
                      key={d.key + i}
                      className="flex flex-col items-center justify-center border-l py-1"
                      style={{
                        width: CELL_W,
                        borderColor: "rgba(255,255,255,0.06)",
                        borderRight:
                          d.dayIdx === 4
                            ? "1px solid rgba(255,255,255,0.12)"
                            : "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <div className="font-display text-[10px] font-bold text-foreground">
                        {DAG_LABELS[d.dayIdx]}
                      </div>
                      <div className="text-[9px] text-muted-foreground">
                        {fmtDayMonth(d.date)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div ref={bodyRef} className="overflow-x-auto tijdlijn-scroll" style={{ scrollbarWidth: "thin" }}>
            <div style={{ minWidth: SIDEBAR_W + totalGridWidth }}>
              {loadingPlan && (
                <div className="px-4 py-2 text-xs text-muted-foreground">Laden…</div>
              )}

              {/* Schakelmonteurs */}
              {orderedGroups.sch.length > 0 && (
                <>
                  <GroupLabel label="Schakelmonteurs" />
                  {orderedGroups.sch.map(renderRow)}
                </>
              )}

              {/* Montagemonteurs */}
              {orderedGroups.mon.length > 0 && (
                <>
                  <GroupLabel label="Montagemonteurs" />
                  {orderedGroups.mon.map(renderRow)}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

interface WeekStructure {
  weekKey: string;
  days: {
    dayIdx: number;
    dateKey: string;
    dayLabel: string;
    dateLabel: string;
    isWeekEnd: boolean;
  }[];
}

const MonteurRow = memo(function MonteurRow({
  monteur,
  days,
  weekStructures,
  projects,
  onNavigate,
}: {
  monteur: Monteur;
  days: Record<string, string[]> | undefined;
  weekStructures: WeekStructure[];
  projects: Record<string, ProjectInfo>;
  onNavigate: (id: string) => void;
}) {
  // Compute slots/spans once per (days, weekStructures) change.
  // Memoizing on `days` (the row's slice of planMap) means rows for
  // monteurs with no planning changes do not recompute.
  const weekItems = useMemo(() => {
    const safeDays = days ?? {};
    return weekStructures.map((w) => {
      type Slot =
        | { kind: "vrij" }
        | { kind: "single"; projectId: string }
        | { kind: "conflict"; projectIds: string[] };
      const slots: Slot[] = w.days.map((d) => {
        const ids = safeDays[d.dateKey] ?? [];
        if (ids.length === 0) return { kind: "vrij" };
        if (ids.length === 1) return { kind: "single", projectId: ids[0] };
        return { kind: "conflict", projectIds: ids };
      });

      type Item =
        | {
            kind: "vrij";
            key: string;
            title: string;
            borderRight: string;
          }
        | {
            kind: "conflict";
            key: string;
            borderRight: string;
            projectIds: string[];
          }
        | {
            kind: "single";
            key: string;
            span: number;
            blockWidth: number;
            label: string;
            fullLabel: string;
            projectId: string;
            borderRight: string;
          };

      const items: Item[] = [];
      let i = 0;
      while (i < 5) {
        const slot = slots[i];
        const meta = w.days[i];
        const lastIdx = (n: number) => i + n - 1 === 4;
        if (slot.kind === "vrij") {
          items.push({
            kind: "vrij",
            key: `v-${i}`,
            title: `${meta.dayLabel} ${meta.dateLabel}`,
            borderRight: meta.isWeekEnd
              ? "1px solid rgba(255,255,255,0.12)"
              : "1px solid rgba(255,255,255,0.04)",
          });
          i++;
          continue;
        }
        if (slot.kind === "conflict") {
          items.push({
            kind: "conflict",
            key: `c-${i}`,
            borderRight: meta.isWeekEnd
              ? "1px solid rgba(255,255,255,0.12)"
              : "1px solid rgba(255,255,255,0.04)",
            projectIds: slot.projectIds,
          });
          i++;
          continue;
        }
        const pid = slot.projectId;
        let span = 1;
        while (
          i + span < 5 &&
          slots[i + span].kind === "single" &&
          (slots[i + span] as { kind: "single"; projectId: string })
            .projectId === pid
        ) {
          span++;
        }
        const blockWidth = span * CELL_W - 2;
        const fullLabel = projects[pid]?.case_nummer ?? "—";
        items.push({
          kind: "single",
          key: `s-${i}`,
          span,
          blockWidth,
          fullLabel,
          label: blockWidth > 80 ? fullLabel : fullLabel.slice(0, 6),
          projectId: pid,
          borderRight: lastIdx(span)
            ? "1px solid rgba(255,255,255,0.12)"
            : "1px solid rgba(255,255,255,0.04)",
        });
        i += span;
      }
      return { weekKey: w.weekKey, items };
    });
  }, [days, weekStructures, projects]);

  return (
    <div
      className="flex border-b transition-colors hover:bg-white/[0.04]"
      style={{ borderColor: "rgba(255,255,255,0.06)", height: CELL_H }}
    >
      <div
        className="sticky left-0 z-10 flex items-center px-3"
        style={{
          width: SIDEBAR_W,
          minWidth: SIDEBAR_W,
          backgroundColor: "hsl(var(--card))",
          borderRight: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="truncate font-display text-sm font-semibold text-foreground">
          {monteur.naam}
        </div>
      </div>
      <div className="flex">
        {weekItems.map((w) => (
          <div key={w.weekKey} className="flex">
            {w.items.map((it) => {
              if (it.kind === "vrij") {
                return (
                  <div
                    key={it.key}
                    title={it.title}
                    style={{
                      width: CELL_W,
                      height: CELL_H,
                      borderRight: it.borderRight,
                    }}
                  />
                );
              }
              if (it.kind === "conflict") {
                return (
                  <div
                    key={it.key}
                    style={{
                      width: CELL_W,
                      height: CELL_H,
                      borderRight: it.borderRight,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ConflictBlock
                      projectIds={it.projectIds}
                      projects={projects}
                      onNavigate={onNavigate}
                    />
                  </div>
                );
              }
              return (
                <div
                  key={it.key}
                  style={{
                    width: it.span * CELL_W,
                    height: CELL_H,
                    borderRight: it.borderRight,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 1px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onNavigate(it.projectId)}
                    title={it.fullLabel}
                    style={{
                      width: it.blockWidth,
                      height: BLOCK_H,
                      backgroundColor: "#3fff8b",
                      color: "#0a1a30",
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                      overflow: "hidden",
                    }}
                    className="font-display transition-opacity hover:opacity-80"
                  >
                    <span className="truncate px-1">{it.label}</span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});

const GroupLabel = ({ label }: { label: string }) => (
  <div
    className="sticky left-0 z-10 px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-wider text-muted-foreground"
    style={{
      backgroundColor: "rgba(255,255,255,0.02)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}
  >
    {label}
  </div>
);

const ConflictBlock = memo(function ConflictBlock({
  projectIds,
  projects,
  onNavigate,
}: {
  projectIds: string[];
  projects: Record<string, ProjectInfo>;
  onNavigate: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Stable order: by case_nummer asc (fallback to id), so the list is
  // identical across renders and across cells with the same projects.
  const ordered = useMemo(() => {
    return [...projectIds].sort((a, b) => {
      const ca = projects[a]?.case_nummer ?? a;
      const cb = projects[b]?.case_nummer ?? b;
      return ca.localeCompare(cb, undefined, { numeric: true });
    });
  }, [projectIds, projects]);

  const handleNavigate = (id: string) => {
    setOpen(false);
    onNavigate(id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="font-display font-bold text-white transition-opacity hover:opacity-80"
          style={{
            width: 46,
            height: BLOCK_H,
            backgroundColor: "#ef4444",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          !
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="center">
        <div className="mb-1 px-2 text-[10px] font-display font-bold uppercase tracking-wider text-muted-foreground">
          Dubbel gepland
        </div>
        <div className="flex flex-col gap-1">
          {ordered.map((id) => {
            const p = projects[id];
            return (
              <button
                key={id}
                onClick={() => handleNavigate(id)}
                className="rounded-md px-2 py-1.5 text-left text-sm font-display font-semibold text-foreground transition-colors hover:bg-white/[0.06]"
              >
                {p?.case_nummer ?? id.slice(0, 8)}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
});

// ===================== Beschikbaarheid =====================

const BeschikbaarheidView = ({
  monteurs,
  onMonteurUpdate,
}: {
  monteurs: Monteur[];
  onMonteurUpdate: (id: string, patch: Partial<Monteur>) => void;
}) => {
  return (
    <div className="space-y-6">
      <FeestdagenSection />
      <MonteurBeschikbaarheidSection monteurs={monteurs} onMonteurUpdate={onMonteurUpdate} />
    </div>
  );
};

// ----- Feestdagen -----

const JAREN = [2025, 2026, 2027] as const;

const FeestdagenSection = () => {
  const [jaar, setJaar] = useState<number>(new Date().getFullYear());
  const [items, setItems] = useState<Feestdag[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Feestdag | null>(null);

  const [datum, setDatum] = useState("");
  const [naam, setNaam] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb
      .from("feestdagen")
      .select("*")
      .eq("jaar", jaar)
      .order("datum", { ascending: true });
    if (error) {
      toast.error("Kon feestdagen niet laden");
    } else {
      setItems((data ?? []) as Feestdag[]);
    }
    setLoading(false);
  }, [jaar]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setDatum(`${jaar}-01-01`);
    setNaam("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!datum || !naam.trim()) {
      toast.error("Datum en naam zijn verplicht");
      return;
    }
    const dJaar = new Date(datum).getFullYear();
    setSaving(true);
    const { data, error } = await sb
      .from("feestdagen")
      .insert({ datum, naam: naam.trim(), jaar: dJaar })
      .select()
      .single();
    setSaving(false);
    if (error || !data) {
      toast.error("Opslaan mislukt — datum mogelijk al ingevoerd");
      return;
    }
    if (dJaar === jaar) {
      setItems((cur) => [...cur, data as Feestdag].sort((a, b) => a.datum.localeCompare(b.datum)));
    }
    toast.success("Feestdag opgeslagen");
    setModalOpen(false);
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    const id = confirmDel.id;
    const prev = items;
    setItems(items.filter((x) => x.id !== id));
    setConfirmDel(null);
    const { error } = await sb.from("feestdagen").delete().eq("id", id);
    if (error) {
      setItems(prev);
      toast.error("Verwijderen mislukt");
    } else {
      toast.success("Feestdag verwijderd");
    }
  };

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-display text-base font-bold tracking-tight text-foreground">
            Feestdagen
          </h3>
          <select
            value={jaar}
            onChange={(e) => setJaar(parseInt(e.target.value, 10))}
            className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-display font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {JAREN.map((j) => (
              <option key={j} value={j} className="bg-[#0a1a30]">
                {j}
              </option>
            ))}
          </select>
        </div>
        <Button
          onClick={openNew}
          size="sm"
          className="font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={2.5} />
          Feestdag toevoegen
        </Button>
      </div>

      {loading ? (
        <div className="px-6 py-12 text-center text-sm text-muted-foreground">Laden…</div>
      ) : items.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-muted-foreground">
          Geen feestdagen voor {jaar}
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {items.map((f) => (
            <li
              key={f.id}
              className="group flex items-center justify-between px-6 py-3 transition-colors hover:bg-white/[0.03]"
            >
              <div className="flex min-w-0 items-center gap-4">
                <span className="min-w-[150px] font-display text-sm font-semibold text-foreground">
                  {formatDatum(f.datum)}
                </span>
                <span className="truncate text-sm text-muted-foreground">{f.naam}</span>
              </div>
              <button
                onClick={() => setConfirmDel(f)}
                className="rounded-md p-2 text-muted-foreground opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                aria-label="Verwijderen"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="max-w-md gap-0 border-0 p-0 [&>button]:hidden"
          style={{
            backgroundColor: "rgba(10, 26, 48, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            backdropFilter: "blur(18px)",
          }}
        >
          <div className="flex items-start justify-between px-6 pt-6">
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
              Feestdag toevoegen
            </h2>
            <button
              onClick={() => setModalOpen(false)}
              className="-mr-2 -mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Annuleren
            </button>
          </div>
          <div className="space-y-5 px-6 py-6">
            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Datum
              </Label>
              <Input
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className="rounded-md border-white/10 bg-white/[0.04] text-foreground focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Naam
              </Label>
              <Input
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
                placeholder="Bijv. Koningsdag"
                className="rounded-md border-white/10 bg-white/[0.04] text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-primary"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Jaar wordt automatisch bepaald uit de datum.
            </div>
          </div>
          <div className="px-6 pb-6">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
            >
              {saving ? "Bezig met opslaan…" : "Opslaan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent
          className="max-w-sm gap-0 border-0 p-6 [&>button]:hidden"
          style={{
            backgroundColor: "rgba(10, 26, 48, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            backdropFilter: "blur(18px)",
          }}
        >
          <h2 className="font-display text-lg font-bold text-foreground">
            Feestdag verwijderen?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {confirmDel ? `${formatDatum(confirmDel.datum)} — ${confirmDel.naam}` : ""}
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDel(null)}
              className="flex-1 border-white/10 bg-white/[0.04] text-foreground hover:bg-white/[0.08]"
            >
              Annuleren
            </Button>
            <Button
              onClick={handleDelete}
              className="flex-1 bg-red-500 text-white hover:bg-red-600"
            >
              Verwijderen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ----- Monteur beschikbaarheid -----

const MonteurBeschikbaarheidSection = ({
  monteurs,
  onMonteurUpdate,
}: {
  monteurs: Monteur[];
  onMonteurUpdate: (id: string, patch: Partial<Monteur>) => void;
}) => {
  const [afwezigByMonteur, setAfwezigByMonteur] = useState<Record<string, Afwezigheid[]>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb
      .from("monteur_afwezigheid")
      .select("*")
      .order("datum_van", { ascending: true });
    if (error) {
      toast.error("Kon afwezigheid niet laden");
    } else {
      const map: Record<string, Afwezigheid[]> = {};
      ((data ?? []) as Afwezigheid[]).forEach((a) => {
        if (!map[a.monteur_id]) map[a.monteur_id] = [];
        map[a.monteur_id].push(a);
      });
      setAfwezigByMonteur(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const actieve = useMemo(
    () =>
      monteurs
        .filter((m) => m.actief)
        .sort((a, b) => a.naam.localeCompare(b.naam)),
    [monteurs]
  );

  return (
    <div className="surface-card overflow-hidden">
      <div className="border-b border-white/10 px-6 py-4">
        <h3 className="font-display text-base font-bold tracking-tight text-foreground">
          Beschikbaarheid per monteur
        </h3>
      </div>
      {loading ? (
        <div className="px-6 py-12 text-center text-sm text-muted-foreground">Laden…</div>
      ) : actieve.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-muted-foreground">
          Geen actieve monteurs
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {actieve.map((m) => (
            <MonteurCard
              key={m.id}
              monteur={m}
              afwezigheden={afwezigByMonteur[m.id] ?? []}
              expanded={!!expanded[m.id]}
              onToggle={() => setExpanded((c) => ({ ...c, [m.id]: !c[m.id] }))}
              onMonteurUpdate={onMonteurUpdate}
              onAfwezigChange={reload}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

const MonteurCard = ({
  monteur,
  afwezigheden,
  expanded,
  onToggle,
  onMonteurUpdate,
  onAfwezigChange,
}: {
  monteur: Monteur;
  afwezigheden: Afwezigheid[];
  expanded: boolean;
  onToggle: () => void;
  onMonteurUpdate: (id: string, patch: Partial<Monteur>) => void;
  onAfwezigChange: () => void;
}) => {
  const werkdagen = useMemo<number[]>(
    () => (monteur.werkdagen && monteur.werkdagen.length ? monteur.werkdagen : [1, 2, 3, 4, 5]),
    [monteur.werkdagen]
  );

  const [flashDay, setFlashDay] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Afwezigheid | null>(null);

  const toggleDag = async (dag: number) => {
    const next = werkdagen.includes(dag)
      ? werkdagen.filter((d) => d !== dag)
      : [...werkdagen, dag].sort();
    const prev = werkdagen;
    onMonteurUpdate(monteur.id, { werkdagen: next });
    const { error } = await sb
      .from("monteurs")
      .update({ werkdagen: next })
      .eq("id", monteur.id);
    if (error) {
      onMonteurUpdate(monteur.id, { werkdagen: prev });
      toast.error("Wijzigen mislukt");
    } else {
      setFlashDay(dag);
      setTimeout(() => setFlashDay((cur) => (cur === dag ? null : cur)), 600);
    }
  };

  const handleDeleteAfw = async () => {
    if (!confirmDel) return;
    const { error } = await sb.from("monteur_afwezigheid").delete().eq("id", confirmDel.id);
    setConfirmDel(null);
    if (error) {
      toast.error("Verwijderen mislukt");
    } else {
      toast.success("Afwezigheid verwijderd");
      onAfwezigChange();
    }
  };

  const initials = monteur.naam
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold"
            style={typeStyle(monteur.type)}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold text-foreground">
              {monteur.naam}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              {WEEKDAG_NUMS.map((n, i) => {
                const on = werkdagen.includes(n);
                return (
                  <span
                    key={n}
                    className="inline-flex h-4 min-w-[20px] items-center justify-center rounded text-[9px] font-display font-bold"
                    style={
                      on
                        ? { backgroundColor: "rgba(63,255,139,0.85)", color: "#0a1a30" }
                        : {
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "rgba(255,255,255,0.35)",
                          }
                    }
                  >
                    {WEEKDAG_LABELS[i]}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {afwezigheden.length > 0 && (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-display font-bold"
              style={{ backgroundColor: "rgba(254,179,0,0.18)", color: "#feb300" }}
            >
              {afwezigheden.length} afwezig
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="space-y-6 border-t border-white/[0.06] bg-white/[0.015] px-6 py-5">
          {/* Werkdagen */}
          <div>
            <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Vaste werkdagen
            </Label>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {WEEKDAG_NUMS.map((n, i) => {
                const on = werkdagen.includes(n);
                const flashing = flashDay === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => toggleDag(n)}
                    className="rounded-md px-4 py-1.5 text-xs font-display font-bold tracking-wide transition-all"
                    style={
                      on
                        ? {
                            backgroundColor: flashing
                              ? "rgba(63,255,139,1)"
                              : "rgba(63,255,139,0.85)",
                            color: "#0a1a30",
                            boxShadow: flashing
                              ? "0 0 0 3px rgba(63,255,139,0.35)"
                              : "none",
                          }
                        : {
                            border: "1px solid rgba(255,255,255,0.14)",
                            color: "rgba(255,255,255,0.55)",
                            backgroundColor: "transparent",
                          }
                    }
                  >
                    {WEEKDAG_LABELS[i]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Afwezigheid */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Afwezigheid
              </Label>
              <Button
                onClick={() => setAddOpen(true)}
                size="sm"
                variant="outline"
                className="h-7 border-white/10 bg-white/[0.04] text-xs font-display font-semibold text-foreground hover:bg-white/[0.08]"
              >
                <Plus className="mr-1 h-3 w-3" strokeWidth={2.5} />
                Toevoegen
              </Button>
            </div>
            {afwezigheden.length === 0 ? (
              <div className="mt-3 text-xs text-muted-foreground">
                Geen afwezigheid ingevoerd
              </div>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {afwezigheden.map((a) => {
                  const def = AFWEZIGHEID_TYPES.find((t) => t.id === a.type);
                  return (
                    <li
                      key={a.id}
                      className="group flex items-center justify-between gap-3 rounded-md bg-white/[0.03] px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="inline-flex shrink-0 items-center rounded px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: def?.color ?? "#9ca3af",
                            color: "#0a1a30",
                          }}
                        >
                          {def?.label ?? a.type}
                        </span>
                        <span className="text-xs font-display font-semibold text-foreground">
                          {formatRange(a.datum_van, a.datum_tot)}
                        </span>
                        {a.omschrijving && (
                          <span className="truncate text-xs text-muted-foreground">
                            {a.omschrijving}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setConfirmDel(a)}
                        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                        aria-label="Verwijderen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      <AfwezigheidModal
        open={addOpen}
        onOpenChange={setAddOpen}
        monteur={monteur}
        existing={afwezigheden}
        onSaved={onAfwezigChange}
      />

      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent
          className="max-w-sm gap-0 border-0 p-6 [&>button]:hidden"
          style={{
            backgroundColor: "rgba(10, 26, 48, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            backdropFilter: "blur(18px)",
          }}
        >
          <h2 className="font-display text-lg font-bold text-foreground">
            Afwezigheid verwijderen?
          </h2>
          {confirmDel && (
            <p className="mt-2 text-sm text-muted-foreground">
              {formatRange(confirmDel.datum_van, confirmDel.datum_tot)}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDel(null)}
              className="flex-1 border-white/10 bg-white/[0.04] text-foreground hover:bg-white/[0.08]"
            >
              Annuleren
            </Button>
            <Button
              onClick={handleDeleteAfw}
              className="flex-1 bg-red-500 text-white hover:bg-red-600"
            >
              Verwijderen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
};

const AfwezigheidModal = ({
  open,
  onOpenChange,
  monteur,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  monteur: Monteur;
  existing: Afwezigheid[];
  onSaved: () => void;
}) => {
  const [type, setType] = useState<AfwezigheidType>("vakantie");
  const [van, setVan] = useState("");
  const [tot, setTot] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType("vakantie");
      const today = new Date().toISOString().slice(0, 10);
      setVan(today);
      setTot(today);
      setOmschrijving("");
    }
  }, [open]);

  // For vrije_dag, force tot = van
  useEffect(() => {
    if (type === "vrije_dag") setTot(van);
  }, [type, van]);

  const handleSave = async () => {
    if (!van || !tot) {
      toast.error("Datum is verplicht");
      return;
    }
    if (tot < van) {
      toast.error("Datum tot moet later of gelijk zijn aan datum van");
      return;
    }
    // Overlap check
    const overlap = existing.some(
      (a) => !(tot < a.datum_van || van > a.datum_tot)
    );
    if (overlap) {
      toast.error("Overlapt met bestaande afwezigheid");
      return;
    }
    setSaving(true);
    const { error } = await sb.from("monteur_afwezigheid").insert({
      monteur_id: monteur.id,
      datum_van: van,
      datum_tot: tot,
      type,
      omschrijving: omschrijving.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error("Opslaan mislukt");
      return;
    }
    toast.success("Afwezigheid opgeslagen");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md gap-0 border-0 p-0 [&>button]:hidden"
        style={{
          backgroundColor: "rgba(10, 26, 48, 0.95)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "12px",
          backdropFilter: "blur(18px)",
        }}
      >
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
              Afwezigheid toevoegen
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{monteur.naam}</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="-mr-2 -mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Annuleren
          </button>
        </div>
        <div className="space-y-5 px-6 py-6">
          <div className="space-y-2">
            <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Type
            </Label>
            <div className="flex flex-wrap gap-2">
              {AFWEZIGHEID_TYPES.map((t) => {
                const active = type === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id)}
                    className="rounded-md px-3 py-1.5 text-xs font-display font-bold tracking-wide transition-all"
                    style={
                      active
                        ? { backgroundColor: t.color, color: "#0a1a30" }
                        : {
                            border: "1px solid rgba(255,255,255,0.14)",
                            color: "rgba(255,255,255,0.6)",
                            backgroundColor: "transparent",
                          }
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Van
              </Label>
              <Input
                type="date"
                value={van}
                onChange={(e) => setVan(e.target.value)}
                className="rounded-md border-white/10 bg-white/[0.04] text-foreground focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tot
              </Label>
              <Input
                type="date"
                value={tot}
                min={van}
                disabled={type === "vrije_dag"}
                onChange={(e) => setTot(e.target.value)}
                className="rounded-md border-white/10 bg-white/[0.04] text-foreground focus-visible:ring-primary disabled:opacity-50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Omschrijving
            </Label>
            <Input
              value={omschrijving}
              onChange={(e) => setOmschrijving(e.target.value)}
              placeholder="bijv. Zomervakantie"
              className="rounded-md border-white/10 bg-white/[0.04] text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-primary"
            />
          </div>
        </div>
        <div className="px-6 pb-6">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
          >
            {saving ? "Bezig met opslaan…" : "Opslaan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};


// ============================================================
// PloegenView
// ============================================================

interface Ploeg {
  id: string;
  naam: string;
  type: MonteurType;
  actief: boolean;
  positie: number;
  monteur_ids: string[];
}

const PloegenView = ({ monteurs }: { monteurs: Monteur[] }) => {
  const [ploegen, setPloegen] = useState<Ploeg[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Ploeg | null>(null);
  const [naam, setNaam] = useState("");
  const [type, setType] = useState<MonteurType>("schakelmonteur");
  const [selMonteurs, setSelMonteurs] = useState<string[]>([]);
  const [actief, setActief] = useState(true);
  const [saving, setSaving] = useState(false);

  const monteurById = useMemo(() => {
    const m = new Map<string, Monteur>();
    monteurs.forEach((x) => m.set(x.id, x));
    return m;
  }, [monteurs]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: pl, error } = await sb
        .from("ploegen")
        .select("id,naam,type,actief,positie")
        .order("positie", { ascending: true })
        .order("naam", { ascending: true });
      if (error) {
        toast.error("Kon ploegen niet laden");
        setLoading(false);
        return;
      }
      const ids = (pl ?? []).map((p: any) => p.id);
      let leden: { ploeg_id: string; monteur_id: string }[] = [];
      if (ids.length > 0) {
        const { data: pm } = await sb
          .from("ploeg_monteurs")
          .select("ploeg_id,monteur_id")
          .in("ploeg_id", ids);
        leden = pm ?? [];
      }
      const map = new Map<string, string[]>();
      leden.forEach((row: any) => {
        const arr = map.get(row.ploeg_id) ?? [];
        arr.push(row.monteur_id);
        map.set(row.ploeg_id, arr);
      });
      setPloegen(
        (pl ?? []).map((p: any) => ({ ...p, monteur_ids: map.get(p.id) ?? [] }))
      );
      setLoading(false);
    };
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setNaam("");
    setType("schakelmonteur");
    setSelMonteurs([]);
    setActief(true);
    setModalOpen(true);
  };

  const openEdit = (p: Ploeg) => {
    setEditing(p);
    setNaam(p.naam);
    setType(p.type);
    setSelMonteurs([...p.monteur_ids]);
    setActief(p.actief);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!naam.trim()) {
      toast.error("Naam is verplicht");
      return;
    }
    setSaving(true);
    const payload = { naam: naam.trim(), type, actief };
    let ploegId = editing?.id;
    if (editing) {
      const { error } = await sb.from("ploegen").update(payload).eq("id", editing.id);
      if (error) {
        toast.error("Opslaan mislukt");
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await sb
        .from("ploegen")
        .insert({ ...payload, positie: ploegen.length })
        .select()
        .single();
      if (error || !data) {
        toast.error("Opslaan mislukt");
        setSaving(false);
        return;
      }
      ploegId = (data as any).id;
    }

    if (ploegId) {
      await sb.from("ploeg_monteurs").delete().eq("ploeg_id", ploegId);
      const validIds = selMonteurs.filter((id) => {
        const m = monteurById.get(id);
        return m && m.type === type;
      });
      if (validIds.length > 0) {
        await sb
          .from("ploeg_monteurs")
          .insert(validIds.map((mid) => ({ ploeg_id: ploegId, monteur_id: mid })));
      }
      setPloegen((cur) => {
        const updated: Ploeg = {
          id: ploegId!,
          naam: payload.naam,
          type,
          actief,
          positie: editing?.positie ?? cur.length,
          monteur_ids: validIds,
        };
        if (editing) return cur.map((p) => (p.id === ploegId ? updated : p));
        return [...cur, updated];
      });
      toast.success("Ploeg opgeslagen");
      setModalOpen(false);
    }
    setSaving(false);
  };

  const handleDelete = async (p: Ploeg) => {
    if (!confirm(`Ploeg "${p.naam}" verwijderen?`)) return;
    const prev = ploegen;
    setPloegen(ploegen.filter((x) => x.id !== p.id));
    const { error } = await sb.from("ploegen").delete().eq("id", p.id);
    if (error) {
      setPloegen(prev);
      toast.error("Verwijderen mislukt");
    } else {
      toast.success("Ploeg verwijderd");
    }
  };

  const eligibleMonteurs = useMemo(
    () => monteurs.filter((m) => m.actief && m.type === type),
    [monteurs, type]
  );

  const toggleSel = (id: string) =>
    setSelMonteurs((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {ploegen.length} ploeg{ploegen.length === 1 ? "" : "en"}
        </div>
        <Button
          onClick={openNew}
          className="font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
          size="sm"
        >
          <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} /> Ploeg toevoegen
        </Button>
      </div>

      {loading ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">Laden…</div>
      ) : ploegen.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          Nog geen ploegen. Een ploeg is een vaste groep monteurs die je in één klik
          samen kunt inplannen.
        </div>
      ) : (
        <div className="px-2 pb-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Naam</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Monteurs</th>
                <th className="px-4 py-3 text-right">Acties</th>
              </tr>
            </thead>
            <tbody>
              {ploegen.map((p) => (
                <tr
                  key={p.id}
                  className="group border-b transition-colors hover:bg-white/[0.04]"
                  style={{ borderColor: "rgba(255,255,255,0.06)" }}
                >
                  <td className="px-4 py-3.5">
                    <div className="font-display font-semibold text-foreground">
                      {p.naam}
                      {!p.actief && (
                        <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          inactief
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-display font-semibold"
                      style={typeStyle(p.type)}
                    >
                      {typeLabel(p.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {p.monteur_ids.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {p.monteur_ids.map((mid) => {
                        const m = monteurById.get(mid);
                        if (!m) return null;
                        return (
                          <span
                            key={mid}
                            className="rounded px-1.5 py-0.5 text-[11px] font-display font-semibold"
                            style={{
                              backgroundColor: "rgba(255,255,255,0.06)",
                              color: "rgba(255,255,255,0.85)",
                            }}
                          >
                            {m.naam}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(p)}
                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                        title="Wijzigen"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                        title="Verwijderen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="max-w-md gap-0 border-0 p-0 [&>button]:hidden"
          style={{
            backgroundColor: "rgba(10, 26, 48, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            backdropFilter: "blur(18px)",
          }}
        >
          <div className="flex items-start justify-between px-6 pt-6">
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
              {editing ? "Ploeg wijzigen" : "Ploeg toevoegen"}
            </h2>
            <button
              onClick={() => setModalOpen(false)}
              className="-mr-2 -mt-1 rounded-md p-1 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5 px-6 py-6 max-h-[70vh] overflow-y-auto">
            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Naam
              </Label>
              <Input
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
                placeholder="Bijv. Ploeg Ali & Sitki"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Type
              </Label>
              <div className="flex gap-2">
                {(["schakelmonteur", "montagemonteur"] as MonteurType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setType(t);
                      setSelMonteurs((cur) =>
                        cur.filter((id) => monteurById.get(id)?.type === t)
                      );
                    }}
                    className={[
                      "flex-1 rounded-md px-3 py-2 text-xs font-display font-semibold tracking-wide transition-all",
                      type === t
                        ? "shadow-[0_0_0_1px_hsl(var(--primary))]"
                        : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
                    ].join(" ")}
                    style={type === t ? typeStyle(t) : undefined}
                  >
                    {typeLabel(t)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Monteurs ({selMonteurs.length})
              </Label>
              {eligibleMonteurs.length === 0 ? (
                <div className="rounded-md bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
                  Geen actieve {typeLabel(type).toLowerCase()}s beschikbaar
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {eligibleMonteurs.map((m) => {
                    const active = selMonteurs.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleSel(m.id)}
                        className={[
                          "rounded-md border px-2.5 py-1 text-xs font-display font-semibold transition-colors",
                          active
                            ? "border-primary bg-primary/15 text-foreground"
                            : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.06]",
                        ].join(" ")}
                      >
                        {m.naam}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <label className="flex items-center justify-between gap-3 rounded-md bg-white/[0.03] px-3 py-2.5">
              <span className="text-sm text-foreground">Ploeg is actief</span>
              <Switch
                checked={actief}
                onCheckedChange={setActief}
                className="data-[state=checked]:bg-primary"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Annuleren
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? "Bezig met opslaan…" : "Opslaan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Capaciteit;
