import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { create } from "zustand";
import type { IsoWeek } from "@/lib/mobile-planning";
import { formatMobileView, parseMobileView, selectMobileWeek } from "@/lib/mobile-ux";

const useWeekStore = create<{ week: IsoWeek | null; setWeek: (week: IsoWeek) => void }>((set) => ({ week: null, setWeek: (week) => set({ week }) }));

/** URL owns screen state; only the week is shared between planning and capacity. */
export function useMobileWeekView(preferredWeek?: IsoWeek, ready = true) {
  const [params, setParams] = useSearchParams();
  const stored = useWeekStore((s) => s.week); const setWeek = useWeekStore((s) => s.setWeek);
  const parsed = parseMobileView(params);
  const selected = selectMobileWeek(params.get("week"), stored ?? preferredWeek ?? null);
  const update = (patch: Partial<{ week: IsoWeek; query: string; open: string | null; mode: "week" | "overview" }>) => {
    const state = { week: selected, query: parsed.query, open: parsed.open, mode: parsed.mode, ...patch };
    setWeek(state.week);
    setParams(formatMobileView(params, state), { replace: true });
  };
  useEffect(() => {
    if (!ready) return;
    if (stored?.jaar !== selected.jaar || stored?.week_nr !== selected.week_nr) setWeek(selected);
    if (!parsed.week) setParams(formatMobileView(params, { week: selected, query: parsed.query, open: parsed.open, mode: parsed.mode }), { replace: true });
  }, [ready, selected.jaar, selected.week_nr, stored?.jaar, stored?.week_nr, params, setParams, setWeek]);
  return { params, selected, query: parsed.query, open: parsed.open, mode: parsed.mode, update, setParams };
}