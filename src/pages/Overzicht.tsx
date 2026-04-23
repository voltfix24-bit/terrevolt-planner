import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DAG_LABELS,
  formatDate,
  getMondayOfWeek,
  initialen,
  wrapWeek,
} from "@/lib/planning-types";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

// ============== Constants ==============
const SIDEBAR_W = 230;
const CELL_W = 52;
const ROW_H_MONTEUR = 44;
const ROW_H_PROJECT = 44;
const ROW_H_ACTIVITEIT = 36;
const HEADER_H = 56;
const DAYS_PER_WEEK = 5;
const PILL_H_MONTEUR = 28;
const PILL_H_PROJECT = 24;

type Status = "concept" | "gepland" | "in_uitvoering" | "afgerond";
type NumWeeks = 2 | 4 | 8;

interface Project {
  id: string;
  case_nummer: string | null;
  station_naam: string | null;
  status: Status | null;
  jaar: number | null;
  created_at: string | null;
}

interface Week {
  id: string;
  project_id: string | null;
  week_nr: number;
  positie: number;
}

interface Activiteit {
  id: string;
  project_id: string | null;
  naam: string;
  capaciteit_type: string | null;
  positie: number | null;
}

interface Cel {
  id: string;
  activiteit_id: string | null;
  week_id: string | null;
  dag_index: number;
  kleur_code: string | null;
}

interface Monteur {
  id: string;
  naam: string;
  type: string;
  aanwijzing_ms: string | null;
  aanwijzing_ls: string | null;
}

interface CelMonteur {
  cel_id: string | null;
  monteur_id: string | null;
}

// ============== Helpers ==============
function dayKey(week_nr: number, dag_index: number): string {
  return `${week_nr}-${dag_index}`;
}

function getCurrentISOWeek(): { week: number; year: number } {
  const now = new Date();
  const target = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const week =
    1 +
    Math.round(
      (target.getTime() - firstThursday.getTime()) /
        (7 * 24 * 3600 * 1000),
    );
  return { week, year: target.getUTCFullYear() };
}

function statusColor(status: Status | null): { bg: string; text: string; label: string } {
  switch (status) {
    case "gepland":
      return { bg: "#feb300", text: "#0a1a30", label: "Gepland" };
    case "in_uitvoering":
      return { bg: "#3fff8b", text: "#0a1a30", label: "In uitvoering" };
    case "afgerond":
      return { bg: "rgba(255,255,255,0.15)", text: "rgba(255,255,255,0.6)", label: "Afgerond" };
    case "concept":
    default:
      return { bg: "rgba(255,255,255,0.15)", text: "rgba(255,255,255,0.7)", label: "Concept" };
  }
}

function msBadgeStyle(ms: string | null): React.CSSProperties | null {
  if (!ms) return null;
  if (ms === "AVP") return { background: "#3fff8b", color: "#0a1a30" };
  if (ms === "VP") return { background: "#7cc1ff", color: "#0a1a30" };
  if (ms === "VOP") return { background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" };
  return { background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" };
}

function capLabel(t: string | null): string {
  if (t === "schakel") return "Schakel";
  if (t === "montage") return "Montage";
  return "Geen";
}

// ============== Page ==============
export default function Overzicht() {
  const navigate = useNavigate();

  const initialIso = useMemo(() => getCurrentISOWeek(), []);
  const [jaar] = useState<number>(initialIso.year);
  const [startWeek, setStartWeek] = useState<number>(initialIso.week);
  const [numWeeks, setNumWeeks] = useState<NumWeeks>(4);

  const [projecten, setProjecten] = useState<Project[]>([]);
  const [weken, setWeken] = useState<Week[]>([]);
  const [activiteiten, setActiviteiten] = useState<Activiteit[]>([]);
  const [cellen, setCellen] = useState<Cel[]>([]);
  const [monteurs, setMonteurs] = useState<Monteur[]>([]);
  const [celMonteurs, setCelMonteurs] = useState<CelMonteur[]>([]);

  const [medewerkersOpen, setMedewerkersOpen] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const visibleWeekNrs = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < numWeeks; i++) arr.push(wrapWeek(startWeek + i));
    return arr;
  }, [startWeek, numWeeks]);

  const visibleWeekNrSet = useMemo(() => new Set(visibleWeekNrs), [visibleWeekNrs]);

  const totalGridWidth = numWeeks * DAYS_PER_WEEK * CELL_W;

  // Fetch all data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pRes, wRes, aRes, cRes, mRes, cmRes] = await Promise.all([
        supabase.from("projecten").select("id, case_nummer, station_naam, status, jaar, created_at").order("created_at", { ascending: true }),
        supabase.from("project_weken").select("id, project_id, week_nr, positie"),
        supabase.from("project_activiteiten").select("id, project_id, naam, capaciteit_type, positie"),
        supabase.from("planning_cellen").select("id, activiteit_id, week_id, dag_index, kleur_code"),
        supabase.from("monteurs").select("id, naam, type, aanwijzing_ms, aanwijzing_ls").eq("actief", true).order("type", { ascending: false }).order("naam", { ascending: true }),
        supabase.from("cel_monteurs").select("cel_id, monteur_id"),
      ]);
      if (cancelled) return;
      setProjecten((pRes.data ?? []) as Project[]);
      setWeken((wRes.data ?? []) as Week[]);
      setActiviteiten((aRes.data ?? []) as Activiteit[]);
      setCellen((cRes.data ?? []) as Cel[]);
      setMonteurs((mRes.data ?? []) as Monteur[]);
      setCelMonteurs((cmRes.data ?? []) as CelMonteur[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Maps
  const projectById = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projecten) m.set(p.id, p);
    return m;
  }, [projecten]);

  const activiteitById = useMemo(() => {
    const m = new Map<string, Activiteit>();
    for (const a of activiteiten) m.set(a.id, a);
    return m;
  }, [activiteiten]);

  const weekById = useMemo(() => {
    const m = new Map<string, Week>();
    for (const w of weken) m.set(w.id, w);
    return m;
  }, [weken]);

  const monteurIdsByCel = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const cm of celMonteurs) {
      if (!cm.cel_id || !cm.monteur_id) continue;
      const arr = m.get(cm.cel_id) ?? [];
      arr.push(cm.monteur_id);
      m.set(cm.cel_id, arr);
    }
    return m;
  }, [celMonteurs]);

  // monteurId → dayKey → Set<project_id>
  const monteurDayProjects = useMemo(() => {
    const m = new Map<string, Map<string, Set<string>>>();
    for (const c of cellen) {
      if (!c.activiteit_id || !c.week_id || !c.kleur_code) continue;
      const w = weekById.get(c.week_id);
      if (!w) continue;
      if (!visibleWeekNrSet.has(w.week_nr)) continue;
      const act = activiteitById.get(c.activiteit_id);
      if (!act?.project_id) continue;
      const monteurIds = monteurIdsByCel.get(c.id) ?? [];
      if (!monteurIds.length) continue;
      const k = dayKey(w.week_nr, c.dag_index);
      for (const mid of monteurIds) {
        let byDay = m.get(mid);
        if (!byDay) {
          byDay = new Map();
          m.set(mid, byDay);
        }
        let projs = byDay.get(k);
        if (!projs) {
          projs = new Set();
          byDay.set(k, projs);
        }
        projs.add(act.project_id);
      }
    }
    return m;
  }, [cellen, weekById, activiteitById, monteurIdsByCel, visibleWeekNrSet]);

  // For project section: project_id → dayKey → activiteit_id → cel
  const projectDayActivities = useMemo(() => {
    const m = new Map<string, Map<string, Map<string, Cel>>>();
    for (const c of cellen) {
      if (!c.activiteit_id || !c.week_id || !c.kleur_code) continue;
      const w = weekById.get(c.week_id);
      if (!w) continue;
      if (!visibleWeekNrSet.has(w.week_nr)) continue;
      const act = activiteitById.get(c.activiteit_id);
      if (!act?.project_id) continue;
      const k = dayKey(w.week_nr, c.dag_index);
      let byDay = m.get(act.project_id);
      if (!byDay) {
        byDay = new Map();
        m.set(act.project_id, byDay);
      }
      let byAct = byDay.get(k);
      if (!byAct) {
        byAct = new Map();
        byDay.set(k, byAct);
      }
      byAct.set(c.activiteit_id, c);
    }
    return m;
  }, [cellen, weekById, activiteitById, visibleWeekNrSet]);

  const activiteitenByProject = useMemo(() => {
    const m = new Map<string, Activiteit[]>();
    for (const a of activiteiten) {
      if (!a.project_id) continue;
      const arr = m.get(a.project_id) ?? [];
      arr.push(a);
      m.set(a.project_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.positie ?? 0) - (b.positie ?? 0));
    return m;
  }, [activiteiten]);

  // Visible projects = projects with at least one filled cell in visible range OR week defined
  const visibleProjecten = useMemo(() => {
    const ids = new Set<string>();
    for (const w of weken) {
      if (w.project_id && visibleWeekNrSet.has(w.week_nr)) ids.add(w.project_id);
    }
    return projecten.filter((p) => ids.has(p.id));
  }, [projecten, weken, visibleWeekNrSet]);

  // Schakelmonteurs / Montagemonteurs split (already sorted by type desc, naam asc)
  const schakelMonteurs = useMemo(
    () => monteurs.filter((m) => m.type === "schakelmonteur"),
    [monteurs],
  );
  const montageMonteurs = useMemo(
    () => monteurs.filter((m) => m.type === "montagemonteur"),
    [monteurs],
  );

  // Team capaciteit %
  const teamCapPct = useMemo(() => {
    const totalDays = numWeeks * DAYS_PER_WEEK * monteurs.length;
    if (totalDays === 0) return 0;
    let planned = 0;
    for (const m of monteurs) {
      const byDay = monteurDayProjects.get(m.id);
      if (!byDay) continue;
      // Count any planned day for this monteur in visible weeks
      for (const wnr of visibleWeekNrs) {
        for (let d = 0; d < DAYS_PER_WEEK; d++) {
          if (byDay.has(dayKey(wnr, d))) planned++;
        }
      }
    }
    return Math.round((planned / totalDays) * 100);
  }, [monteurs, monteurDayProjects, visibleWeekNrs, numWeeks]);

  const currentISO = useMemo(() => getCurrentISOWeek(), []);

  // Today as { week, dag_index } (Mon=0..Fri=4); null if weekend
  const today = useMemo(() => {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // Mon=0..Sun=6
    if (dow > 4) return null;
    return { week: currentISO.week, year: currentISO.year, dag: dow };
  }, [currentISO]);

  const isTodayCol = useCallback(
    (wnr: number, d: number) =>
      !!today && today.year === jaar && today.week === wnr && today.dag === d,
    [today, jaar],
  );

  const toggleExpand = (id: string) => {
    setExpandedProjects((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  const navigateToProject = (id: string) => {
    navigate(`/plannen?project=${id}`);
  };

  // ====== Compute monteur spans (continuous same-project days) ======
  // Returns array of segments: { startSlot, endSlot, projectId, dubbel: boolean }
  type MonteurSeg = { startSlot: number; endSlot: number; projectId: string | null; projectIds: string[]; dubbel: boolean };
  const monteurSegments = useCallback(
    (monteurId: string): MonteurSeg[] => {
      const byDay = monteurDayProjects.get(monteurId);
      if (!byDay) return [];
      const segs: MonteurSeg[] = [];
      let cur: MonteurSeg | null = null;
      const flush = () => {
        if (cur) segs.push(cur);
        cur = null;
      };
      for (let wi = 0; wi < visibleWeekNrs.length; wi++) {
        const wnr = visibleWeekNrs[wi];
        for (let d = 0; d < DAYS_PER_WEEK; d++) {
          const slot = wi * DAYS_PER_WEEK + d;
          const projs = byDay.get(dayKey(wnr, d));
          if (!projs || projs.size === 0) {
            flush();
            continue;
          }
          if (projs.size > 1) {
            flush();
            segs.push({
              startSlot: slot,
              endSlot: slot,
              projectId: null,
              projectIds: Array.from(projs),
              dubbel: true,
            });
            continue;
          }
          const pid = Array.from(projs)[0];
          if (cur && !cur.dubbel && cur.projectId === pid && cur.endSlot === slot - 1) {
            cur.endSlot = slot;
          } else {
            flush();
            cur = {
              startSlot: slot,
              endSlot: slot,
              projectId: pid,
              projectIds: [pid],
              dubbel: false,
            };
          }
        }
      }
      flush();
      return segs;
    },
    [monteurDayProjects, visibleWeekNrs],
  );

  // ====== Project bar segments (continuous days with any filled cell) ======
  const projectSegments = useCallback(
    (projectId: string): { startSlot: number; endSlot: number }[] => {
      const byDay = projectDayActivities.get(projectId);
      if (!byDay) return [];
      const segs: { startSlot: number; endSlot: number }[] = [];
      let cur: { startSlot: number; endSlot: number } | null = null;
      for (let wi = 0; wi < visibleWeekNrs.length; wi++) {
        const wnr = visibleWeekNrs[wi];
        for (let d = 0; d < DAYS_PER_WEEK; d++) {
          const slot = wi * DAYS_PER_WEEK + d;
          const has = byDay.has(dayKey(wnr, d));
          if (has) {
            if (cur && cur.endSlot === slot - 1) cur.endSlot = slot;
            else {
              if (cur) segs.push(cur);
              cur = { startSlot: slot, endSlot: slot };
            }
          } else {
            if (cur) {
              segs.push(cur);
              cur = null;
            }
          }
        }
      }
      if (cur) segs.push(cur);
      return segs;
    },
    [projectDayActivities, visibleWeekNrs],
  );

  // ============== Render helpers ==============
  const renderHeader = () => (
    <div style={{ width: totalGridWidth }}>
      {/* Week titles */}
      <div className="flex" style={{ height: 28 }}>
        {visibleWeekNrs.map((wnr, wi) => {
          const monday = getMondayOfWeek(wnr, jaar);
          const isNow = wnr === currentISO.week && jaar === currentISO.year;
          return (
            <div
              key={wi}
              className="flex items-center justify-center gap-1.5"
              style={{
                width: DAYS_PER_WEEK * CELL_W,
                borderRight: "1px solid rgba(255,255,255,0.12)",
                background: isNow ? "rgba(63,255,139,0.06)" : "transparent",
              }}
            >
              <span className="text-[11px] font-semibold text-foreground">
                Wk {wnr}{" "}
                <span className="text-muted-foreground font-normal">
                  {formatDate(monday)}
                </span>
              </span>
              {isNow && (
                <span
                  style={{
                    background: "rgba(63,255,139,0.2)",
                    color: "#3fff8b",
                    fontSize: 8,
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: 999,
                    letterSpacing: 0.5,
                  }}
                >
                  NU
                </span>
              )}
            </div>
          );
        })}
      </div>
      {/* Day sub-headers */}
      <div className="flex" style={{ height: 28, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {visibleWeekNrs.map((wnr, wi) => {
          const monday = getMondayOfWeek(wnr, jaar);
          const isNow = wnr === currentISO.week && jaar === currentISO.year;
          return (
            <div key={wi} className="flex" style={{ background: isNow ? "rgba(63,255,139,0.04)" : "transparent" }}>
              {DAG_LABELS.map((dl, d) => {
                const date = new Date(monday);
                date.setDate(monday.getDate() + d);
                const isLastOfWeek = d === DAYS_PER_WEEK - 1;
                return (
                  <div
                    key={d}
                    className="flex flex-col items-center justify-center"
                    style={{
                      width: CELL_W,
                      borderRight: isLastOfWeek
                        ? "1px solid rgba(255,255,255,0.12)"
                        : "1px solid rgba(255,255,255,0.04)",
                      background: isTodayCol(wnr, d) ? "rgba(63,255,139,0.05)" : undefined,
                    }}
                  >
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      {dl}
                    </span>
                    <span className="text-[9px] text-muted-foreground/70 tabular-nums">
                      {formatDate(date)}
                    </span>
                    {isTodayCol(wnr, d) && (
                      <div
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: "#3fff8b",
                          marginTop: 2,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );

  // Empty cells row background (for monteurs row)
  const renderEmptyDayCells = (rowHeight: number) => (
    <div className="flex" style={{ width: totalGridWidth, height: rowHeight }}>
      {visibleWeekNrs.map((wnr, wi) => {
        const monday = getMondayOfWeek(wnr, jaar);
        const isNow = wnr === currentISO.week && jaar === currentISO.year;
        return (
          <div key={wi} className="flex" style={{ background: isNow ? "rgba(63,255,139,0.03)" : "transparent" }}>
            {DAG_LABELS.map((_, d) => {
              const isLastOfWeek = d === DAYS_PER_WEEK - 1;
              const date = new Date(monday);
              date.setDate(monday.getDate() + d);
              return (
                <div
                  key={d}
                  title={`${DAG_LABELS[d]} ${formatDate(date)}`}
                  style={{
                    width: CELL_W,
                    height: rowHeight,
                    borderRight: isLastOfWeek
                      ? "1px solid rgba(255,255,255,0.1)"
                      : "1px solid rgba(255,255,255,0.04)",
                    background: isTodayCol(wnr, d) ? "rgba(63,255,139,0.03)" : undefined,
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );

  // ============== Render ==============
  const totalMonteurs = monteurs.length;

  return (
    <div className="font-sans">
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Overzicht
        </h1>
        <div
          className="flex items-center gap-2"
          style={{
            background: "rgba(63,255,139,0.15)",
            border: "1px solid rgba(63,255,139,0.3)",
            color: "#3fff8b",
            fontSize: 12,
            fontWeight: 700,
            padding: "6px 14px",
            borderRadius: 999,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "#3fff8b",
              boxShadow: "0 0 6px rgba(63,255,139,0.6)",
            }}
          />
          {teamCapPct}% TEAM CAP.
        </div>
      </div>

      {/* Week navigator */}
      <div
        className="mb-3 flex items-center justify-between rounded-lg border px-3 py-2"
        style={{
          borderColor: "rgba(255,255,255,0.08)",
          background: "rgba(10,26,48,0.6)",
        }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStartWeek((w) => wrapWeek(w - 1))}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/[0.06] text-muted-foreground hover:text-foreground"
            title="Vorige week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground tabular-nums min-w-[110px] text-center">
            Week {startWeek} {jaar}
          </span>
          <button
            type="button"
            onClick={() => setStartWeek((w) => wrapWeek(w + 1))}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/[0.06] text-muted-foreground hover:text-foreground"
            title="Volgende week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] p-0.5">
          {([2, 4, 8] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNumWeeks(n)}
              className={[
                "rounded px-3 h-7 text-xs font-semibold transition-colors",
                numWeeks === n
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
              ].join(" ")}
            >
              {n} weken
            </button>
          ))}
        </div>
      </div>

      {/* Main grid container — single scroll wrapper */}
      <div
        className="overflow-hidden rounded-lg border"
        style={{
          borderColor: "rgba(255,255,255,0.08)",
          background: "rgba(10,26,48,0.4)",
        }}
      >
        <div style={{ display: "flex" }}>
          {/* ====== Fixed left sidebar ====== */}
          <div style={{ width: SIDEBAR_W, flexShrink: 0 }}>
            {/* Header spacer */}
            <div
              style={{
                height: HEADER_H,
                borderRight: "1px solid rgba(255,255,255,0.08)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)",
              }}
            />

            {/* Medewerkers section toggle */}
            <button
              type="button"
              onClick={() => setMedewerkersOpen((o) => !o)}
              className="flex w-full items-center gap-2 px-3 hover:bg-white/[0.04]"
              style={{
                height: 32,
                borderRight: "1px solid rgba(255,255,255,0.08)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <ChevronRight
                className="h-3 w-3 text-muted-foreground"
                style={{
                  transform: medewerkersOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Medewerkers
              </span>
              <span className="ml-auto text-[10px] font-semibold text-muted-foreground tabular-nums">
                {totalMonteurs}
              </span>
            </button>

            <div
              style={{
                maxHeight: medewerkersOpen ? 2000 : 0,
                opacity: medewerkersOpen ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 0.2s ease, opacity 0.15s ease",
              }}
            >
              {/* Schakelmonteurs label */}
              {schakelMonteurs.length > 0 && (
                <div
                  style={{
                    height: 28,
                    paddingLeft: 16,
                    display: "flex",
                    alignItems: "center",
                    borderRight: "1px solid rgba(255,255,255,0.08)",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Schakelmonteurs
                  </span>
                </div>
              )}
              {schakelMonteurs.map((m) => (
                <MonteurSidebarRow key={m.id} monteur={m} />
              ))}

              {/* Montagemonteurs label */}
              {montageMonteurs.length > 0 && (
                <div
                  style={{
                    height: 28,
                    paddingLeft: 16,
                    display: "flex",
                    alignItems: "center",
                    borderRight: "1px solid rgba(255,255,255,0.08)",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Montagemonteurs
                  </span>
                </div>
              )}
              {montageMonteurs.map((m) => (
                <MonteurSidebarRow key={m.id} monteur={m} />
              ))}

              {monteurs.length === 0 && (
                <div
                  style={{
                    padding: "16px 12px",
                    borderRight: "1px solid rgba(255,255,255,0.08)",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}
                  className="text-xs italic text-muted-foreground"
                >
                  Voeg monteurs toe op de Capaciteit pagina
                </div>
              )}
            </div>

            {/* Projecten section header */}
            <div
              style={{
                height: 32,
                paddingLeft: 12,
                display: "flex",
                alignItems: "center",
                borderRight: "1px solid rgba(255,255,255,0.08)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Project / Taak
              </span>
            </div>

            {visibleProjecten.length === 0 && (
              <div
                style={{
                  padding: "16px 12px",
                  borderRight: "1px solid rgba(255,255,255,0.08)",
                }}
                className="text-xs italic text-muted-foreground"
              >
                Maak een project aan op de Projecten pagina
              </div>
            )}

            {visibleProjecten.map((p) => {
              const expanded = expandedProjects.has(p.id);
              const sc = statusColor(p.status);
              const acts = activiteitenByProject.get(p.id) ?? [];
              return (
                <div key={p.id}>
                  {/* Project header sidebar */}
                  <div
                    onClick={() => navigateToProject(p.id)}
                    className="group flex cursor-pointer items-center gap-1.5 px-2 hover:bg-white/[0.03]"
                    style={{
                      height: ROW_H_PROJECT,
                      borderRight: "1px solid rgba(255,255,255,0.08)",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(p.id);
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-white/[0.08]"
                    >
                      {expanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                    <span
                      className="font-display text-[13px] font-bold tabular-nums"
                      style={{ color: "#3fff8b" }}
                    >
                      {p.case_nummer ?? "—"}
                    </span>
                    <span
                      className="truncate text-[11px] text-foreground/80"
                      title={p.station_naam ?? ""}
                    >
                      {p.station_naam ? `— ${p.station_naam}` : ""}
                    </span>
                    <span
                      className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                      style={{ background: sc.bg, color: sc.text }}
                    >
                      {sc.label}
                    </span>
                  </div>

                  {/* Activiteit sidebar rows */}
                  {expanded &&
                    acts.map((a, ai) => {
                      const capDotColor =
                        a.capaciteit_type === "schakel"
                          ? "#feb300"
                          : a.capaciteit_type === "montage"
                            ? "#378add"
                            : "rgba(255,255,255,0.2)";
                      const isLastAct = ai === acts.length - 1;
                      return (
                        <div
                          key={a.id}
                          onClick={() => navigateToProject(p.id)}
                          className="flex cursor-pointer items-center gap-2 pr-2 hover:bg-white/[0.03]"
                          style={{
                            paddingLeft: 20,
                            height: ROW_H_ACTIVITEIT,
                            borderRight: "1px solid rgba(255,255,255,0.08)",
                            borderBottom: isLastAct
                              ? "2px solid rgba(255,255,255,0.06)"
                              : "1px solid rgba(255,255,255,0.03)",
                            background: "rgba(255,255,255,0.015)",
                          }}
                        >
                          <span
                            className="shrink-0"
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: capDotColor,
                            }}
                          />
                          <span className="truncate text-[11px] text-foreground/90" title={a.naam}>
                            {a.naam}
                          </span>
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>

          {/* ====== Single scrollable right area ====== */}
          <div style={{ flex: 1, overflowX: "auto" }}>
            {/* Shared header */}
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
              {renderHeader()}
            </div>

            {/* Medewerkers toggle row spacer (matches sidebar 32px) */}
            <div
              style={{
                height: 32,
                width: totalGridWidth,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.02)",
              }}
            />

            <div
              style={{
                maxHeight: medewerkersOpen ? 2000 : 0,
                opacity: medewerkersOpen ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 0.2s ease, opacity 0.15s ease",
              }}
            >
              {schakelMonteurs.length > 0 && (
                <div
                  style={{
                    height: 28,
                    width: totalGridWidth,
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                />
              )}
              {schakelMonteurs.map((m) => (
                <MonteurCellsRow
                  key={m.id}
                  monteur={m}
                  segments={monteurSegments(m.id)}
                  projectById={projectById}
                  visibleWeekNrs={visibleWeekNrs}
                  jaar={jaar}
                  currentISO={currentISO}
                  isTodayCol={isTodayCol}
                  totalGridWidth={totalGridWidth}
                  onProjectClick={navigateToProject}
                />
              ))}
              {montageMonteurs.length > 0 && (
                <div
                  style={{
                    height: 28,
                    width: totalGridWidth,
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                />
              )}
              {montageMonteurs.map((m) => (
                <MonteurCellsRow
                  key={m.id}
                  monteur={m}
                  segments={monteurSegments(m.id)}
                  projectById={projectById}
                  visibleWeekNrs={visibleWeekNrs}
                  jaar={jaar}
                  currentISO={currentISO}
                  isTodayCol={isTodayCol}
                  totalGridWidth={totalGridWidth}
                  onProjectClick={navigateToProject}
                />
              ))}
              {monteurs.length === 0 && (
                <div style={{ height: 60, width: totalGridWidth }} />
              )}
            </div>

            {/* Projecten section header spacer */}
            <div
              style={{
                height: 32,
                width: totalGridWidth,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)",
              }}
            />

            {visibleProjecten.length === 0 && (
              <div style={{ height: 60, width: totalGridWidth }} />
            )}

            {visibleProjecten.map((p) => {
              const expanded = expandedProjects.has(p.id);
              const sc = statusColor(p.status);
              const segs = projectSegments(p.id);
              const acts = activiteitenByProject.get(p.id) ?? [];
              return (
                <div key={p.id}>
                  {/* Project bar row */}
                  <div
                    onClick={() => navigateToProject(p.id)}
                    className="relative cursor-pointer hover:bg-white/[0.02]"
                    style={{
                      width: totalGridWidth,
                      height: ROW_H_PROJECT,
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    {renderEmptyDayCells(ROW_H_PROJECT)}
                    {segs.map((s, i) => {
                      const left = s.startSlot * CELL_W + 2;
                      const width = (s.endSlot - s.startSlot + 1) * CELL_W - 4;
                      return (
                        <div
                          key={i}
                          className="absolute flex items-center justify-center px-2"
                          style={{
                            left,
                            width,
                            top: (ROW_H_PROJECT - PILL_H_PROJECT) / 2,
                            height: PILL_H_PROJECT,
                            background: sc.bg,
                            opacity: 0.8,
                            borderRadius: 4,
                            color: sc.text,
                            fontSize: 10,
                            fontWeight: 700,
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {width > 80 && (p.case_nummer ?? "")}
                        </div>
                      );
                    })}
                  </div>

                  {/* Activiteit cell rows */}
                  {expanded &&
                    acts.map((a) => (
                      <ActiviteitCellsRow
                        key={a.id}
                        activiteit={a}
                        cellMap={projectDayActivities.get(p.id)}
                        monteurIdsByCel={monteurIdsByCel}
                        monteurById={new Map(monteurs.map((mm) => [mm.id, mm]))}
                        visibleWeekNrs={visibleWeekNrs}
                        jaar={jaar}
                        currentISO={currentISO}
                        isTodayCol={isTodayCol}
                        totalGridWidth={totalGridWidth}
                        isLast={a === acts[acts.length - 1]}
                        onClick={() => navigateToProject(p.id)}
                      />
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== Sub-components ==============
function MonteurSidebarRow({ monteur }: { monteur: Monteur }) {
  const isSchakel = monteur.type === "schakelmonteur";
  const ms = monteur.aanwijzing_ms;
  const msStyle = msBadgeStyle(ms);
  return (
    <div
      className="flex items-center gap-2 px-3"
      style={{
        height: ROW_H_MONTEUR,
        borderRight: "1px solid rgba(255,255,255,0.08)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div
        className="flex shrink-0 items-center justify-center rounded-full"
        style={{
          width: 26,
          height: 26,
          background: isSchakel ? "#feb300" : "#378add",
          color: isSchakel ? "#0a1a30" : "#ffffff",
          fontSize: 9,
          fontWeight: 700,
        }}
      >
        {initialen(monteur.naam)}
      </div>
      <span className="truncate text-[13px] font-semibold text-foreground" title={monteur.naam}>
        {monteur.naam}
      </span>
      {ms && msStyle && (
        <span
          className="ml-auto shrink-0"
          style={{
            ...msStyle,
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 5px",
            borderRadius: 4,
          }}
        >
          {ms}
        </span>
      )}
    </div>
  );
}

function MonteurCellsRow({
  monteur,
  segments,
  projectById,
  visibleWeekNrs,
  jaar,
  currentISO,
  totalGridWidth,
  onProjectClick,
}: {
  monteur: Monteur;
  segments: { startSlot: number; endSlot: number; projectId: string | null; projectIds: string[]; dubbel: boolean }[];
  projectById: Map<string, Project>;
  visibleWeekNrs: number[];
  jaar: number;
  currentISO: { week: number; year: number };
  totalGridWidth: number;
  onProjectClick: (id: string) => void;
}) {
  return (
    <div
      className="relative"
      style={{
        height: ROW_H_MONTEUR,
        width: totalGridWidth,
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* Empty cell backgrounds */}
      <div className="flex" style={{ width: totalGridWidth, height: ROW_H_MONTEUR }}>
        {visibleWeekNrs.map((wnr, wi) => {
          const monday = getMondayOfWeek(wnr, jaar);
          const isNow = wnr === currentISO.week && jaar === currentISO.year;
          return (
            <div key={wi} className="flex" style={{ background: isNow ? "rgba(63,255,139,0.03)" : "transparent" }}>
              {DAG_LABELS.map((_, d) => {
                const isLast = d === DAYS_PER_WEEK - 1;
                const date = new Date(monday);
                date.setDate(monday.getDate() + d);
                return (
                  <div
                    key={d}
                    title={`${monteur.naam} — ${DAG_LABELS[d]} ${formatDate(date)}`}
                    style={{
                      width: CELL_W,
                      height: ROW_H_MONTEUR,
                      borderRight: isLast
                        ? "1px solid rgba(255,255,255,0.1)"
                        : "1px solid rgba(255,255,255,0.04)",
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Segment overlays */}
      {segments.map((s, i) => {
        const left = s.startSlot * CELL_W;
        const width = (s.endSlot - s.startSlot + 1) * CELL_W;
        if (s.dubbel) {
          return (
            <HoverCard key={i} openDelay={120}>
              <HoverCardTrigger asChild>
                <div
                  className="absolute flex cursor-pointer items-center justify-center"
                  style={{
                    left: left + 2,
                    width: width - 4,
                    top: 4,
                    height: ROW_H_MONTEUR - 8,
                    background: "#ef4444",
                    borderRadius: 4,
                    color: "white",
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  !
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="w-auto" side="top">
                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Dubbel gepland
                  </div>
                  {s.projectIds.map((pid) => {
                    const p = projectById.get(pid);
                    return (
                      <div key={pid} className="text-xs">
                        <span style={{ color: "#3fff8b", fontWeight: 700 }}>
                          {p?.case_nummer ?? pid.slice(0, 6)}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {p?.station_naam ?? ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </HoverCardContent>
            </HoverCard>
          );
        }
        const p = s.projectId ? projectById.get(s.projectId) : null;
        const isFirst = true;
        const isLast = true;
        return (
          <div
            key={i}
            onClick={() => s.projectId && onProjectClick(s.projectId)}
            className="absolute flex cursor-pointer items-center justify-center"
            title={p?.case_nummer ? `${p.case_nummer} — ${p.station_naam ?? ""}` : ""}
            style={{
              left,
              width,
              top: 4,
              height: ROW_H_MONTEUR - 8,
              background: "rgba(63,255,139,0.85)",
              color: "#0a1a30",
              fontSize: 9,
              fontWeight: 700,
              borderTopLeftRadius: isFirst ? 4 : 0,
              borderBottomLeftRadius: isFirst ? 4 : 0,
              borderTopRightRadius: isLast ? 4 : 0,
              borderBottomRightRadius: isLast ? 4 : 0,
              overflow: "hidden",
              whiteSpace: "nowrap",
              padding: "0 4px",
            }}
          >
            {p?.case_nummer ?? ""}
          </div>
        );
      })}
    </div>
  );
}

function ActiviteitCellsRow({
  activiteit,
  cellMap,
  monteurIdsByCel,
  monteurById,
  visibleWeekNrs,
  jaar,
  currentISO,
  totalGridWidth,
}: {
  activiteit: Activiteit;
  cellMap: Map<string, Map<string, Cel>> | undefined;
  monteurIdsByCel: Map<string, string[]>;
  monteurById: Map<string, Monteur>;
  visibleWeekNrs: number[];
  jaar: number;
  currentISO: { week: number; year: number };
  totalGridWidth: number;
}) {
  return (
    <div
      className="flex"
      style={{
        width: totalGridWidth,
        height: ROW_H_ACTIVITEIT,
        borderBottom: "1px solid rgba(255,255,255,0.03)",
        background: "rgba(255,255,255,0.015)",
      }}
    >
      {visibleWeekNrs.map((wnr, wi) => {
        const isNow = wnr === currentISO.week && jaar === currentISO.year;
        return (
          <div key={wi} className="flex" style={{ background: isNow ? "rgba(63,255,139,0.03)" : "transparent" }}>
            {DAG_LABELS.map((_, d) => {
              const isLast = d === DAYS_PER_WEEK - 1;
              const cel = cellMap?.get(dayKey(wnr, d))?.get(activiteit.id);
              const kleur = cel?.kleur_code;
              const colorHex = kleur ? colorHexFor(kleur) : null;
              const monteurIds = cel ? monteurIdsByCel.get(cel.id) ?? [] : [];
              return (
                <div
                  key={d}
                  className="relative"
                  style={{
                    width: CELL_W,
                    height: ROW_H_ACTIVITEIT,
                    borderRight: isLast
                      ? "1px solid rgba(255,255,255,0.1)"
                      : "1px solid rgba(255,255,255,0.04)",
                    background: colorHex ? hexToRgba(colorHex, 0.5) : "transparent",
                    borderLeft: colorHex ? `2px solid ${colorHex}` : undefined,
                  }}
                >
                  {monteurIds.length > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex">
                        {monteurIds.slice(0, 3).map((mid, idx) => {
                          const m = monteurById.get(mid);
                          if (!m) return null;
                          const isS = m.type === "schakelmonteur";
                          return (
                            <div
                              key={mid}
                              className="flex items-center justify-center rounded-full"
                              style={{
                                width: 18,
                                height: 18,
                                background: isS ? "#feb300" : "#378add",
                                color: isS ? "#0a1a30" : "#fff",
                                fontSize: 7,
                                fontWeight: 700,
                                border: "1.5px solid rgba(0,0,0,0.4)",
                                marginLeft: idx === 0 ? 0 : -6,
                              }}
                              title={m.naam}
                            >
                              {initialen(m.naam)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function colorHexFor(code: string): string {
  // Lazy import to avoid circular issues — use the COLOR_MAP constants directly
  // by re-importing here for type clarity
  const map: Record<string, string> = {
    c1: "#00642f",
    c2: "#fdcb35",
    c3: "#1a4a2e",
    c4: "#0f766e",
    c5: "#1d4ed8",
    c6: "#dc2626",
    c7: "#9333ea",
    c8: "#ea580c",
    c9: "#0891b2",
    c10: "#65a30d",
    c11: "#be185d",
    c12: "#78716c",
  };
  return map[code] ?? "#888888";
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
