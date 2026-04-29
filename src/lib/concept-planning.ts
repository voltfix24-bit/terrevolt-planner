import { supabase } from "@/integrations/supabase/client";

// Concept planning is project-bound, week-onafhankelijk.
// dag_offset start bij 1 (= D1). Uitrol mapt D1..Dn naar opeenvolgende
// werkdagen (ma-vr) vanaf een gekozen startweek.

export interface ConceptCel {
  id: string;
  project_id: string;
  dag_offset: number; // 1-based
  activiteit_id: string | null;
  kleur_code: string | null;
  capaciteit: number | null;
  notitie: string | null;
  positie: number;
  monteur_ids: string[];
}

export interface ConceptCelRaw {
  id: string;
  project_id: string;
  dag_offset: number;
  activiteit_id: string | null;
  kleur_code: string | null;
  capaciteit: number | null;
  notitie: string | null;
  positie: number;
}

/** dag_offset (1-based) → { week_offset (0-based), dag_index (0-4) } */
export function offsetToWeekDag(dag_offset: number): {
  week_offset: number;
  dag_index: number;
} {
  const zero = Math.max(0, dag_offset - 1);
  return { week_offset: Math.floor(zero / 5), dag_index: zero % 5 };
}

export function dagOffsetLabel(dag_offset: number): string {
  const { week_offset, dag_index } = offsetToWeekDag(dag_offset);
  const dagen = ["MA", "DI", "WO", "DO", "VR"];
  if (week_offset === 0) return `D${dag_offset} · ${dagen[dag_index]}`;
  return `D${dag_offset} · W+${week_offset} ${dagen[dag_index]}`;
}

export async function loadConceptPlanning(
  project_id: string,
): Promise<ConceptCel[]> {
  const { data: cellen, error } = await supabase
    .from("project_concept_planning")
    .select("*")
    .eq("project_id", project_id)
    .order("dag_offset", { ascending: true })
    .order("positie", { ascending: true });
  if (error) throw error;
  const ids = (cellen ?? []).map((c) => c.id);
  let monteurMap = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: cm } = await supabase
      .from("project_concept_monteurs")
      .select("concept_cel_id,monteur_id")
      .in("concept_cel_id", ids);
    (cm ?? []).forEach((row) => {
      const arr = monteurMap.get(row.concept_cel_id) ?? [];
      arr.push(row.monteur_id);
      monteurMap.set(row.concept_cel_id, arr);
    });
  }
  return (cellen ?? []).map((c) => ({
    ...(c as ConceptCelRaw),
    monteur_ids: monteurMap.get(c.id) ?? [],
  }));
}

/**
 * Rol concept-planning uit naar planning_cellen vanaf de gekozen startweek.
 * - Maakt project_weken aan voor opeenvolgende weken indien nodig.
 * - Insert planning_cellen + cel_monteurs.
 */
export async function uitrollenNaarPlanning(opts: {
  project_id: string;
  startWeek: number;
  cellen: ConceptCel[];
}): Promise<{ aangemaakteCellen: number; aangemaakteWeken: number }> {
  const { project_id, startWeek, cellen } = opts;
  if (cellen.length === 0) return { aangemaakteCellen: 0, aangemaakteWeken: 0 };

  // 1) Bepaal benodigde weeknummers
  const benodigdeWeken = new Set<number>();
  for (const c of cellen) {
    const { week_offset } = offsetToWeekDag(c.dag_offset);
    benodigdeWeken.add(((startWeek - 1 + week_offset) % 53) + 1);
  }

  // 2) Bestaande project_weken laden
  const { data: bestaandeWeken } = await supabase
    .from("project_weken")
    .select("id,week_nr,positie")
    .eq("project_id", project_id);
  const wekenMap = new Map<number, string>();
  (bestaandeWeken ?? []).forEach((w) =>
    wekenMap.set(w.week_nr, w.id as string),
  );
  const maxPositie = (bestaandeWeken ?? []).reduce(
    (m, w) => Math.max(m, w.positie ?? 0),
    -1,
  );

  // 3) Ontbrekende weken aanmaken
  const teMaken: { project_id: string; week_nr: number; positie: number }[] =
    [];
  let pos = maxPositie + 1;
  for (const wn of Array.from(benodigdeWeken).sort((a, b) => a - b)) {
    if (!wekenMap.has(wn)) {
      teMaken.push({ project_id, week_nr: wn, positie: pos++ });
    }
  }
  let aangemaakteWeken = 0;
  if (teMaken.length > 0) {
    const { data: ingev, error: e1 } = await supabase
      .from("project_weken")
      .insert(teMaken)
      .select("id,week_nr");
    if (e1) throw e1;
    (ingev ?? []).forEach((w) => wekenMap.set(w.week_nr, w.id as string));
    aangemaakteWeken = ingev?.length ?? 0;
  }

  // 4) Planning cellen aanmaken
  const insertRows: {
    activiteit_id: string;
    week_id: string;
    dag_index: number;
    kleur_code: string | null;
    capaciteit: number;
    notitie: string;
  }[] = [];
  const monteurInsertPerIndex: { idx: number; monteur_ids: string[] }[] = [];

  cellen.forEach((c) => {
    if (!c.activiteit_id) return;
    const { week_offset, dag_index } = offsetToWeekDag(c.dag_offset);
    const wn = ((startWeek - 1 + week_offset) % 53) + 1;
    const week_id = wekenMap.get(wn);
    if (!week_id) return;
    insertRows.push({
      activiteit_id: c.activiteit_id,
      week_id,
      dag_index,
      kleur_code: c.kleur_code,
      capaciteit: c.capaciteit ?? 0,
      notitie: c.notitie ?? "",
    });
    monteurInsertPerIndex.push({
      idx: insertRows.length - 1,
      monteur_ids: c.monteur_ids,
    });
  });

  if (insertRows.length === 0)
    return { aangemaakteCellen: 0, aangemaakteWeken };

  const { data: ingevoegdeCellen, error: e2 } = await supabase
    .from("planning_cellen")
    .insert(insertRows)
    .select("id");
  if (e2) throw e2;

  // 5) Monteurs koppelen
  const monteurRows: { cel_id: string; monteur_id: string }[] = [];
  monteurInsertPerIndex.forEach(({ idx, monteur_ids }) => {
    const cel = (ingevoegdeCellen ?? [])[idx];
    if (!cel) return;
    monteur_ids.forEach((mid) =>
      monteurRows.push({ cel_id: cel.id as string, monteur_id: mid }),
    );
  });
  if (monteurRows.length > 0) {
    const { error: e3 } = await supabase.from("cel_monteurs").insert(monteurRows);
    if (e3) throw e3;
  }

  return {
    aangemaakteCellen: ingevoegdeCellen?.length ?? 0,
    aangemaakteWeken,
  };
}
