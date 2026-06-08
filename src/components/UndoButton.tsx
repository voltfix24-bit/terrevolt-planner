import { useEffect, useState } from "react";
import { Undo2, ChevronDown, Clock } from "lucide-react";
import { toast } from "sonner";
import { describeBatch, undoBatch, useRecentBatches } from "@/lib/audit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "./ConfirmDialog";

function timeAgo(iso: string): string {
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s geleden`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m geleden`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}u geleden`;
  return new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

export function UndoButton() {
  const { batches } = useRecentBatches(20);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();
  const latest = batches[0];

  // Ctrl/Cmd+Z global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const inEditable =
        tgt &&
        (tgt.tagName === "INPUT" ||
          tgt.tagName === "TEXTAREA" ||
          tgt.isContentEditable ||
          tgt.getAttribute("role") === "textbox");
      if (inEditable) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (latest && !busy) {
          void doUndo(latest.batch_id, describeBatch(latest));
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest, busy]);

  async function doUndo(batchId: string, label: string, requireConfirm = false) {
    if (requireConfirm) {
      const ok = await confirm({
        title: "Wijziging terugdraaien?",
        description: `"${label}" wordt teruggedraaid. Latere wijzigingen blijven staan.`,
        confirmText: "Terugdraaien",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await undoBatch(batchId);
      toast.success(`Teruggedraaid (${res.count} ${res.count === 1 ? "wijziging" : "wijzigingen"})`);
      setOpen(false);
    } catch (e) {
      toast.error("Kon niet terugdraaien");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  const disabled = !latest || busy;

  return (
    <div className="flex items-stretch rounded-md border overflow-hidden"
      style={{
        borderColor: "rgb(var(--fg-rgb) / 0.12)",
        background: "rgb(var(--surface-rgb) / 0.95)",
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => latest && doUndo(latest.batch_id, describeBatch(latest))}
        title={latest ? `Ongedaan maken: ${describeBatch(latest)} (Ctrl+Z)` : "Geen actie om ongedaan te maken"}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-fg/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Undo2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Ongedaan</span>
      </button>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={batches.length === 0}
            className="flex items-center px-1.5 border-l text-foreground hover:bg-fg/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: "rgb(var(--fg-rgb) / 0.12)" }}
            title="Geschiedenis"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
          <DropdownMenuLabel className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Recente wijzigingen
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {batches.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">Geen recente acties</div>
          )}
          {batches.map((b, i) => (
            <DropdownMenuItem
              key={b.batch_id}
              onSelect={(e) => {
                e.preventDefault();
                void doUndo(b.batch_id, describeBatch(b), i > 0);
              }}
              className="flex flex-col items-start gap-0.5 py-2"
            >
              <span className="text-xs font-medium">{describeBatch(b)}</span>
              <span className="text-[10px] text-muted-foreground">{timeAgo(b.created_at)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
