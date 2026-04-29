import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type PloegType = "schakelmonteur" | "montagemonteur";

export interface Ploeg {
  id: string;
  naam: string;
  type: PloegType;
  actief: boolean;
  positie: number;
  monteur_ids: string[];
}

export async function fetchPloegen(): Promise<Ploeg[]> {
  const { data: ploegen, error } = await sb
    .from("ploegen")
    .select("id,naam,type,actief,positie")
    .order("positie", { ascending: true })
    .order("naam", { ascending: true });
  if (error) throw error;
  const ids = (ploegen ?? []).map((p: any) => p.id);
  let leden: { ploeg_id: string; monteur_id: string }[] = [];
  if (ids.length > 0) {
    const { data: pm, error: pmErr } = await sb
      .from("ploeg_monteurs")
      .select("ploeg_id,monteur_id")
      .in("ploeg_id", ids);
    if (pmErr) throw pmErr;
    leden = pm ?? [];
  }
  const map = new Map<string, string[]>();
  leden.forEach((row) => {
    const arr = map.get(row.ploeg_id) ?? [];
    arr.push(row.monteur_id);
    map.set(row.ploeg_id, arr);
  });
  return (ploegen ?? []).map((p: any) => ({
    ...p,
    monteur_ids: map.get(p.id) ?? [],
  })) as Ploeg[];
}
