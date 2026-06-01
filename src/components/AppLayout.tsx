import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { AppSidebar } from "./AppSidebar";

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "#030e20" }}>
      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-12 border-b"
        style={{
          backgroundColor: "rgba(10, 26, 48, 0.85)",
          borderColor: "rgba(255, 255, 255, 0.08)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-white/[0.06]"
          aria-label={mobileOpen ? "Menu sluiten" : "Menu openen"}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div className="font-display text-sm font-bold tracking-tight">TerreVolt Planner</div>
        <div className="w-9" />
      </div>

      {/* Sidebar wrapper: slide on mobile, static on desktop */}
      {/* Sidebar wrapper: slide on mobile, static on desktop.
          Explicit width is required so -translate-x-full actually moves it off-screen on mobile,
          because the child <AppSidebar /> is position:fixed and contributes no intrinsic width. */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-50 w-[220px] transition-transform md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <AppSidebar />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <main className="md:ml-[220px] min-h-screen pt-12 md:pt-0">
        <div className="w-full px-3 py-3 md:px-6 md:py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
