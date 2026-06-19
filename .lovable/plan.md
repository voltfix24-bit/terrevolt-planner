## Doel

Optimistic UI + silent refresh consistent toepassen in de hele app. Kleine acties knipperen niet meer; globale loader alleen bij eerste laad, projectwissel of bulkacties.

## Aanpak per pagina

### 1. `src/pages/Plannen.tsx`
`loadAll({ silent })` bestaat al (van vorige refactor). Uitbreiden naar alle mutaties:
- `setCelKleur`, `setCelNotitie`, `setCelActiviteit`, `setCelCapaciteit`: optimistisch `setCellen` updaten vóór RPC. Bij error: revert + toast. Op succes: geen reload.
- `addMonteurToCel` / `removeMonteurFromCel`: lokaal `setCelMonteurs` muteren, daarna RPC, revert bij fout.
- `clearCel` / `deleteCel`: lokaal verwijderen, daarna RPC.
- Drag-move cel: lokaal verplaatsen vóór RPC.
- "Weken beheren" toggles (week toevoegen/verwijderen): lokaal `setWeken` updaten, dan RPC, bij succes `loadAll({ silent: true })` voor positie-normalisatie.
- Globale `setLoading(true)` blijft alleen in `loadAll` zonder `silent`, aangeroepen bij mount en bij projectwissel.

### 2. `src/pages/Overzicht.tsx`
- Statuswijziging project: rij lokaal updaten, dan UPDATE, revert bij fout.
- Planning verschuiven (week-shift): lokaal `projecten`/`weken` aanpassen, RPC, silent refresh op succes.
- Sortering: pure client-side, geen loader.
- Geen volledig herladen na elke actie.

### 3. `src/pages/Mandagenregister.tsx` + `MandagenregisterPanel.tsx`
- Uren-cel edit: lokaal `regels` muteren onmiddellijk, dan upsert, revert bij fout.
- Exportlog refresh: alleen die lijst silent refetchen, geen paginalader.

### 4. `src/pages/Capaciteit.tsx`
- Monteurgegevens edits (naam, ploeg, etc.): optimistisch, revert bij fout.
- Beschikbaarheid toggles (afwezigheid aan/uit): lokaal toggle, dan insert/delete, revert bij fout.
- Registergegevens via `MonteurRegisterDialog`: dialoog sluit direct, lijst lokaal updaten.

## Patroon (code-conventie)

```ts
const prev = state;
setState(next);                       // optimistic
try {
  const { error } = await supabase...;
  if (error) throw error;
  void reload({ silent: true });      // optioneel
} catch (e) {
  setState(prev);                     // revert
  toast.error("Opslaan mislukt");
}
```

Alle bestaande `setLoading(true)` rondom enkelvoudige mutaties wordt verwijderd. `loadAll/load*` krijgen overal een `{ silent?: boolean }` optie zoals al in `Plannen.tsx`.

## Behoud van UI-state

- Geen `key` resets op containers na een mutatie.
- Geen `window.scrollTo` calls toevoegen.
- Dialogen niet automatisch sluiten/heropenen door reload.
- Filters/sortering/expansions blijven in component-state — niet refetchen.

## Verificatie

- `npx tsc --noEmit` schoon.
- Bestaande tests draaien (`vitest run`).
- Handmatig: cel-acties op /plannen knipperen niet; status op /overzicht switcht direct; uren-edit op /mandagenregister voelt instant; afwezigheid-toggle op /capaciteit zonder loader.

## Out of scope

- Geen schema-/RPC-wijzigingen.
- Geen visuele redesign.
- Undo-flow blijft zoals nu (history push gebeurt na succesvolle mutatie).
