import { useEffect, useMemo, useRef, useState, useCallback, memo, MouseEvent as ReactMouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  Download,
  FileText,
  GripVertical,
  History,
  Plus,
  Printer,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  COLOR_MAP,
  COLOR_CODES,
  DAG_LABELS,
  formatDate,
  getMondayOfWeek,
  initialen,
  wrapWeek,
} from "@/lib/planning-types";
import { checkCelVoldoet, voldoetAanwijzing, type Aanwijzing } from "@/lib/aanwijzing";

/* ----------------------------- Current week (ISO) ----------------------------- */
function getCurrentISOWeek(): number {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const dow = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dow + 1);
  const diff = now.getTime() - monday.getTime();
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}
const CURRENT_WEEK = getCurrentISOWeek();
const CURRENT_YEAR = new Date().getFullYear();

/* ----------------------------- Types ----------------------------- */

type CapType = "schakel" | "montage" | "geen";
type MonteurType = "schakelmonteur" | "montagemonteur";

interface Project {
  id: string;
  case_nummer: string | null;
  station_naam: string | null;
  status: string | null;
  jaar: number | null;
  wv_naam: string | null;
  tijdelijke_situatie: string | null;
  template_id: string | null;
  gsu_datum: string | null;
  geu_datum: string | null;
}

/* --- ISO week helpers for auto-seeding planning weeks --- */
function isoWeekParts(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

function enumerateISOWeeks(startISO: string, endISO: string): { week_nr: number; year: number }[] {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [];
  const dow = start.getUTCDay() || 7;
  const monday = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - dow + 1);
  const out: { week_nr: number; year: number }[] = [];
  const seen = new Set<string>();
  const cursor = new Date(monday);
  for (let i = 0; i < 60 && cursor.getTime() <= end.getTime() + 6 * 86400000; i++) {
    const { year, week } = isoWeekParts(cursor);
    const key = `${year}-${week}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ week_nr: week, year });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return out;
}

interface Week {
  id: string;
  week_nr: number;
  positie: number;
  opmerking: string | null;
}

interface Activiteit {
  id: string;
  naam: string;
  capaciteit_type: CapType | null;
  min_personen: number | null;
  min_personen_totaal: number | null;
  min_personen_gekwalificeerd: number | null;
  min_aanwijzing_ls: Aanwijzing | null;
  min_aanwijzing_ms: Aanwijzing | null;
  positie: number | null;
  activiteit_type_id: string | null;
}

interface ActiviteitTypeOption {
  id: string;
  naam: string;
  capaciteit_type: CapType | null;
  min_personen: number | null;
  min_personen_totaal: number | null;
  min_personen_gekwalificeerd: number | null;
  min_aanwijzing_ls: Aanwijzing | null;
  min_aanwijzing_ms: Aanwijzing | null;
  kleur_default: string | null;
}

interface Monteur {
  id: string;
  naam: string;
  type: MonteurType;
  aanwijzing_ls: Aanwijzing | null;
  aanwijzing_ms: Aanwijzing | null;
  actief: boolean;
}

interface Cel {
  id: string;
  activiteit_id: string;
  week_id: string;
  dag_index: number;
  kleur_code: string | null;
  notitie: string | null;
  capaciteit: number | null;
}

type CelMap = Map<string, Cel>; // key: `${activiteit_id}|${week_id}|${dag_index}`
type CelMonteurMap = Map<string, string[]>; // key: cel.id -> monteur ids

const cellKey = (a: string, w: string, d: number) => `${a}|${w}|${d}`;

const DAG_NAMEN_KORT = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"];

type HistoryEntry =
  | { type: "cel_created"; cel: Cel }
  | { type: "cel_deleted"; cel: Cel; monteurIds: string[] }
  | { type: "cel_color_changed"; cel: Cel; prevColor: string | null }
  | { type: "cel_notitie_changed"; cel: Cel; prevNotitie: string | null }
  | { type: "monteur_added"; cel: Cel; monteurId: string }
  | { type: "monteur_removed"; cel: Cel; monteurId: string };

/* ----------------------------- Layout sizes ----------------------------- */
const SIDEBAR_W = 240;
const CELL_W = 52;
const CELL_H = 40;
const HEADER_H = 56;

/* ----------------------------- Page ----------------------------- */

const Plannen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");

  const [project, setProject] = useState<Project | null>(null);
  const [weken, setWeken] = useState<Week[]>([]);
  const [activiteiten, setActiviteiten] = useState<Activiteit[]>([]);
  const [cellen, setCellen] = useState<CelMap>(new Map());
  const [celMonteurs, setCelMonteurs] = useState<CelMonteurMap>(new Map());
  const [monteurs, setMonteurs] = useState<Monteur[]>([]);
  const [ploegen, setPloegen] = useState<import("@/lib/ploegen").Ploeg[]>([]);
  const [activiteitTypes, setActiviteitTypes] = useState<ActiviteitTypeOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [openCellKey, setOpenCellKey] = useState<string | null>(null);
  const [weekModalOpen, setWeekModalOpen] = useState(false);
  const [showAddActiviteit, setShowAddActiviteit] = useState(false);

  // Filter voor de "Ingeplande monteurs" balk: filter op week en/of dag.
  // weekId === null => alle weken; dagIndex === null => alle dagen
  const [monteursFilter, setMonteursFilter] = useState<{
    weekId: string | null;
    dagIndex: number | null;
  }>({ weekId: null, dagIndex: null });

  // Scope voor de "Ingeplande monteurs" balk:
  // - "visible": alleen monteurs van de weken die nu in de grid-viewport zichtbaar zijn (default)
  // - "all":     monteurs van het hele project
  // Een expliciete week-filter (monteursFilter.weekId) overschrijft beide.
  const [monteursScope, setMonteursScope] = useState<"visible" | "all">("visible");

  // Geselecteerde monteur waarvan alle ingeplande cellen worden gehighlight in de grid.
  // null => geen highlight actief.
  const [highlightedMonteurId, setHighlightedMonteurId] = useState<string | null>(null);

  // History stack — session only, max 30 entries
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const skipHistoryRef = useRef(false);
  // Voorkomt dat dezelfde projectId tijdens één sessie meerdere keren tegelijk
  // weken gaat seeden (StrictMode dubbele mount, snelle navigatie, refetch).
  const seedingProjectsRef = useRef<Set<string>>(new Set());
  const pushHistory = useCallback((entry: HistoryEntry) => {
    if (skipHistoryRef.current) return;
    setHistory((prev) => [...prev.slice(-29), entry]);
  }, []);

  // ---------- data load ----------
  const loadAll = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [projRes, wRes, aRes, mRes, atRes] = await Promise.all([
      supabase.from("projecten").select("*").eq("id", projectId).single(),
      supabase
        .from("project_weken")
        .select("*")
        .eq("project_id", projectId)
        .order("positie", { ascending: true }),
      supabase
        .from("project_activiteiten")
        .select("*")
        .eq("project_id", projectId)
        .order("positie", { ascending: true }),
      supabase
        .from("monteurs")
        .select("*")
        .eq("actief", true)
        .order("naam", { ascending: true }),
      supabase
        .from("activiteit_types")
        .select("*")
        .order("positie", { ascending: true }),
    ]);

    if (projRes.error || !projRes.data) {
      toast.error("Project niet gevonden");
      setLoading(false);
      return;
    }
    setProject(projRes.data as Project);
    const weekRows = (wRes.data ?? []) as Week[];
    setWeken(weekRows);
    let actRows = (aRes.data ?? []) as Activiteit[];
    setMonteurs((mRes.data ?? []) as Monteur[]);
    const atRows = (atRes.data ?? []) as ActiviteitTypeOption[];
    setActiviteitTypes(atRows);

    // Auto-seed project_activiteiten vanuit template wanneer leeg
    const proj = projRes.data as Project;
    if (actRows.length === 0 && proj?.template_id) {
      const { data: tplRow } = await supabase
        .from("project_templates")
        .select("activiteit_type_ids")
        .eq("id", proj.template_id)
        .maybeSingle();
      const typeIds: string[] = (tplRow?.activiteit_type_ids ?? []) as string[];
      if (typeIds.length > 0) {
        const inserts = typeIds
          .map((tid, i) => {
            const t = atRows.find((x) => x.id === tid);
            if (!t) return null;
            return {
              project_id: projectId,
              activiteit_type_id: t.id,
              naam: t.naam,
              capaciteit_type: t.capaciteit_type,
              min_personen: t.min_personen ?? 1,
              min_personen_totaal: t.min_personen_totaal ?? t.min_personen ?? 1,
              min_personen_gekwalificeerd: t.min_personen_gekwalificeerd ?? t.min_personen ?? 1,
              min_aanwijzing_ls: t.min_aanwijzing_ls,
              min_aanwijzing_ms: t.min_aanwijzing_ms,
              positie: i,
            };
          })
          .filter(Boolean);
        if (inserts.length > 0) {
          const { data: inserted } = await supabase
            .from("project_activiteiten")
            .insert(inserts as never)
            .select();
          if (inserted) {
            actRows = inserted as Activiteit[];
            toast.success("Activiteiten geladen vanuit template");
          }
        }
      }
    }
    setActiviteiten(actRows);

    // Auto-seed project_weken wanneer er geen weken bestaan.
    // Robuust tegen dubbele mounts / snelle reloads:
    //  1. Per-project guard (seedingProjectsRef) — voorkomt parallelle seeds in dezelfde tab
    //  2. Re-fetch direct vóór insert om race tegen andere tab/sessie te dichten
    //  3. Dedupe candidates op week_nr
    //  4. Insert alleen weken die nog niet bestaan; positie hercomputeren op basis van week_nr
    //  5. DB unique index (project_id, week_nr) is de laatste vangnet
    let effectiveWeeks: Week[] = weekRows;
    if (effectiveWeeks.length === 0 && !seedingProjectsRef.current.has(projectId)) {
      seedingProjectsRef.current.add(projectId);
      try {
        // Re-fetch om te checken dat een ander mount/process intussen niet al heeft geseed.
        const { data: freshWeeks } = await supabase
          .from("project_weken")
          .select("*")
          .eq("project_id", projectId)
          .order("positie", { ascending: true });
        const existing = (freshWeeks ?? []) as Week[];

        if (existing.length > 0) {
          // Iemand anders was sneller; gebruik die.
          effectiveWeeks = existing;
          setWeken(effectiveWeeks);
        } else {
          const gsu = proj?.gsu_datum ?? null;
          const geu = proj?.geu_datum ?? null;
          let candidates: { week_nr: number; year: number }[] = [];
          let usedFallback = false;
          if (gsu && geu) candidates = enumerateISOWeeks(gsu, geu);
          // Fallback 1: één GSU- of GEU-datum bekend → gebruik die week
          if (candidates.length === 0 && (gsu || geu)) {
            const ref = new Date((gsu || geu) as string);
            if (!isNaN(ref.getTime())) {
              const p = isoWeekParts(ref);
              candidates = [{ week_nr: p.week, year: p.year }];
              usedFallback = true;
            }
          }
          // Fallback 2: gebruik projectjaar — huidige week als jaar == nu, anders week 1 van projectjaar
          if (candidates.length === 0 && proj?.jaar) {
            if (proj.jaar === CURRENT_YEAR) {
              candidates = [{ week_nr: CURRENT_WEEK, year: CURRENT_YEAR }];
            } else {
              candidates = [{ week_nr: 1, year: proj.jaar }];
            }
            usedFallback = true;
          }
          // Fallback 3: laatste vangnet → huidige ISO-week
          if (candidates.length === 0) {
            candidates = [{ week_nr: CURRENT_WEEK, year: CURRENT_YEAR }];
            usedFallback = true;
          }
          // Dedupe op week_nr (ISO weeknummer is uniek binnen het projectjaar)
          const seenWn = new Set<number>();
          const dedup = candidates.filter((c) => {
            if (seenWn.has(c.week_nr)) return false;
            seenWn.add(c.week_nr);
            return true;
          });
          // Positie volgt chronologische volgorde van de candidates
          const inserts = dedup.map((c, i) => ({
            project_id: projectId,
            week_nr: c.week_nr,
            positie: i,
            opmerking: "",
          }));
          // Insert; unique index op (project_id, week_nr) zorgt voor DB-niveau dedupe.
          const { error: weekErr } = await supabase
            .from("project_weken")
            .insert(inserts);
          if (weekErr) {
            // Eén of meerdere weken bestonden al (race) — niet fataal, opnieuw ophalen.
            console.warn("[plannen] week-seed insert error, terugvallen op refetch:", weekErr.message);
          }
          // Eindstand altijd refetchen — autoriteit is de DB.
          const { data: afterRows } = await supabase
            .from("project_weken")
            .select("*")
            .eq("project_id", projectId)
            .order("positie", { ascending: true });
          let finalWeeks = ((afterRows ?? []) as Week[]).slice();

          // Hercomputeer positie op basis van week_nr om gaten/duplicaten te corrigeren
          // (ISO-weken stijgend; week 52→1 jaarwissel handhaven we via volgorde van candidates).
          const wnOrder = new Map<number, number>();
          dedup.forEach((c, i) => wnOrder.set(c.week_nr, i));
          finalWeeks.sort((a, b) => {
            const ai = wnOrder.has(a.week_nr) ? wnOrder.get(a.week_nr)! : 9999 + a.week_nr;
            const bi = wnOrder.has(b.week_nr) ? wnOrder.get(b.week_nr)! : 9999 + b.week_nr;
            return ai - bi;
          });
          // Push positie-correcties als ze afwijken
          const positieFixes = finalWeeks
            .map((w, i) => (w.positie !== i ? { id: w.id, positie: i } : null))
            .filter(Boolean) as { id: string; positie: number }[];
          if (positieFixes.length > 0) {
            await Promise.all(
              positieFixes.map((p) =>
                supabase.from("project_weken").update({ positie: p.positie }).eq("id", p.id),
              ),
            );
            finalWeeks = finalWeeks.map((w, i) => ({ ...w, positie: i }));
          }

          effectiveWeeks = finalWeeks;
          setWeken(effectiveWeeks);
          if (effectiveWeeks.length > 0) {
            if (usedFallback) {
              toast.info("Startweek aangemaakt zodat dit project direct ingepland kan worden");
            } else {
              toast.success("Planningweken automatisch aangemaakt op basis van uitvoeringsperiode");
            }
          }
        }
      } finally {
        seedingProjectsRef.current.delete(projectId);
      }
    }

    // load cells for these weeks
    if (effectiveWeeks.length > 0) {
      const weekIds = effectiveWeeks.map((w) => w.id);
      const { data: celRows } = await supabase
        .from("planning_cellen")
        .select("*")
        .in("week_id", weekIds);
      const celArr = (celRows ?? []) as Cel[];
      const cmap: CelMap = new Map();
      celArr.forEach((c) => cmap.set(cellKey(c.activiteit_id, c.week_id, c.dag_index), c));
      setCellen(cmap);

      if (celArr.length > 0) {
        const { data: cm } = await supabase
          .from("cel_monteurs")
          .select("*")
          .in(
            "cel_id",
            celArr.map((c) => c.id)
          );
        const mmap: CelMonteurMap = new Map();
        (cm ?? []).forEach((row: { cel_id: string; monteur_id: string }) => {
          const arr = mmap.get(row.cel_id) ?? [];
          arr.push(row.monteur_id);
          mmap.set(row.cel_id, arr);
        });
        setCelMonteurs(mmap);
      } else {
        setCelMonteurs(new Map());
      }
    } else {
      setCellen(new Map());
      setCelMonteurs(new Map());
    }

    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /* ----------------------------- scroll sync ----------------------------- */
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const scrollLock = useRef(false);
  // Track horizontale scroll & viewportbreedte van het body-scroll-container,
  // zodat we kunnen bepalen welke weken op dit moment zichtbaar zijn.
  const [gridScrollLeft, setGridScrollLeft] = useState(0);
  const [gridViewportWidth, setGridViewportWidth] = useState(0);
  const syncScroll = useCallback((source: "header" | "body", left: number) => {
    if (scrollLock.current) return;
    scrollLock.current = true;
    if (source !== "header" && headerScrollRef.current) headerScrollRef.current.scrollLeft = left;
    if (source !== "body" && bodyScrollRef.current) bodyScrollRef.current.scrollLeft = left;
    setGridScrollLeft(left);
    requestAnimationFrame(() => {
      scrollLock.current = false;
    });
  }, []);

  // Meet de viewportbreedte van de grid en luister naar resize.
  useEffect(() => {
    const el = bodyScrollRef.current;
    if (!el) return;
    const update = () => {
      setGridViewportWidth(el.clientWidth);
      setGridScrollLeft(el.scrollLeft);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bodyScrollRef.current]);

  /* ----------------------------- cell ops ----------------------------- */
  const updateCellLocal = useCallback((cel: Cel) => {
    setCellen((prev) => {
      const m = new Map(prev);
      m.set(cellKey(cel.activiteit_id, cel.week_id, cel.dag_index), cel);
      return m;
    });
  }, []);

  const removeCellLocal = useCallback((activiteit_id: string, week_id: string, dag_index: number) => {
    setCellen((prev) => {
      const m = new Map(prev);
      m.delete(cellKey(activiteit_id, week_id, dag_index));
      return m;
    });
  }, []);

  const ensureCell = useCallback(
    async (activiteit_id: string, week_id: string, dag_index: number, kleur_code: string | null): Promise<Cel | null> => {
      const k = cellKey(activiteit_id, week_id, dag_index);
      const existing = cellen.get(k);
      if (existing) return existing;
      const { data, error } = await supabase
        .from("planning_cellen")
        .insert({ activiteit_id, week_id, dag_index, kleur_code })
        .select()
        .single();
      if (error || !data) {
        toast.error("Cel kon niet worden aangemaakt");
        return null;
      }
      updateCellLocal(data as Cel);
      return data as Cel;
    },
    [cellen, updateCellLocal]
  );

  const handleCellClick = useCallback(
    async (activiteit: Activiteit, week_id: string, dag_index: number) => {
      const k = cellKey(activiteit.id, week_id, dag_index);
      const existing = cellen.get(k);
      if (existing) {
        setOpenCellKey(k);
        return;
      }
      // create with default color from activiteit_type
      const at = activiteitTypes.find((t) => t.id === activiteit.activiteit_type_id);
      const defaultColor = at?.kleur_default ?? "c3";
      const cel = await ensureCell(activiteit.id, week_id, dag_index, defaultColor);
      if (!cel) return;
      pushHistory({ type: "cel_created", cel });
      if (activiteit.capaciteit_type === "schakel" || activiteit.capaciteit_type === "montage") {
        setOpenCellKey(cellKey(activiteit.id, week_id, dag_index));
      }
    },
    [cellen, activiteitTypes, ensureCell, pushHistory]
  );

  const handleCellRightClick = useCallback(
    async (e: ReactMouseEvent, activiteit_id: string, week_id: string, dag_index: number) => {
      e.preventDefault();
      const k = cellKey(activiteit_id, week_id, dag_index);
      const cel = cellen.get(k);
      if (!cel) return;
      const monteurIds = celMonteurs.get(cel.id) ?? [];
      pushHistory({ type: "cel_deleted", cel, monteurIds: [...monteurIds] });
      removeCellLocal(activiteit_id, week_id, dag_index);
      setCelMonteurs((prev) => {
        const m = new Map(prev);
        m.delete(cel.id);
        return m;
      });
      const { error } = await supabase.from("planning_cellen").delete().eq("id", cel.id);
      if (error) {
        toast.error("Wissen mislukt");
        loadAll();
      }
    },
    [cellen, celMonteurs, removeCellLocal, loadAll, pushHistory]
  );

  const updateCellColor = useCallback(
    async (cel: Cel, kleur_code: string | null) => {
      pushHistory({ type: "cel_color_changed", cel, prevColor: cel.kleur_code });
      updateCellLocal({ ...cel, kleur_code });
      const { error } = await supabase
        .from("planning_cellen")
        .update({ kleur_code })
        .eq("id", cel.id);
      if (error) toast.error("Kleur opslaan mislukt");
    },
    [updateCellLocal, pushHistory]
  );

  const updateCellNotitie = useCallback(
    async (cel: Cel, notitie: string) => {
      pushHistory({ type: "cel_notitie_changed", cel, prevNotitie: cel.notitie });
      updateCellLocal({ ...cel, notitie });
      const { error } = await supabase
        .from("planning_cellen")
        .update({ notitie })
        .eq("id", cel.id);
      if (error) toast.error("Notitie opslaan mislukt");
    },
    [updateCellLocal, pushHistory]
  );

  const addMonteurToCell = useCallback(async (cel: Cel, monteur_id: string) => {
    setCelMonteurs((prev) => {
      const m = new Map(prev);
      const arr = [...(m.get(cel.id) ?? [])];
      if (!arr.includes(monteur_id)) arr.push(monteur_id);
      m.set(cel.id, arr);
      return m;
    });
    pushHistory({ type: "monteur_added", cel, monteurId: monteur_id });
    const { error } = await supabase
      .from("cel_monteurs")
      .insert({ cel_id: cel.id, monteur_id });
    if (error) {
      toast.error("Monteur toevoegen mislukt");
    }
  }, [pushHistory]);

  const removeMonteurFromCell = useCallback(async (cel: Cel, monteur_id: string) => {
    setCelMonteurs((prev) => {
      const m = new Map(prev);
      const arr = (m.get(cel.id) ?? []).filter((x) => x !== monteur_id);
      m.set(cel.id, arr);
      return m;
    });
    pushHistory({ type: "monteur_removed", cel, monteurId: monteur_id });
    const { error } = await supabase
      .from("cel_monteurs")
      .delete()
      .eq("cel_id", cel.id)
      .eq("monteur_id", monteur_id);
    if (error) toast.error("Monteur verwijderen mislukt");
  }, [pushHistory]);


  /* ----------------------------- undo / history ----------------------------- */
  const reverseHistoryEntry = useCallback(
    async (entry: HistoryEntry) => {
      skipHistoryRef.current = true;
      try {
        switch (entry.type) {
          case "cel_created": {
            removeCellLocal(
              entry.cel.activiteit_id,
              entry.cel.week_id,
              entry.cel.dag_index
            );
            await supabase
              .from("planning_cellen")
              .delete()
              .eq("id", entry.cel.id);
            break;
          }
          case "cel_deleted": {
            const { data } = await supabase
              .from("planning_cellen")
              .insert({
                activiteit_id: entry.cel.activiteit_id,
                week_id: entry.cel.week_id,
                dag_index: entry.cel.dag_index,
                kleur_code: entry.cel.kleur_code,
                notitie: entry.cel.notitie,
                capaciteit: entry.cel.capaciteit,
              })
              .select()
              .single();
            if (data) {
              updateCellLocal(data as Cel);
              if (entry.monteurIds.length > 0) {
                await supabase.from("cel_monteurs").insert(
                  entry.monteurIds.map((mid) => ({
                    cel_id: (data as Cel).id,
                    monteur_id: mid,
                  }))
                );
                setCelMonteurs((prev) => {
                  const m = new Map(prev);
                  m.set((data as Cel).id, [...entry.monteurIds]);
                  return m;
                });
              }
            }
            break;
          }
          case "cel_color_changed": {
            await updateCellColor(entry.cel, entry.prevColor);
            break;
          }
          case "cel_notitie_changed": {
            await updateCellNotitie(entry.cel, entry.prevNotitie ?? "");
            break;
          }
          case "monteur_added": {
            await removeMonteurFromCell(entry.cel, entry.monteurId);
            break;
          }
          case "monteur_removed": {
            await addMonteurToCell(entry.cel, entry.monteurId);
            break;
          }
        }
      } finally {
        skipHistoryRef.current = false;
      }
    },
    [
      removeCellLocal,
      updateCellLocal,
      updateCellColor,
      updateCellNotitie,
      addMonteurToCell,
      removeMonteurFromCell,
    ]
  );

  const handleUndo = useCallback(async () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    await reverseHistoryEntry(last);
    toast("Actie ongedaan gemaakt");
  }, [history, reverseHistoryEntry]);

  const handleUndoEntry = useCallback(
    async (entry: HistoryEntry, idx: number) => {
      setHistory((prev) => prev.filter((_, i) => i !== idx));
      await reverseHistoryEntry(entry);
      toast("Actie ongedaan gemaakt");
    },
    [reverseHistoryEntry]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        const target = e.target as HTMLElement | null;
        // Don't intercept undo when user is editing text
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo]);


  const updateWeekOpmerking = useCallback(async (week_id: string, opmerking: string) => {
    setWeken((prev) => prev.map((w) => (w.id === week_id ? { ...w, opmerking } : w)));
    const { error } = await supabase
      .from("project_weken")
      .update({ opmerking })
      .eq("id", week_id);
    if (error) toast.error("Opmerking opslaan mislukt");
  }, []);

  /* ----------------------------- week mgmt ----------------------------- */
  const addWeek = useCallback(async () => {
    if (!projectId) return;
    const lastWeek = weken[weken.length - 1];
    const newPos = (lastWeek?.positie ?? -1) + 1;
    const newWeekNr = wrapWeek((lastWeek?.week_nr ?? 0) + 1);
    const { data, error } = await supabase
      .from("project_weken")
      .insert({ project_id: projectId, week_nr: newWeekNr, positie: newPos, opmerking: "" })
      .select()
      .single();
    if (error || !data) {
      toast.error("Week toevoegen mislukt");
      return;
    }
    setWeken((prev) => [...prev, data as Week]);
  }, [projectId, weken]);

  const removeLastWeek = useCallback(async () => {
    const last = weken[weken.length - 1];
    if (!last) return;
    setWeken((prev) => prev.slice(0, -1));
    const { error } = await supabase.from("project_weken").delete().eq("id", last.id);
    if (error) {
      toast.error("Week verwijderen mislukt");
      loadAll();
    }
  }, [weken, loadAll]);

  const setWeekNr = useCallback(
    async (week_id: string, newNr: number) => {
      // find index of changed week, shift all subsequent
      const idx = weken.findIndex((w) => w.id === week_id);
      if (idx < 0) return;
      const updated = weken.map((w, i) =>
        i >= idx ? { ...w, week_nr: wrapWeek(newNr + (i - idx)) } : w
      );
      setWeken(updated);
      // batch update affected
      const updates = updated.slice(idx).map((w) =>
        supabase.from("project_weken").update({ week_nr: w.week_nr }).eq("id", w.id)
      );
      const results = await Promise.all(updates);
      if (results.some((r) => r.error)) {
        toast.error("Weeknummers opslaan mislukt");
        loadAll();
      }
    },
    [weken, loadAll]
  );

  /* ----------------------------- activiteit ops ----------------------------- */
  const addActiviteitFromType = useCallback(
    async (typeId: string) => {
      if (!projectId) return;
      const t = activiteitTypes.find((x) => x.id === typeId);
      if (!t) return;
      const positie = activiteiten.length;
      const { data, error } = await supabase
        .from("project_activiteiten")
        .insert({
          project_id: projectId,
          activiteit_type_id: t.id,
          naam: t.naam,
          capaciteit_type: t.capaciteit_type,
          min_personen: t.min_personen ?? 1,
          min_personen_totaal: t.min_personen_totaal ?? t.min_personen ?? 1,
          min_personen_gekwalificeerd: t.min_personen_gekwalificeerd ?? t.min_personen ?? 1,
          min_aanwijzing_ls: t.min_aanwijzing_ls,
          min_aanwijzing_ms: t.min_aanwijzing_ms,
          positie,
        })
        .select()
        .single();
      if (error || !data) {
        toast.error("Activiteit toevoegen mislukt");
        return;
      }
      setActiviteiten((prev) => [...prev, data as Activiteit]);
      setShowAddActiviteit(false);
      toast.success("Activiteit toegevoegd");
    },
    [projectId, activiteiten, activiteitTypes]
  );

  const removeActiviteit = useCallback(async (id: string) => {
    setActiviteiten((prev) => prev.filter((a) => a.id !== id));
    const { error } = await supabase.from("project_activiteiten").delete().eq("id", id);
    if (error) {
      toast.error("Verwijderen mislukt");
      loadAll();
    }
  }, [loadAll]);

  const syncActiviteitFromTemplate = useCallback(
    async (activiteitId: string) => {
      const act = activiteiten.find((a) => a.id === activiteitId);
      if (!act || !act.activiteit_type_id) {
        toast.error("Geen template gekoppeld aan deze activiteit");
        return;
      }
      const tpl = activiteitTypes.find((t) => t.id === act.activiteit_type_id);
      if (!tpl) {
        toast.error("Template niet gevonden");
        return;
      }
      const updates = {
        naam: tpl.naam,
        capaciteit_type: tpl.capaciteit_type,
        min_personen: tpl.min_personen,
        min_personen_totaal: tpl.min_personen_totaal ?? tpl.min_personen ?? 1,
        min_personen_gekwalificeerd:
          tpl.min_personen_gekwalificeerd ?? tpl.min_personen ?? 1,
        min_aanwijzing_ls: tpl.min_aanwijzing_ls,
        min_aanwijzing_ms: tpl.min_aanwijzing_ms,
      };
      const { error } = await supabase
        .from("project_activiteiten")
        .update(updates)
        .eq("id", activiteitId);
      if (error) {
        toast.error("Synchroniseren mislukt");
        return;
      }
      setActiviteiten((prev) =>
        prev.map((a) => (a.id === activiteitId ? { ...a, ...updates } : a))
      );
      toast.success(`"${tpl.naam}" gesynchroniseerd vanuit template`);
    },
    [activiteiten, activiteitTypes]
  );


  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleActiviteitDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = activiteiten.findIndex((a) => a.id === active.id);
      const newIdx = activiteiten.findIndex((a) => a.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return;
      const reordered = arrayMove(activiteiten, oldIdx, newIdx).map((a, i) => ({
        ...a,
        positie: i,
      }));
      setActiviteiten(reordered);
      const updates = reordered.map((a) =>
        supabase.from("project_activiteiten").update({ positie: a.positie }).eq("id", a.id)
      );
      const results = await Promise.all(updates);
      if (results.some((r) => r.error)) {
        toast.error("Volgorde opslaan mislukt");
        loadAll();
      }
    },
    [activiteiten, loadAll]
  );

  /* ----------------------------- excel export ----------------------------- */
  const exportExcel = useCallback(async () => {
    if (!project) return;
    try {
      // dynamic load
      const XLSX: any = await loadSheetJS();
      const aoa: (string | number)[][] = [];
      aoa.push([
        "Case:",
        project.case_nummer ?? "",
        "Station:",
        project.station_naam ?? "",
        "WV:",
        project.wv_naam ?? "",
      ]);
      aoa.push([]);
      // week header row — markeer de huidige ISO-week met " — NU"
      const projectJaar = project.jaar ?? new Date().getFullYear();
      const weekRow: string[] = [""];
      weken.forEach((w) => {
        const isNu = w.week_nr === CURRENT_WEEK && projectJaar === CURRENT_YEAR;
        const label = isNu ? `Week ${w.week_nr} — NU` : `Week ${w.week_nr}`;
        weekRow.push(label, "", "", "", "");
      });
      aoa.push(weekRow);
      // day row
      const dayRow: string[] = [""];
      weken.forEach(() => {
        DAG_LABELS.forEach((d) => dayRow.push(d));
      });
      aoa.push(dayRow);
      // activity rows
      activiteiten.forEach((a) => {
        const row: (string | number)[] = [a.naam];
        weken.forEach((w) => {
          for (let d = 0; d < 5; d++) {
            const cel = cellen.get(cellKey(a.id, w.id, d));
            if (!cel || !cel.kleur_code) {
              row.push("");
              continue;
            }
            const kleurNaam = COLOR_MAP[cel.kleur_code]?.naam ?? cel.kleur_code;
            const ids = celMonteurs.get(cel.id) ?? [];
            const namen = ids
              .map((mid) => monteurs.find((m) => m.id === mid)?.naam)
              .filter(Boolean)
              .join(", ");
            row.push(namen ? `${kleurNaam} — ${namen}` : kleurNaam);
          }
        });
        aoa.push(row);
      });
      // opmerkingen row
      const opmRow: string[] = ["Opmerkingen"];
      weken.forEach((w) => {
        opmRow.push(w.opmerking ?? "", "", "", "", "");
      });
      aoa.push(opmRow);

      // ---- Ingeplande monteurs sectie ----
      // Verzamel unieke monteurs die ergens in dit project staan ingepland.
      const ingeplandeIds = new Set<string>();
      for (const cel of cellen.values()) {
        const ids = celMonteurs.get(cel.id);
        if (!ids) continue;
        for (const id of ids) ingeplandeIds.add(id);
      }
      const ingeplandeList = Array.from(ingeplandeIds)
        .map((id) => monteurs.find((m) => m.id === id))
        .filter((m): m is Monteur => !!m)
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === "schakelmonteur" ? -1 : 1;
          return a.naam.localeCompare(b.naam, "nl");
        });

      aoa.push([]);
      aoa.push([`Ingeplande monteurs (${ingeplandeList.length})`]);
      if (ingeplandeList.length === 0) {
        aoa.push(["Nog geen monteurs ingepland"]);
      } else {
        aoa.push(["Naam", "Type", "Aanwijzing LS", "Aanwijzing MS"]);
        ingeplandeList.forEach((m) => {
          const typeLabel =
            m.type === "schakelmonteur" ? "Schakelmonteur" : "Montagemonteur";
          aoa.push([
            m.naam,
            typeLabel,
            m.aanwijzing_ls ?? "—",
            m.aanwijzing_ms ?? "—",
          ]);
        });
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Planning");
      const filename = `Terrevolt_${project.case_nummer ?? "project"}_${project.jaar ?? new Date().getFullYear()}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch {
      toast.error("Excel export mislukt");
    }
  }, [project, weken, activiteiten, cellen, celMonteurs, monteurs]);

  /* ----------------------------- derived ----------------------------- */
  const monteurById = useMemo(() => {
    const m = new Map<string, Monteur>();
    monteurs.forEach((x) => m.set(x.id, x));
    return m;
  }, [monteurs]);

  // Bereken welke weken op dit moment (deels) zichtbaar zijn in de grid-viewport.
  // Een week neemt 5 * CELL_W pixels in. Een week telt als zichtbaar als zijn
  // [start, eind)-bereik overlapt met [scrollLeft, scrollLeft + viewportWidth].
  const visibleWeekIds = useMemo(() => {
    if (gridViewportWidth <= 0 || weken.length === 0) return new Set<string>();
    const weekW = CELL_W * 5;
    const left = gridScrollLeft;
    const right = gridScrollLeft + gridViewportWidth;
    const ids = new Set<string>();
    weken.forEach((w, idx) => {
      const wLeft = idx * weekW;
      const wRight = wLeft + weekW;
      // Overlap-check; we tellen een week mee zodra >=20% zichtbaar is om
      // randgevallen (1px van een week net zichtbaar) uit te sluiten.
      const overlap = Math.max(0, Math.min(right, wRight) - Math.max(left, wLeft));
      if (overlap >= weekW * 0.2) ids.add(w.id);
    });
    return ids;
  }, [weken, gridScrollLeft, gridViewportWidth]);

  // Unique monteurs that are actually scheduled in any cell of this project,
  // gefilterd op:
  //  - expliciete week-filter (monteursFilter.weekId) als gezet
  //  - anders: scope ("visible" => alleen zichtbare weken, "all" => hele project)
  //  - en altijd op dagIndex als gezet
  // Sortering: schakelmonteurs (amber) eerst, dan montagemonteurs (blue), daarna op naam.
  const ingeplandeMonteurs = useMemo(() => {
    const ids = new Set<string>();
    const useVisibleScope =
      monteursScope === "visible" && monteursFilter.weekId === null;
    for (const cel of cellen.values()) {
      if (monteursFilter.weekId && cel.week_id !== monteursFilter.weekId) continue;
      if (useVisibleScope && !visibleWeekIds.has(cel.week_id)) continue;
      if (monteursFilter.dagIndex !== null && cel.dag_index !== monteursFilter.dagIndex) continue;
      const monteurIds = celMonteurs.get(cel.id);
      if (!monteurIds) continue;
      for (const id of monteurIds) ids.add(id);
    }
    const list: Monteur[] = [];
    for (const id of ids) {
      const m = monteurById.get(id);
      if (m) list.push(m);
    }
    list.sort((a, b) => {
      if (a.type !== b.type) return a.type === "schakelmonteur" ? -1 : 1;
      return a.naam.localeCompare(b.naam, "nl");
    });
    return list;
  }, [cellen, celMonteurs, monteurById, monteursFilter, monteursScope, visibleWeekIds]);

  // Reset filter wanneer de geselecteerde week niet meer bestaat (bv. na week verwijderen)
  useEffect(() => {
    if (monteursFilter.weekId && !weken.some((w) => w.id === monteursFilter.weekId)) {
      setMonteursFilter((p) => ({ ...p, weekId: null }));
    }
  }, [weken, monteursFilter.weekId]);

  // Tooltip-tekst voor lege cellen in de huidige ISO-week.
  // Verklaart waarom de week een groene tint heeft + samenvatting van wat er die week gepland staat.
  const currentWeekTooltip = useMemo<string | null>(() => {
    const projectJaar = project?.jaar ?? new Date().getFullYear();
    if (projectJaar !== CURRENT_YEAR) return null;
    const currentWeek = weken.find((w) => w.week_nr === CURRENT_WEEK);
    if (!currentWeek) return null;

    // Tel per activiteit hoeveel dagen er gepland zijn in deze week (cellen met kleur_code).
    const dagenPerActiviteit = new Map<string, number>();
    for (const cel of cellen.values()) {
      if (cel.week_id !== currentWeek.id) continue;
      if (!cel.kleur_code) continue;
      dagenPerActiviteit.set(
        cel.activiteit_id,
        (dagenPerActiviteit.get(cel.activiteit_id) ?? 0) + 1,
      );
    }

    const header = `Huidige week (week ${CURRENT_WEEK})`;
    if (dagenPerActiviteit.size === 0) {
      return `${header}\nNog niets ingepland deze week`;
    }

    const regels: string[] = [];
    for (const a of activiteiten) {
      const n = dagenPerActiviteit.get(a.id);
      if (!n) continue;
      const cap =
        a.capaciteit_type === "schakel"
          ? " (schakel)"
          : a.capaciteit_type === "montage"
          ? " (montage)"
          : "";
      regels.push(`• ${a.naam}${cap} — ${n} ${n === 1 ? "dag" : "dagen"}`);
    }
    return `${header}\nGepland deze week:\n${regels.join("\n")}`;
  }, [project?.jaar, weken, cellen, activiteiten]);

  const openCel = useMemo(() => {
    if (!openCellKey) return null;
    const cel = cellen.get(openCellKey);
    if (!cel) return null;
    const a = activiteiten.find((x) => x.id === cel.activiteit_id) ?? null;
    const w = weken.find((x) => x.id === cel.week_id) ?? null;
    return { cel, activiteit: a, week: w };
  }, [openCellKey, cellen, activiteiten, weken]);

  /* ----------------------------- empty / no project ----------------------------- */
  if (!projectId) {
    return (
      <div className="surface-card flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CalendarDays className="h-7 w-7" strokeWidth={2} />
        </div>
        <h3 className="font-display text-lg font-bold text-foreground">
          Selecteer een project om te beginnen
        </h3>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          Open een project vanuit de projectenlijst om de planning te bekijken
        </p>
        <Button
          onClick={() => navigate("/")}
          className="mt-6 font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Naar projecten
        </Button>
      </div>
    );
  }

  if (loading || !project) {
    return (
      <div className="surface-card px-6 py-16 text-center text-sm text-muted-foreground">
        Planning laden…
      </div>
    );
  }

  const totalGridWidth = weken.length * 5 * CELL_W;

  return (
    <div className="-mx-8 -my-8">
      {/* Project info bar (sticky) */}
      <div
        className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b px-8 py-3"
        style={{
          backgroundColor: "rgba(10, 26, 48, 0.85)",
          borderColor: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            title="Terug naar projecten"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="font-display text-xl font-extrabold text-primary">
            {project.case_nummer || "—"}
          </div>
          <div className="font-display text-sm font-semibold text-foreground">
            {project.station_naam || ""}
          </div>
          {project.tijdelijke_situatie && project.tijdelijke_situatie !== "geen" && (
            <span className="inline-flex items-center rounded-md border border-white/15 px-2 py-0.5 text-[11px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
              {project.tijdelijke_situatie}
            </span>
          )}
          {(project.gsu_datum || project.geu_datum) && (() => {
            const fmt = (d: string | null) => {
              if (!d) return "—";
              const dt = new Date(d);
              if (isNaN(dt.getTime())) return "—";
              return dt.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "2-digit" });
            };
            return (
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-display font-medium text-muted-foreground/80"
                title="GSU – GEU"
              >
                <span className="opacity-60">GSU</span>
                <span className="text-foreground/80">{fmt(project.gsu_datum)}</span>
                <span className="opacity-40">→</span>
                <span className="opacity-60">GEU</span>
                <span className="text-foreground/80">{fmt(project.geu_datum)}</span>
              </span>
            );
          })()}
          {project.status && (
            <span
              className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-display font-semibold"
              style={{
                backgroundColor:
                  project.status === "in_uitvoering"
                    ? "#3fff8b"
                    : project.status === "gepland"
                    ? "#feb300"
                    : "rgba(255,255,255,0.08)",
                color:
                  project.status === "in_uitvoering" || project.status === "gepland"
                    ? "#0a1a30"
                    : "rgba(255,255,255,0.6)",
              }}
            >
              {project.status === "in_uitvoering"
                ? "In uitvoering"
                : project.status === "gepland"
                ? "Gepland"
                : project.status === "afgerond"
                ? "Afgerond"
                : "Concept"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length === 0}
            title="Ongedaan maken (Ctrl+Z)"
            className={[
              "flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-transparent",
              history.length === 0
                ? "cursor-not-allowed opacity-30"
                : "text-foreground hover:bg-white/[0.06]",
            ].join(" ")}
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            title="Geschiedenis"
            className="flex h-8 items-center justify-center rounded-md border border-white/15 bg-transparent px-2 text-foreground hover:bg-white/[0.06]"
          >
            <History className="h-4 w-4" />
            {history.length > 0 && (
              <span className="ml-1 font-display text-xs font-semibold">
                {history.length}
              </span>
            )}
          </button>
          {/* divider */}
          <span
            aria-hidden
            className="inline-block"
            style={{
              width: 1,
              height: 20,
              backgroundColor: "rgba(255,255,255,0.08)",
              marginInline: 2,
            }}
          />
          <button
            type="button"
            onClick={() => setWeekModalOpen(true)}
            title="Weken beheren"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-transparent text-foreground hover:bg-white/[0.06]"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={exportExcel}
            title="Exporteer naar Excel"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-transparent text-foreground hover:bg-white/[0.06]"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            title="Afdrukken"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-transparent text-foreground hover:bg-white/[0.06]"
          >
            <Printer className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Planning grid */}
      <div className="px-8 py-6">
        <div
          className="surface-card overflow-hidden"
          style={{ padding: 0 }}
        >
          {/* Header row */}
          <div className="flex border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <div
              className="shrink-0 px-4 flex items-center"
              style={{
                width: SIDEBAR_W,
                height: HEADER_H,
                borderRight: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span className="font-display text-[10px] font-bold uppercase tracking-[0.15em] text-primary/80">
                Activiteiten
              </span>
            </div>
            <div
              ref={headerScrollRef}
              onScroll={(e) => syncScroll("header", (e.target as HTMLDivElement).scrollLeft)}
              className="overflow-x-auto overflow-y-hidden flex-1 no-scrollbar"
              style={{ height: HEADER_H }}
            >
              <div className="flex" style={{ width: totalGridWidth, height: HEADER_H }}>
                {weken.map((w) => (
                  <WeekHeader
                    key={w.id}
                    week={w}
                    jaar={project.jaar ?? new Date().getFullYear()}
                    onWeekChange={(nr) => setWeekNr(w.id, nr)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex">
            {/* Sidebar (frozen) */}
            <div
              className="shrink-0"
              style={{ width: SIDEBAR_W, borderRight: "1px solid rgba(255,255,255,0.06)" }}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleActiviteitDragEnd}
              >
                <SortableContext
                  items={activiteiten.map((a) => a.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {activiteiten.map((a) => (
                    <SidebarRow key={a.id} a={a} onRemove={() => removeActiviteit(a.id)} />
                  ))}
                </SortableContext>
              </DndContext>

              {/* Add activiteit */}
              <div style={{ minHeight: CELL_H }}>
                {showAddActiviteit ? (
                  <div className="px-3 py-2 space-y-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <Select onValueChange={addActiviteitFromType}>
                      <SelectTrigger className="h-8 rounded-md border-white/10 bg-white/[0.04] text-xs">
                        <SelectValue placeholder="Kies activiteit…" />
                      </SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#0a1a30] text-foreground">
                        {activiteitTypes.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.naam}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => setShowAddActiviteit(false)}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Annuleren
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddActiviteit(true)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-display font-semibold text-primary/80 hover:bg-white/[0.04] hover:text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Activiteit toevoegen
                  </button>
                )}
              </div>

              {/* Opmerkingen label */}
              <div
                className="px-4 flex items-center border-t"
                style={{ height: CELL_H, borderColor: "rgba(255,255,255,0.06)" }}
              >
                <span className="font-display text-[10px] font-bold uppercase tracking-[0.15em] text-primary/80">
                  Opmerkingen
                </span>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-hidden">
              <div
                ref={bodyScrollRef}
                onScroll={(e) => syncScroll("body", (e.target as HTMLDivElement).scrollLeft)}
                className="overflow-x-auto overflow-y-hidden"
              >
                <div style={{ width: totalGridWidth }}>
                  {activiteiten.map((a) => (
                    <GridRow
                      key={a.id}
                      activiteit={a}
                      weken={weken}
                      jaar={project.jaar ?? new Date().getFullYear()}
                      cellen={cellen}
                      celMonteurs={celMonteurs}
                      monteurById={monteurById}
                      highlightedMonteurId={highlightedMonteurId}
                      currentWeekTooltip={currentWeekTooltip}
                      onClick={handleCellClick}
                      onRightClick={handleCellRightClick}
                    />
                  ))}
                  {/* spacer to align with the "+ Activiteit toevoegen" row in sidebar */}
                  <div style={{ height: showAddActiviteit ? 80 : CELL_H }} />

                  {/* Opmerkingen row — inside same scroll container as activity rows */}
                  <div
                    className="flex border-t"
                    style={{
                      width: totalGridWidth,
                      height: CELL_H,
                      borderColor: "rgba(255,255,255,0.06)",
                    }}
                  >
                    {weken.map((w) => (
                      <OpmerkingCell
                        key={w.id}
                        week={w}
                        onSave={(val) => updateWeekOpmerking(w.id, val)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ingeplande monteurs balk — compacte horizontale balk */}
      <div
        style={{
          marginTop: 8,
          padding: "10px 16px",
          background: "rgba(10, 26, 48, 0.6)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {/* Left: label + count */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="font-display"
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "rgba(63,255,139,0.6)",
            }}
          >
            Ingeplande monteurs
          </span>
          <span
            className="font-display"
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 8px",
              borderRadius: 999,
              backgroundColor: "rgba(63,255,139,0.15)",
              color: "#3fff8b",
            }}
          >
            {ingeplandeMonteurs.length}
          </span>
        </div>

        {/* Divider */}
        <span
          aria-hidden
          style={{
            width: 1,
            height: 20,
            backgroundColor: "rgba(255,255,255,0.08)",
            marginLeft: 4,
            marginRight: 4,
            display: "inline-block",
          }}
        />

        {/* Monteur chips of empty state */}
        {ingeplandeMonteurs.length === 0 ? (
          <span
            className="text-muted-foreground"
            style={{ fontSize: 12, fontStyle: "italic" }}
          >
            Nog geen monteurs ingepland
          </span>
        ) : (
          ingeplandeMonteurs.map((m) => {
            const isSchakel = m.type === "schakelmonteur";
            const avatarBg = isSchakel ? "#feb300" : "#378add";
            const avatarColor = isSchakel ? "#0a1a30" : "#ffffff";
            const isConcept = project?.status === "concept";
            const accent = isSchakel ? "254,179,0" : "55,138,221";
            const ms = m.aanwijzing_ms;
            let msStyle: React.CSSProperties | null = null;
            if (ms === "AVP") msStyle = { backgroundColor: "#3fff8b", color: "#0a1a30" };
            else if (ms === "VP") msStyle = { backgroundColor: "#7cc1ff", color: "#0a1a30" };
            else if (ms === "VOP")
              msStyle = { backgroundColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" };
            return (
              <div
                key={m.id}
                title={isConcept ? `${m.naam} — concept-reservering` : m.naam}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: isConcept
                    ? `rgba(${accent},0.06)`
                    : "rgba(255,255,255,0.04)",
                  border: isConcept
                    ? `1.5px dashed rgba(${accent},0.7)`
                    : "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  padding: "4px 10px 4px 4px",
                  cursor: "default",
                  position: "relative",
                }}
              >
                <span
                  className="font-display"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: isConcept ? "transparent" : avatarBg,
                    color: isConcept ? avatarBg : avatarColor,
                    border: isConcept
                      ? `1.5px dashed ${avatarBg}`
                      : "none",
                    fontSize: 8,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {initialen(m.naam)}
                </span>
                <span
                  className="font-display"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isConcept ? avatarBg : "#ffffff",
                  }}
                >
                  {m.naam}
                </span>
                {isConcept && (
                  <span
                    className="font-display"
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      padding: "1px 5px",
                      borderRadius: 3,
                      border: `1px dashed rgba(${accent},0.6)`,
                      color: avatarBg,
                    }}
                  >
                    Concept
                  </span>
                )}
                {ms && msStyle && (
                  <span
                    className="font-display"
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "1px 5px",
                      borderRadius: 4,
                      ...msStyle,
                    }}
                  >
                    {ms}
                  </span>
                )}
              </div>
            );
          })
        )}

        {/* Right: legend */}
        <div className="ml-auto flex items-center" style={{ gap: 12 }}>
          <span
            aria-hidden
            style={{
              width: 1,
              height: 20,
              backgroundColor: "rgba(255,255,255,0.08)",
              display: "inline-block",
            }}
          />
          <span
            className="text-muted-foreground"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10 }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#feb300",
                display: "inline-block",
              }}
            />
            Schakel
          </span>
          <span
            className="text-muted-foreground"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10 }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#378add",
                display: "inline-block",
              }}
            />
            Montage
          </span>
          <span
            className="text-muted-foreground"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 10,
            }}
            title="Concept-reservering: nog niet definitief ingepland. Wordt definitief zodra het project status 'gepland' krijgt of de concept-planning wordt uitgerold."
          >
            <span
              aria-hidden
              style={{
                width: 14,
                height: 10,
                borderRadius: 3,
                border: "1.5px dashed rgba(255,255,255,0.55)",
                background: "transparent",
                display: "inline-block",
              }}
            />
            Concept-reservering
          </span>
        </div>
      </div>

      {openCel?.cel && openCel.activiteit && openCel.week && (
        <CelModal
          open={!!openCellKey}
          onClose={() => setOpenCellKey(null)}
          cel={openCel.cel}
          activiteit={openCel.activiteit}
          week={openCel.week}
          monteurs={monteurs}
          monteurIdsAssigned={celMonteurs.get(openCel.cel.id) ?? []}
          monteurById={monteurById}
          template={
            openCel.activiteit.activiteit_type_id
              ? activiteitTypes.find(
                  (t) => t.id === openCel.activiteit!.activiteit_type_id
                ) ?? null
              : null
          }
          onColorChange={(c) => updateCellColor(openCel.cel, c)}
          onNotitieChange={(n) => updateCellNotitie(openCel.cel, n)}
          onAddMonteur={(id) => addMonteurToCell(openCel.cel, id)}
          onRemoveMonteur={(id) => removeMonteurFromCell(openCel.cel, id)}
          onSyncFromTemplate={() => syncActiviteitFromTemplate(openCel.activiteit!.id)}
        />
      )}

      {/* History panel */}
      {historyOpen && (
        <HistoryPanel
          history={history}
          activiteiten={activiteiten}
          monteurById={monteurById}
          weken={weken}
          onClose={() => setHistoryOpen(false)}
          onClear={() => setHistory([])}
          onUndoEntry={handleUndoEntry}
        />
      )}

      {/* Week mgmt modal */}
      <Dialog open={weekModalOpen} onOpenChange={setWeekModalOpen}>
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
              Weken beheren
            </h2>
            <button
              onClick={() => setWeekModalOpen(false)}
              className="-mr-2 -mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Sluiten
            </button>
          </div>
          <div className="space-y-3 px-6 py-6 max-h-[60vh] overflow-y-auto">
            {weken.length === 0 && (
              <div className="text-sm text-muted-foreground">Nog geen weken.</div>
            )}
            {weken.map((w, i) => (
              <div
                key={w.id}
                className="flex items-center gap-3 rounded-md bg-white/[0.03] px-3 py-2"
              >
                <span className="font-display text-xs uppercase tracking-wider text-muted-foreground w-12">
                  Pos {i + 1}
                </span>
                <Label className="font-display text-xs text-muted-foreground">Week</Label>
                <Input
                  type="number"
                  min={1}
                  max={53}
                  value={w.week_nr}
                  onChange={(e) => setWeekNr(w.id, parseInt(e.target.value) || 1)}
                  className="h-8 w-20 rounded-md border-white/10 bg-white/[0.04] text-foreground"
                />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={addWeek}
                className="flex-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-display font-bold"
              >
                <Plus className="mr-1 h-4 w-4" /> Week toevoegen rechts
              </Button>
              <Button
                onClick={removeLastWeek}
                variant="outline"
                disabled={weken.length === 0}
                className="rounded-md border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-1 h-4 w-4" /> Laatste
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ----------------------------- Sub components ----------------------------- */

const WeekHeader = memo(function WeekHeader({
  week,
  jaar,
  onWeekChange,
}: {
  week: Week;
  jaar: number;
  onWeekChange: (nr: number) => void;
}) {
  const monday = getMondayOfWeek(week.week_nr, jaar);
  const dayWidth = CELL_W * 5;
  const isCurrentWeek = week.week_nr === CURRENT_WEEK && jaar === CURRENT_YEAR;
  return (
    <div
      className="shrink-0 flex flex-col"
      style={{
        width: dayWidth,
        borderRight: "1px solid rgba(255,255,255,0.06)",
        backgroundColor: isCurrentWeek ? "rgba(63,255,139,0.04)" : undefined,
      }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={[
              "flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-display font-bold uppercase tracking-wider hover:text-foreground",
              isCurrentWeek ? "" : "text-muted-foreground",
            ].join(" ")}
            style={isCurrentWeek ? { color: "#3fff8b" } : undefined}
          >
            Week {week.week_nr}
            {isCurrentWeek && (
              <span
                style={{
                  background: "rgba(63,255,139,0.2)",
                  color: "#3fff8b",
                  fontSize: "9px",
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: "999px",
                  marginLeft: "6px",
                }}
              >
                Nu
              </span>
            )}
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          className="border-white/10 bg-[#0a1a30] text-foreground max-h-72 overflow-y-auto"
        >
          {Array.from({ length: 53 }, (_, i) => i + 1).map((n) => (
            <DropdownMenuItem
              key={n}
              onSelect={() => onWeekChange(n)}
              className="cursor-pointer focus:bg-primary/15 focus:text-primary text-xs"
            >
              Week {n}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex flex-1">
        {DAG_LABELS.map((d, i) => {
          const date = new Date(monday);
          date.setDate(monday.getDate() + i);
          return (
            <div
              key={d}
              className="flex flex-col items-center justify-center"
              style={{
                width: CELL_W,
                borderRight:
                  i < 4 ? "1px solid rgba(255,255,255,0.04)" : undefined,
              }}
            >
              <div className="font-display text-[10px] font-bold tracking-wider text-foreground/80">
                {d}
              </div>
              <div className="text-[9px] text-muted-foreground">{formatDate(date)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const SidebarRow = ({ a, onRemove }: { a: Activiteit; onRemove: () => void }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: a.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    height: CELL_H,
    borderTop: "1px solid rgba(255,255,255,0.06)",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 px-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-100 cursor-grab touch-none p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex-1 truncate font-display text-[13px] font-semibold text-foreground">
        {a.naam}
      </div>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
        title="Verwijderen"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

interface GridRowProps {
  activiteit: Activiteit;
  weken: Week[];
  jaar: number;
  cellen: CelMap;
  celMonteurs: CelMonteurMap;
  monteurById: Map<string, Monteur>;
  highlightedMonteurId: string | null;
  currentWeekTooltip: string | null;
  onClick: (a: Activiteit, week_id: string, dag_index: number) => void;
  onRightClick: (
    e: ReactMouseEvent,
    activiteit_id: string,
    week_id: string,
    dag_index: number
  ) => void;
}

const GridRow = memo(function GridRow({
  activiteit,
  weken,
  jaar,
  cellen,
  celMonteurs,
  monteurById,
  highlightedMonteurId,
  currentWeekTooltip,
  onClick,
  onRightClick,
}: GridRowProps) {
  return (
    <div
      className="flex"
      style={{
        height: CELL_H,
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {weken.map((w) => {
        const isCurrentWeek = w.week_nr === CURRENT_WEEK && jaar === CURRENT_YEAR;
        return DAG_LABELS.map((_, d) => {
          const cel = cellen.get(cellKey(activiteit.id, w.id, d));
          const monteurIds = cel ? celMonteurs.get(cel.id) ?? [] : [];
          const isHighlighted =
            highlightedMonteurId !== null &&
            monteurIds.includes(highlightedMonteurId);
          const highlightColor = isHighlighted
            ? monteurById.get(highlightedMonteurId!)?.type === "schakelmonteur"
              ? "#feb300"
              : "#378add"
            : null;
          return (
            <CellBox
              key={`${w.id}-${d}`}
              cel={cel}
              activiteit={activiteit}
              monteurIds={monteurIds}
              monteurById={monteurById}
              isCurrentWeek={isCurrentWeek}
              isHighlighted={isHighlighted}
              highlightColor={highlightColor}
              isDimmed={highlightedMonteurId !== null && !isHighlighted}
              currentWeekTooltip={isCurrentWeek ? currentWeekTooltip : null}
              onClick={() => onClick(activiteit, w.id, d)}
              onContextMenu={(e) => onRightClick(e, activiteit.id, w.id, d)}
            />
          );
        });
      })}
    </div>
  );
});

const MonteurAvatar = ({
  naam,
  type,
  overflow,
  size = 20,
  fontSize = 7,
  overlap = false,
  overlapPx = 5,
  borderWidth = 1.5,
  borderColor = "rgba(0,0,0,0.3)",
  overflowBg = "rgba(255,255,255,0.2)",
}: {
  naam?: string;
  type?: "schakelmonteur" | "montagemonteur";
  overflow?: number;
  size?: number;
  fontSize?: number;
  overlap?: boolean;
  overlapPx?: number;
  borderWidth?: number;
  borderColor?: string;
  overflowBg?: string;
}) => {
  let bg = overflowBg;
  let color = "white";
  let label = "";
  if (overflow != null) {
    label = `+${overflow}`;
  } else if (type === "schakelmonteur") {
    bg = "#feb300";
    color = "#0a1a30";
    label = initialen(naam ?? "");
  } else {
    bg = "#378add";
    color = "white";
    label = initialen(naam ?? "");
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: bg,
        color,
        border: `${borderWidth}px solid ${borderColor}`,
        marginLeft: overlap ? -overlapPx : 0,
        fontSize,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
        flexShrink: 0,
      }}
      className="font-display"
    >
      {label}
    </span>
  );
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const CellBox = memo(function CellBox({
  cel,
  activiteit,
  monteurIds,
  monteurById,
  isCurrentWeek = false,
  isHighlighted = false,
  highlightColor = null,
  isDimmed = false,
  currentWeekTooltip = null,
  onClick,
  onContextMenu,
}: {
  cel: Cel | undefined;
  activiteit: Activiteit;
  monteurIds: string[];
  monteurById: Map<string, Monteur>;
  isCurrentWeek?: boolean;
  isHighlighted?: boolean;
  highlightColor?: string | null;
  isDimmed?: boolean;
  currentWeekTooltip?: string | null;
  onClick: () => void;
  onContextMenu: (e: ReactMouseEvent) => void;
}) {
  const kleur = cel?.kleur_code ? COLOR_MAP[cel.kleur_code]?.hex : null;
  const isCap =
    activiteit.capaciteit_type === "schakel" || activiteit.capaciteit_type === "montage";

  let voldoet = true;
  let warningReason: string | null = null;
  let warningDetails: string | null = null;
  if (cel && isCap) {
    const monteursForCheck = monteurIds
      .map((id) => monteurById.get(id))
      .filter((m): m is Monteur => !!m && !!m.aanwijzing_ls && !!m.aanwijzing_ms)
      .map((m) => ({
        aanwijzing_ls: m.aanwijzing_ls as Aanwijzing,
        aanwijzing_ms: m.aanwijzing_ms as Aanwijzing,
      }));
    const minTotaal = activiteit.min_personen_totaal ?? activiteit.min_personen ?? 1;
    const minGek =
      activiteit.min_personen_gekwalificeerd ?? activiteit.min_personen ?? 1;
    const res = checkCelVoldoet({
      monteurs: monteursForCheck,
      min_personen_totaal: minTotaal,
      min_personen_gekwalificeerd: minGek,
      min_aanwijzing_ls: activiteit.min_aanwijzing_ls,
      min_aanwijzing_ms: activiteit.min_aanwijzing_ms,
      discipline:
        activiteit.capaciteit_type === "schakel"
          ? "beide"
          : activiteit.capaciteit_type === "montage"
          ? "beide"
          : "beide",
    });
    voldoet = res.voldoet;
    warningReason = res.reden;

    if (!voldoet) {
      // Bouw uitgebreide uitleg: alle eisen + huidige stand per regel
      const aantal = monteursForCheck.length;
      const lines: string[] = [];
      lines.push(`⚠ Cel voldoet niet aan de eisen`);
      lines.push("");
      lines.push(`Vereist:`);
      lines.push(`• Min. ${minTotaal} ${minTotaal === 1 ? "persoon" : "personen"} totaal`);
      if (activiteit.min_aanwijzing_ls) {
        lines.push(
          `• Min. ${minGek} met LS ${activiteit.min_aanwijzing_ls} of hoger`
        );
      }
      if (activiteit.min_aanwijzing_ms) {
        lines.push(
          `• Min. ${minGek} met MS ${activiteit.min_aanwijzing_ms} of hoger`
        );
      }
      lines.push("");
      lines.push(`Huidige stand:`);
      lines.push(`• ${aantal} ${aantal === 1 ? "persoon" : "personen"} ingepland`);
      if (activiteit.min_aanwijzing_ls) {
        const okLs = monteursForCheck.filter((m) =>
          voldoetAanwijzing(m.aanwijzing_ls, activiteit.min_aanwijzing_ls as Aanwijzing)
        ).length;
        lines.push(`• ${okLs} met LS ${activiteit.min_aanwijzing_ls}+`);
      }
      if (activiteit.min_aanwijzing_ms) {
        const okMs = monteursForCheck.filter((m) =>
          voldoetAanwijzing(m.aanwijzing_ms, activiteit.min_aanwijzing_ms as Aanwijzing)
        ).length;
        lines.push(`• ${okMs} met MS ${activiteit.min_aanwijzing_ms}+`);
      }
      warningDetails = lines.join("\n");
    }
  }

  const assignedMonteurs = monteurIds
    .map((id) => monteurById.get(id))
    .filter((m): m is Monteur => !!m);
  const showAvatars = isCap && cel?.kleur_code != null && assignedMonteurs.length > 0;

  // Build hover title: kleur naam + monteur namen
  const namen = assignedMonteurs.map((m) => m.naam).join(", ");
  const kleurNaam = cel?.kleur_code ? COLOR_MAP[cel.kleur_code]?.naam : null;
  let hoverTitle: string | undefined;
  if (warningDetails) {
    hoverTitle = namen ? `${warningDetails}\n\nIngepland: ${namen}` : warningDetails;
  } else if (warningReason) {
    hoverTitle = warningReason;
  } else if (kleurNaam && namen) {
    hoverTitle = `${kleurNaam} — ${namen}`;
  } else if (kleurNaam) {
    hoverTitle = kleurNaam;
  } else if (namen) {
    hoverTitle = namen;
  } else if (isCurrentWeek && !cel?.kleur_code && currentWeekTooltip) {
    // Lege cel in de huidige (groen getinte) week: leg uit waarom de tint er is
    // en toon wat er deze week wel gepland staat.
    hoverTitle = currentWeekTooltip;
  }

  const visibleAvatars = assignedMonteurs.slice(0, 2);
  const overflow = assignedMonteurs.length - visibleAvatars.length;

  const isGeen = activiteit.capaciteit_type === "geen";
  const filled = !!kleur;
  const showHoverPlus = !filled && !isGeen;

  // Highlight ring (inset boxShadow) wanneer deze cel een geselecteerde monteur bevat.
  // Dim de overige gevulde cellen zodat de highlight extra opvalt.
  const highlightShadow =
    isHighlighted && highlightColor
      ? `inset 0 0 0 2px ${highlightColor}, 0 0 12px ${highlightColor}80`
      : undefined;

  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={hoverTitle}
      className={[
        "group relative shrink-0 transition-all",
        showHoverPlus ? "hover:bg-white/[0.03]" : "",
      ].join(" ")}
      style={{
        width: CELL_W,
        height: CELL_H,
        backgroundColor: filled
          ? hexToRgba(kleur!, isHighlighted ? 0.55 : 0.35)
          : isCurrentWeek
          ? "rgba(63,255,139,0.02)"
          : "transparent",
        borderTop: filled ? "none" : "1px solid rgba(255,255,255,0.06)",
        borderRight: filled ? "none" : "1px solid rgba(255,255,255,0.06)",
        borderBottom: filled ? "none" : "1px solid rgba(255,255,255,0.06)",
        borderLeft: filled
          ? `3px solid ${kleur}`
          : "1px solid rgba(255,255,255,0.06)",
        outline: filled && !voldoet ? "2px solid #feb300" : undefined,
        outlineOffset: filled && !voldoet ? "-2px" : undefined,
        boxShadow: highlightShadow,
        opacity: isDimmed && filled ? 0.35 : 1,
        zIndex: isHighlighted ? 2 : undefined,
      }}
    >
      {showAvatars && (
        <div className="flex h-full w-full items-center justify-center">
          {visibleAvatars.map((m, idx) => (
            <MonteurAvatar
              key={m.id}
              naam={m.naam}
              type={m.type}
              size={26}
              fontSize={8}
              overlap={idx > 0}
              overlapPx={8}
              borderWidth={2}
              borderColor="rgba(0,0,0,0.4)"
            />
          ))}
          {overflow > 0 && (
            <MonteurAvatar
              overflow={overflow}
              size={26}
              fontSize={8}
              overlap
              overlapPx={8}
              borderWidth={2}
              borderColor="rgba(0,0,0,0.4)"
              overflowBg="rgba(255,255,255,0.15)"
            />
          )}
        </div>
      )}
      {showHoverPlus && (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-[16px] opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: "rgba(255,255,255,0.2)" }}
        >
          +
        </span>
      )}
      {!voldoet && cel && (
        <span
          className="absolute right-0.5 top-0.5 flex items-center justify-center rounded-full text-[8px] font-bold"
          style={{
            width: 14,
            height: 14,
            backgroundColor: "#feb300",
            color: "#0a1a30",
          }}
        >
          !
        </span>
      )}
    </button>
  );
});

const OpmerkingCell = ({
  week,
  onSave,
}: {
  week: Week;
  onSave: (val: string) => void;
}) => {
  const [val, setVal] = useState(week.opmerking ?? "");
  useEffect(() => {
    setVal(week.opmerking ?? "");
  }, [week.opmerking]);
  return (
    <div
      className="shrink-0 px-1 py-1"
      style={{
        width: CELL_W * 5,
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          if (val !== (week.opmerking ?? "")) onSave(val);
        }}
        placeholder={`Opmerking week ${week.week_nr}…`}
        className="h-7 w-full rounded-sm bg-transparent px-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:bg-white/[0.04] focus:outline-none"
      />
    </div>
  );
};

/* ----------------------------- Cel modal ----------------------------- */

const DAG_NAMEN = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"];

interface CelModalProps {
  open: boolean;
  onClose: () => void;
  cel: Cel;
  activiteit: Activiteit;
  week: Week;
  monteurs: Monteur[];
  monteurIdsAssigned: string[];
  monteurById: Map<string, Monteur>;
  template: ActiviteitTypeOption | null;
  onColorChange: (c: string) => void;
  onNotitieChange: (n: string) => void;
  onAddMonteur: (id: string) => void;
  onRemoveMonteur: (id: string) => void;
  onSyncFromTemplate: () => void;
}

const CelModal = ({
  open,
  onClose,
  cel,
  activiteit,
  week,
  monteurs,
  monteurIdsAssigned,
  monteurById,
  template,
  onColorChange,
  onNotitieChange,
  onAddMonteur,
  onRemoveMonteur,
  onSyncFromTemplate,
}: CelModalProps) => {
  const [notitie, setNotitie] = useState(cel.notitie ?? "");
  useEffect(() => {
    setNotitie(cel.notitie ?? "");
  }, [cel.id, cel.notitie]);

  const isCap =
    activiteit.capaciteit_type === "schakel" || activiteit.capaciteit_type === "montage";

  const assigned = monteurIdsAssigned
    .map((id) => monteurById.get(id))
    .filter((m): m is Monteur => !!m);

  const eligibleMonteurs = useMemo(() => {
    return monteurs.filter((m) => {
      if (monteurIdsAssigned.includes(m.id)) return false;
      if (activiteit.capaciteit_type === "schakel") return m.type === "schakelmonteur";
      if (activiteit.capaciteit_type === "montage") return true; // both types can do montage
      return false;
    });
  }, [monteurs, monteurIdsAssigned, activiteit.capaciteit_type]);

  const check = checkCelVoldoet({
    monteurs: assigned
      .filter((m) => m.aanwijzing_ls && m.aanwijzing_ms)
      .map((m) => ({
        aanwijzing_ls: m.aanwijzing_ls as Aanwijzing,
        aanwijzing_ms: m.aanwijzing_ms as Aanwijzing,
      })),
    min_personen_totaal: activiteit.min_personen_totaal ?? activiteit.min_personen ?? 1,
    min_personen_gekwalificeerd:
      activiteit.min_personen_gekwalificeerd ?? activiteit.min_personen ?? 1,
    min_aanwijzing_ls: activiteit.min_aanwijzing_ls,
    min_aanwijzing_ms: activiteit.min_aanwijzing_ms,
    discipline: "beide",
  });

  const vereistAanwijzing =
    activiteit.min_aanwijzing_ms ?? activiteit.min_aanwijzing_ls ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-lg gap-0 border-0 p-0 [&>button]:hidden"
        style={{
          backgroundColor: "rgba(10, 26, 48, 0.95)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "12px",
          backdropFilter: "blur(18px)",
        }}
      >
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
              {activiteit.naam}
            </h2>
            <div className="text-xs text-muted-foreground mt-0.5">
              {DAG_NAMEN[cel.dag_index]} — Week {week.week_nr}
            </div>
          </div>
          <button
            onClick={onClose}
            className="-mr-2 -mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Sluiten
          </button>
        </div>

        <div className="space-y-5 px-6 py-6 max-h-[70vh] overflow-y-auto">
          {/* Kleur */}
          <div className="space-y-2">
            <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Kleur
            </Label>
            <div className="grid grid-cols-6 gap-2.5">
              {COLOR_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => onColorChange(code)}
                  title={COLOR_MAP[code].naam}
                  className={[
                    "relative h-9 w-9 rounded-full transition-transform hover:scale-110",
                    cel.kleur_code === code
                      ? "ring-2 ring-white ring-offset-2 ring-offset-[#0a1a30]"
                      : "",
                  ].join(" ")}
                  style={{ backgroundColor: COLOR_MAP[code].hex }}
                />
              ))}
            </div>
          </div>

          {/* Monteurs */}
          {isCap && (
            <div className="space-y-2">
              {(() => {
                const tplTotaal =
                  template?.min_personen_totaal ?? template?.min_personen ?? null;
                const tplGek =
                  template?.min_personen_gekwalificeerd ?? template?.min_personen ?? null;
                const tplLs = template?.min_aanwijzing_ls ?? null;
                const tplMs = template?.min_aanwijzing_ms ?? null;
                const projTotaal =
                  activiteit.min_personen_totaal ?? activiteit.min_personen ?? null;
                const projGek =
                  activiteit.min_personen_gekwalificeerd ?? activiteit.min_personen ?? null;
                const afwijkt =
                  !!template &&
                  (tplTotaal !== projTotaal ||
                    tplGek !== projGek ||
                    tplLs !== activiteit.min_aanwijzing_ls ||
                    tplMs !== activiteit.min_aanwijzing_ms);
                return (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Monteurs
                      </Label>
                      <span className="text-[11px] font-display font-semibold text-muted-foreground">
                        min. {activiteit.min_personen_totaal ?? 1} man ·{" "}
                        {activiteit.min_personen_gekwalificeerd ?? 1} gekwal.
                        {vereistAanwijzing ? ` ${vereistAanwijzing}+` : ""}
                      </span>
                    </div>
                    {afwijkt && (
                      <div
                        className="flex items-start justify-between gap-3 rounded-md px-3 py-2"
                        style={{
                          background: "rgba(255,176,32,0.08)",
                          border: "1px solid rgba(255,176,32,0.25)",
                        }}
                      >
                        <div className="text-[11px] leading-snug text-foreground/90">
                          <div className="font-display font-semibold text-[#ffb020]">
                            Wijkt af van template
                          </div>
                          <div className="text-muted-foreground">
                            Template: min. {tplTotaal ?? 1} man · {tplGek ?? 1} gekwal.
                            {tplLs ? ` · LS ${tplLs}+` : ""}
                            {tplMs ? ` · MS ${tplMs}+` : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={onSyncFromTemplate}
                          className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-display font-bold transition-colors"
                          style={{
                            background: "#3fff8b",
                            color: "#030e20",
                          }}
                        >
                          Sync vanuit template
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="space-y-1.5">
                {assigned.length === 0 && (
                  <div className="rounded-md bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
                    Nog geen monteurs toegewezen
                  </div>
                )}
                {assigned.map((m) => {
                  const okLs =
                    !activiteit.min_aanwijzing_ls ||
                    (m.aanwijzing_ls
                      ? rankAanwijzing(m.aanwijzing_ls) >=
                        rankAanwijzing(activiteit.min_aanwijzing_ls)
                      : false);
                  const okMs =
                    !activiteit.min_aanwijzing_ms ||
                    (m.aanwijzing_ms
                      ? rankAanwijzing(m.aanwijzing_ms) >=
                        rankAanwijzing(activiteit.min_aanwijzing_ms)
                      : false);
                  const ok = okLs && okMs;
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 rounded-md bg-white/[0.03] px-3 py-2"
                    >
                      <MonteurAvatar
                        naam={m.naam}
                        type={m.type}
                        size={32}
                        fontSize={11}
                      />
                      <div className="flex-1 font-display text-sm font-semibold text-foreground">
                        {m.naam}
                      </div>
                      {m.aanwijzing_ls && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-display font-bold"
                          style={aanwijzingPillStyle(m.aanwijzing_ls)}
                        >
                          LS {m.aanwijzing_ls}
                        </span>
                      )}
                      {m.aanwijzing_ms && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-display font-bold"
                          style={aanwijzingPillStyle(m.aanwijzing_ms)}
                        >
                          MS {m.aanwijzing_ms}
                        </span>
                      )}
                      {ok ? (
                        <Check className="h-4 w-4 text-primary" strokeWidth={2.5} />
                      ) : (
                        <span className="text-warning text-xs font-bold">!</span>
                      )}
                      <button
                        onClick={() => onRemoveMonteur(m.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {eligibleMonteurs.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-white/15 px-3 py-2 text-xs font-display font-semibold text-muted-foreground hover:bg-white/[0.04] hover:text-foreground">
                      <Plus className="h-3.5 w-3.5" /> Monteur toevoegen
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-[360px] border-white/10 bg-[#0a1a30] text-foreground max-h-72 overflow-y-auto"
                  >
                    {eligibleMonteurs.map((m) => (
                      <DropdownMenuItem
                        key={m.id}
                        onSelect={() => onAddMonteur(m.id)}
                        className="flex cursor-pointer items-center gap-2 focus:bg-primary/15"
                      >
                        <span className="font-display text-sm font-semibold flex-1">
                          {m.naam}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-display font-bold"
                          style={{
                            backgroundColor:
                              m.type === "schakelmonteur" ? "#feb300" : "#378add",
                            color: "#0a1a30",
                          }}
                        >
                          {m.type === "schakelmonteur" ? "Schakel" : "Montage"}
                        </span>
                        {m.aanwijzing_ls && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-display font-bold"
                            style={aanwijzingPillStyle(m.aanwijzing_ls)}
                          >
                            LS {m.aanwijzing_ls}
                          </span>
                        )}
                        {m.aanwijzing_ms && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-display font-bold"
                            style={aanwijzingPillStyle(m.aanwijzing_ms)}
                          >
                            MS {m.aanwijzing_ms}
                          </span>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Banner */}
              <div
                className="rounded-md px-3 py-2 text-xs font-display font-semibold"
                style={
                  check.voldoet
                    ? {
                        backgroundColor: "rgba(63,255,139,0.12)",
                        color: "#3fff8b",
                        border: "1px solid rgba(63,255,139,0.25)",
                      }
                    : {
                        backgroundColor: "rgba(254,179,0,0.12)",
                        color: "#feb300",
                        border: "1px solid rgba(254,179,0,0.3)",
                      }
                }
              >
                {check.voldoet
                  ? "Bezetting voldoet aan vereisten"
                  : check.reden ?? "Bezetting voldoet niet"}
              </div>
            </div>
          )}

          {/* Notitie */}
          <div className="space-y-2">
            <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notitie
            </Label>
            <Textarea
              value={notitie}
              onChange={(e) => setNotitie(e.target.value)}
              onBlur={() => {
                if (notitie !== (cel.notitie ?? "")) onNotitieChange(notitie);
              }}
              rows={2}
              placeholder="Notitie voor deze cel…"
              className="rounded-md border-white/10 bg-white/[0.04] text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-primary resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end px-6 pb-6">
          <Button
            onClick={onClose}
            className="rounded-md bg-white/[0.06] text-foreground hover:bg-white/[0.1] font-display font-semibold"
          >
            Sluiten
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ----------------------------- helpers ----------------------------- */

const aanwijzingPillStyle = (a: Aanwijzing): React.CSSProperties => {
  if (a === "AVP") return { backgroundColor: "#3fff8b", color: "#0a1a30" };
  if (a === "VP") return { backgroundColor: "#7cc1ff", color: "#0a1a30" };
  return { backgroundColor: "#cbd5e1", color: "#0a1a30" };
};

const rankAanwijzing = (a: Aanwijzing | null): number =>
  a === "AVP" ? 3 : a === "VP" ? 2 : a === "VOP" ? 1 : 0;

let sheetJsPromise: Promise<any> | null = null;
function loadSheetJS(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const w = window as unknown as { XLSX?: any };
  if (w.XLSX) return Promise.resolve(w.XLSX);
  if (sheetJsPromise) return sheetJsPromise;
  sheetJsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = () => {
      const xw = window as unknown as { XLSX?: any };
      if (xw.XLSX) resolve(xw.XLSX);
      else reject(new Error("XLSX not available"));
    };
    s.onerror = () => reject(new Error("Failed to load SheetJS"));
    document.head.appendChild(s);
  });
  return sheetJsPromise;
}

export default Plannen;

/* ----------------------------- History Panel ----------------------------- */

const dotColor = (type: HistoryEntry["type"]): string => {
  switch (type) {
    case "cel_created":
    case "monteur_added":
      return "#3fff8b";
    case "cel_deleted":
    case "monteur_removed":
      return "#ef4444";
    case "cel_color_changed":
      return "#feb300";
    case "cel_notitie_changed":
      return "#7cc1ff";
  }
};

const describeEntry = (
  entry: HistoryEntry,
  activiteiten: Activiteit[],
  weken: Week[],
  monteurById: Map<string, Monteur>
): string => {
  const actNaam = (id: string) =>
    activiteiten.find((a) => a.id === id)?.naam ?? "—";
  const weekNr = (id: string) =>
    weken.find((w) => w.id === id)?.week_nr ?? "—";
  const dag = (idx: number) => DAG_NAMEN_KORT[idx] ?? "";
  switch (entry.type) {
    case "cel_created":
      return `Cel aangemaakt — ${actNaam(entry.cel.activiteit_id)} ${dag(
        entry.cel.dag_index
      )} week ${weekNr(entry.cel.week_id)}`;
    case "cel_deleted":
      return `Cel gewist — ${actNaam(entry.cel.activiteit_id)} ${dag(
        entry.cel.dag_index
      )} week ${weekNr(entry.cel.week_id)}`;
    case "cel_color_changed":
      return `Kleur gewijzigd — ${actNaam(entry.cel.activiteit_id)}`;
    case "monteur_added":
      return `Monteur toegevoegd — ${
        monteurById.get(entry.monteurId)?.naam ?? "—"
      }`;
    case "monteur_removed":
      return `Monteur verwijderd — ${
        monteurById.get(entry.monteurId)?.naam ?? "—"
      }`;
    case "cel_notitie_changed":
      return "Notitie gewijzigd";
  }
};

const HistoryPanel = ({
  history,
  activiteiten,
  monteurById,
  weken,
  onClose,
  onClear,
  onUndoEntry,
}: {
  history: HistoryEntry[];
  activiteiten: Activiteit[];
  monteurById: Map<string, Monteur>;
  weken: Week[];
  onClose: () => void;
  onClear: () => void;
  onUndoEntry: (entry: HistoryEntry, idx: number) => void;
}) => {
  const reversed = [...history].map((e, i) => ({ entry: e, idx: i })).reverse();
  return (
    <div
      className="fixed right-0 overflow-y-auto"
      style={{
        top: 52,
        width: 320,
        height: "calc(100vh - 52px)",
        backgroundColor: "rgba(10, 26, 48, 0.97)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        zIndex: 40,
      }}
    >
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{
          backgroundColor: "rgba(10, 26, 48, 0.97)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <h3 className="font-display text-sm font-bold tracking-tight text-foreground">
          Geschiedenis
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClear}
            disabled={history.length === 0}
            className={[
              "rounded-md px-2 py-1 text-[11px] font-display font-semibold",
              history.length === 0
                ? "cursor-not-allowed text-muted-foreground/40"
                : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
            ].join(" ")}
          >
            Wissen
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="px-4 py-12 text-center text-xs text-muted-foreground">
          Nog geen wijzigingen in deze sessie
        </div>
      ) : (
        <div className="px-2 py-2">
          {reversed.map(({ entry, idx }) => (
            <div
              key={idx}
              className="group flex items-start gap-2 rounded-md px-2 py-2 hover:bg-white/[0.04]"
            >
              <span
                className="mt-1 inline-block shrink-0 rounded-full"
                style={{
                  width: 8,
                  height: 8,
                  backgroundColor: dotColor(entry.type),
                }}
              />
              <div className="flex-1 text-[12px] leading-snug text-foreground">
                {describeEntry(entry, activiteiten, weken, monteurById)}
              </div>
              <button
                type="button"
                onClick={() => onUndoEntry(entry, idx)}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-display font-bold text-primary opacity-0 transition-opacity hover:bg-primary/10 group-hover:opacity-100"
              >
                Herstel
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
