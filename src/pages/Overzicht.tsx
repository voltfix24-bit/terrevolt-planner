import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
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
const SIDEBAR_W = 260;
const SIDEBAR_W_COLLAPSED = 48;
const ROW_H_MONTEUR = 52;
const ROW_H_PROJECT = 44;
const ROW_H_ACTIVITEIT = 36;
const HEADER_H = 56;
const DAYS_PER_WEEK = 5;
const PILL_H_MONTEUR = 26;
const PILL_H_PROJECT = 22;

// Border tokens — applied to EVERY cell so the raster is always visible
const BORDER_CELL_RIGHT = "1px solid rgba(255,255,255,0.06)";
const BORDER_CELL_BOTTOM = "1px solid rgba(255,255,255,0.04)";
const BORDER_GROUP_RIGHT = "1px solid rgba(255,255,255,0.12)";
const BG_CURRENT_GROUP = "rgba(63,255,139,0.02)";
const BG_TODAY = "rgba(63,255,139,0.04)";

// Scale config
type Scale = "maand" | "kwartaal" | "jaar";

const SCALE_OPTIONS: { value: Scale; label: string }[] = [
  { value: "maand", label: "Maand" },
  { value: "kwartaal", label: "Kwartaal" },
  { value: "jaar", label: "Jaar" },
];

const CELL_W_BY_SCALE: Record<Scale, number> = {
  maand: 44,
  kwartaal: 52,
  jaar: 64,
};

const NL_MONTHS = [
  "Jan", "Feb", "Mrt", "Apr", "Mei", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec",
];
const NL_MONTHS_LONG = [
  "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December",

// Compact date-range formatter for the project card subtitle.
// Examples: "12 mei → 20 mei", "12 mei → 3 jun '25", "vanaf 12 mei", "tot 20 mei".
function formatDateRangeShort(from: string | null, to: string | null): string {
  const parse = (s: string | null): Date | null => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };
  const fmt = (d: Date, withYear: boolean) =>
    `${d.getDate()} ${NL_MONTHS[d.getMonth()].toLowerCase()}${withYear ? ` '${String(d.getFullYear()).slice(2)}` : ""}`;
  const a = parse(from);
  const b = parse(to);
  if (!a && !b) return "";
  if (a && !b) return `vanaf ${fmt(a, false)}`;
  if (!a && b) return `tot ${fmt(b, false)}`;
  const sameYear = a!.getFullYear() === b!.getFullYear();
  const currentYear = new Date().getFullYear();
  const showYearA = !sameYear;
  const showYearB = !sameYear || a!.getFullYear() !== currentYear;
  return `${fmt(a!, showYearA)} → ${fmt(b!, showYearB)}`;
}


type Status = "concept" | "gepland" | "in_uitvoering" | "afgerond";

interface Project {
  id: string;
  case_nummer: string | null;
  station_naam: string | null;
  status: Status | null;
  jaar: number | null;
  created_at: string | null;
  gsu_datum: string | null;
  geu_datum: string | null;
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

// One column in the grid (a "slot"). A slot covers one or more (week_nr, dag_index) pairs.
interface Slot {
  index: number;
  // (week_nr, dag_index) pairs covered by this slot
  pairs: Array<{ wnr: number; dag: number }>;
  // header info
  primaryLabel: string;       // e.g. "MA" / "Wk 18" / "Mei"
  secondaryLabel?: string;    // e.g. "27/4" / "" / ""
  // group label that this slot belongs to (e.g. week label for maand, month label for kwartaal/jaar)
  groupLabel: string;
  // groupKey is shared across slots in the same group (so we render the group header once)
  groupKey: string;
  // is this the last slot of its visible group? (-> stronger right border)
  isLastInGroup: boolean;
  // tint hints
  isCurrentGroup: boolean;
  isToday: boolean;
  // feestdag (NL) — only relevant for "maand" scale where each slot is a single day
  isFeestdag?: boolean;
  feestdagNaam?: string;
}

// ============== Helpers ==============
function dayKey(week_nr: number, dag_index: number): string {
  return `${week_nr}-${dag_index}`;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function colorHexFor(code: string): string {
  const map: Record<string, string> = {
    c1: "#00642f", c2: "#fdcb35", c3: "#1a4a2e", c4: "#0f766e",
    c5: "#1d4ed8", c6: "#dc2626", c7: "#9333ea", c8: "#ea580c",
    c9: "#0891b2", c10: "#65a30d", c11: "#be185d", c12: "#78716c",
  };
  return map[code] ?? "#888888";
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Number of ISO weeks for a year (52 or 53). Approximation: 52 unless year contains a Thursday on Dec 31 or Jan 1.
function weeksInYear(year: number): number {
  const d = new Date(year, 11, 28);
  // ISO week of Dec 28 is always last week of year
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  return 1 + Math.round((tmp.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

// Quarter (1..4) for an ISO week_nr (approximate, based on Monday's month)
function quarterOfWeek(wnr: number, jaar: number): number {
  const monday = getMondayOfWeek(wnr, jaar);
  return Math.floor(monday.getMonth() / 3) + 1;
}

// First week_nr of a quarter q (1..4)
function firstWeekOfQuarter(q: number, jaar: number): number {
  const wkCount = weeksInYear(jaar);
  for (let w = 1; w <= wkCount; w++) {
    if (quarterOfWeek(w, jaar) === q) return w;
  }
  return 1;
}

// ============== Page ==============
export default function Overzicht() {
  const navigate = useNavigate();

  const initialIso = useMemo(() => getCurrentISOWeek(), []);
  const [jaar, setJaar] = useState<number>(initialIso.year);
  const [scale, setScale] = useState<Scale>("maand");
  const [startWeek, setStartWeek] = useState<number>(initialIso.week);

  const [projecten, setProjecten] = useState<Project[]>([]);
  const [weken, setWeken] = useState<Week[]>([]);
  const [activiteiten, setActiviteiten] = useState<Activiteit[]>([]);
  const [cellen, setCellen] = useState<Cel[]>([]);
  const [monteurs, setMonteurs] = useState<Monteur[]>([]);
  const [celMonteurs, setCelMonteurs] = useState<CelMonteur[]>([]);
  const [feestdagen, setFeestdagen] = useState<{ datum: string; naam: string }[]>([]);

  const [medewerkersOpen, setMedewerkersOpen] = useState(true);
  const [schakelOpen, setSchakelOpen] = useState(true);
  const [montageOpen, setMontageOpen] = useState(true);
  const [projectenOpen, setProjectenOpen] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarW = sidebarCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W;

  // Scroll sync between sticky header and vertically-scrolling body
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const scrollLock = useRef(false);
  const syncScroll = useCallback((source: "header" | "body", left: number) => {
    if (scrollLock.current) return;
    scrollLock.current = true;
    if (source !== "header" && headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = left;
    }
    if (source !== "body" && bodyScrollRef.current) {
      bodyScrollRef.current.scrollLeft = left;
    }
    requestAnimationFrame(() => {
      scrollLock.current = false;
    });
  }, []);

  // Reset horizontal scroll to 0 when the visible week range changes,
  // so the first slot is never clipped (header and body stay aligned).
  useEffect(() => {
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = 0;
    if (bodyScrollRef.current) bodyScrollRef.current.scrollLeft = 0;
  }, [startWeek, jaar, scale]);

  const currentISO = useMemo(() => getCurrentISOWeek(), []);

  // Track viewport width so the grid can fill available horizontal space.
  const [viewportW, setViewportW] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Auto-fit number of weeks/slots to the available horizontal width so
  // the grid always fills the viewport (no empty whitespace after last col).
  const availableGridWidth = useMemo(() => {
    const sidebarPx = sidebarCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W;
    const appSidebar = 220; // left nav sidebar
    const beschikbaarColumnPx = 0; // (was 100px) right BESCHIKBAAR column removed
    const padding = 80;
    return Math.max(400, viewportW - appSidebar - sidebarPx - beschikbaarColumnPx - padding);
  }, [viewportW, sidebarCollapsed]);

  // For "maand": each week = 5 days × cellW. Min 4, max 12 weeks.
  const weeksToShow = useMemo(() => {
    if (scale !== "maand") return 5;
    const weekPx = DAYS_PER_WEEK * CELL_W_BY_SCALE.maand;
    return Math.max(4, Math.min(12, Math.floor(availableGridWidth / weekPx) - 1));
  }, [scale, availableGridWidth]);

  // For "kwartaal": each slot = cellW. Min 8, max 26 weeks.
  const kwartaalWeeks = useMemo(() => {
    if (scale !== "kwartaal") return 13;
    return Math.max(8, Math.min(26, Math.ceil(availableGridWidth / CELL_W_BY_SCALE.kwartaal)));
  }, [scale, availableGridWidth]);

  // Feestdagen lookup (datum YYYY-MM-DD → naam)
  const feestdagMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of feestdagen) m.set(f.datum, f.naam);
    return m;
  }, [feestdagen]);

  // ====== Build slots based on scale ======
  const slots = useMemo<Slot[]>(() => {
    const out: Slot[] = [];
    const todayWeek = currentISO.week;
    const todayYear = currentISO.year;
    const now = new Date();
    const todayDow = (now.getDay() + 6) % 7;

    if (scale === "maand") {
      // weeksToShow weeks × 5 days (auto-fit to viewport)
      const wkCount = weeksInYear(jaar);
      for (let wi = 0; wi < weeksToShow; wi++) {
        const wnr = wrapWeek(((startWeek - 1 + wi) % wkCount) + 1);
        const monday = getMondayOfWeek(wnr, jaar);
        const isCurrentWeek = wnr === todayWeek && jaar === todayYear;
        const groupKey = `wk-${wnr}`;
        const groupLabel = `Wk ${wnr}`;
        for (let d = 0; d < DAYS_PER_WEEK; d++) {
          const date = new Date(monday);
          date.setDate(monday.getDate() + d);
          const isToday = isCurrentWeek && d === todayDow && todayDow <= 4;
          const dStr = dateKey(date);
          const fNaam = feestdagMap.get(dStr);
          out.push({
            index: out.length,
            pairs: [{ wnr, dag: d }],
            primaryLabel: DAG_LABELS[d],
            secondaryLabel: formatDate(date),
            groupLabel,
            groupKey,
            isLastInGroup: d === DAYS_PER_WEEK - 1,
            isCurrentGroup: isCurrentWeek,
            isToday,
            isFeestdag: !!fNaam,
            feestdagNaam: fNaam,
          });
        }
      }
    } else if (scale === "kwartaal") {
      // Auto-fit weeks; group by month of the week's Monday
      const wkCount = weeksInYear(jaar);
      for (let i = 0; i < kwartaalWeeks; i++) {
        const wnr = wrapWeek(((startWeek - 1 + i) % wkCount) + 1);
        const monday = getMondayOfWeek(wnr, jaar);
        const monthIdx = monday.getMonth();
        const groupKey = `mo-${monday.getFullYear()}-${monthIdx}`;
        const groupLabel = `${NL_MONTHS_LONG[monthIdx]} ${monday.getFullYear()}`;
        const pairs: Array<{ wnr: number; dag: number }> = [];
        for (let d = 0; d < DAYS_PER_WEEK; d++) pairs.push({ wnr, dag: d });
        // Last in group = next slot has different month
        // We'll patch isLastInGroup after the loop.
        const isCurrentWeek = wnr === todayWeek && jaar === todayYear;
        out.push({
          index: out.length,
          pairs,
          primaryLabel: `Wk ${wnr}`,
          secondaryLabel: formatDate(monday),
          groupLabel,
          groupKey,
          isLastInGroup: false,
          isCurrentGroup: isCurrentWeek,
          isToday: false,
        });
      }
    } else {
      // jaar: 12 months
      for (let m = 0; m < 12; m++) {
        // Collect all (wnr, d) pairs whose Monday is in this month
        const pairs: Array<{ wnr: number; dag: number }> = [];
        const wkCount = weeksInYear(jaar);
        for (let w = 1; w <= wkCount; w++) {
          const monday = getMondayOfWeek(w, jaar);
          if (monday.getMonth() === m && monday.getFullYear() === jaar) {
            for (let d = 0; d < DAYS_PER_WEEK; d++) pairs.push({ wnr: w, dag: d });
          }
        }
        const isCurrentMonth = jaar === todayYear && new Date().getMonth() === m;
        out.push({
          index: out.length,
          pairs,
          primaryLabel: NL_MONTHS[m],
          secondaryLabel: `${jaar}`,
          groupLabel: `${jaar}`,
          groupKey: `yr-${jaar}`,
          isLastInGroup: m === 11,
          isCurrentGroup: isCurrentMonth,
          isToday: false,
        });
      }
    }

    // Patch isLastInGroup for kwartaal
    if (scale === "kwartaal") {
      for (let i = 0; i < out.length; i++) {
        const next = out[i + 1];
        out[i].isLastInGroup = !next || next.groupKey !== out[i].groupKey;
      }
    }
    return out;
  }, [scale, startWeek, jaar, currentISO, weeksToShow, kwartaalWeeks, feestdagMap]);

  // (cellW for jaar uses viewport-derived width; declared below)

  const cellW = useMemo(() => {
    if (scale !== "jaar") return CELL_W_BY_SCALE[scale];
    // Approximate available width = viewport minus sidebar minus app chrome.
    const available = Math.max(0, viewportW - SIDEBAR_W - 280);
    const ideal = available / 12;
    return Math.round(Math.min(110, Math.max(70, ideal)));
  }, [scale, viewportW]);
  const totalGridWidth = slots.length * cellW;

  const visibleWeekNrSet = useMemo(() => {
    const s = new Set<number>();
    for (const sl of slots) for (const p of sl.pairs) s.add(p.wnr);
    return s;
  }, [slots]);

  // dayKey -> slotIndex (for fast lookup of which column a (wnr,dag) belongs to)
  const dayKeyToSlot = useMemo(() => {
    const m = new Map<string, number>();
    for (const sl of slots) {
      for (const p of sl.pairs) m.set(dayKey(p.wnr, p.dag), sl.index);
    }
    return m;
  }, [slots]);

  // ====== Fetch all data once ======
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pRes, wRes, aRes, cRes, mRes, cmRes, fRes] = await Promise.all([
        supabase.from("projecten").select("id, case_nummer, station_naam, status, jaar, created_at, gsu_datum, geu_datum").order("created_at", { ascending: true }),
        supabase.from("project_weken").select("id, project_id, week_nr, positie"),
        supabase.from("project_activiteiten").select("id, project_id, naam, capaciteit_type, positie"),
        supabase.from("planning_cellen").select("id, activiteit_id, week_id, dag_index, kleur_code"),
        supabase.from("monteurs").select("id, naam, type, aanwijzing_ms, aanwijzing_ls").eq("actief", true).order("type", { ascending: false }).order("naam", { ascending: true }),
        supabase.from("cel_monteurs").select("cel_id, monteur_id"),
        supabase.from("feestdagen").select("datum, naam").in("jaar", [jaar - 1, jaar, jaar + 1]),
      ]);
      if (cancelled) return;
      setProjecten((pRes.data ?? []) as Project[]);
      setWeken((wRes.data ?? []) as Week[]);
      setActiviteiten((aRes.data ?? []) as Activiteit[]);
      setCellen((cRes.data ?? []) as Cel[]);
      setMonteurs((mRes.data ?? []) as Monteur[]);
      setCelMonteurs((cmRes.data ?? []) as CelMonteur[]);
      setFeestdagen((fRes.data ?? []) as { datum: string; naam: string }[]);
    })();
    return () => { cancelled = true; };
  }, [jaar]);

  // Re-fetch all data when the window/tab regains focus, so changes made
  // on other pages (e.g. Plannen) are immediately reflected here.
  useEffect(() => {
    const onFocus = () => {
      let cancelled = false;
      (async () => {
        const [pRes, wRes, aRes, cRes, mRes, cmRes, fRes] = await Promise.all([
          supabase.from("projecten").select("id, case_nummer, station_naam, status, jaar, created_at, gsu_datum, geu_datum").order("created_at", { ascending: true }),
          supabase.from("project_weken").select("id, project_id, week_nr, positie"),
          supabase.from("project_activiteiten").select("id, project_id, naam, capaciteit_type, positie"),
          supabase.from("planning_cellen").select("id, activiteit_id, week_id, dag_index, kleur_code"),
          supabase.from("monteurs").select("id, naam, type, aanwijzing_ms, aanwijzing_ls").eq("actief", true).order("type", { ascending: false }).order("naam", { ascending: true }),
          supabase.from("cel_monteurs").select("cel_id, monteur_id"),
          supabase.from("feestdagen").select("datum, naam").in("jaar", [jaar - 1, jaar, jaar + 1]),
        ]);
        if (cancelled) return;
        setProjecten((pRes.data ?? []) as Project[]);
        setWeken((wRes.data ?? []) as Week[]);
        setActiviteiten((aRes.data ?? []) as Activiteit[]);
        setCellen((cRes.data ?? []) as Cel[]);
        setMonteurs((mRes.data ?? []) as Monteur[]);
        setCelMonteurs((cmRes.data ?? []) as CelMonteur[]);
        setFeestdagen((fRes.data ?? []) as { datum: string; naam: string }[]);
      })();
      return () => { cancelled = true; };
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [jaar]);

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
        if (!byDay) { byDay = new Map(); m.set(mid, byDay); }
        let projs = byDay.get(k);
        if (!projs) { projs = new Set(); byDay.set(k, projs); }
        projs.add(act.project_id);
      }
    }
    return m;
  }, [cellen, weekById, activiteitById, monteurIdsByCel, visibleWeekNrSet]);

  // dayKey → Set<monteurId> double-booked on that day
  const dayConflictMonteurs = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const [mid, byDay] of monteurDayProjects.entries()) {
      for (const [k, projs] of byDay.entries()) {
        if (projs.size > 1) {
          let set = m.get(k);
          if (!set) { set = new Set(); m.set(k, set); }
          set.add(mid);
        }
      }
    }
    return m;
  }, [monteurDayProjects]);

  // project_id → dayKey → activiteit_id → cel
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
      if (!byDay) { byDay = new Map(); m.set(act.project_id, byDay); }
      let byAct = byDay.get(k);
      if (!byAct) { byAct = new Map(); byDay.set(k, byAct); }
      byAct.set(c.activiteit_id, c);
    }
    return m;
  }, [cellen, weekById, activiteitById, visibleWeekNrSet]);

  // activiteit_id → dayKey → cel
  const activiteitDayCel = useMemo(() => {
    const m = new Map<string, Map<string, Cel>>();
    for (const c of cellen) {
      if (!c.activiteit_id || !c.week_id || !c.kleur_code) continue;
      const w = weekById.get(c.week_id);
      if (!w) continue;
      if (!visibleWeekNrSet.has(w.week_nr)) continue;
      const k = dayKey(w.week_nr, c.dag_index);
      let byDay = m.get(c.activiteit_id);
      if (!byDay) { byDay = new Map(); m.set(c.activiteit_id, byDay); }
      byDay.set(k, c);
    }
    return m;
  }, [cellen, weekById, visibleWeekNrSet]);

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

  // Visible projects = projects with planning data anywhere (filled cellen),
  // OR projects with project_weken in the visible range (being planned).
  // This ensures projects don't disappear when scrolling outside their week range.
  const visibleProjecten = useMemo(() => {
    const projectsWithCellen = new Set<string>();
    for (const c of cellen) {
      if (!c.activiteit_id || !c.kleur_code) continue;
      const act = activiteitById.get(c.activiteit_id);
      if (act?.project_id) projectsWithCellen.add(act.project_id);
    }
    for (const w of weken) {
      if (w.project_id && visibleWeekNrSet.has(w.week_nr)) {
        projectsWithCellen.add(w.project_id);
      }
    }
    return projecten.filter((p) => projectsWithCellen.has(p.id));
  }, [projecten, weken, cellen, activiteitById, visibleWeekNrSet]);

  const schakelMonteurs = useMemo(
    () => monteurs.filter((m) => m.type === "schakelmonteur"),
    [monteurs],
  );
  const montageMonteurs = useMemo(
    () => monteurs.filter((m) => m.type === "montagemonteur"),
    [monteurs],
  );

  // ====== Aggregate to slot level ======

  // monteurId → slotIndex → Set<project_id>
  const monteurSlotProjects = useMemo(() => {
    const m = new Map<string, Map<number, Set<string>>>();
    for (const [mid, byDay] of monteurDayProjects.entries()) {
      for (const [k, projs] of byDay.entries()) {
        const si = dayKeyToSlot.get(k);
        if (si === undefined) continue;
        let bySlot = m.get(mid);
        if (!bySlot) { bySlot = new Map(); m.set(mid, bySlot); }
        let set = bySlot.get(si);
        if (!set) { set = new Set(); bySlot.set(si, set); }
        for (const p of projs) set.add(p);
      }
    }
    return m;
  }, [monteurDayProjects, dayKeyToSlot]);

  // monteurId → Set<slotIndex> waar deze monteur op minstens één dag écht
  // dubbel staat (≥2 projecten op dezelfde dag). Alleen díe slots tonen we
  // als "dubbel gepland" — niet slots die meerdere projecten bevatten over
  // verschillende dagen (kwartaal/jaar weergave).
  const monteurSlotDubbel = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const [k, mids] of dayConflictMonteurs.entries()) {
      const si = dayKeyToSlot.get(k);
      if (si === undefined) continue;
      for (const mid of mids) {
        let s = m.get(mid);
        if (!s) { s = new Set(); m.set(mid, s); }
        s.add(si);
      }
    }
    return m;
  }, [dayConflictMonteurs, dayKeyToSlot]);

  // project_id → slotIndex → boolean (any cel that slot)
  const projectSlotsFilled = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const [pid, byDay] of projectDayActivities.entries()) {
      for (const k of byDay.keys()) {
        const si = dayKeyToSlot.get(k);
        if (si === undefined) continue;
        let set = m.get(pid);
        if (!set) { set = new Set(); m.set(pid, set); }
        set.add(si);
      }
    }
    return m;
  }, [projectDayActivities, dayKeyToSlot]);

  // project_id → Set<slotIndex> with conflicts
  const projectSlotConflicts = useMemo(() => {
    // For each cel, check if any of its monteurs is double-booked on that day → mark its slot
    const m = new Map<string, Set<number>>();
    for (const c of cellen) {
      if (!c.activiteit_id || !c.week_id || !c.kleur_code) continue;
      const w = weekById.get(c.week_id);
      if (!w) continue;
      const k = dayKey(w.week_nr, c.dag_index);
      const si = dayKeyToSlot.get(k);
      if (si === undefined) continue;
      const act = activiteitById.get(c.activiteit_id);
      if (!act?.project_id) continue;
      const conflictSet = dayConflictMonteurs.get(k);
      if (!conflictSet || conflictSet.size === 0) continue;
      const mids = monteurIdsByCel.get(c.id) ?? [];
      const has = mids.some((mid) => conflictSet.has(mid));
      if (!has) continue;
      let s = m.get(act.project_id);
      if (!s) { s = new Set(); m.set(act.project_id, s); }
      s.add(si);
    }
    return m;
  }, [cellen, weekById, activiteitById, dayConflictMonteurs, monteurIdsByCel, dayKeyToSlot]);

  // Team capaciteit % (planned monteur-days vs total possible monteur-days in visible range)
  // Excludes feestdagen consistently (both in possible and planned).
  const teamCapPct = useMemo(() => {
    if (monteurs.length === 0) return 0;

    // Build the list of working days (MA-VR, excl. feestdagen) in the visible period
    const dates: string[] = [];
    if (scale === "maand" || scale === "kwartaal") {
      for (const wnr of visibleWeekNrSet) {
        const monday = getMondayOfWeek(wnr, jaar);
        for (let d = 0; d < 5; d++) {
          const date = new Date(monday);
          date.setDate(monday.getDate() + d);
          const dk = dateKey(date);
          if (!feestdagMap.has(dk)) dates.push(dk);
        }
      }
    } else {
      const wkCount = weeksInYear(jaar);
      for (let week = 1; week <= wkCount; week++) {
        const monday = getMondayOfWeek(week, jaar);
        for (let d = 0; d < 5; d++) {
          const date = new Date(monday);
          date.setDate(monday.getDate() + d);
          if (date.getFullYear() === jaar) {
            const dk = dateKey(date);
            if (!feestdagMap.has(dk)) dates.push(dk);
          }
        }
      }
    }

    const totalPossible = monteurs.length * dates.length;
    if (totalPossible === 0) return 0;

    // Unieke monteur+datum combinaties die ingepland zijn (skip feestdagen)
    const planned = new Set<string>();
    for (const cel of cellen) {
      if (!cel.week_id) continue;
      const week = weekById.get(cel.week_id);
      if (!week) continue;
      const monday = getMondayOfWeek(week.week_nr, jaar);
      const date = new Date(monday);
      date.setDate(monday.getDate() + cel.dag_index);
      const dk = dateKey(date);
      if (feestdagMap.has(dk)) continue;
      const mids = monteurIdsByCel.get(cel.id) ?? [];
      for (const mid of mids) planned.add(`${mid}-${dk}`);
    }

    return Math.round((planned.size / totalPossible) * 100);
  }, [monteurs, visibleWeekNrSet, scale, jaar, cellen, monteurIdsByCel, weekById, feestdagMap]);

  // Vrije dagen per monteur in zichtbare periode
  // (werkdagen exclusief feestdagen − dagen met inplanning op niet-feestdagen)
  const monteurVrijeDagen = useMemo(() => {
    const map = new Map<string, number>();
    // Tel alle werkdagen (MA-VR) in zichtbare weken die geen feestdag zijn
    const workingDateKeys = new Set<string>();
    for (const wnr of visibleWeekNrSet) {
      const monday = getMondayOfWeek(wnr, jaar);
      for (let d = 0; d < 5; d++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + d);
        const dStr = dateKey(date);
        if (!feestdagMap.has(dStr)) workingDateKeys.add(`${wnr}-${d}`);
      }
    }
    const totalDays = workingDateKeys.size;
    for (const m of monteurs) {
      const planned = new Set<string>();
      for (const cel of cellen) {
        if (!cel.week_id) continue;
        const week = weekById.get(cel.week_id);
        if (!week) continue;
        if (!visibleWeekNrSet.has(week.week_nr)) continue;
        const key = `${week.week_nr}-${cel.dag_index}`;
        if (!workingDateKeys.has(key)) continue;
        const mids = monteurIdsByCel.get(cel.id) ?? [];
        if (mids.includes(m.id)) planned.add(key);
      }
      map.set(m.id, totalDays - planned.size);
    }
    return map;
  }, [monteurs, visibleWeekNrSet, cellen, weekById, monteurIdsByCel, jaar, feestdagMap]);

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

  // ====== Monteur segments (consecutive slots same project) ======
  type MonteurSeg = { startSlot: number; endSlot: number; projectId: string | null; projectIds: string[]; dubbel: boolean };
  const monteurSegments = useCallback(
    (monteurId: string): MonteurSeg[] => {
      const bySlot = monteurSlotProjects.get(monteurId);
      if (!bySlot) return [];
      const dubbelSlots = monteurSlotDubbel.get(monteurId);
      const segs: MonteurSeg[] = [];
      let cur: MonteurSeg | null = null;
      const flush = () => { if (cur) segs.push(cur); cur = null; };
      for (let i = 0; i < slots.length; i++) {
        const projs = bySlot.get(i);
        if (!projs || projs.size === 0) { flush(); continue; }
        // Alleen écht dubbel als deze monteur op minstens één dag binnen
        // dit slot ≥2 projecten op dezelfde dag heeft.
        if (dubbelSlots?.has(i)) {
          flush();
          segs.push({
            startSlot: i, endSlot: i,
            projectId: null,
            projectIds: Array.from(projs),
            dubbel: true,
          });
          continue;
        }
        // Meerdere projecten in een slot zonder dag-conflict (bv. ma project A,
        // vr project B in kwartaal-weergave) → toon als één pill van het eerste
        // project, zodat het niet ten onrechte rood wordt.
        const pid = Array.from(projs)[0];
        if (cur && !cur.dubbel && cur.projectId === pid && cur.endSlot === i - 1) {
          cur.endSlot = i;
        } else {
          flush();
          cur = { startSlot: i, endSlot: i, projectId: pid, projectIds: Array.from(projs), dubbel: false };
        }
      }
      flush();
      // Defensive: only return segments fully within the visible slot range,
      // so a "phantom" pill can never bleed in/out at the grid edges.
      return segs.filter(
        (s) => s.startSlot >= 0 && s.endSlot < slots.length && s.endSlot >= s.startSlot,
      );
    },
    [monteurSlotProjects, monteurSlotDubbel, slots.length],
  );

  // ====== Project bar segments (consecutive filled slots) ======
  const projectSegments = useCallback(
    (projectId: string): { startSlot: number; endSlot: number }[] => {
      const filled = projectSlotsFilled.get(projectId);
      if (!filled) return [];
      const segs: { startSlot: number; endSlot: number }[] = [];
      let cur: { startSlot: number; endSlot: number } | null = null;
      for (let i = 0; i < slots.length; i++) {
        if (filled.has(i)) {
          if (cur && cur.endSlot === i - 1) cur.endSlot = i;
          else {
            if (cur) segs.push(cur);
            cur = { startSlot: i, endSlot: i };
          }
        } else {
          if (cur) { segs.push(cur); cur = null; }
        }
      }
      if (cur) segs.push(cur);
      return segs.filter(
        (s) => s.startSlot >= 0 && s.endSlot < slots.length && s.endSlot >= s.startSlot,
      );
    },
    [projectSlotsFilled, slots.length],
  );

  // ====== Navigator label & shift ======
  const navigatorLabel = useMemo(() => {
    if (scale === "maand") {
      const wkCount = weeksInYear(jaar);
      const firstWnr = startWeek;
      const lastWnr = wrapWeek(((startWeek - 1 + (weeksToShow - 1)) % wkCount) + 1);
      const firstMonday = getMondayOfWeek(firstWnr, jaar);
      // For the last week we may have wrapped into next year
      const lastWeekWrapped = startWeek + weeksToShow - 1 > wkCount;
      const lastYear = lastWeekWrapped ? jaar + 1 : jaar;
      const lastMonday = getMondayOfWeek(lastWnr, lastYear);

      const fM = firstMonday.getMonth();
      const fY = firstMonday.getFullYear();
      const lM = lastMonday.getMonth();
      const lY = lastMonday.getFullYear();

      const rangePart = `Wk ${firstWnr}–${lastWnr}`;
      if (fM === lM && fY === lY) {
        return `${NL_MONTHS_LONG[fM]} ${fY} · ${rangePart}`;
      }
      if (fY === lY) {
        return `${NL_MONTHS_LONG[fM]} – ${NL_MONTHS_LONG[lM]} ${fY} · ${rangePart}`;
      }
      return `${NL_MONTHS_LONG[fM]} ${fY} – ${NL_MONTHS_LONG[lM]} ${lY} · ${rangePart}`;
    }
    if (scale === "kwartaal") {
      const q = quarterOfWeek(startWeek, jaar);
      return `Q${q} ${jaar}`;
    }
    return `${jaar}`;
  }, [scale, startWeek, jaar, weeksToShow]);

  const shiftLeft = () => {
    if (scale === "maand") {
      const step = Math.max(1, weeksToShow - 1);
      const next = startWeek - step;
      if (next < 1) {
        setJaar(jaar - 1);
        setStartWeek(weeksInYear(jaar - 1) + next);
      } else {
        setStartWeek(next);
      }
    } else if (scale === "kwartaal") {
      const q = quarterOfWeek(startWeek, jaar);
      if (q === 1) {
        setJaar(jaar - 1);
        setStartWeek(firstWeekOfQuarter(4, jaar - 1));
      } else {
        setStartWeek(firstWeekOfQuarter(q - 1, jaar));
      }
    } else {
      setJaar(jaar - 1);
      setStartWeek(1);
    }
  };

  const shiftRight = () => {
    if (scale === "maand") {
      const wkCount = weeksInYear(jaar);
      const step = Math.max(1, weeksToShow - 1);
      const next = startWeek + step;
      if (next > wkCount) {
        setJaar(jaar + 1);
        setStartWeek(next - wkCount);
      } else {
        setStartWeek(next);
      }
    } else if (scale === "kwartaal") {
      const q = quarterOfWeek(startWeek, jaar);
      if (q === 4) {
        setJaar(jaar + 1);
        setStartWeek(firstWeekOfQuarter(1, jaar + 1));
      } else {
        setStartWeek(firstWeekOfQuarter(q + 1, jaar));
      }
    } else {
      setJaar(jaar + 1);
      setStartWeek(1);
    }
  };

  // Spring exact één week vooruit/achteruit, ongeacht de huidige schaal.
  const shiftWeek = (delta: number) => {
    const next = startWeek + delta;
    if (next < 1) {
      const prevYear = jaar - 1;
      setJaar(prevYear);
      setStartWeek(weeksInYear(prevYear) + next);
    } else {
      const wkCount = weeksInYear(jaar);
      if (next > wkCount) {
        setJaar(jaar + 1);
        setStartWeek(next - wkCount);
      } else {
        setStartWeek(next);
      }
    }
  };

  // Wisselen van schaal mag startWeek/jaar niet verschuiven — de huidige
  // periode blijft in beeld; alleen de zoom verandert.
  const onScaleChange = (s: Scale) => {
    setScale(s);
  };

  // ============== Render helpers ==============
  const renderHeader = () => {
    // Two header rows: group labels (week / month / year) and slot labels (day/week/month)
    // Determine grouping
    const groups: { key: string; label: string; startSlot: number; endSlot: number; isCurrent: boolean }[] = [];
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const last = groups[groups.length - 1];
      if (last && last.key === s.groupKey) last.endSlot = i;
      else groups.push({ key: s.groupKey, label: s.groupLabel, startSlot: i, endSlot: i, isCurrent: s.isCurrentGroup });
    }

    return (
      <div style={{ width: totalGridWidth + cellW }}>
        {/* Group row */}
        <div className="flex" style={{ height: 28 }}>
          {groups.map((g) => {
            const w = (g.endSlot - g.startSlot + 1) * cellW;
            return (
              <div
                key={g.key}
                className="flex items-center justify-center gap-1.5"
                style={{
                  width: w,
                  borderRight: BORDER_GROUP_RIGHT,
                  borderBottom: BORDER_CELL_BOTTOM,
                  background: g.isCurrent ? "rgba(63,255,139,0.06)" : "transparent",
                }}
              >
                <span className="text-[11px] font-semibold text-foreground truncate px-1">
                  {g.label}
                </span>
                {g.isCurrent && (
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
        {/* Slot label row */}
        <div className="flex" style={{ height: 28 }}>
          {slots.map((s) => {
            const isCurrent = s.isCurrentGroup;
            const isLastGroup = s.isLastInGroup;
            const isFeest = s.isFeestdag;
            const bg = isFeest
              ? "rgba(167,139,250,0.18)"
              : s.isToday
                ? BG_TODAY
                : isCurrent
                  ? BG_CURRENT_GROUP
                  : undefined;
            const labelColor = isFeest ? "#c4b5fd" : undefined;
            return (
              <div
                key={s.index}
                title={isFeest ? s.feestdagNaam : undefined}
                className="flex flex-col items-center justify-center"
                style={{
                  width: cellW,
                  borderRight: isLastGroup ? BORDER_GROUP_RIGHT : BORDER_CELL_RIGHT,
                  borderBottom: BORDER_CELL_BOTTOM,
                  borderTop: isFeest ? "2px solid rgba(167,139,250,0.6)" : undefined,
                  background: bg,
                }}
              >
                <span
                  className="text-[9px] font-bold uppercase tracking-wider"
                  style={{ color: labelColor ?? "hsl(var(--muted-foreground))" }}
                >
                  {s.primaryLabel}
                </span>
                {s.secondaryLabel && (
                  <span
                    className="text-[9px] tabular-nums"
                    style={{ color: labelColor ?? "hsl(var(--muted-foreground) / 0.7)" }}
                  >
                    {s.secondaryLabel}
                  </span>
                )}
                {s.isToday && (
                  <div
                    style={{
                      width: 4, height: 4, borderRadius: "50%",
                      background: "#3fff8b", marginTop: 2,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ============== Render ==============
  const totalMonteurs = monteurs.length;

  return (
    <div className="font-sans">
      <style>{`
        .overzicht-scroll::-webkit-scrollbar { height: 4px; width: 4px; }
        .overzicht-scroll::-webkit-scrollbar-track { background: transparent; }
        .overzicht-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
        .overzicht-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(63,255,139,0.3);
        }
      `}</style>
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
              width: 8, height: 8, borderRadius: 999,
              background: "#3fff8b",
              boxShadow: "0 0 6px rgba(63,255,139,0.6)",
            }}
          />
          {teamCapPct}% TEAM CAP.
        </div>
      </div>

      {/* Navigator + scale selector */}
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
            onClick={shiftLeft}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/[0.06] text-muted-foreground hover:text-foreground"
            title="Vorige periode"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/[0.06] text-muted-foreground hover:text-foreground"
            title="Eén week terug"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground tabular-nums min-w-[140px] text-center">
            {navigatorLabel}
          </span>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/[0.06] text-muted-foreground hover:text-foreground"
            title="Eén week vooruit"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={shiftRight}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/[0.06] text-muted-foreground hover:text-foreground"
            title="Volgende periode"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const iso = getCurrentISOWeek();
              setJaar(iso.year);
              setStartWeek(iso.week);
            }}
            className="flex h-7 items-center justify-center rounded px-3 text-xs font-semibold transition-colors"
            style={{
              background: "rgba(63,255,139,0.12)",
              color: "#3fff8b",
              border: "1px solid rgba(63,255,139,0.2)",
              marginLeft: 8,
            }}
            title="Ga naar huidige week"
          >
            Vandaag
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] p-0.5">
          {SCALE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onScaleChange(opt.value)}
              className={[
                "rounded px-3 h-7 text-xs font-semibold transition-colors",
                scale === opt.value
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main grid container — sticky header + scrollable body */}
      <div style={{ position: "relative" }}>
        {/* Floating week scroll buttons */}
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          title="Eén week terug"
          aria-label="Eén week terug"
          className="group absolute top-1/2 -translate-y-1/2 z-40 flex items-center justify-center rounded-full border shadow-lg transition-all hover:scale-110"
          style={{
            left: -16,
            width: 36,
            height: 36,
            borderColor: "rgba(255,255,255,0.12)",
            background: "rgba(10,26,48,0.92)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          title="Eén week vooruit"
          aria-label="Eén week vooruit"
          className="group absolute top-1/2 -translate-y-1/2 z-40 flex items-center justify-center rounded-full border shadow-lg transition-all hover:scale-110"
          style={{
            right: -16,
            width: 36,
            height: 36,
            borderColor: "rgba(255,255,255,0.12)",
            background: "rgba(10,26,48,0.92)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      <div
        id="overzicht-grid-root"
        className="rounded-lg border"
        style={{
          borderColor: "rgba(255,255,255,0.08)",
          background: "rgba(10,26,48,0.4)",
          height: "calc(100vh - 200px)",
          minHeight: 400,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ====== Sticky top header bar ====== */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            zIndex: 30,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            backgroundColor: "rgba(10, 26, 48, 0.95)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          {/* Sidebar-aligned spacer */}
          <div
            style={{
              width: sidebarW,
              flexShrink: 0,
              height: HEADER_H,
              borderRight: "1px solid rgba(255,255,255,0.08)",
              transition: "width 0.2s ease",
            }}
          />
          {/* Horizontally-scrollable header (week/day labels) */}
          <div
            ref={headerScrollRef}
            className="overzicht-scroll no-scrollbar"
            style={{ flex: 1, overflowX: "auto", overflowY: "hidden" }}
            onScroll={(e) => syncScroll("header", e.currentTarget.scrollLeft)}
          >
            {renderHeader()}
          </div>
          {/* Right "Beschikbaar" header column removed — vrije dagen badge is now shown under monteur naam in the left sidebar. */}
        </div>

        {/* ====== Scrollable body (vertical) ====== */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "auto",
            minHeight: 0,
          }}
          className="overzicht-scroll"
        >
        <div style={{ display: "flex" }}>
          {/* ====== Fixed left sidebar ====== */}
          <div
            style={{
              width: sidebarW,
              flexShrink: 0,
              transition: "width 0.2s ease",
            }}
          >
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
                <button
                  type="button"
                  onClick={() => setSchakelOpen((o) => !o)}
                  className="flex w-full items-center gap-2 hover:bg-white/[0.04]"
                  style={{
                    height: 28,
                    paddingLeft: 16,
                    borderRight: "1px solid rgba(255,255,255,0.08)",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <ChevronRight
                    className="h-3 w-3 text-muted-foreground"
                    style={{
                      transform: schakelOpen ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                    }}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Schakelmonteurs
                  </span>
                  <span className="ml-auto pr-3 text-[10px] font-semibold text-muted-foreground tabular-nums">
                    {schakelMonteurs.length}
                  </span>
                </button>
              )}
              <div
                style={{
                  maxHeight: schakelOpen ? 2000 : 0,
                  opacity: schakelOpen ? 1 : 0,
                  overflow: "hidden",
                  transition: "max-height 0.2s ease, opacity 0.15s ease",
                }}
              >
                {schakelMonteurs.map((m) => (
                  <MonteurSidebarRow
                    key={m.id}
                    monteur={m}
                    collapsed={sidebarCollapsed}
                    vrijeDagen={monteurVrijeDagen.get(m.id) ?? visibleWeekNrSet.size * 5}
                  />
                ))}
              </div>

              {/* Montagemonteurs label */}
              {montageMonteurs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMontageOpen((o) => !o)}
                  className="flex w-full items-center gap-2 hover:bg-white/[0.04]"
                  style={{
                    height: 28,
                    paddingLeft: 16,
                    borderRight: "1px solid rgba(255,255,255,0.08)",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <ChevronRight
                    className="h-3 w-3 text-muted-foreground"
                    style={{
                      transform: montageOpen ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                    }}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Montagemonteurs
                  </span>
                  <span className="ml-auto pr-3 text-[10px] font-semibold text-muted-foreground tabular-nums">
                    {montageMonteurs.length}
                  </span>
                </button>
              )}
              <div
                style={{
                  maxHeight: montageOpen ? 2000 : 0,
                  opacity: montageOpen ? 1 : 0,
                  overflow: "hidden",
                  transition: "max-height 0.2s ease, opacity 0.15s ease",
                }}
              >
                {montageMonteurs.map((m) => (
                  <MonteurSidebarRow
                    key={m.id}
                    monteur={m}
                    collapsed={sidebarCollapsed}
                    vrijeDagen={monteurVrijeDagen.get(m.id) ?? visibleWeekNrSet.size * 5}
                  />
                ))}
              </div>

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

            {/* Visual separator between medewerkers en projecten */}
            <div
              style={{
                height: 8,
                background: "transparent",
                borderRight: "1px solid rgba(255,255,255,0.08)",
                borderTop: "2px solid rgba(255,255,255,0.06)",
                marginTop: 4,
              }}
            />

            {/* Projecten section header */}
            {(() => {
              const allExpanded =
                visibleProjecten.length > 0 &&
                visibleProjecten.every((p) => expandedProjects.has(p.id));
              const toggleAllProjects = () => {
                if (allExpanded) {
                  setExpandedProjects(new Set());
                } else {
                  setExpandedProjects(new Set(visibleProjecten.map((p) => p.id)));
                }
              };
              return (
                <div
                  className="flex w-full items-center gap-2"
                  style={{
                    height: 32,
                    paddingLeft: 12,
                    paddingTop: 4,
                    borderRight: "1px solid rgba(255,255,255,0.08)",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setProjectenOpen((o) => !o)}
                    className="flex flex-1 items-center gap-2 hover:bg-white/[0.05]"
                    style={{ height: "100%", marginLeft: -12, paddingLeft: 12 }}
                  >
                    <ChevronRight
                      className="h-3 w-3 text-muted-foreground"
                      style={{
                        transform: projectenOpen ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.2s ease",
                      }}
                    />
                    {!sidebarCollapsed && (
                      <>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Projecten
                        </span>
                        <span className="ml-auto text-[10px] font-semibold text-muted-foreground tabular-nums">
                          {visibleProjecten.length}
                        </span>
                      </>
                    )}
                  </button>
                  {!sidebarCollapsed && visibleProjecten.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAllProjects}
                      className="text-[10px] font-semibold transition-colors hover:text-foreground"
                      style={{
                        color: "rgba(255,255,255,0.4)",
                        padding: "2px 8px",
                        borderRadius: 4,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.03)",
                        marginRight: 12,
                      }}
                      title={allExpanded ? "Alles inklappen" : "Alles uitklappen"}
                    >
                      {allExpanded ? "Inklappen" : "Uitklappen"}
                    </button>
                  )}
                </div>
              );
            })()}

            <div
              style={{
                maxHeight: projectenOpen ? 99999 : 0,
                opacity: projectenOpen ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 0.25s ease, opacity 0.15s ease",
              }}
            >
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
                      title={`${p.case_nummer ?? "—"}${p.station_naam ? ` — ${p.station_naam}` : ""}`}
                      className="group relative flex cursor-pointer items-center gap-1.5 pr-2 hover:bg-white/[0.03]"
                      style={{
                        height: ROW_H_PROJECT,
                        paddingLeft: 12,
                        borderRight: "1px solid rgba(255,255,255,0.08)",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        borderLeft: (() => {
                          switch (p.status) {
                            case "gepland": return "3px solid #feb300";
                            case "in_uitvoering": return "3px solid #3fff8b";
                            case "afgerond": return "3px solid rgba(255,255,255,0.3)";
                            case "concept":
                            default: return "3px dashed rgba(255,255,255,0.2)";
                          }
                        })(),
                      }}
                    >
                      {sidebarCollapsed ? (
                        <>
                          {/* Status dot */}
                          <span
                            className="mx-auto shrink-0 rounded-full"
                            style={{
                              width: 10,
                              height: 10,
                              background: sc.bg,
                            }}
                          />
                          {/* Optional 4-char case number, very small */}
                          <span
                            className="absolute inset-x-0 bottom-0.5 text-center font-display text-[8px] font-bold tabular-nums"
                            style={{ color: "#3fff8b" }}
                          >
                            {(p.case_nummer ?? "").slice(0, 4)}
                          </span>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(p.id);
                            }}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-white/[0.08]"
                          >
                            <ChevronRight
                              className="h-3 w-3 text-muted-foreground"
                              style={{
                                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                                transition: "transform 0.2s ease",
                              }}
                            />
                          </button>
                          <div style={{ overflow: "hidden", flex: 1, minWidth: 0 }}>
                            <p
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#3fff8b",
                                letterSpacing: "0.12em",
                                textTransform: "uppercase",
                                marginBottom: 1,
                                fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {p.case_nummer ?? "—"}
                            </p>
                            <p
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: "white",
                                fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: sidebarCollapsed ? 0 : sidebarW - 90,
                                display: "block",
                              }}
                              title={p.station_naam ?? ""}
                            >
                              {p.station_naam ?? "—"}
                            </p>
                            {(p.gsu_datum || p.geu_datum) && (
                              <p
                                style={{
                                  fontSize: 10,
                                  fontWeight: 500,
                                  color: "rgba(255,255,255,0.45)",
                                  fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  marginTop: 1,
                                  letterSpacing: "0.02em",
                                }}
                                title={`Uitvoering: ${p.gsu_datum ?? "?"} → ${p.geu_datum ?? "?"}`}
                              >
                                {formatDateRangeShort(p.gsu_datum, p.geu_datum)}
                              </p>
                            )}
                          </div>
                          <span
                            className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                            style={{ background: sc.bg, color: sc.text }}
                          >
                            {sc.label}
                          </span>
                          <ArrowRight
                            className="h-3 w-3 shrink-0 text-muted-foreground transition-opacity"
                            style={{
                              opacity: 0,
                            }}
                            aria-hidden
                          />
                        </>
                      )}
                      {/* Hover arrow indicator (positioned absolutely so it doesn't affect layout) */}
                      {!sidebarCollapsed && (
                        <ArrowRight
                          className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-40"
                          aria-hidden
                        />
                      )}
                    </div>

                    {/* Activiteit sidebar rows */}
                    {!sidebarCollapsed && expanded &&
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
                                width: 6, height: 6, borderRadius: "50%",
                                background: capDotColor,
                              }}
                            />
                            <span className="truncate text-[11px] text-foreground/90" title={a.naam}>
                              {a.naam}
                            </span>
                          </div>
                        );
                      })}
                    {/* Visual separator between expanded projects — sidebar side.
                        Always rendered when expanded so heights stay aligned with the
                        grid side, including sidebarCollapsed and acts.length === 0. */}
                    {expanded && (
                      <div
                        aria-hidden
                        style={{
                          height: 8,
                          width: "100%",
                          boxSizing: "border-box",
                          background: "rgba(255,255,255,0.02)",
                          borderRight: "1px solid rgba(255,255,255,0.08)",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ====== Single horizontally-scrollable right area (synced with header) ====== */}
          <div
            ref={bodyScrollRef}
            className="overzicht-scroll"
            style={{ flex: 1, overflowX: "auto", paddingRight: cellW }}
            onScroll={(e) => syncScroll("body", e.currentTarget.scrollLeft)}
          >

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
                maxHeight: medewerkersOpen ? 4000 : 0,
                opacity: medewerkersOpen ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 0.2s ease, opacity 0.15s ease",
              }}
            >
              {schakelMonteurs.length > 0 && (
                <div
                  style={{
                    height: 28, width: totalGridWidth,
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                />
              )}
              <div
                style={{
                  maxHeight: schakelOpen ? 4000 : 0,
                  opacity: schakelOpen ? 1 : 0,
                  overflow: "hidden",
                  transition: "max-height 0.2s ease, opacity 0.15s ease",
                }}
              >
                {schakelMonteurs.map((m) => (
                  <MonteurCellsRow
                    key={m.id}
                    monteur={m}
                    segments={monteurSegments(m.id)}
                    projectById={projectById}
                    slots={slots}
                    cellW={cellW}
                    scale={scale}
                    totalGridWidth={totalGridWidth}
                    onProjectClick={navigateToProject}
                  />
                ))}
              </div>
              {montageMonteurs.length > 0 && (
                <div
                  style={{
                    height: 28, width: totalGridWidth,
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                />
              )}
              <div
                style={{
                  maxHeight: montageOpen ? 4000 : 0,
                  opacity: montageOpen ? 1 : 0,
                  overflow: "hidden",
                  transition: "max-height 0.2s ease, opacity 0.15s ease",
                }}
              >
                {montageMonteurs.map((m) => (
                  <MonteurCellsRow
                    key={m.id}
                    monteur={m}
                    segments={monteurSegments(m.id)}
                    projectById={projectById}
                    slots={slots}
                    cellW={cellW}
                    scale={scale}
                    totalGridWidth={totalGridWidth}
                    onProjectClick={navigateToProject}
                  />
                ))}
              </div>
              {monteurs.length === 0 && (
                <div style={{ height: 60, width: totalGridWidth }} />
              )}
            </div>

            {/* Visual separator between medewerkers en projecten (matches sidebar) */}
            <div
              style={{
                height: 8,
                width: totalGridWidth,
                background: "transparent",
                borderTop: "2px solid rgba(255,255,255,0.06)",
                marginTop: 4,
              }}
            />

            {/* Projecten section header spacer */}
            <div
              style={{
                height: 32, width: totalGridWidth,
                paddingTop: 4,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.03)",
              }}
            />

            <div
              style={{
                maxHeight: projectenOpen ? 99999 : 0,
                opacity: projectenOpen ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 0.25s ease, opacity 0.15s ease",
              }}
            >
              {visibleProjecten.length === 0 && (
                <div style={{ height: 60, width: totalGridWidth }} />
              )}

              {visibleProjecten.map((p) => {
                const expanded = expandedProjects.has(p.id);
                const sc = statusColor(p.status);
                const segs = projectSegments(p.id);
                const acts = activiteitenByProject.get(p.id) ?? [];
                const conflictSet = projectSlotConflicts.get(p.id);
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
                      <EmptyCellsRow slots={slots} cellW={cellW} rowHeight={ROW_H_PROJECT} />
                      {segs.map((s, i) => {
                        const isJaar = scale === "jaar";
                        // Jaar: pill spans the full month column(s); other
                        // scales keep the original 2px inset.
                        const left = s.startSlot * cellW + (isJaar ? 3 : 2);
                        const width =
                          (s.endSlot - s.startSlot + 1) * cellW -
                          (isJaar ? 6 : 4);
                        const segHasConflict =
                          !!conflictSet &&
                          [...Array(s.endSlot - s.startSlot + 1)].some((_, off) =>
                            conflictSet.has(s.startSlot + off),
                          );
                        const pillTop = isJaar
                          ? 11
                          : (ROW_H_PROJECT - PILL_H_PROJECT) / 2;
                        const pillHeight = isJaar
                          ? ROW_H_PROJECT - 22
                          : PILL_H_PROJECT;
                        const isConcept = p.status === "concept" && !segHasConflict;
                        const pillBg = segHasConflict
                          ? "#ef4444"
                          : isConcept
                            ? "transparent"
                            : isJaar
                              ? "rgba(254,179,0,0.8)"
                              : sc.bg;
                        return (
                          <div
                            key={i}
                            className="absolute flex items-center justify-center px-2"
                            style={{
                              left, width,
                              top: pillTop,
                              height: pillHeight,
                              background: pillBg,
                              opacity: segHasConflict ? 0.95 : isConcept ? 1 : isJaar ? 1 : 0.8,
                              borderRadius: 4,
                              border: isConcept ? "2px dashed rgba(255,255,255,0.15)" : undefined,
                              color: segHasConflict
                                ? "#ffffff"
                                : isConcept
                                  ? "rgba(255,255,255,0.4)"
                                  : isJaar
                                    ? "#0a1a30"
                                    : sc.text,
                              fontSize: isConcept ? 9 : 10,
                              fontWeight: 700,
                              letterSpacing: isConcept ? "0.1em" : undefined,
                              textTransform: isConcept ? "uppercase" : undefined,
                              overflow: "hidden", whiteSpace: "nowrap",
                              boxShadow: segHasConflict
                                ? "0 0 0 1px rgba(239,68,68,0.7), 0 0 8px rgba(239,68,68,0.4)"
                                : undefined,
                            }}
                            title={segHasConflict ? "Conflict: monteur is dubbel ingepland" : undefined}
                          >
                            {segHasConflict && (
                              <span
                                className="mr-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
                                style={{ background: "rgba(0,0,0,0.25)", fontSize: 9 }}
                              >
                                !
                              </span>
                            )}
                            {isConcept
                              ? (width > 60 ? "CONCEPT" : "")
                              : (width > (isJaar ? 50 : 80) && (p.case_nummer ?? ""))}
                          </div>
                        );
                      })}
                      {/* Standalone conflict markers (no status bar covers them) */}
                      {conflictSet && [...conflictSet]
                        .filter((sl) => !segs.some((s) => sl >= s.startSlot && sl <= s.endSlot))
                        .map((sl) => (
                          <div
                            key={`cf-${sl}`}
                            className="absolute flex items-center justify-center"
                            style={{
                              left: sl * cellW + 2,
                              width: cellW - 4,
                              top: (ROW_H_PROJECT - PILL_H_PROJECT) / 2,
                              height: PILL_H_PROJECT,
                              background: "#ef4444",
                              opacity: 0.95,
                              borderRadius: 4,
                              color: "#ffffff",
                              fontSize: 11, fontWeight: 700,
                              boxShadow: "0 0 0 1px rgba(239,68,68,0.7), 0 0 8px rgba(239,68,68,0.4)",
                            }}
                            title="Conflict: monteur is dubbel ingepland"
                          >
                            !
                          </div>
                        ))}
                    </div>

                    {/* Activiteit cell rows — only for THIS project's activiteiten */}
                    {expanded &&
                      acts.map((a) => {
                        const dayMap = activiteitDayCel.get(a.id);
                        const hasData = !!dayMap && slots.some((sl) => {
                          for (const p2 of sl.pairs) {
                            if (dayMap.has(dayKey(p2.wnr, p2.dag))) return true;
                          }
                          return false;
                        });
                        return (
                          <ActiviteitCellsRow
                            key={a.id}
                            activiteit={a}
                            dayCelMap={dayMap}
                            monteurIdsByCel={monteurIdsByCel}
                            monteurById={new Map(monteurs.map((mm) => [mm.id, mm]))}
                            dayConflictMonteurs={dayConflictMonteurs}
                            slots={slots}
                            cellW={cellW}
                            totalGridWidth={totalGridWidth}
                            isLast={a === acts[acts.length - 1]}
                            onClick={() => navigateToProject(p.id)}
                            opacity={hasData ? 1 : 0.35}
                          />
                        );
                      })}
                    {/* Visual separator between expanded projects — grid side.
                        Always rendered when expanded so heights match the sidebar. */}
                    {expanded && (
                      <div
                        aria-hidden
                        style={{
                          width: totalGridWidth,
                          height: 8,
                          boxSizing: "border-box",
                          background: "rgba(255,255,255,0.02)",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ====== Right "Beschikbaar" column removed — vrije dagen badge now lives under monteur naam in the left sidebar. ====== */}
        </div>
        </div>
      </div>
      </div>

    </div>
  );
}

// ============== Sub-components ==============

// (BeschikbaarCell removed — vrije dagen badge is now rendered inside MonteurSidebarRow.)


function MonteurSidebarRow({
  monteur,
  collapsed = false,
  vrijeDagen,
}: {
  monteur: Monteur;
  collapsed?: boolean;
  vrijeDagen?: number;
}) {
  const isSchakel = monteur.type === "schakelmonteur";
  const ms = monteur.aanwijzing_ms;
  const msStyle = msBadgeStyle(ms);

  // Vrije dagen badge style
  const vd = vrijeDagen ?? -1;
  const vdStyle: React.CSSProperties =
    vd === 0
      ? {
          background: "rgba(254,179,0,0.2)",
          color: "#feb300",
          border: "1px solid rgba(254,179,0,0.3)",
        }
      : vd > 0 && vd <= 3
        ? {
            background: "rgba(254,179,0,0.15)",
            color: "#feb300",
            border: "1px solid rgba(254,179,0,0.25)",
          }
        : {
            background: "rgba(63,255,139,0.12)",
            color: "#3fff8b",
            border: "1px solid rgba(63,255,139,0.2)",
          };
  const vdLabel = vd === 0 ? "Vol" : `${vd}d vrij`;

  return (
    <div
      className="flex items-center gap-2"
      title={collapsed ? monteur.naam : undefined}
      style={{
        height: ROW_H_MONTEUR,
        paddingLeft: collapsed ? 0 : 12,
        paddingRight: collapsed ? 0 : 12,
        justifyContent: collapsed ? "center" : undefined,
        borderRight: "1px solid rgba(255,255,255,0.08)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div
        className="flex shrink-0 items-center justify-center"
        title={collapsed ? undefined : monteur.naam}
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: isSchakel ? "rgba(251,191,36,0.1)" : "rgba(59,130,246,0.1)",
          color: isSchakel ? "#feb300" : "#378add",
          border: isSchakel
            ? "1px solid rgba(251,191,36,0.2)"
            : "1px solid rgba(59,130,246,0.2)",
          fontSize: 9,
          fontWeight: 900,
        }}
      >
        {initialen(monteur.naam)}
      </div>
      {!collapsed && (
        <>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
            <span
              className="truncate text-[13px] font-semibold text-foreground"
              style={{ maxWidth: 160, lineHeight: 1.15 }}
              title={monteur.naam}
            >
              {monteur.naam}
            </span>
            {vd >= 0 && (
              <span
                style={{
                  ...vdStyle,
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
                  padding: "1px 7px",
                  borderRadius: 999,
                  display: "inline-block",
                  marginTop: 2,
                  whiteSpace: "nowrap",
                  alignSelf: "flex-start",
                }}
              >
                {vdLabel}
              </span>
            )}
          </div>
          {ms && msStyle && (
            <span
              className="ml-auto shrink-0"
              title={ms}
              style={{
                ...msStyle,
                fontSize: 8, fontWeight: 700,
                padding: "1px 4px", borderRadius: 3,
              }}
            >
              {ms}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// Renders a row of empty raster cells (always visible borders)
function EmptyCellsRow({
  slots, cellW, rowHeight,
}: { slots: Slot[]; cellW: number; rowHeight: number }) {
  return (
    <div className="flex" style={{ width: slots.length * cellW, height: rowHeight }}>
      {slots.map((s) => (
        <div
          key={s.index}
          data-grid-cell="empty"
          data-slot={s.index}
          data-today={s.isToday ? "1" : "0"}
          data-current-group={s.isCurrentGroup ? "1" : "0"}
          data-last-in-group={s.isLastInGroup ? "1" : "0"}
          style={{
            width: cellW,
            height: rowHeight,
            borderRight: s.isLastInGroup ? BORDER_GROUP_RIGHT : BORDER_CELL_RIGHT,
            borderBottom: BORDER_CELL_BOTTOM,
            background: s.isToday
              ? BG_TODAY
              : s.isCurrentGroup
                ? BG_CURRENT_GROUP
                : "transparent",
          }}
        />
      ))}
    </div>
  );
}

function MonteurCellsRow({
  monteur,
  segments,
  projectById,
  slots,
  cellW,
  scale,
  totalGridWidth,
  onProjectClick,
}: {
  monteur: Monteur;
  segments: { startSlot: number; endSlot: number; projectId: string | null; projectIds: string[]; dubbel: boolean }[];
  projectById: Map<string, Project>;
  slots: Slot[];
  cellW: number;
  scale: Scale;
  totalGridWidth: number;
  onProjectClick: (id: string) => void;
}) {
  const topPad = (ROW_H_MONTEUR - PILL_H_MONTEUR) / 2;
  const isJaar = scale === "jaar";
  return (
    <div
      className="relative"
      style={{
        height: ROW_H_MONTEUR,
        width: totalGridWidth,
      }}
    >
      {/* Background raster */}
      <EmptyCellsRow slots={slots} cellW={cellW} rowHeight={ROW_H_MONTEUR} />

      {/* Segment overlays */}
      {segments.map((s, i) => {
        const left = s.startSlot * cellW;
        const width = (s.endSlot - s.startSlot + 1) * cellW;
        if (s.dubbel) {
          return (
            <HoverCard key={i} openDelay={120}>
              <HoverCardTrigger asChild>
                <div
                  className="absolute flex cursor-pointer items-center justify-center"
                  style={{
                    left: left + 2, width: width - 4,
                    top: topPad, height: PILL_H_MONTEUR,
                    background: "#ef4444",
                    borderRadius: 4,
                    color: "white", fontWeight: 700, fontSize: 12,
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

        // ===== Jaar scale: pill spans the full month column(s) =====
        // Each segment is already a maximal consecutive span (gaps split
        // segments), so the segment's first column always has a "previous
        // month not planned" left-edge and its last column a "next month
        // not planned" right-edge → fully rounded.
        if (isJaar) {
          const projCount = s.projectIds.length;
          const label =
            projCount > 1 ? `${projCount} proj.` : (p?.case_nummer ?? "");
          return (
            <div
              key={i}
              onClick={() => s.projectId && onProjectClick(s.projectId)}
              className="absolute flex cursor-pointer items-center justify-center"
              title={
                projCount > 1
                  ? s.projectIds
                      .map((pid) => projectById.get(pid)?.case_nummer ?? pid.slice(0, 6))
                      .join(", ")
                  : p?.case_nummer
                    ? `${p.case_nummer} — ${p.station_naam ?? ""}`
                    : ""
              }
              style={{
                left: left + 3,
                width: width - 6,
                top: 8,
                bottom: 8,
                height: ROW_H_MONTEUR - 16,
                background: "rgba(63,255,139,0.85)",
                color: "#0a1a30",
                fontSize: 9,
                fontWeight: 700,
                borderRadius: 4,
                overflow: "hidden",
                whiteSpace: "nowrap",
                padding: "0 4px",
              }}
            >
              {label}
            </div>
          );
        }

        return (
          <div
            key={i}
            onClick={() => s.projectId && onProjectClick(s.projectId)}
            className="absolute flex cursor-pointer items-center justify-center"
            title={p?.case_nummer ? `${p.case_nummer} — ${p.station_naam ?? ""}` : ""}
            style={{
              left: left + 2, width: width - 4,
              top: topPad, height: PILL_H_MONTEUR,
              background: "rgba(63,255,139,0.85)",
              color: "#0a1a30",
              fontSize: 9, fontWeight: 700,
              borderRadius: 4,
              overflow: "hidden", whiteSpace: "nowrap",
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
  dayCelMap,
  monteurIdsByCel,
  monteurById,
  dayConflictMonteurs,
  slots,
  cellW,
  totalGridWidth,
  isLast: isLastRow,
  onClick,
  opacity = 1,
}: {
  activiteit: Activiteit;
  dayCelMap: Map<string, Cel> | undefined;
  monteurIdsByCel: Map<string, string[]>;
  monteurById: Map<string, Monteur>;
  dayConflictMonteurs: Map<string, Set<string>>;
  slots: Slot[];
  cellW: number;
  totalGridWidth: number;
  isLast: boolean;
  onClick: () => void;
  opacity?: number;
}) {
  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer hover:bg-white/[0.03]"
      style={{
        width: totalGridWidth,
        height: ROW_H_ACTIVITEIT,
        borderBottom: isLastRow
          ? "2px solid rgba(255,255,255,0.06)"
          : "1px solid rgba(255,255,255,0.03)",
        background: "rgba(255,255,255,0.015)",
        opacity,
      }}
    >
      {slots.map((s) => {
        // Aggregate over all (wnr,d) pairs in this slot
        let firstColorHex: string | null = null;
        let aggMonteurIds = new Set<string>();
        let hasConflict = false;
        const conflictMids: string[] = [];

        for (const p of s.pairs) {
          const cel = dayCelMap?.get(dayKey(p.wnr, p.dag));
          if (!cel) continue;
          if (cel.kleur_code && !firstColorHex) firstColorHex = colorHexFor(cel.kleur_code);
          const mids = monteurIdsByCel.get(cel.id) ?? [];
          for (const mid of mids) aggMonteurIds.add(mid);
          const cs = dayConflictMonteurs.get(dayKey(p.wnr, p.dag));
          if (cs) {
            for (const mid of mids) {
              if (cs.has(mid)) {
                hasConflict = true;
                if (!conflictMids.includes(mid)) conflictMids.push(mid);
              }
            }
          }
        }

        const monteurIds = Array.from(aggMonteurIds);
        const todayBg = s.isToday && !firstColorHex ? BG_TODAY : undefined;
        const groupBg = s.isCurrentGroup && !firstColorHex && !s.isToday ? BG_CURRENT_GROUP : undefined;

        return (
          <div
            key={s.index}
            className="relative"
            data-grid-cell="activiteit"
            data-slot={s.index}
            data-today={s.isToday ? "1" : "0"}
            data-current-group={s.isCurrentGroup ? "1" : "0"}
            data-last-in-group={s.isLastInGroup ? "1" : "0"}
            data-has-conflict={hasConflict ? "1" : "0"}
            data-has-color={firstColorHex ? "1" : "0"}
            style={{
              width: cellW,
              height: ROW_H_ACTIVITEIT,
              borderRight: s.isLastInGroup ? BORDER_GROUP_RIGHT : BORDER_CELL_RIGHT,
              borderBottom: BORDER_CELL_BOTTOM,
              background: hasConflict
                ? "rgba(239,68,68,0.18)"
                : firstColorHex
                  ? hexToRgba(firstColorHex, 0.45)
                  : (todayBg ?? groupBg),
              borderLeft: hasConflict
                ? "2px solid #ef4444"
                : firstColorHex
                  ? `2px solid ${firstColorHex}`
                  : undefined,
              boxShadow: hasConflict
                ? "inset 0 0 0 1px rgba(239,68,68,0.55)"
                : undefined,
            }}
            title={
              hasConflict
                ? `Conflict: ${conflictMids
                    .map((mid) => monteurById.get(mid)?.naam ?? "?")
                    .join(", ")} dubbel ingepland`
                : undefined
            }
          >
            {hasConflict && (
              <div
                className="absolute right-0.5 top-0.5 flex h-3 w-3 items-center justify-center rounded-full"
                style={{
                  background: "#ef4444", color: "#fff",
                  fontSize: 8, fontWeight: 700, lineHeight: 1,
                }}
              >
                !
              </div>
            )}
            {monteurIds.length > 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex">
                  {monteurIds.slice(0, 2).map((mid, idx) => {
                    const m = monteurById.get(mid);
                    if (!m) return null;
                    const isS = m.type === "schakelmonteur";
                    return (
                      <div
                        key={mid}
                        className="flex items-center justify-center rounded-full"
                        style={{
                          width: 16, height: 16,
                          background: isS ? "#feb300" : "#378add",
                          color: isS ? "#0a1a30" : "#fff",
                          fontSize: 6, fontWeight: 700,
                          border: "1px solid rgba(10,26,48,0.5)",
                          marginLeft: idx === 0 ? 0 : -4,
                        }}
                        title={m.naam}
                      >
                        {initialen(m.naam)}
                      </div>
                    );
                  })}
                  {monteurIds.length > 2 && (
                    <div
                      className="flex items-center justify-center rounded-full"
                      style={{
                        width: 16, height: 16,
                        background: "rgba(255,255,255,0.2)",
                        color: "#fff",
                        fontSize: 6, fontWeight: 700,
                        border: "1px solid rgba(10,26,48,0.5)",
                        marginLeft: -4,
                      }}
                      title={`+${monteurIds.length - 2} meer`}
                    >
                      +{monteurIds.length - 2}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

