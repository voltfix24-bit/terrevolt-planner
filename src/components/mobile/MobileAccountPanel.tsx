import { LogOut, Moon, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { TERREVOLT_ICON_DATA_URI } from "@/lib/brand-assets";
import { useEffect, useRef } from "react";

export function MobileAccountPanel({ onClose }: { onClose: () => void }) {
  const { user, signOut } = useAuth(); const { theme, toggle } = useTheme();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll<HTMLElement>("button, a[href]");
      if (!controls?.length) return;
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, [onClose]);
  return <aside ref={panel} role="dialog" aria-modal="true" aria-label="Account en instellingen" className="fixed inset-y-0 left-0 z-50 flex w-[min(320px,85vw)] flex-col overflow-y-auto border-r border-border bg-card px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-2">
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><img src={TERREVOLT_ICON_DATA_URI} alt="" className="h-8 w-8" /><strong className="font-display">TerreVolt Planner</strong></div><Button variant="ghost" className="h-11 w-11 shrink-0 p-0" onClick={onClose} aria-label="Account sluiten"><X /></Button></div>
    <p className="mt-5 break-all text-sm text-muted-foreground">{user?.email}</p>
    <div className="mt-6 space-y-2"><Button variant="ghost" className="h-11 w-full justify-start" onClick={toggle}>{theme === "dark" ? <Sun /> : <Moon />}{theme === "dark" ? "Licht thema" : "Donker thema"}</Button><Button variant="ghost" className="h-11 w-full justify-start" onClick={() => void signOut()}><LogOut />Uitloggen</Button></div>
    <div className="mt-auto pt-8 text-xs leading-relaxed text-muted-foreground"><p>Mobiel is alleen-lezen. Activiteiten, instellingen en planning bewerken kan op desktop.</p><p className="mt-4">v0.1 · 2026</p></div>
  </aside>;
}