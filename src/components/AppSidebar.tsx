import { NavLink, useLocation } from "react-router-dom";
import { CalendarDays, FolderKanban, LayoutDashboard, ListChecks, Moon, Settings, Sun, Users, Zap } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

const navItems = [
  { to: "/overzicht", label: "Overzicht", icon: LayoutDashboard },
  { to: "/projecten", label: "Projecten", icon: FolderKanban },
  { to: "/plannen", label: "Plannen", icon: CalendarDays },
  { to: "/activiteiten", label: "Activiteiten", icon: ListChecks },
  { to: "/capaciteit", label: "Capaciteit", icon: Users },
  { to: "/instellingen", label: "Instellingen", icon: Settings },
];

interface AppSidebarProps {
  collapsed?: boolean;
}

export function AppSidebar({ collapsed = false }: AppSidebarProps) {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();

  const isItemActive = (to: string) => {
    if (to === "/overzicht" && pathname === "/") return true;
    if (pathname === to) return true;
    return pathname.startsWith(to + "/");
  };

  return (
    <aside
      className="fixed left-0 top-0 z-30 flex h-screen flex-col border-r transition-[width] duration-200"
      style={{
        width: collapsed ? 64 : 220,
        backgroundColor: "rgb(var(--surface-rgb) / 0.7)",
        borderColor: "rgb(var(--fg-rgb) / 0.08)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      {/* Brand */}
      <div className={["flex items-center gap-2.5 py-5", collapsed ? "justify-center px-2" : "px-5"].join(" ")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Zap className="h-5 w-5" strokeWidth={2.25} />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <div className="font-display text-[15px] font-bold tracking-tight">TerreVolt</div>
            <div className="text-[11px] font-medium text-muted-foreground">Planner</div>
          </div>
        )}
      </div>

      <div className="mx-4 mb-3 h-px bg-fg/[0.06]" />

      {/* Nav */}
      <nav className={["flex-1", collapsed ? "px-2" : "px-3"].join(" ")}>
        <ul className="space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = isItemActive(to);
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  title={collapsed ? label : undefined}
                  className={[
                    "group relative flex items-center rounded-md text-sm font-medium transition-colors",
                    collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-fg/[0.04] hover:text-foreground",
                  ].join(" ")}
                >
                  {!collapsed && (
                    <span
                      className={[
                        "absolute -ml-3 h-5 w-[3px] rounded-r-full transition-all",
                        active ? "bg-primary" : "bg-transparent",
                      ].join(" ")}
                    />
                  )}
                  <Icon
                    className={["h-[18px] w-[18px] shrink-0", active ? "text-primary" : ""].join(" ")}
                    strokeWidth={2}
                  />
                  {!collapsed && <span className="font-display tracking-tight">{label}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Theme toggle */}
      <div className={collapsed ? "px-2 pb-2" : "px-3 pb-2"}>
        <button
          type="button"
          onClick={toggle}
          aria-label={theme === "dark" ? "Schakel naar licht thema" : "Schakel naar donker thema"}
          title={collapsed ? (theme === "dark" ? "Licht thema" : "Donker thema") : undefined}
          className={[
            "flex w-full items-center rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-fg/[0.04] hover:text-foreground",
            collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
          ].join(" ")}
        >
          {theme === "dark" ? (
            <Sun className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
          ) : (
            <Moon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
          )}
          {!collapsed && (
            <span className="font-display tracking-tight">
              {theme === "dark" ? "Licht thema" : "Donker thema"}
            </span>
          )}
        </button>
      </div>

      {/* Footer */}
      {!collapsed && (
        <div className="px-5 py-4 text-[11px] text-muted-foreground">
          <div>v0.1 · 2026</div>
        </div>
      )}
    </aside>
  );
}
