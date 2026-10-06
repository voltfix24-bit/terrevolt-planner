# Roadmap

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
- [ ] Centrale actieve planningfilter en geblokkeerde on-hold context
- [ ] Compacte casekalender en monteurkalender met uitklapdetails
- [ ] Capaciteit standaard weekkalender; komende weken behouden
- [ ] Vandaag en case-detail consequent on-hold behandelen
- [ ] Regressietests en mobiele/desktop browsercontrole
