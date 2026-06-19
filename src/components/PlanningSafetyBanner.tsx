import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  assessPlanningRange,
  formatPlanningRange,
  type PlanningWeek,
  type PlanningAssessment,
} from "@/lib/planning-safety";
import { PlanningCleanupButton } from "@/components/PlanningCleanupButton";

type Props = {
  /** Direct meegegeven weken (gebruik dit als de pagina ze al heeft geladen). */
  weken?: PlanningWeek[];
  /** Anders: laad de weken zelf voor dit project. */
  projectId?: string | null;
  /** Optioneel project-label voor het bevestigingsdialoog. */
  projectLabel?: string | null;
  className?: string;
  /** Compact = badge-stijl; standaard = volledige banner. */
  variant?: "banner" | "badge";
  /** Toon "Planningvenster opschonen" knop (alleen zinvol met projectId). */
  showCleanup?: boolean;
  /** Callback na succesvolle opschoning. */
  onCleaned?: () => void;
};

/** Hook: laad jaar/week_nr van een project en bereken assessment. */
export function usePlanningAssessment(
  projectId: string | null | undefined,
  reloadKey: number = 0,
): PlanningAssessment | null {
  const [data, setData] = useState<PlanningAssessment | null>(null);
  useEffect(() => {
    if (!projectId) {
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase
        .from("project_weken")
        .select("jaar, week_nr")
        .eq("project_id", projectId);
      if (cancelled) return;
      setData(assessPlanningRange((rows ?? []) as PlanningWeek[]));
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);
  return data;
}

export function PlanningSafetyBanner({
  weken,
  projectId,
  projectLabel,
  className = "",
  variant = "banner",
  showCleanup = false,
  onCleaned,
}: Props) {
  const fetched = usePlanningAssessment(weken ? null : projectId ?? null);
  const a = weken ? assessPlanningRange(weken) : fetched;
  if (!a || a.status === "safe") return null;

  const range = `${a.firstDate?.toISOString().slice(0, 10)} → ${a.lastDate?.toISOString().slice(0, 10)}`;

  if (variant === "badge") {
    return (
      <span
        title={`Planning loopt van ${range} — ${a.reasons.join("; ")}`}
        className={`inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 ${className}`}
      >
        <AlertTriangle className="h-3 w-3" />
        Planning {a.rangeWeeks}w
      </span>
    );
  }

  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200 ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Planning valt buiten veilige periode</div>
        <div className="mt-0.5 text-amber-800/90 dark:text-amber-200/90">
          {formatPlanningRange(a)}
        </div>
        <ul className="mt-1 list-disc pl-4 text-amber-800/80 dark:text-amber-200/80">
          {a.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        {showCleanup && projectId && (
          <div className="mt-2">
            <PlanningCleanupButton
              projectId={projectId}
              projectLabel={projectLabel}
              onApplied={onCleaned}
            />
          </div>
        )}
      </div>
    </div>
  );
}
