# Roadmap

## Desktop Gantt — chronologische volgorde en logo
- [ ] Pure exportsortering binnen bestaande opdrachtgevergroepen
- [ ] Bestaand TerreVolt-beeldmerk in iedere printheader
- [ ] Regressietests, volledige tests en echte desktop-printpreview QA

## Mobiele signalen en visuele inhoud — fase 3
- [x] Uitzonderingenbalk, eigen amber afwezigheidssignaal en activiteitcellen
- [x] Gedeelde dagkop, conceptbadge en conceptmandagen
- [x] Vrij-op-dagfilter, eerlijke capaciteit en vrije ruimte komende weken
- [x] Latente overlap on hold, case-context en week-/dagovergangen
- [x] Pure regressietests, volledige tests en QA op 360/390px en desktop (235 tests; automatische typecheck/build OK; uitzonderingen met tijdelijke browserfixtures, tikdoelen en on-hold-detail gecontroleerd zonder opgeslagen data te wijzigen)

- [x] Build client-safe external/internal Gantt export selection.
- [x] Replace the compact print popover with a responsive export dialog.
- [x] Add deterministic A3 week and row pagination with explicit page numbers.
- [x] Add printable day dates, opdrachtgever grouping and monteur name legends.
- [x] Show opdrachtgever subtly in expanded overview project rows.
- [x] Add focused unit tests and verify desktop/mobile UI, typecheck and build.
- [x] Add mobile bottom navigation and safe-area spacing.
- [x] Build mobile Today, Cases, global Planning, case-detail and Capacity read views.
- [x] Guard planning drag/fill/week mutations and replace the mobile editor with a read-only route.
- [x] Add mobile aggregation tests and run mobile/desktop QA.
- [x] Align mobile capacity with werkdagen, afwezigheid and feestdagen, then revalidate mobile views.

## Mobiel ronde 2
- [x] Read-only consistentie (geen Undo, sidebar zonder beheer, beheerroutes desktop-only)
- [x] /plannen?project= context + doelweek
- [x] Case-detail: unieke werkdagen, dagblokken, week-accordion
- [x] Capaciteit: plannedAvailable/free, onbeschikbaar ingepland, conflicten
- [x] Vandaag: dynamische titel, dag-capaciteit, weekcontext
- [x] Per monteur-weergave
- [x] Swipe dagen/weken
- [x] Gedeelde cache + "Bijgewerkt" + vernieuwen
- [x] PWA (manifest, iconen, guarded service worker zonder datacache)
- [x] Cases: filters wissen, volgende/afgelopen datum

## Compacte mobiele weekkalenders
- [x] Centrale actieve planningfilter en geblokkeerde on-hold context
- [x] Compacte casekalender en monteurkalender met uitklapdetails
- [x] Capaciteit standaard weekkalender; komende weken behouden
- [x] Vandaag en case-detail consequent on-hold behandelen
- [x] Regressietests en mobiele/desktop browsercontrole

## Mobiele UX-audit verbeterronde
- [x] Vandaag: eerstvolgende actieve planning (?week=)
- [x] Case-context zonder planning, on-hold detail opgeschoond
- [x] Dagcellen: 11px, operationele kleuren + legenda
- [x] Eenheden monteurs/mandagen, mobiele labels Vandaag/Cases/Planning/Capaciteit
- [x] Mobiele Cases-lijst met zoeken en inklapbare filters
- [x] Vrije monteurs gebundeld, secties in Capaciteit, monteurzoek
- [x] Sticky weekbalk met actualiteit; Komende weken -> weekkalender

## Mobiele betrouwbaarheid — fase 1
- [x] Gedeelde foutgate en actualiteit in mobiele topbar
- [x] Ondubbelzinnige beschikbaarheid en contrastrijke teksttokens
- [x] Synchrone mobiele detectie, titels/zoeken en Cases-secties
- [x] Licht manifest, architectuurregels, volledige tests en mobiele QA

## Mobiele structuur en navigatie — fase 2
- [x] Signaaltokens met opacity-ondersteuning
- [x] Planning alleen per case, gedeelde week en URL-staat
- [x] Accountpaneel en contextbewuste terugnavigatie
- [x] Kruislinks, monteurfocus en geordend case-detail
- [x] Vandaag: komende week in weekend, cases eerst en vrije namen
- [x] Pure helpertests, volledige tests en mobiele/desktop QA (215 tests; automatische typecheck/build OK; 390×844 zonder overflow; amber rand en heen/terug-context gecontroleerd)
