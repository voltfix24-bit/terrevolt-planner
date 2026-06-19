import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
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

interface ConfirmOptions {
  title: string;
  description: ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const handle = (v: boolean) => {
    setOpen(false);
    resolver.current?.(v);
    resolver.current = null;
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => !o && handle(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title ?? "Weet je het zeker?"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>{opts?.description}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handle(false)}>
              {opts?.cancelText ?? "Annuleren"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handle(true)}
              className={opts?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {opts?.confirmText ?? "Doorgaan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

/** Convenience: confirm a shift action. Returns true if user confirms. */
export function describeShift(days: number, itemCount: number, itemLabel = "cel"): {
  title: string;
  description: string;
} {
  const dir = days > 0 ? "vooruit" : "terug";
  const absD = Math.abs(days);
  const dagWoord = absD === 1 ? "dag" : "dagen";
  const itemWoord = itemCount === 1 ? itemLabel : `${itemLabel}len`;
  return {
    title: `${absD} ${dagWoord} ${dir} verschuiven?`,
    description: `Je staat op het punt ${itemCount} ${itemWoord} met ${absD} ${dagWoord} ${dir} te verschuiven. Dit kun je daarna ongedaan maken met de Undo-knop.`,
  };
}

/** Convenience: confirm overwriting existing planning cells. */
export function describeOverwrite(cellCount: number): ConfirmOptions {
  const cellWord = cellCount === 1 ? "cel" : "cellen";
  return {
    title: `${cellCount} bestaande ${cellWord} overschrijven?`,
    description:
      cellCount === 1
        ? "Op de gekozen dag staat al planning. Als je doorgaat, wordt die cel vervangen door de nieuwe planning."
        : `Er staan al ${cellCount} cellen in deze reeks. Als je doorgaat, worden die cellen vervangen door de nieuwe planning.`,
    confirmText: "Overschrijven",
    cancelText: "Annuleren",
    destructive: true,
  };
}
