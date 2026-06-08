# Globale Undo + bevestiging bij verschuiven

## 1. Database — audit log (persistent)

Nieuwe tabel `public.audit_log`:
- `id`, `created_at`, `user_id` (nullable)
- `table_name` (text)
- `operation` (`INSERT` | `UPDATE` | `DELETE`)
- `row_pk` (jsonb) — primary key(s) van de rij
- `old_data` (jsonb) — bij UPDATE/DELETE
- `new_data` (jsonb) — bij INSERT/UPDATE
- `label` (text, nullable) — vrije beschrijving (bijv. "Project X met 3 dagen verschoven")
- `batch_id` (uuid) — groepeert mutaties die bij dezelfde actie horen, zodat één undo de hele groep terugdraait
- `undone` (boolean, default false)

Generieke trigger `public.audit_trigger()` (SECURITY DEFINER) op alle datatabellen die de UI muteert:
`planning_cellen`, `cel_monteurs`, `project_concept_planning`, `project_concept_monteurs`, `project_weken`, `projecten`, `project_activiteiten`, `project_ls_kabels`, `project_ms_kabels`, `project_tekeningen`, `monteurs`, `monteur_afwezigheid`, `ploegen`, `ploeg_monteurs`, `activiteit_types`, `opdrachtgevers`, `percelen`, `feestdagen`, `project_templates`.

Helper-functie `public.undo_last(batch_uuid uuid default null)`:
- Pakt laatste niet-undone `batch_id` (of meegegeven id) en draait per record terug:
  - `INSERT` → `DELETE` op pk
  - `DELETE` → `INSERT` met `old_data`
  - `UPDATE` → `UPDATE` met `old_data`
- Markeert rijen als `undone = true`.
- De trigger logt zelf niet tijdens undo (session-variabele `app.suppress_audit = 'on'`).

RLS: `SELECT/UPDATE` op `audit_log` voor `authenticated`; `INSERT` alleen via trigger.

## 2. Frontend — batch-helper

Nieuw bestand `src/lib/audit.ts`:
- `withBatch(label, fn)` zet vóór de mutaties een `batch_id` via `select set_config('app.audit_batch', uuid, true)` en `set_config('app.audit_label', label, true)`, voert `fn()` uit, en geeft het batch-id terug.
- `undoLast()` → roept rpc `undo_last` aan.
- `useUndoStack()` hook: laadt recente niet-undone batches voor UI-lijst, realtime refresh.

Alle bestaande mutatie-helpers in `Plannen.tsx`, `Overzicht.tsx`, `ProjectConceptPlanning.tsx`, `Projecten.tsx`, `ProjectDetail.tsx`, `Activiteiten.tsx`, `Capaciteit.tsx`, `Instellingen.tsx` worden in `withBatch("…")` gewikkeld zodat elke actie één duidelijke entry krijgt.

## 3. UI — Undo-knop

In `src/components/AppLayout.tsx` (topbar) een knop `↶ Ongedaan maken`:
- Toont laatste actie-label als tooltip.
- Disabled wanneer er geen batch is.
- Dropdown met laatste 20 acties → klik = die specifieke batch terugdraaien (waarschuwing als er nieuwere acties bovenop liggen).
- Sneltoets `Ctrl/Cmd+Z`.

## 4. Bevestigingsdialogs bij ALLE verschuif-acties

Generieke `ConfirmDialog` (shadcn `AlertDialog` wrapper) in `src/components/ConfirmDialog.tsx`.

Toegepast op:
- `Overzicht.tsx` → `shiftProjectPlanning` (drag op projectbalk én elke `shiftDay`-actie).
- `Plannen.tsx` → `shiftGroup` (toolbar +/-1/-5), drag-and-drop verplaatsen van 1 of meer cellen.
- `ProjectConceptPlanning.tsx` → `shiftSelection` (toolbar +/-1/-5).

Dialog toont: aantal cellen/projecten, richting (vooruit/achteruit), aantal dagen. Bevat checkbox "Deze sessie niet meer vragen voor 1-dag verschuivingen" (opt-out per sessie, persisted in `sessionStorage`) zodat het niet te irritant wordt voor losse cellen.

## Technische details
- Audit-trigger draait altijd, ook buiten `withBatch`: dan krijgt elke statement een eigen `batch_id` (`gen_random_uuid()`), nog steeds undo-baar.
- Drag-and-drop in Plannen voert al meerdere updates uit binnen één callback → die hele callback in één `withBatch` zodat één Undo de complete sleep terugdraait.
- `undo_last` draait records in omgekeerde volgorde terug om FK-volgordeproblemen te voorkomen.
- Geen wijzigingen aan bestaande tabel-schema's; alleen triggers toevoegen.
- Realtime: undo-stack ververst via Supabase realtime kanaal op `audit_log`.
