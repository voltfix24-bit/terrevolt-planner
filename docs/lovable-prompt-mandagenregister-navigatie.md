# Lovable prompt — Mandagenregister beter bereikbaar maken

De huidige mandagenregister-sectie zit te verstopt op ProjectDetail. Verplaats de workflow naar een beter bereikbare plek vanuit de echte projectplanning.

## Gewenste UX

1. Op de projectplanningpagina `/plannen?project=<id>` moet in de bovenbalk een duidelijke knop komen:

   **Mandagenregister**

   Gebruik een passend icoon, bijvoorbeeld `ClipboardList` of `FileSpreadsheet` uit lucide.

2. Klik op deze knop navigeert naar een aparte pagina:

   `/mandagenregister?project=<id>`

3. Op die aparte pagina staat bovenaan:

   - terugknop naar `/plannen?project=<id>`
   - projectnummer/stationnaam
   - subtitel: `Mandagenregister`
   - korte status: aantal geplande dagen / monteurs als beschikbaar

4. De pagina toont daarna het bestaande `MandagenregisterPanel`.

## Periode/range

De gebruiker wil niet standaard handmatig een periode moeten raden. Bij openen van `/mandagenregister?project=<id>` moet standaard **alles wat voor die klus gepland staat** worden opgehaald.

Gebruik hiervoor de nieuwe RPC:

```ts
supabase.rpc("mandagenregister_project_range", { p_project_id: projectId })
```

Deze geeft terug:

- `first_planned`
- `last_planned`
- `planned_days`
- `planned_monteurs`

Gedrag:

- Als `first_planned` en `last_planned` bestaan: zet de periode standaard op die volledige range.
- Als er nog geen planning/monteurs zijn: val terug op huidige ISO-week en toon lege-state `Nog geen ingeplande monteurs voor dit project`.
- Laat de periodevelden wel zichtbaar als filter/aanpassing, maar niet als eerste drempel.
- Voeg een knop toe: `Volledige planning` om terug te springen naar `first_planned → last_planned`.

## Route toevoegen

Voeg een nieuwe route toe in `App.tsx` binnen de protected `AppLayout` routes:

```tsx
<Route path="/mandagenregister" element={<MandagenregisterPage />} />
```

Maak een nieuwe pagina:

```text
src/pages/Mandagenregister.tsx
```

Deze pagina:

- leest `project` uit querystring
- haalt het project op voor label/kop
- haalt via `mandagenregister_project_range` de volledige geplande range op
- rendert `MandagenregisterPanel` met die default range
- is manager-only via `useIsManager`
- als niet-manager: toon geen PII, liever redirect naar `/overzicht` of toon `Geen toegang`

## MandagenregisterPanel aanpassen

Breid `MandagenregisterPanel` uit met optionele props:

```ts
projectId: string;
defaultVan?: string | null;
defaultTot?: string | null;
showHeader?: boolean;
```

Of als het component al `projectId` heeft: voeg alleen `defaultVan/defaultTot` toe.

Gedrag:

- Wanneer `defaultVan/defaultTot` binnenkomen, gebruik die als periode.
- Als de gebruiker handmatig wijzigt, overschrijf dat niet telkens opnieuw.
- Voeg knop `Volledige planning` toe als default range bekend is.

## ProjectDetail

De bestaande ProjectDetail-sectie mag blijven, maar minder dominant. Voeg daar eventueel een knop toe:

`Open mandagenregister`

Die naar `/mandagenregister?project=<id>` gaat.

## Belangrijk

- Raak planningdata niet aan.
- Geen project_activiteiten, planning_cellen, cel_monteurs, sortering of projectvelden muteren.
- Alleen navigatie/UI en lezen via RPC.
- Manager-only beveiliging behouden.
- Build-check draaien.

## Test

1. Open `/plannen?project=<id>`.
2. Bovenin staat knop `Mandagenregister`.
3. Klik opent `/mandagenregister?project=<id>`.
4. Periode staat automatisch op eerste t/m laatste geplande dag van dit project.
5. Register toont alle geplande monteurs voor die klus.
6. Periode kan nog handmatig aangepast worden.
7. Knop `Volledige planning` zet periode terug naar volledige geplande range.
8. Niet-manager ziet de knop/pagina niet.
