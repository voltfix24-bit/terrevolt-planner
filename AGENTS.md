# Architecture rules

- Keep Gantt export safety, grouping, and pagination as pure functions in `src/lib/gantt-export.ts` so customer isolation and page composition remain unit-testable.
- Keep mobile planning aggregation and capacity calculations pure in `src/lib/mobile-planning.ts` so read-only views share tested business interpretation without changing desktop editors.
