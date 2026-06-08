import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AuditBatch {
  batch_id: string;
  table_name: string;
  operation: string;
  created_at: string;
  label: string | null;
  count: number;
}

const TABLE_LABELS: Record<string, string> = {
  planning_cellen: "planning",
  cel_monteurs: "monteurs op planning",
  project_concept_planning: "concept planning",
  project_concept_monteurs: "concept monteurs",
  project_weken: "weken",
  projecten: "project",
  project_activiteiten: "activiteiten",
  project_ls_kabels: "LS-kabels",
  project_ms_kabels: "MS-kabels",
  project_tekeningen: "tekeningen",
  monteurs: "monteur",
  monteur_afwezigheid: "afwezigheid",
  ploegen: "ploeg",
  ploeg_monteurs: "ploeg-monteur",
  activiteit_types: "activiteit-type",
  opdrachtgevers: "opdrachtgever",
  percelen: "perceel",
  feestdagen: "feestdag",
  project_templates: "template",
};

export function describeBatch(b: AuditBatch): string {
  if (b.label) return b.label;
  const t = TABLE_LABELS[b.table_name] ?? b.table_name;
  const op =
    b.operation === "INSERT" ? "toegevoegd" : b.operation === "DELETE" ? "verwijderd" : "gewijzigd";
  if (b.count > 1) return `${b.count} × ${t} ${op}`;
  return `${t} ${op}`;
}

/** Most recent non-undone batches, grouped */
export function useRecentBatches(limit = 20) {
  const [batches, setBatches] = useState<AuditBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("audit_log")
      .select("batch_id,table_name,operation,created_at,label")
      .eq("undone", false)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      setLoading(false);
      return;
    }
    const map = new Map<string, AuditBatch>();
    for (const row of data ?? []) {
      const ex = map.get(row.batch_id);
      if (ex) {
        ex.count += 1;
      } else {
        map.set(row.batch_id, {
          batch_id: row.batch_id,
          table_name: row.table_name,
          operation: row.operation,
          created_at: row.created_at,
          label: row.label,
          count: 1,
        });
      }
    }
    setBatches(Array.from(map.values()).slice(0, limit));
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("audit_log_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_log" },
        () => load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load]);

  return { batches, loading, reload: load };
}

export async function undoBatch(batchId?: string): Promise<{ batch: string | null; count: number }> {
  const { data, error } = await supabase.rpc("undo_batch", {
    p_batch_id: batchId ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { batch: row?.batch ?? null, count: row?.undone_count ?? 0 };
}

/** Best-effort label op de eerstvolgende mutatie in dezelfde tx */
export async function setAuditLabel(label: string): Promise<void> {
  try {
    await supabase.rpc("set_audit_label", { p_label: label });
  } catch {
    /* non-fatal */
  }
}
