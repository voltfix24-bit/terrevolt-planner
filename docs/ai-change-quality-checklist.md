# AI change quality checklist

Gebruik deze checklist bij Lovable/Codex-wijzigingen. Doel: kleine wijzigingen veilig houden en voorkomen dat werkende planningdata of UX ongemerkt achteruitgaat.

## Data en scope

- Raak alleen tabellen, velden en componenten die expliciet nodig zijn.
- Planningdata is kritisch: `project_weken`, `planning_cellen`, `cel_monteurs`, activiteiten en sortering alleen wijzigen als dat het doel is.
- Bulkacties moeten via RPC/audit/snapshot lopen waar beschikbaar.
- Bij herstel/normalisatie altijd vooraf duidelijk maken wat wordt ingevoegd, aangepast of verwijderd.

## UX

- Kleine acties geven geen globale laadstand.
- Gebruik lokale state-update plus stille refresh op de achtergrond.
- Behoud scrollpositie, filters, open dialogs en focus.
- Risicoacties krijgen een app-dialog, geen browser-achtige `window.confirm`.
- Dagelijkse acties blijven zichtbaar; zeldzame of risicovolle acties gaan onder `Meer`.

## Foutmeldingen

- Toon geen rauwe database- of SQL-fouten aan gebruikers.
- Gebruik `toUserFacingError` voor technische fouten.
- Log technische details alleen in de console met duidelijke scope.

## Security en privacy

- Manager-only acties blijven server-side afgedwongen met RLS/RPC checks.
- ZZP-export bevat geen BSN/ID-gegevens.
- Gevoelige gegevens nooit in toastmeldingen, bestandsnamen of debug-output tonen.

## Browser en thema

- Test light en dark mode.
- Test minimaal Chromium/Edge en Safari wanneer print/PDF/drag/drop/inputvelden geraakt worden.
- Date/number inputs moeten in dark mode leesbaar blijven.
- Print/PDF flows mogen de app of preview niet leeg maken.

## Verificatie

- Run TypeScript/build check.
- Test het normale pad en minimaal één edge case.
- Controleer dat bestaande functies bereikbaar blijven na UI-wijzigingen.
- Rapporteer kort: wat is aangepast, wat is niet geraakt, wat is getest.
