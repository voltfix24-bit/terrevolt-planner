import { useCallback } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { checkUrenboekImpact, summarizeImpact } from "@/lib/urenboek-impact";

export function useUrenboekImpactConfirm() {
  const confirm = useConfirm();

  return useCallback(
    async (externalIds: readonly string[], actionLabel = "deze planning wijzigen") => {
      const results = await checkUrenboekImpact(externalIds);
      const summary = summarizeImpact(results);

      if (!summary.requiresConfirmation) return true;

      const isStrong = summary.level === "strong" || summary.level === "unknown";
      return confirm({
        title: summary.title,
        description: (
          <div className="space-y-3 text-sm">
            <p>{summary.description}</p>
            <div className="rounded-md border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
              <div>Actie: {actionLabel}</div>
              <div>Gekoppelde regels: {summary.totalIds}</div>
              <div>Al zichtbaar in urenboek: {summary.syncedCount}</div>
              <div>Met geregistreerde uren: {summary.bookedCount}</div>
              {summary.totalHours > 0 && <div>Totaal uren: {summary.totalHours}</div>}
              {summary.statuses.length > 0 && <div>Status uren: {summary.statuses.join(", ")}</div>}
            </div>
          </div>
        ),
        confirmText: isStrong ? "Toch doorgaan" : "Doorgaan",
        cancelText: "Annuleren",
        destructive: isStrong,
      });
    },
    [confirm],
  );
}
