import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Edit2, Plus, Power, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
}

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
  const [tab, setTab] = useState<"monteurs" | "tijdlijn">("monteurs");

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
            { id: "tijdlijn", label: "Tijdlijn" },
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

      {tab === "tijdlijn" && (
        <TijdlijnView monteurs={monteurs.filter((m) => m.actief)} />
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

  if (monteurs.length === 0) {
    return (
      <div className="surface-card px-6 py-16 text-center text-sm text-muted-foreground">
        Voeg eerst monteurs toe op het Monteurs tabblad
      </div>
    );
  }

  const renderRow = (m: Monteur) => {
    const days = planMap[m.id] ?? {};
    return (
      <div
        key={m.id}
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
            {m.naam}
          </div>
        </div>
        <div className="flex">
          {visibleWeeks.map((w, wi) => {
            // Build 5 slots for this week
            type Slot =
              | { kind: "vrij" }
              | { kind: "single"; projectId: string }
              | { kind: "conflict"; projectIds: string[] };
            const slots: Slot[] = [];
            for (let d = 0; d < 5; d++) {
              const date = addDays(w.monday, d);
              const ids = days[isoKey(date)] ?? [];
              if (ids.length === 0) slots.push({ kind: "vrij" });
              else if (ids.length === 1)
                slots.push({ kind: "single", projectId: ids[0] });
              else slots.push({ kind: "conflict", projectIds: ids });
            }

            const items: React.ReactNode[] = [];
            let i = 0;
            while (i < 5) {
              const slot = slots[i];
              const isLastDay = i === 4;
              const borderRight = isLastDay
                ? "1px solid rgba(255,255,255,0.12)"
                : "1px solid rgba(255,255,255,0.04)";
              const date = addDays(w.monday, i);

              if (slot.kind === "vrij") {
                items.push(
                  <div
                    key={`v-${wi}-${i}`}
                    title={`${DAG_FULL[i]} ${fmtDayMonth(date)}`}
                    style={{
                      width: CELL_W,
                      height: CELL_H,
                      borderRight,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  />
                );
                i++;
                continue;
              }

              if (slot.kind === "conflict") {
                items.push(
                  <div
                    key={`c-${wi}-${i}`}
                    style={{
                      width: CELL_W,
                      height: CELL_H,
                      borderRight,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ConflictBlock
                      projectIds={slot.projectIds}
                      projects={projects}
                      onNavigate={(id) => navigate(`/plannen?project=${id}`)}
                    />
                  </div>
                );
                i++;
                continue;
              }

              // single → look ahead for consecutive same project
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
              const p = projects[pid];
              const fullLabel = p?.case_nummer ?? "—";
              const label =
                blockWidth > 80 ? fullLabel : fullLabel.slice(0, 6);

              items.push(
                <div
                  key={`s-${wi}-${i}`}
                  style={{
                    width: span * CELL_W,
                    height: CELL_H,
                    borderRight: i + span - 1 === 4
                      ? "1px solid rgba(255,255,255,0.12)"
                      : "1px solid rgba(255,255,255,0.04)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 1px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/plannen?project=${pid}`)}
                    title={fullLabel}
                    style={{
                      width: blockWidth,
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
                    <span className="truncate px-1">{label}</span>
                  </button>
                </div>
              );
              i += span;
            }

            return (
              <div key={`w-${wi}`} className="flex">
                {items}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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

const ConflictBlock = ({
  projectIds,
  projects,
  onNavigate,
}: {
  projectIds: string[];
  projects: Record<string, ProjectInfo>;
  onNavigate: (id: string) => void;
}) => {
  return (
    <Popover>
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
          {projectIds.map((id) => {
            const p = projects[id];
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
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
};

export default Capaciteit;
