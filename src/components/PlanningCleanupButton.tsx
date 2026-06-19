import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  projectId: string;
  projectLabel?: string | null;
  weeksBefore?: number;
  weeksAfter?: number;
  className?: string;
  size?: "sm" | "md";
  /** Wordt aangeroepen na succesvolle apply, zodat de pagina kan herladen. */
  onApplied?: () => void;
};

type DryRun = {
  applied: boolean;
  project?: string;
  first_planned?: string;
  last_planned?: string;
  keep_from?: string;
  keep_to?: string;
  total_weeks?: number;
  planned_weeks?: number;
  delete_weeks?: number;
  remaining_weeks?: number;
  dangling_planning_cellen?: number;
  message?: string;
};

/**
 * Knop die eerst een dry-run van `normalize_project_planning_window` uitvoert
 * en de gebruiker laat bevestigen vóór apply.
 *
 * Raakt geen activiteiten, monteurs, planning_cellen, projectvelden of sorteringen.
 * Verwijdert alleen lege `project_weken` buiten het venster van de echte planning.
 */
export function PlanningCleanupButton({
  projectId,
  projectLabel,
  weeksBefore = 4,
  weeksAfter = 8,
  className = "",
  size = "sm",
  onApplied,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [open, setOpen] = useState(false);

  const startDryRun = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("normalize_project_planning_window", {
        p_project_id: projectId,
        p_apply: false,
        p_weeks_before: weeksBefore,
        p_weeks_after: weeksAfter,
      });
      if (error) throw error;
      setDryRun((data ?? {}) as DryRun);
      setOpen(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Kon planning niet analyseren: " + msg);
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    try {
      const { data, error } = await supabase.rpc("normalize_project_planning_window", {
        p_project_id: projectId,
        p_apply: true,
        p_weeks_before: weeksBefore,
        p_weeks_after: weeksAfter,
      });
      if (error) throw error;
      const r = (data ?? {}) as DryRun;
      const removed = r.delete_weeks ?? dryRun?.delete_weeks ?? 0;
      toast.success(
        removed > 0
          ? `Planningvenster opgeschoond: ${removed} lege weken verwijderd`
          : "Planningvenster gecontroleerd: niets te verwijderen",
      );
      setOpen(false);
      setDryRun(null);
      onApplied?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Opschonen mislukt: " + msg);
    } finally {
      setApplying(false);
    }
  };

  const sizeCls =
    size === "md"
      ? "px-3 py-1.5 text-[12px]"
      : "px-2 py-1 text-[11px]";

  return (
    <>
      <button
        type="button"
        onClick={startDryRun}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/15 font-semibold text-amber-900 transition-colors hover:bg-amber-500/25 disabled:cursor-wait disabled:opacity-60 dark:text-amber-100 ${sizeCls} ${className}`}
        title="Lege project_weken buiten de echte planning verwijderen"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        Planningvenster opschonen
      </button>

      <AlertDialog open={open} onOpenChange={(v) => !applying && setOpen(v)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Planningvenster opschonen?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  Project:{" "}
                  <span className="font-semibold text-foreground">
                    {projectLabel ?? dryRun?.project ?? "—"}
                  </span>
                </div>
                {dryRun?.message && (
                  <div className="rounded border border-fg/10 bg-fg/[0.04] px-2 py-1.5 text-muted-foreground">
                    {dryRun.message}
                  </div>
                )}
                {dryRun?.first_planned && dryRun?.last_planned && (
                  <div>
                    Echte planning:{" "}
                    <span className="font-mono">{dryRun.first_planned}</span> →{" "}
                    <span className="font-mono">{dryRun.last_planned}</span>{" "}
                    ({dryRun.planned_weeks ?? 0} week
                    {dryRun.planned_weeks === 1 ? "" : "en"})
                  </div>
                )}
                {dryRun?.keep_from && dryRun?.keep_to && (
                  <div>
                    Venster dat blijft:{" "}
                    <span className="font-mono">{dryRun.keep_from}</span> →{" "}
                    <span className="font-mono">{dryRun.keep_to}</span>{" "}
                    <span className="text-muted-foreground">
                      ({weeksBefore} weken voor, {weeksAfter} weken na)
                    </span>
                  </div>
                )}
                <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
                  <li>
                    Project_weken totaal:{" "}
                    <span className="font-semibold text-foreground">
                      {dryRun?.total_weeks ?? "?"}
                    </span>
                  </li>
                  <li>
                    Te verwijderen lege weken:{" "}
                    <span className="font-semibold text-amber-700 dark:text-amber-300">
                      {dryRun?.delete_weeks ?? 0}
                    </span>
                  </li>
                  <li>
                    Overgebleven na opschonen:{" "}
                    <span className="font-semibold text-foreground">
                      {dryRun?.remaining_weeks ?? "?"}
                    </span>
                  </li>
                  <li>
                    Dangling planning_cellen:{" "}
                    <span className="font-semibold text-foreground">
                      {dryRun?.dangling_planning_cellen ?? 0}
                    </span>
                  </li>
                </ul>
                <div className="rounded border border-fg/10 bg-fg/[0.03] px-2 py-1.5 text-[12px] text-muted-foreground">
                  Activiteiten, monteurs, planning_cellen, projectvelden en
                  sorteringen blijven onaangetast. Er wordt automatisch een
                  snapshot voor undo gemaakt.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void apply();
              }}
              disabled={applying || (dryRun?.delete_weeks ?? 0) === 0}
            >
              {applying ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Bezig…
                </span>
              ) : (dryRun?.delete_weeks ?? 0) === 0 ? (
                "Niets te verwijderen"
              ) : (
                `Ja, ${dryRun?.delete_weeks ?? 0} weken verwijderen`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
