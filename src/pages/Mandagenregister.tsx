import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ClipboardList, Users, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useIsManager } from "@/hooks/use-is-manager";
import { MandagenregisterPanel } from "@/components/MandagenregisterPanel";

type ProjectInfo = {
  id: string;
  case_nummer: string | null;
  station_naam: string | null;
};

type ProjectRange = {
  first_planned: string | null;
  last_planned: string | null;
  planned_days: number | null;
  planned_monteurs: number | null;
};

export default function Mandagenregister() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const projectId = params.get("project");
  const { isManager, loading: managerLoading } = useIsManager();

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [range, setRange] = useState<ProjectRange | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const [{ data: p, error: pErr }, { data: r, error: rErr }] = await Promise.all([
        supabase
          .from("projecten")
          .select("id, case_nummer, station_naam")
          .eq("id", projectId)
          .maybeSingle(),
        supabase.rpc("mandagenregister_project_range", { p_project_id: projectId }),
      ]);
      if (cancelled) return;
      if (pErr) setError(pErr.message);
      setProject((p as ProjectInfo) ?? null);
      if (!rErr && Array.isArray(r) && r[0]) {
        setRange(r[0] as ProjectRange);
      } else {
        setRange(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const projectLabel = useMemo(
    () =>
      project
        ? [project.case_nummer, project.station_naam].filter(Boolean).join(" · ") || project.id
        : "",
    [project],
  );

  if (!projectId) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Geen project geselecteerd.{" "}
          <Link to="/overzicht" className="underline">
            Terug naar overzicht
          </Link>
        </p>
      </div>
    );
  }

  if (!managerLoading && !isManager) {
    return (
      <div className="p-6">
        <h1 className="font-display text-xl font-bold">Geen toegang</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Het mandagenregister is alleen toegankelijk voor planner-managers.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/overzicht")}>
          Naar overzicht
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3 border-b border-fg/10 pb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/plannen?project=${projectId}`)}
          className="h-9"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Terug naar planning
        </Button>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <div>
            <div className="font-display text-lg font-bold leading-tight">
              {projectLabel || (loading ? "…" : "Project")}
            </div>
            <div className="text-xs text-muted-foreground">Mandagenregister</div>
          </div>
        </div>
        {range && (range.first_planned || range.planned_monteurs) && (
          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {range.first_planned && range.last_planned && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {range.first_planned} → {range.last_planned}
              </span>
            )}
            {typeof range.planned_days === "number" && (
              <span>{range.planned_days} geplande dagen</span>
            )}
            {typeof range.planned_monteurs === "number" && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {range.planned_monteurs} monteurs
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {!loading && range && !range.first_planned && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          Nog geen ingeplande monteurs voor dit project. Pas hieronder de periode aan om handmatig
          een register samen te stellen.
        </div>
      )}

      <MandagenregisterPanel
        projectId={projectId}
        projectLabel={projectLabel}
        defaultVan={range?.first_planned ?? null}
        defaultTot={range?.last_planned ?? null}
      />
    </div>
  );
}
