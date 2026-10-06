# Mobiele UX-audit TerreVolt Planner (alleen lezen)

Gemeten op 390x844 (iPhone, touch) met een ingelogde sessie, tegen de huidige code. Er is niets veranderd. Na akkoord bouw ik fase 1 (P0) hieronder.

## A) Wat nu goed werkt op mobiel
- **Geen horizontale pagina-overflow.** Op `/overzicht`, `/projecten`, `/plannen` en `/capaciteit` is de pagina precies 390px breed. Brede onderdelen scrollen alleen binnen hun eigen blok.
- **Bovenbalk.** Op mobiel is er een vaste bovenbalk met menuknop, schuifmenu, donkere achtergrond en de knop Ongedaan (`AppLayout.tsx`).
- **Projecten.** De lijst is gegroepeerd per periode (Deze week, Binnenkort, ...) en heeft zoeken en statusfilters. Dat is al bijna een bruikbaar "Cases"-scherm.
- **Capaciteit.** De tabellen worden onder 640px kaarten (`capaciteit-fixes.css`). De tabs lopen door op een tweede regel in plaats van eruit te vallen.
- **Overzicht.** Er is een aparte mobiele filterknop (`Overzicht.tsx` r.1900). De weeknavigatie met de knop "Vandaag" is compact.
- **Exportdialoog.** Die past zich goed aan op mobiel (eerder gecontroleerd).

## B) Concrete problemen op de telefoon
1. **Overzicht is een desktopraster.** Er passen ongeveer 1,2 week in beeld. De naamkolom toont alleen initialen ("HG", "MA"). Je ziet geen project of case in beeld, alleen gekleurde cellen. Week 2 wordt afgekapt ("W..."). Over het hele scherm moet je in twee richtingen scrollen.
2. **De waarschuwing over het planningsvenster duwt de inhoud omlaag.** Ze staat open boven de planning en neemt ongeveer 25% van het eerste scherm in. Op mobiel is dat beheerinformatie, geen raadpleeginformatie.
3. **"Gantt printen" en "15% CAP." staan in de belangrijkste knoppenrij.** Printen is op een telefoon niet relevant.
4. **`/plannen` zonder geselecteerd project is een doodlopend scherm.** Er staat alleen "Naar projecten". Met een project open krijg je het volledige bewerkraster met slepen, doortrekken en rechtsklikken. Dat werkt niet met touch en is foutgevoelig: een tik kan per ongeluk een cel wijzigen.
5. **Projecten heeft 101 te kleine aanraakvlakken (kleiner dan 32px).** Dat zijn vooral de icoonknoppen Dossier, Inplannen en Verwijderen per kaart. De verwijderknop staat direct naast Inplannen, wat een groot risico op misklikken geeft. "Project toevoegen" staat prominent bovenaan, terwijl mobiel om raadplegen draait. De pagina is ongeveer 5600px hoog en er is geen filter op week of opdrachtgever.
6. **Capaciteit begint met beheer.** De standaardtab is Monteurs: een lijst met bewerk-, activeer- en uitschakelknoppen en "Monteur toevoegen". Het antwoord op "hoeveel capaciteit is er in week X" zit in de tabs Tijdlijn en Beschikbaarheid, die zelf brede rasters zijn.
7. **Hamburgermenu met 6 bestemmingen.** Activiteiten en Instellingen zijn beheerpagina's. Er is geen onderste navigatiebalk, dus alles vraagt twee tikken bovenin het scherm. Dat is lastig met één hand.
8. **Prestaties.** Overzicht rendert ongeveer 1500 elementen voor 4 weken. Dat is prima nu, maar het groeit lineair met monteurs maal dagen. Projecten heeft ongeveer 1750 elementen. Daarnaast is er een kunstmatige resize-trigger in `Overzicht.tsx` r.456 (willekeurige `viewportW`-wijziging bij `nav-resize`), die volledige herberekeningen veroorzaakt.
9. **Dialogen en hover.** Monteurnamen zitten vaak in een tooltip of `title`-attribuut. Op touch zijn die onbereikbaar.
10. **ProjectDetail en Dossier** zijn lange desktopformulieren. Er is geen compact leesoverzicht "wat staat wanneer gepland".

## C) Wat relevant is op mobiel en wat niet
**Relevant (alleen lezen):**
- Planning per case per week en dag
- Activiteiten, ploeg en monteurs per dag, opdrachtgever, status, adres (met navigatielink)
- Capaciteit per week (bezet / beschikbaar), wie werkt waar deze week
- Zoeken op case, station, opdrachtgever en week
- Lichte acties: bellen/navigeren, dossier/tekeningen bekijken, mandagenregister openen

**Alleen desktop:**
- Cellen bewerken, slepen, doortrekken en verschuiven
- Weken toevoegen of verwijderen, planning opschonen
- Gantt-print en exports, Activiteiten- en lookupbeheer, Instellingen
- Monteurbeheer, project aanmaken of verwijderen, conceptplanning

## D) Mobiele informatiestructuur: 4 tabs in een onderste navigatiebalk
```text
[ Vandaag ]  [ Cases ]  [ Planning ]  [ Capaciteit ]
```
- Het hamburgermenu blijft bestaan voor "Meer": Instellingen, thema, uitloggen en een desktoplink.
- Alles alleen vanaf breakpoint `md` (<768px). Desktop blijft ongewijzigd.

## E) Schermen
- **Vandaag / Deze week.** Bovenaan schakel je tussen dagen (ma–vr, vandaag gemarkeerd). Daaronder kaarten per project dat die dag actief is: case, station, opdrachtgever, activiteit(en), statuskleur en monteurchips met volledige naam. Onderaan een korte regel: "12 monteurs · 9 ingepland · 3 vrij". Een tik op een kaart opent Case-detail.
- **Cases.** De bestaande Projecten-lijst wordt de basis, met:
  - één zoekveld
  - filterchips: status, opdrachtgever en week (onderblad)
  - kaarten met eerste en laatste planningsdatum, de eerstvolgende werkdag en een "deze week"-badge
  - geen verwijderknop of "toevoegen" op mobiel
- **Planning.** Een lijst per week in plaats van een raster. Je kiest een week (pijltjes plus vegen). Daaronder per project een balk met 5 dagstippen, gekleurd per status; uitklappen toont de activiteiten per dag. Een schakelaar "Per monteur" toont per monteur de 5 dagen met een projectnaam, geen initialen.
- **Capaciteit.** Zie G.

## F) Case-detail op mobiel
- **Kop:** case-nummer, station, status-badge, opdrachtgever en adres met knop "Navigeer" (maps-link).
- **Planning:** gegroepeerd per week, inklapbaar, huidige week open. Per dag een regel "Ma 05/10 · Kabel trekken · AS, MH", waarbij een tik de volledige monteurnamen toont.
- **Activiteitenlijst:** totaal aantal geplande dagen en de eerste en laatste datum per activiteit.
- **Ploeg:** unieke monteurs met hun aantal dagen.
- **Kerngegevens:** periode, aantal weken, on hold-melding.
- **Acties:** dossier, tekeningen en mandagenregister bekijken, plus "Open op desktop" (kopieer link).
- **Route:** `/m/cases/:id`, of een mobiele weergave binnen `ProjectDetail`.

## G) Capaciteit op mobiel
- Verticale lijst van de komende 8 weken (schakelaar 6/8/12). Per week een balk bezet/beschikbaar in mandagen, bijvoorbeeld "W42 · 38/55 md · 69%", met een kleur bij overboeking en een telling van vrije dagen en verlof.
- Een tik op een week opent een weekdetail: per dag het aantal bezette monteurs, daarna per ploeg of monteur waar die werkt (project) of vrij/verlof.
- Projecten met status on hold tellen niet mee, zoals de bestaande regel voorschrijft.

## H) Op mobiel verbergen, vereenvoudigen of alleen-lezen maken
- **Plannen:** volledig alleen-lezen op touch/mobiel, met een melding "Bewerken op desktop".
- **Overzicht-raster:** vervangen door de Planning-lijst. Het raster blijft beschikbaar als optionele weergave "Raster".
- **Waarschuwing planningsvenster:** standaard ingeklapt tot één regel.
- **Gantt printen, Exports, Monteur toevoegen, Project toevoegen/verwijderen, Opschonen, Activiteiten, Lookupbeheer:** niet zichtbaar op mobiel.
- **Capaciteit:** standaardtab op mobiel wordt het weekoverzicht; Monteurs wordt alleen-lezen.

## I) Prioriteiten en fasering
- **P0, fase 1** (laag risico, alleen mobiel):
  - onderste navigatiebalk
  - `/plannen` alleen-lezen op mobiel
  - beheerknoppen verbergen
  - aanraakvlakken van minimaal 44px op de Projecten-kaarten
  - waarschuwing standaard ingeklapt
  - Overzicht op mobiel standaard naar een weeklijst
- **P1, fase 2:**
  - mobiel Case-detail
  - capaciteitsweken met weekdetail
  - Cases-filters op opdrachtgever en week
- **P2, fase 3:**
  - Vandaag-scherm
  - "Per monteur"-weergave
  - vegen tussen weken
  - de `nav-resize`-hack opruimen
  - beperkt renderen van lange lijsten
- **Voorkomen van desktopproblemen:** alle wijzigingen achter `useIsMobile()` of Tailwind `md:`. Geen wijzigingen aan bewerklogica. Nieuwe pure helpers (weekaggregaties) krijgen unit tests. Desktop-screenshots worden voor en na vergeleken.

## J) Bestanden

**Aanpassen:**
- `src/components/AppLayout.tsx`: onderste navigatiebalk, menu als "Meer"
- `src/components/AppSidebar.tsx`: mobiel alleen Meer-items
- `src/pages/Overzicht.tsx`: mobiele weeklijst, waarschuwing ingeklapt, Gantt/CAP verbergen
- `src/pages/Plannen.tsx`: alleen-lezen-modus op mobiel
- `src/pages/Projecten.tsx`: aanraakvlakken, filters, beheeracties verbergen
- `src/pages/Capaciteit.tsx`: mobiele standaardtab
- `src/pages/ProjectDetail.tsx`: mobiele weergave
- `src/components/PlanningSafetyBanner.tsx`: ingeklapte variant
- `src/App.tsx`: routes

**Toevoegen:**
- `src/components/mobile/MobileBottomNav.tsx`
- `src/pages/mobile/Vandaag.tsx`, `MobilePlanning.tsx`, `MobileCapaciteit.tsx`, `MobileCaseDetail.tsx`
- `src/lib/mobile-planning.ts` + test: per week/dag groeperen, bezetting/beschikbaarheid berekenen

## Technische notities
- Bestaande data hergebruiken (project_cellen, cel_monteurs, project_weken, monteurs, opdrachtgevers). Geen schemawijzigingen.
- On hold uitsluiten via de bestaande status in de capaciteitsberekening.
- Mobiel alleen-lezen afdwingen in de mutatiehandlers van `Plannen.tsx` met een guard, niet alleen door de knoppen te verbergen.
