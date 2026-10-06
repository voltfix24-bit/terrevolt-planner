# Architecture rules

- Keep Gantt export safety, grouping, and pagination as pure functions in `src/lib/gantt-export.ts` so customer isolation and page composition remain unit-testable.
- Keep mobile planning aggregation and capacity calculations pure in `src/lib/mobile-planning.ts` so read-only views share tested business interpretation without changing desktop editors.
- Derive active mobile day indexes once in the shared hook with `activeMobilePlanningDays`; calendar and capacity helpers use that same pure filter defensively, while raw indexes remain available only for explicitly inactive case records.
- Mobile planning screens share one React Query cache via `useMobilePlanningData` (no per-screen refetch, no N+1) and stay read-only; desktop-only admin routes render `DesktopOnly` on mobile.
- The app-shell service worker (vite-plugin-pwa generateSW) is registered only from `src/lib/pwa-register.ts`, never in dev/preview, and never caches backend/planning requests so data cannot go stale offline.
- Keep mobile UX derivations (next active planning, resource week grouping, case list labels/sort, week query param) pure in `src/lib/mobile-ux.ts`; resource grouping never classifies by name because monteur metadata cannot distinguish persons, crews or subcontractors.
- Gate all mobile planning screens with MobileDataGate and shared cache hasData/isStale; never show empty states or KPI zeros without successful data, to distinguish errors from genuinely empty planning.
- Use primary-text, destructive-text and warning-text semantic tokens for mobile signal text/icons/rings; retain original button/background tokens so desktop appearance is unchanged.
- Keep caseTitle, matchesSearch/normalizeForSearch, freshness, unavailable labels and case section/week ordering pure in mobile-ux.ts with Vitest coverage; normalize only display/search, never stored data.
- Mount shared-cache freshness only in the mobile topbar and initialize useIsMobile synchronously at the md breakpoint, to avoid duplicate freshness and initial desktop queries on phones.
