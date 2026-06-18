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
  startJaar?: number;
  cellen: ConceptCel[];
}): Promise<{ aangemaakteCellen: number; aangemaakteWeken: number }> {
  const { project_id, startWeek, cellen } = opts;
  if (cellen.length === 0) return { aangemaakteCellen: 0, aangemaakteWeken: 0 };

  // Bepaal startjaar: meegegeven, anders uit projecten, anders huidig jaar
  let startJaar = opts.startJaar;
  if (startJaar === undefined) {
    const { data: proj } = await supabase
      .from("projecten")
      .select("jaar")
      .eq("id", project_id)
      .maybeSingle();
    startJaar = (proj?.jaar as number | null) ?? new Date().getFullYear();
  }

  // 1) Bepaal benodigde (jaar, week_nr) paren via echte datum-rekenkunde.
  // Vul ook alle tussenliggende weken, zodat een projectplanning nooit W39 → W41 kan krijgen.
  const { addIsoWeeks, weekDeltaIso } = await import("./planning-types");
  const benodigdeWeken = new Map<string, { jaar: number; week_nr: number }>();
  for (const c of cellen) {
    const { week_offset } = offsetToWeekDag(c.dag_offset);
    const w = addIsoWeeks(startJaar, startWeek, week_offset);
    benodigdeWeken.set(`${w.jaar}-${w.week_nr}`, w);
  }
  const bounds = Array.from(benodigdeWeken.values()).sort(
    (a, b) => a.jaar - b.jaar || a.week_nr - b.week_nr,
  );
  if (bounds.length > 1) {
    const first = bounds[0];
    const last = bounds[bounds.length - 1];
    const span = Math.max(0, weekDeltaIso(first.jaar, first.week_nr, last.jaar, last.week_nr));
    for (let i = 0; i <= span; i++) {
      const w = addIsoWeeks(first.jaar, first.week_nr, i);
      benodigdeWeken.set(`${w.jaar}-${w.week_nr}`, w);
    }
  }

  // 2) Bestaande project_weken laden
  const { data: bestaandeWeken, error: eLoadWeken } = await supabase
    .from("project_weken")
    .select("id,week_nr,jaar,positie")
    .eq("project_id", project_id);
  if (eLoadWeken) throw new Error("Kon bestaande weken niet laden: " + eLoadWeken.message);
  const wekenMap = new Map<string, string>();
  (bestaandeWeken ?? []).forEach((w) =>
    wekenMap.set(`${w.jaar}-${w.week_nr}`, w.id as string),
  );
  const maxPositie = (bestaandeWeken ?? []).reduce(
    (m, w) => Math.max(m, w.positie ?? 0),
    -1,
  );

  // 3) Ontbrekende weken aanmaken (idempotent via upsert op project_id+jaar+week_nr).
  const teMaken: { project_id: string; jaar: number; week_nr: number; positie: number }[] = [];
  let pos = maxPositie + 1;
  const sorted = Array.from(benodigdeWeken.values()).sort(
    (a, b) => a.jaar - b.jaar || a.week_nr - b.week_nr,
  );
  for (const w of sorted) {
    if (!wekenMap.has(`${w.jaar}-${w.week_nr}`)) {
      teMaken.push({ project_id, jaar: w.jaar, week_nr: w.week_nr, positie: pos++ });
    }
  }
  let aangemaakteWeken = 0;
  if (teMaken.length > 0) {
    // Upsert i.p.v. insert: voorkomt 23505 bij gelijktijdige uitrollen.
    const { error: eUpsert } = await supabase
      .from("project_weken")
      .upsert(teMaken, { onConflict: "project_id,jaar,week_nr", ignoreDuplicates: true });
    if (eUpsert) throw new Error("Kon weken niet aanmaken: " + eUpsert.message);

    // Herlees zodat we ALLE id's (ook reeds bestaande dubbele) hebben.
    const { data: refreshed, error: eReload } = await supabase
      .from("project_weken")
      .select("id,week_nr,jaar")
      .eq("project_id", project_id);
    if (eReload) throw new Error("Kon weken niet herladen: " + eReload.message);
    (refreshed ?? []).forEach((w) =>
      wekenMap.set(`${w.jaar}-${w.week_nr}`, w.id as string),
    );
    aangemaakteWeken = teMaken.length;
  }

  // 4) Planning cellen voorbereiden (gedupliceerd per (activiteit, week, dag) wegfilteren).
  type InsertRow = {
    activiteit_id: string;
    week_id: string;
    dag_index: number;
    kleur_code: string | null;
    capaciteit: number;
    notitie: string;
  };
  const insertRows: InsertRow[] = [];
  const monteurPerKey = new Map<string, string[]>();
  const seenKey = new Set<string>();

  cellen.forEach((c) => {
    if (!c.activiteit_id) return;
    const { week_offset, dag_index } = offsetToWeekDag(c.dag_offset);
    const w = addIsoWeeks(startJaar!, startWeek, week_offset);
    const week_id = wekenMap.get(`${w.jaar}-${w.week_nr}`);
    if (!week_id) return;
    const key = `${c.activiteit_id}|${week_id}|${dag_index}`;
    if (seenKey.has(key)) {
      // Merge monteurs als er meerdere concept-cellen op dezelfde slot landen.
      const prev = monteurPerKey.get(key) ?? [];
      monteurPerKey.set(key, Array.from(new Set([...prev, ...c.monteur_ids])));
      return;
    }
    seenKey.add(key);
    insertRows.push({
      activiteit_id: c.activiteit_id,
      week_id,
      dag_index,
      kleur_code: c.kleur_code,
      capaciteit: c.capaciteit ?? 0,
      notitie: c.notitie ?? "",
    });
    monteurPerKey.set(key, [...c.monteur_ids]);
  });

  if (insertRows.length === 0)
    return { aangemaakteCellen: 0, aangemaakteWeken };

  // Upsert: opnieuw uitrollen overschrijft dezelfde cel i.p.v. dubbele rijen te
  // produceren (constraint unique_cel: activiteit_id, week_id, dag_index).
  const { data: ingevoegdeCellen, error: e2 } = await supabase
    .from("planning_cellen")
    .upsert(insertRows, { onConflict: "activiteit_id,week_id,dag_index" })
    .select("id,activiteit_id,week_id,dag_index");
  if (e2) throw new Error("Kon planning-cellen niet schrijven: " + e2.message);

  // 5) Monteurs synchroniseren: verwijder oude koppelingen voor de geraakte
  //    cellen, voeg dan de gewenste set toe. Zo blijft re-uitrol consistent.
  const celIds = (ingevoegdeCellen ?? []).map((c) => c.id as string);
  if (celIds.length > 0) {
    const { error: eDel } = await supabase
      .from("cel_monteurs")
      .delete()
      .in("cel_id", celIds);
    if (eDel) throw new Error("Kon monteur-koppelingen niet opschonen: " + eDel.message);
  }

  const monteurRows: { cel_id: string; monteur_id: string }[] = [];
  (ingevoegdeCellen ?? []).forEach((cel) => {
    const key = `${cel.activiteit_id}|${cel.week_id}|${cel.dag_index}`;
    const mids = monteurPerKey.get(key) ?? [];
    mids.forEach((mid) => monteurRows.push({ cel_id: cel.id as string, monteur_id: mid }));
  });
  if (monteurRows.length > 0) {
    const { error: e3 } = await supabase
      .from("cel_monteurs")
      .upsert(monteurRows, { onConflict: "cel_id,monteur_id", ignoreDuplicates: true });
    if (e3) throw new Error("Kon monteurs niet koppelen: " + e3.message);
  }

  return {
    aangemaakteCellen: ingevoegdeCellen?.length ?? 0,
    aangemaakteWeken,
  };
}

