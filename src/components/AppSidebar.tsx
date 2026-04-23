import { NavLink } from "react-router-dom";
import { CalendarDays, FolderKanban, ListChecks, Settings, Users, Zap } from "lucide-react";

const navItems = [
  { to: "/", label: "Projecten", icon: FolderKanban },
  { to: "/plannen", label: "Plannen", icon: CalendarDays },
  { to: "/activiteiten", label: "Activiteiten", icon: ListChecks },
  { to: "/capaciteit", label: "Capaciteit", icon: Users },
  { to: "/instellingen", label: "Instellingen", icon: Settings },
];

export function AppSidebar() {
  return (
    <aside
      className="fixed left-0 top-0 z-30 flex h-screen w-[220px] flex-col border-r"
      style={{
        backgroundColor: "rgba(10, 26, 48, 0.7)",
        borderColor: "rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Zap className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div className="leading-tight">
          <div className="font-display text-[15px] font-bold tracking-tight">TerreVolt</div>
          <div className="text-[11px] font-medium text-muted-foreground">Planner</div>
        </div>
      </div>

      <div className="mx-4 mb-3 h-px bg-white/[0.06]" />

      {/* Nav */}
      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end
                className={({ isActive }) =>
                  [
                    "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={[
                        "absolute -ml-3 h-5 w-[3px] rounded-r-full transition-all",
                        isActive ? "bg-primary" : "bg-transparent",
                      ].join(" ")}
                    />
                    <Icon
                      className={["h-[18px] w-[18px] shrink-0", isActive ? "text-primary" : ""].join(" ")}
                      strokeWidth={2}
                    />
                    <span className="font-display tracking-tight">{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 text-[11px] text-muted-foreground">
        <div>v0.1 · 2026</div>
      </div>
    </aside>
  );
}
