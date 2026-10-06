import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { aggregateMobilePlanning } from "@/lib/mobile-planning";

export interface MobileProject { id: string; case_nummer: string | null; station_naam: string | null; status: string | null; opdrachtgever_id: string | null; straat?: string | null; postcode?: string | null; stad?: string | null }
export interface MobileMonteur { id: string; naam: string; actief: boolean }

export function useMobilePlanningData() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<MobileProject[]>([]);
  const [monteurs, setMonteurs] = useState<MobileMonteur[]>([]);
  const [opdrachtgevers, setOpdrachtgevers] = useState<{ id: string; naam: string }[]>([]);
  const [raw, setRaw] = useState<{ weeks: any[]; activities: any[]; cells: any[]; links: any[] }>({ weeks: [], activities: [], cells: [], links: [] });

  useEffect(() => { let active = true; void (async () => {
    const [p, w, a, c, m, l, o] = await Promise.all([
      supabase.from("projecten").select("id, case_nummer, station_naam, status, opdrachtgever_id, straat, postcode, stad"),
      supabase.from("project_weken").select("id, project_id, jaar, week_nr"),
      supabase.from("project_activiteiten").select("id, project_id, naam"),
      supabase.from("planning_cellen").select("id, activiteit_id, week_id, dag_index, kleur_code").not("kleur_code", "is", null),
      supabase.from("monteurs").select("id, naam, actief").eq("actief", true).order("naam"),
      supabase.from("cel_monteurs").select("cel_id, monteur_id"),
      supabase.from("opdrachtgevers").select("id, naam").order("naam"),
    ]);
    if (!active) return;
    setProjects((p.data ?? []) as MobileProject[]); setMonteurs((m.data ?? []) as MobileMonteur[]);
    setOpdrachtgevers((o.data ?? []) as { id: string; naam: string }[]);
    setRaw({ weeks: w.data ?? [], activities: a.data ?? [], cells: c.data ?? [], links: l.data ?? [] }); setLoading(false);
  })(); return () => { active = false; }; }, []);

  const days = useMemo(() => aggregateMobilePlanning(raw.weeks, raw.activities, raw.cells, raw.links), [raw]);
  return { loading, projects, monteurs, opdrachtgevers, days };
}