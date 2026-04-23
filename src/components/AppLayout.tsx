import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";

export function AppLayout() {
  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "#030e20" }}>
      <AppSidebar />
      <main className="ml-[220px] min-h-screen">
        <div className="mx-auto w-full max-w-[1400px] px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
