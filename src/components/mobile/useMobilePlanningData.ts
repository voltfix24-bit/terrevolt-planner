import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  aggregateMobilePlanning, indexDaysByProject, indexDaysByWeek,
  type MobileActivity, type MobileCell, type MobileCellMonteur, type MobileWeek,
} from "@/lib/mobile-planning";
import type { AfwezigheidPeriode, FeestdagItem } from "@/lib/monteur-beschikbaarheid";

export interface MobileProject { id: string; case_nummer: string | null; station_naam: string | null; status: string | null; opdrachtgever_id: string | null; straat?: string | null; postcode?: string | null; stad?: string | null }
export interface MobileMonteur { id: string; naam: string; actief: boolean; werkdagen: number[] | null }

interface MobileRawData {
  projects: MobileProject[];
  monteurs: MobileMonteur[];
  opdrachtgevers: { id: string; naam: string }[];
  absences: AfwezigheidPeriode[];
  holidays: FeestdagItem[];
  weeks: MobileWeek[];
  activities: MobileActivity[];
  cells: MobileCell[];
  links: MobileCellMonteur[];
}

const PAGE = 1000;
type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Haalt alle rijen op in batches van 1000 (geen N+1 per project). */
async function fetchAll<T>(page: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function loadMobilePlanning(): Promise<MobileRawData> {
  const [projects, weeks, activities, cells, monteurs, links, opdrachtgevers, absent, holidays] = await Promise.all([
    fetchAll<MobileProject>((f, t) => supabase.from("projecten").select("id, case_nummer, station_naam, status, opdrachtgever_id, straat, postcode, stad").order("id").range(f, t)),
    fetchAll<MobileWeek>((f, t) => supabase.from("project_weken").select("id, project_id, jaar, week_nr").order("id").range(f, t)),
    fetchAll<MobileActivity>((f, t) => supabase.from("project_activiteiten").select("id, project_id, naam").order("id").range(f, t)),
    fetchAll<MobileCell>((f, t) => supabase.from("planning_cellen").select("id, activiteit_id, week_id, dag_index, kleur_code").not("kleur_code", "is", null).order("id").range(f, t)),
    fetchAll<MobileMonteur>((f, t) => supabase.from("monteurs").select("id, naam, actief, werkdagen").eq("actief", true).order("naam").range(f, t)),
    fetchAll<MobileCellMonteur>((f, t) => supabase.from("cel_monteurs").select("cel_id, monteur_id").order("cel_id").order("monteur_id").range(f, t)),
    fetchAll<{ id: string; naam: string }>((f, t) => supabase.from("opdrachtgevers").select("id, naam").order("naam").range(f, t)),
    fetchAll<{ monteur_id: string | null; datum_van: string; datum_tot: string; type: string; omschrijving: string | null }>((f, t) => supabase.from("monteur_afwezigheid").select("monteur_id, datum_van, datum_tot, type, omschrijving").order("datum_van").range(f, t)),
    fetchAll<FeestdagItem>((f, t) => supabase.from("feestdagen").select("datum, naam").order("datum").range(f, t)),
  ]);
  return {
    projects, weeks, activities, cells, monteurs, links, opdrachtgevers, holidays,
    absences: absent.flatMap((a) => a.monteur_id ? [{ monteur_id: a.monteur_id, datum_van: a.datum_van, datum_tot: a.datum_tot, type: a.type, omschrijving: a.omschrijving }] : []),
  };
}

export const MOBILE_PLANNING_QUERY_KEY = ["mobile-planning"] as const;

/**
 * Gedeelde, read-only planningdata voor alle mobiele schermen.
 * React Query cachet 45s; ververst bij focus/zichtbaar worden van het tabblad en via refresh().
 */
export function useMobilePlanningData() {
  const query = useQuery({
    queryKey: MOBILE_PLANNING_QUERY_KEY,
    queryFn: loadMobilePlanning,
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const raw = query.data;
  const days = useMemo(() => raw ? aggregateMobilePlanning(raw.weeks, raw.activities, raw.cells, raw.links) : [], [raw]);
  const daysByProject = useMemo(() => indexDaysByProject(days), [days]);
  const daysByWeek = useMemo(() => indexDaysByWeek(days), [days]);
  const onHoldProjectIds = useMemo(() => new Set((raw?.projects ?? []).filter((p) => p.status === "on_hold").map((p) => p.id)), [raw]);
  const projectById = useMemo(() => new Map((raw?.projects ?? []).map((p) => [p.id, p])), [raw]);
  const monteurNameById = useMemo(() => new Map((raw?.monteurs ?? []).map((m) => [m.id, m.naam])), [raw]);
  const opdrachtgeverNameById = useMemo(() => new Map((raw?.opdrachtgevers ?? []).map((o) => [o.id, o.naam])), [raw]);
  return {
    loading: query.isPending,
    fetching: query.isFetching,
    error: query.error ? String(query.error) : null,
    lastUpdated: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
    refresh: () => { void query.refetch(); },
    projects: raw?.projects ?? [],
    monteurs: raw?.monteurs ?? [],
    opdrachtgevers: raw?.opdrachtgevers ?? [],
    absences: raw?.absences ?? [],
    holidays: raw?.holidays ?? [],
    days, daysByProject, daysByWeek, onHoldProjectIds, projectById, monteurNameById, opdrachtgeverNameById,
  };
}

export type MobilePlanningData = ReturnType<typeof useMobilePlanningData>;
