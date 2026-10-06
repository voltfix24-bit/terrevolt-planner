# Architecture rules

- Keep Gantt export safety, grouping, and pagination as pure functions in `src/lib/gantt-export.ts` so customer isolation and page composition remain unit-testable.
