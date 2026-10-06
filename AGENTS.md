# Architecture rules

- Keep Gantt export safety, grouping, and pagination as pure functions in `src/lib/gantt-export.ts` so customer isolation and page composition remain unit-testable.
- Keep mobile planning aggregation and capacity calculations pure in `src/lib/mobile-planning.ts` so read-only views share tested business interpretation without changing desktop editors.
- Mobile planning screens share one React Query cache via `useMobilePlanningData` (no per-screen refetch, no N+1) and stay read-only; desktop-only admin routes render `DesktopOnly` on mobile.
- The app-shell service worker (vite-plugin-pwa generateSW) is registered only from `src/lib/pwa-register.ts`, never in dev/preview, and never caches backend/planning requests so data cannot go stale offline.
