import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Returns true when the current user is an active planner-manager.
 * Mirrors public.is_planner_manager() — used for client-side UI gating
 * of mandagenregister/PII features. Server still enforces via RLS.
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
      const { data, error } = await supabase
        .from("planner_users")
        .select("role, active")
        .eq("user_id", user.id)
        .eq("active", true)
        .eq("role", "manager")
        .maybeSingle();
      if (cancelled) return;
      setIsManager(!error && !!data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { isManager, loading };
}
