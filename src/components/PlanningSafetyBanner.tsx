import { AlertTriangle } from "lucide-react";
import {
  assessPlanningRange,
  formatPlanningRange,
  type PlanningWeek,
} from "@/lib/planning-safety";

type Props = {
  weken: PlanningWeek[];
  className?: string;
  /** Compact = badge-stijl; standaard = volledige banner. */
  variant?: "banner" | "badge";
};

export function PlanningSafetyBanner({ weken, className = "", variant = "banner" }: Props) {
  const a = assessPlanningRange(weken);
  if (a.status === "safe") return null;

  if (variant === "badge") {
    return (
      <span
        title={`Planning loopt van ${a.firstDate?.toISOString().slice(0,10)} tot ${a.lastDate?.toISOString().slice(0,10)} — ${a.reasons.join("; ")}`}
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
      </div>
    </div>
  );
}
