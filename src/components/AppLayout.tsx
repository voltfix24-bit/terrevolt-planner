import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";

export function AppLayout() {
  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "#030e20" }}>
      <AppSidebar />
      <main className="ml-[220px] min-h-screen">
        <div className="w-full px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
