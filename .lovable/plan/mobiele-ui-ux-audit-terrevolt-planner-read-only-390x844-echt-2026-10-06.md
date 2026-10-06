# Mobiele UI/UX-audit TerreVolt Planner (read-only, 390x844, echte data, 6 okt 2026)

Getest: /overzicht, /projecten (+ zoeken "Apeldoorn"), /plannen per case + per monteur (week 41 en 44, uitgeklapt), /capaciteit weekkalender + komende weken (uitgeklapt), actieve case 0307973 Snijdersplaats, on-hold case 295341 Waterlandsweg, /plannen?project=<on-hold> en ?project=<actief>. Geen horizontale overflow (scrollWidth 390 overal), geen runtimefouten, geen afgekapte tekst gemeten.

## 1. Verdict
Field-ready: **ja, voor raadplegen** — **7/10**. Het datamodel en de on-holdscheiding kloppen; de grootste winst zit in "wat zie ik als er vandaag niets is", ruis in monteurlijsten en het Cases-scherm dat nog de desktoppagina is.

## 2. Top 5 sterk (niet aankomen)
1. On hold is overal schoon: week 41 bevat alleen on-holdcellen en toont correct "Geen actieve planning"; /plannen?project=295341 toont nette blokkade met Terug naar cases / Alle planning.
2. Case-weekkalender: 0307997 Hogedries in één kaart van 96px, MA "CY AS +2", uitklap met volledige activiteiten en namen per dag. Precies het juiste compact/uitklap-niveau.
3. Twee perspectieven consistent: dezelfde 14 ingepland / 45 vrij / 24% in Planning en Capaciteit week 44.
4. Touch targets: alle knoppen 44px+, dagtabs 56px, kaarten 96px; bottom nav 4 items duidelijk.
5. Freshness "Bijgewerkt 16:18" + vernieuwknop, offline-melding, read-only boodschap in "Meer".

## 3. Top 10 issues
| # | P | Probleem -> impact -> oplossing |
|---|---|---|
| 1 | P0 | **Vandaag is leeg zonder vervolg** (week 41 alleen on hold): "Geen projecten gepland" en 0% -> uitvoerder weet niet wanneer het weer loopt -> toon "Eerstvolgende actieve planning: ma 26 okt · 0307997 Hogedries" met tik naar /plannen in die week. |
| 2 | P1 | **Cases-scherm is de desktoppagina**: 6335px hoog, 1679 DOM-nodes, lege witruimte boven chips, weekdropdown met 25+ opties, titel "Projecten" terwijl nav "Cases" zegt -> trage scan -> mobiele lijstkaart (case · station, status, volgende dag) met zoekveld bovenaan en filters in één inklapbare rij; titel "Cases". |
| 3 | P1 | **Per monteur/Capaciteit: alle "Vrij"-rijen even groot** (9 van 12 monteurs leeg in week 44, 1787px scroll) -> "wie staat waar" verdwijnt onder ruis -> sorteer ingeplande/conflict eerst, vrije monteurs samengevoegd in één regel "Vrij hele week: Hamza, Hassan, ... (7)" uitklapbaar. |
| 4 | P1 | **Niet-personen als monteur**: "Kevin+maat", "Smart Infra", "Sami" tellen als 5 slots elk in 59 beschikbaar -> capaciteit lijkt groter -> markeer onderaannemer/ploeg apart (alleen weergave; geen schemawijziging: label op basis van bestaande data of instelling, overleg nodig). |
| 5 | P1 | **Weeknavigatie scrollt weg**: na uitklappen (1184-2171px) geen weekcontext meer -> sticky compacte balk "Week 44 · ‹ ›" + Per case/Per monteur onder de header. |
| 6 | P1 | **Case-context zonder planning** (/plannen?project=0307973) springt naar huidige week met "Geen actieve planning in deze week" -> lijkt fout -> specifieke melding "Deze case heeft nog geen planning". Mogelijk dubbele case: 0307973 bestaat 2x (met en zonder "–"), één zonder planning en adres "Amsterdam" -> datakwaliteit melden, niet in code oplossen. |
| 7 | P1 | **Celkleuren niet uitlegbaar**: alle geplande cellen ongeveer dezelfde groen/geel tint; legenda alleen in uitklap per dag -> kleur draagt weinig info -> één kleine legendaregel boven de lijst, of kleur alleen voor conflict/afwezig/gepland (3 toestanden). |
| 8 | P2 | **Dagcellen 9-10px tekst**, "Vrij" lichtgrijs op lichtgroen (laag contrast buiten in zon) -> 11-12px, casecode bold, "Vrij" als lege cel met streep. |
| 9 | P2 | **Vandaag dagcapaciteit vs Planning-weektelling** (12 beschikbaar vs 59 vrij) zonder eenheid -> "monteurs" vs "monteur-dagen" expliciet labelen. |
| 10 | P2 | **Zoeken ontbreekt in Per monteur/Capaciteit** ("Waar staat Hassan donderdag?") en paginakoppen nemen ~110px -> naamfilter + kleinere koppen. |

## 4. Bevindingen per scherm
- **A Vandaag**: hiërarchie goed (titel, dagtabs, capaciteit, cases). Mist eerstvolgend werk (#1) en conflictlink naar betrokken monteurs. Swipe + Vandaag-knop werken.
- **B Cases**: zie #2. Zoeken werkt (Apeldoorn -> 2 kaarten, "Volgende: ma 26 okt · week 44" is waardevol, behouden). Twee knoppen per kaart (Dossier/Planning bekijken) verdubbelen lengte.
- **C Per case**: sterk. Lange activiteitenregel bij uitklap ("Aarding slaan · Demontage · ... Schakelen MS+LS") prima. Alleen actieve cases — goed.
- **D Per monteur**: data klopt (Samir alleen MA/VR). Ruis #3/#4, geen zoeken.
- **E Capaciteit weekkalender**: samenvatting 59/14/45/0 helder; identiek aan D waardoor twee tabs bijna hetzelfde scherm zijn -> differentieer: Capaciteit focust op vrij/afwezig (vrij-eerst sortering), Planning per monteur op ingepland.
- **F Komende weken**: 6/8/12 weken + percentages scanbaar; kaarten 112px maar weinig info; mini-balk per week en tik -> naar weekkalender van die week ontbreken.
- **G Case-detail**: on-hold melding duidelijk, maar "On hold" staat 3x (chip, melding, label) -> één melding. "Werkdagen 0 · Weken 0 · 0" blok bij geen planning is ruis -> verbergen.
- **H Bottom nav/Meer**: goed. "Meer" dupliceert Overzicht/Projecten/Plannen/Capaciteit met andere namen -> labels gelijk trekken.
- **I Freshness/PWA**: goed; staat onderaan, bij lange lijsten buiten beeld -> tijd ook in sticky balk tonen.

## 5. Aanbevolen hiërarchie
```text
Vandaag:   Dag + tabs | capaciteit (3 cijfers) | cases vandaag | [leeg -> eerstvolgende]
Planning:  sticky week+toggle | zoek | case-kaarten (5 cellen) -> uitklap per dag
Monteur:   sticky week | ingepland/conflict eerst | "Vrij hele week (n)" ingeklapt
Capaciteit: sticky week | 4 cijfers | afwezig/vrij-perspectief | komende weken -> tik naar week
Cases:     zoek | filterrij ingeklapt | kaart: case·station, status, volgende dag
Detail:    case·station, status 1x, opdrachtgever | navigeer | planning | dossier
```

## 6. Niet aanpassen
Centrale on-holdfilter en blokkade; case-kaart compactie (initialen +N); 5 vaste kolommen; standaard ingeklapt; 44px targets; bottom nav 4 items; React Query gedeelde cache; PWA zonder datacache; desktop.

## 7. Gefaseerd plan
- **Quick wins**: #1 eerstvolgende planning, #6 melding geen planning, #8 celtypografie/contrast, #9 eenheden, Cases-titel, on-hold 1x op detail.
- **Volgende release**: #3 vrije monteurs samenvouwen, #5 sticky weekbalk, #10 monteurzoek, #7 legenda, Komende weken tik -> week, #2 mobiele Cases-lijst.
- **Later**: #4 onderaannemer-weergave (keuze gebruiker nodig), duplicaat 0307973 opschonen (data), lijstvirtualisatie bij >50 kaarten.

## 8. Bestanden per voorstel
- #1, #9: `src/components/mobile/MobileToday.tsx`, helper `targetWeekForDays` in `src/lib/mobile-planning.ts`
- #2: nieuw mobiel lijstcomponent naast `src/pages/Projecten.tsx` via `ResponsivePage` in `src/App.tsx`
- #3, #4, #10: `MobileWeekPlanning.tsx`, `MobileCapacity.tsx`, `MobileWeekCards.tsx` (MonteurWeekCard), sorteerhelper in `mobile-planning.ts` + tests
- #5: `MobileWeekNavigation.tsx`, `MobileShared.tsx` (FreshnessBar compact)
- #6, G: `MobileWeekPlanning.tsx`, `MobileProjectDetail.tsx`
- #7, #8: `MobileWeekCards.tsx` (cellTone), `src/index.css` tokens
- F: `MobileCapacity.tsx`; H: `src/components/AppSidebar.tsx`

## Open vraag
Moeten "Kevin+maat", "Smart Infra" en "Sami" als onderaannemer/ploeg apart getoond worden en buiten de monteur-capaciteit vallen? Dat bepaalt #4.
