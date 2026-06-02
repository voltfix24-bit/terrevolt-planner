import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { AppSidebar } from "./AppSidebar";

const STORAGE_KEY = "terrevolt-nav-collapsed";

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const sidebarW = collapsed ? 64 : 220;

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "var(--app-bg)" }}>
      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-12 border-b"
        style={{
          backgroundColor: "rgb(var(--surface-rgb) / 0.85)",
          borderColor: "rgb(var(--fg-rgb) / 0.08)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-fg/[0.06]"
          aria-label={mobileOpen ? "Menu sluiten" : "Menu openen"}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div className="font-display text-sm font-bold tracking-tight">TerreVolt Planner</div>
        <div className="w-9" />
      </div>

      {/* Sidebar wrapper: slide on mobile, static on desktop. */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-50 transition-[transform,width] duration-200 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
        style={{ width: mobileOpen ? 220 : sidebarW }}
      >
        <AppSidebar collapsed={collapsed && !mobileOpen} />
      </div>

      {/* Desktop collapse toggle — floats on the sidebar edge */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? "Navigatie uitklappen" : "Navigatie inklappen"}
        title={collapsed ? "Navigatie uitklappen" : "Navigatie inklappen voor meer weken"}
        className="hidden md:flex fixed top-4 z-[60] h-6 w-6 items-center justify-center rounded-full border shadow-md transition-all hover:scale-110"
        style={{
          left: sidebarW - 12,
          borderColor: "rgb(var(--fg-rgb) / 0.12)",
          background: "rgb(var(--surface-rgb) / 0.95)",
          color: "rgb(var(--fg-rgb) / 0.75)",
        }}
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <main
        className="min-h-screen pt-12 md:pt-0 overflow-x-hidden transition-[margin] duration-200"
        style={{ marginLeft: typeof window !== "undefined" && window.innerWidth >= 768 ? sidebarW : 0 }}
      >
        <div className="w-full px-3 py-3 md:px-6 md:py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
