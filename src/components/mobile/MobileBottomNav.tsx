import { CalendarDays, FolderKanban, Gauge, SunMedium } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/overzicht", label: "Vandaag", icon: SunMedium },
  { to: "/projecten", label: "Cases", icon: FolderKanban },
  { to: "/plannen", label: "Planning", icon: CalendarDays },
  { to: "/capaciteit", label: "Capaciteit", icon: Gauge },
];

export function MobileBottomNav() {
  return <nav aria-label="Mobiele hoofdnavigatie" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
    {items.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? "text-primary-text before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:bg-primary-text before:content-['']" : "text-muted-foreground"}`}>
      <Icon className="h-5 w-5" /><span>{label}</span>
    </NavLink>)}
  </nav>;
}