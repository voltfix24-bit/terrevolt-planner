import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  COLOR_MAP,
  DAG_LABELS,
  formatDate,
  getMondayOfWeek,
  initialen,
  wrapWeek,
} from "@/lib/planning-types";

// ============== Constants ==============
const SIDEBAR_W = 220;
const CELL_W = 44;
const ROW_H_PROJECT = 44;
const ROW_H_ACTIVITEIT = 36;
const HEADER_H = 56;
const DAYS_PER_WEEK = 5;

type Status = "concept" | "gepland" | "in_uitvoering" | "afgerond";

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
}

interface CelMonteur {
  cel_id: string | null;
  monteur_id: string | null;
}

// ============== Helpers ==============
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function statusBarColor(status: Status | null): string {
  switch (status) {
    case "gepland":
      return "#feb300";
    case "in_uitvoering":
      return "#3fff8b";
    case "afgerond":
      return "rgba(63,255,139,0.3)";
    case "concept":
    default:
      return "rgba(255,255,255,0.15)";
  }
}

function statusBarTextColor(status: Status | null): string {
  switch (status) {
    case "gepland":
    case "in_uitvoering":
      return "#0a1a30";
    default:
      return "#ffffff";
  }
}

function statusLabel(status: Status | null): string {
  switch (status) {
    case "gepland":
      return "Gepland";
    case "in_uitvoering":
      return "In uitvoering";
    case "afgerond":
      return "Afgerond";
    case "concept":
    default:
      return "Concept";
  }
}

function capLabel(t: string | null): string {
  if (t === "schakel") return "Schakel";
  if (t === "montage") return "Montage";
  return "Geen";
}

// ============== Mini avatar ==============
function MiniAvatar({ naam, idx }: { naam: string; idx: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full text-white"
      style={{
        width: 18,
        height: 18,
        fontSize: 6,
        fontWeight: 700,
        backgroundColor: "rgba(255,255,255,0.18)",
        border: "1.5px solid rgba(0,0,0,0.4)",
        marginLeft: idx === 0 ? 0 : -6,
      }}
    >
      {initialen(naam)}
    </div>
  );
}

// ============== Page ==============
export default function Overzicht() {
  const navigate = useNavigate();

  // ====== Filters ======
  const [jaar, setJaar] = useState<number>(2026);
  const [numWeeks, setNumWeeks] = useState<4 | 8 | 12>(8);
  const [startWeek, setStartWeek] = useState<number>(1);

  // ====== Data ======
  const [projecten, setProjecten] = useState<Project[]>([]);
  const [weken, setWeken] = useState<Week[]>([]);
  const [activiteiten, setActiviteiten] = useState<Activiteit[]>([]);
  const [cellen, setCellen] = useState<Cel[]>([]);
  const [monteurs, setMonteurs] = useState<Monteur[]>([]);
  const [celMonteurs, setCelMonteurs] = useState<CelMonteur[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  // ====== Scroll sync ======
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const scrollLock = useRef(false);

  const syncScroll = useCallback((source: "header" | "body", left: number) => {
    if (scrollLock.current) return;
    scrollLock.current = true;
    if (source !== "header" && headerScrollRef.current) headerScrollRef.current.scrollLeft = left;
    if (source !== "body" && bodyScrollRef.current) bodyScrollRef.current.scrollLeft = left;
    requestAnimationFrame(() => {
      scrollLock.current = false;
    });
  }, []);

  // ====== Fetch ======
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [pRes, wRes, aRes, cRes, mRes, cmRes] = await Promise.all([
        supabase.from("projecten").select("id, case_nummer, station_naam, status, jaar, created_at").order("created_at", { ascending: true }),
        supabase.from("project_weken").select("id, project_id, week_nr, positie"),
        supabase.from("project_activiteiten").select("id, project_id, naam, capaciteit_type, positie"),
        supabase.from("planning_cellen").select("id, activiteit_id, week_id, dag_index, kleur_code"),
        supabase.from("monteurs").select("id, naam"),
        supabase.from("cel_monteurs").select("cel_id, monteur_id"),
      ]);
      if (cancelled) return;
      setProjecten((pRes.data ?? []) as Project[]);
      setWeken((wRes.data ?? []) as Week[]);
      setActiviteiten((aRes.data ?? []) as Activiteit[]);
      setCellen((cRes.data ?? []) as Cel[]);
      setMonteurs((mRes.data ?? []) as Monteur[]);
      setCelMonteurs((cmRes.data ?? []) as CelMonteur[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ====== Derived maps ======
  const visibleWeekNrs = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < numWeeks; i++) arr.push(wrapWeek(startWeek + i));
    return arr;
  }, [startWeek, numWeeks]);

  const visibleWeekNrSet = useMemo(() => new Set(visibleWeekNrs), [visibleWeekNrs]);

  const totalGridWidth = numWeeks * DAYS_PER_WEEK * CELL_W;

  // Only projecten matching the selected jaar are shown
  const visibleProjecten = useMemo(
    () => projecten.filter((p) => (p.jaar ?? null) === jaar),
    [projecten, jaar],
  );

  const visibleProjectIds = useMemo(
    () => new Set(visibleProjecten.map((p) => p.id)),
    [visibleProjecten],
  );

  // Only weken belonging to a visible project AND within the visible week range
  const wekenByProject = useMemo(() => {
    const m = new Map<string, Week[]>();
    for (const w of weken) {
      if (!w.project_id) continue;
      if (!visibleProjectIds.has(w.project_id)) continue;
      if (!visibleWeekNrSet.has(w.week_nr)) continue;
      const arr = m.get(w.project_id) ?? [];
      arr.push(w);
      m.set(w.project_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.positie - b.positie);
    return m;
  }, [weken, visibleProjectIds, visibleWeekNrSet]);

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

  const weekById = useMemo(() => {
    const m = new Map<string, Week>();
    for (const w of weken) m.set(w.id, w);
    return m;
  }, [weken]);

  // cel lookup: activiteitId|weekId|dag → cel
  const celByKey = useMemo(() => {
    const m = new Map<string, Cel>();
    for (const c of cellen) {
      if (!c.activiteit_id || !c.week_id) continue;
      m.set(`${c.activiteit_id}|${c.week_id}|${c.dag_index}`, c);
    }
    return m;
  }, [cellen]);

  const monteurById = useMemo(() => {
    const m = new Map<string, Monteur>();
    for (const x of monteurs) m.set(x.id, x);
    return m;
  }, [monteurs]);

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

  // For each project, find global slot range across visible weeks
  // slot index = visibleWeekIndex * 5 + dag
  const projectSpanByProject = useMemo(() => {
    const result = new Map<string, { first: number; last: number } | null>();
    for (const p of projecten) {
      const projWeken = wekenByProject.get(p.id) ?? [];
      const projActs = activiteitenByProject.get(p.id) ?? [];
      let first = Infinity;
      let last = -Infinity;
      for (let wi = 0; wi < visibleWeekNrs.length; wi++) {
        const wnr = visibleWeekNrs[wi];
        const matchingWeeks = projWeken.filter((w) => w.week_nr === wnr);
        for (const w of matchingWeeks) {
          for (let d = 0; d < DAYS_PER_WEEK; d++) {
            for (const a of projActs) {
              const c = celByKey.get(`${a.id}|${w.id}|${d}`);
              if (c?.kleur_code) {
                const slot = wi * DAYS_PER_WEEK + d;
                if (slot < first) first = slot;
                if (slot > last) last = slot;
              }
            }
          }
        }
      }
      result.set(p.id, first === Infinity ? null : { first, last });
    }
    return result;
  }, [projecten, wekenByProject, activiteitenByProject, visibleWeekNrs, celByKey]);

  // For empty projects: thin dashed bar across project_weken visible range
  const projectVisibleWeekRangeByProject = useMemo(() => {
    const result = new Map<string, { first: number; last: number } | null>();
    for (const p of projecten) {
      const projWeken = wekenByProject.get(p.id) ?? [];
      let first = Infinity;
      let last = -Infinity;
      for (let wi = 0; wi < visibleWeekNrs.length; wi++) {
        const wnr = visibleWeekNrs[wi];
        if (projWeken.some((w) => w.week_nr === wnr)) {
          const start = wi * DAYS_PER_WEEK;
          const end = wi * DAYS_PER_WEEK + DAYS_PER_WEEK - 1;
          if (start < first) first = start;
          if (end > last) last = end;
        }
      }
      result.set(p.id, first === Infinity ? null : { first, last });
    }
    return result;
  }, [projecten, wekenByProject, visibleWeekNrs]);

  // ====== Handlers ======
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

  return (
    <div className="font-sans">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Overzicht</h1>

        <div className="flex items-center gap-2">
          {/* Week navigator */}
          <div className="flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.03] px-1 h-8">
            <button
              type="button"
              onClick={() => setStartWeek((w) => wrapWeek(w - 1))}
              className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/[0.06] text-muted-foreground hover:text-foreground"
              title="Vorige week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs font-medium text-foreground tabular-nums">
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

          {/* Range pills */}
          <div className="flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.03] p-0.5 h-8">
            {([4, 8, 12] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNumWeeks(n)}
                className={[
                  "rounded px-2.5 h-7 text-xs font-medium transition-colors",
                  numWeeks === n
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
                ].join(" ")}
              >
                {n} weken
              </button>
            ))}
          </div>

          {/* Year select */}
          <select
            value={jaar}
            onChange={(e) => setJaar(parseInt(e.target.value, 10))}
            className="h-8 rounded-md border border-white/15 bg-white/[0.03] px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y} className="bg-[#0a1a30]">
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid container */}
      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(10,26,48,0.4)" }}
      >
        {/* Header row */}
        <div className="flex border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {/* Sidebar header */}
          <div
            className="shrink-0 border-r flex items-end px-3 pb-2"
            style={{
              width: SIDEBAR_W,
              height: HEADER_H,
              borderColor: "rgba(255,255,255,0.08)",
              backgroundColor: "rgba(255,255,255,0.02)",
            }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Project
            </span>
          </div>

          {/* Scrollable header */}
          <div
            ref={headerScrollRef}
            className="overflow-x-hidden flex-1"
            onScroll={(e) => syncScroll("header", e.currentTarget.scrollLeft)}
          >
            <div style={{ width: totalGridWidth }}>
              {/* Week titles */}
              <div className="flex" style={{ height: 28 }}>
                {visibleWeekNrs.map((wnr, wi) => {
                  const monday = getMondayOfWeek(wnr, jaar);
                  return (
                    <div
                      key={wi}
                      className="flex items-center justify-center border-r"
                      style={{
                        width: DAYS_PER_WEEK * CELL_W,
                        borderColor: "rgba(255,255,255,0.06)",
                      }}
                    >
                      <span className="text-[11px] font-semibold text-foreground">
                        Wk {wnr}{" "}
                        <span className="text-muted-foreground font-normal">
                          {formatDate(monday)}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Day labels */}
              <div className="flex" style={{ height: 28 }}>
                {visibleWeekNrs.map((_, wi) =>
                  DAG_LABELS.map((d, di) => (
                    <div
                      key={`${wi}-${di}`}
                      className="flex items-center justify-center border-r"
                      style={{
                        width: CELL_W,
                        borderColor:
                          di === DAYS_PER_WEEK - 1
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(255,255,255,0.04)",
                      }}
                    >
                      <span className="text-[10px] font-medium text-muted-foreground">{d}</span>
                    </div>
                  )),
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Laden…</div>
        ) : projecten.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nog geen projecten — maak een project aan op de Projecten pagina
          </div>
        ) : (
          <div className="flex">
            {/* Frozen sidebar */}
            <div
              className="shrink-0 border-r"
              style={{
                width: SIDEBAR_W,
                borderColor: "rgba(255,255,255,0.08)",
                backgroundColor: "rgba(255,255,255,0.015)",
              }}
            >
              {projecten.map((p) => {
                const expanded = expandedProjects.has(p.id);
                const projActs = activiteitenByProject.get(p.id) ?? [];
                return (
                  <div
                    key={p.id}
                    className="border-b"
                    style={{ borderColor: "rgba(255,255,255,0.06)" }}
                  >
                    {/* Project row */}
                    <div
                      className="flex items-center gap-2 px-3 hover:bg-white/[0.03] cursor-pointer"
                      style={{ height: ROW_H_PROJECT }}
                      onClick={() => navigateToProject(p.id)}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(p.id);
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-white/[0.06] hover:text-foreground shrink-0"
                      >
                        {expanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-[13px] font-bold text-primary">
                          {p.case_nummer ?? "—"}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {p.station_naam ?? ""}
                        </div>
                      </div>
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                        style={{
                          backgroundColor: hexToRgba(
                            statusBarColor(p.status).startsWith("rgba")
                              ? "#ffffff"
                              : statusBarColor(p.status),
                            0.18,
                          ),
                          color: statusBarColor(p.status).startsWith("rgba")
                            ? "rgba(255,255,255,0.7)"
                            : statusBarColor(p.status),
                        }}
                      >
                        {statusLabel(p.status)}
                      </span>
                    </div>

                    {/* Expanded activiteit rows */}
                    {expanded &&
                      projActs.map((a, idx) => (
                        <div
                          key={a.id}
                          className="flex items-center gap-2 pl-9 pr-3"
                          style={{
                            height: ROW_H_ACTIVITEIT,
                            borderTop:
                              idx === 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                            backgroundColor: "rgba(0,0,0,0.15)",
                          }}
                        >
                          <span className="truncate flex-1 text-[12px] text-foreground">
                            {a.naam}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-white/[0.06] text-muted-foreground"
                          >
                            {capLabel(a.capaciteit_type)}
                          </span>
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>

            {/* Scrollable body */}
            <div
              ref={bodyScrollRef}
              className="overflow-x-auto flex-1"
              onScroll={(e) => syncScroll("body", e.currentTarget.scrollLeft)}
            >
              <div style={{ width: totalGridWidth }}>
                {projecten.map((p) => {
                  const expanded = expandedProjects.has(p.id);
                  const projActs = activiteitenByProject.get(p.id) ?? [];
                  const projWeken = wekenByProject.get(p.id) ?? [];
                  const span = projectSpanByProject.get(p.id);
                  const dashedRange = projectVisibleWeekRangeByProject.get(p.id);

                  return (
                    <div
                      key={p.id}
                      className="border-b"
                      style={{ borderColor: "rgba(255,255,255,0.06)" }}
                    >
                      {/* Project bar row */}
                      <div
                        className="relative cursor-pointer hover:bg-white/[0.03]"
                        style={{ height: ROW_H_PROJECT, width: totalGridWidth }}
                        onClick={() => navigateToProject(p.id)}
                      >
                        {/* Day separators */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {visibleWeekNrs.map((_, wi) =>
                            DAG_LABELS.map((_, di) => (
                              <div
                                key={`${wi}-${di}`}
                                className="border-r"
                                style={{
                                  width: CELL_W,
                                  borderColor:
                                    di === DAYS_PER_WEEK - 1
                                      ? "rgba(255,255,255,0.06)"
                                      : "rgba(255,255,255,0.025)",
                                }}
                              />
                            )),
                          )}
                        </div>

                        {/* Bar */}
                        {span ? (
                          <div
                            className="absolute flex items-center px-2"
                            style={{
                              left: span.first * CELL_W,
                              width: (span.last - span.first + 1) * CELL_W,
                              top: (ROW_H_PROJECT - 28) / 2,
                              height: 28,
                              backgroundColor: statusBarColor(p.status),
                              borderRadius: 6,
                            }}
                          >
                            <span
                              className="font-display font-bold tracking-tight truncate"
                              style={{
                                fontSize: 10,
                                color: statusBarTextColor(p.status),
                              }}
                            >
                              {p.case_nummer ?? ""}
                            </span>
                          </div>
                        ) : dashedRange ? (
                          <div
                            className="absolute flex items-center px-2"
                            style={{
                              left: dashedRange.first * CELL_W,
                              width: (dashedRange.last - dashedRange.first + 1) * CELL_W,
                              top: (ROW_H_PROJECT - 28) / 2,
                              height: 28,
                              border: "1px dashed rgba(255,255,255,0.18)",
                              borderRadius: 6,
                            }}
                          >
                            <span
                              className="font-display font-medium tracking-tight truncate text-muted-foreground"
                              style={{ fontSize: 10 }}
                            >
                              {p.case_nummer ?? ""}
                            </span>
                          </div>
                        ) : null}
                      </div>

                      {/* Expanded activiteit cell rows */}
                      {expanded &&
                        projActs.map((a, idx) => (
                          <div
                            key={a.id}
                            className="flex"
                            style={{
                              height: ROW_H_ACTIVITEIT,
                              borderTop:
                                idx === 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                              backgroundColor: "rgba(0,0,0,0.15)",
                            }}
                          >
                            {visibleWeekNrs.map((wnr, wi) => {
                              const matchingWeeks = projWeken.filter((w) => w.week_nr === wnr);
                              const week = matchingWeeks[0];
                              return DAG_LABELS.map((_, di) => {
                                const cel = week
                                  ? celByKey.get(`${a.id}|${week.id}|${di}`)
                                  : undefined;
                                const filled = !!cel?.kleur_code;
                                const kleur = filled
                                  ? COLOR_MAP[cel!.kleur_code!]?.hex
                                  : undefined;
                                const monteurIds = cel
                                  ? monteurIdsByCel.get(cel.id) ?? []
                                  : [];
                                const showAvatars =
                                  filled &&
                                  (a.capaciteit_type === "schakel" ||
                                    a.capaciteit_type === "montage") &&
                                  monteurIds.length > 0;
                                const visibleMonteurs = monteurIds.slice(0, 2);
                                const overflow = monteurIds.length - visibleMonteurs.length;

                                return (
                                  <div
                                    key={`${wi}-${di}`}
                                    className="flex items-center justify-center cursor-pointer"
                                    style={{
                                      width: CELL_W,
                                      borderRight:
                                        di === DAYS_PER_WEEK - 1
                                          ? "1px solid rgba(255,255,255,0.06)"
                                          : "1px solid rgba(255,255,255,0.025)",
                                      backgroundColor: filled
                                        ? hexToRgba(kleur!, 0.6)
                                        : "transparent",
                                      borderLeft: filled ? `2px solid ${kleur}` : undefined,
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigateToProject(p.id);
                                    }}
                                  >
                                    {showAvatars && (
                                      <div className="flex items-center">
                                        {visibleMonteurs.map((mid, i) => {
                                          const m = monteurById.get(mid);
                                          return (
                                            <MiniAvatar
                                              key={mid}
                                              naam={m?.naam ?? "?"}
                                              idx={i}
                                            />
                                          );
                                        })}
                                        {overflow > 0 && (
                                          <div
                                            className="flex items-center justify-center rounded-full text-white"
                                            style={{
                                              width: 18,
                                              height: 18,
                                              fontSize: 6,
                                              fontWeight: 700,
                                              backgroundColor: "rgba(255,255,255,0.15)",
                                              border: "1.5px solid rgba(0,0,0,0.4)",
                                              marginLeft: -6,
                                            }}
                                          >
                                            +{overflow}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              });
                            })}
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
