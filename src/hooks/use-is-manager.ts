import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Returns true when the current user is an active planner-manager.
 * Server-side RLS/RPCs are still authoritative; this hook only gates UI.
 */
export function useIsManager() {
  const { user } = useAuth();
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setIsManager(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        // Prefer the same database helper that protects the manager-only RPCs.
        const { data: rpcData, error: rpcError } = await supabase.rpc("is_planner_manager");
        if (!cancelled && !rpcError && typeof rpcData === "boolean") {
          setIsManager(rpcData);
          setLoading(false);
          return;
        }

        // Fallback for older generated types or environments where the helper
        // is not exposed as RPC. Accept common manager/admin role names.
        const { data, error } = await supabase
          .from("planner_users")
          .select("role, active")
          .eq("user_id", user.id)
          .eq("active", true)
          .maybeSingle();

        if (cancelled) return;
        const role = String(data?.role ?? "").toLowerCase();
        setIsManager(
          !error &&
            !!data &&
            ["manager", "planner_manager", "planner-manager", "admin", "beheerder"].includes(role),
        );
      } catch {
        if (!cancelled) setIsManager(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { isManager, loading };
}
