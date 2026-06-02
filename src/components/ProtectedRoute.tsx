import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
        Laden...
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
