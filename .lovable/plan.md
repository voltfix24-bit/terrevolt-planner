# Professionele, klantveilige Gantt-export

## Doel
De bestaande Gantt-export wordt een ruime, duidelijke exportdialoog met een veilige klantmodus en een flexibele interne modus. De PDF gebruikt altijd leesbare A3-landscape pagina’s, zonder database- of planningwijzigingen.

## Aanpak

### 1. Exportveiligheid en selectie
- Voeg exporttype **Opdrachtgever** (standaard) en **Intern** toe.
- Selecteer bij openen automatisch het actieve opdrachtgeverfilter, indien aanwezig; anders blijft opdrachtgever verplicht leeg.
- Beperk in opdrachtgevermodus zowel de zichtbare projectlijst als de uiteindelijke exportdata strikt tot exact één gekozen opdrachtgever.
- Voeg direct vóór renderen een tweede pure veiligheidscontrole toe die gemengde, ontbrekende of afwijkende opdrachtgever-ID’s blokkeert.
- Interne modus staat gemengde en ontbrekende opdrachtgevers toe, groepeert projecten per opdrachtgever en toont “Geen opdrachtgever” waar nodig.

### 2. Ruime exportdialoog
- Vervang de kleine popover door een responsive dialoog van circa 800 px breed met vaste secties: exporttype, opdrachtgever, periode, projecten, weergave, samenvatting en actie.
- Behoud 4/8/12-wekenpresets, vanaf nu, van/tot, weekfijnafstemming, projectselectie, lege-wekenfilter en monteursweergave.
- Voeg printindeling toe: Detail (4), Standaard (6, standaard) en Compact (8 weken per A3-pagina).
- Toon tellingen, lege toestanden, waarschuwingen voor projecten zonder opdrachtgever en een live samenvatting.
- Hernoem “Namen” naar **Initialen + namenlijst** zonder de bestaande interne waarde te breken.

### 3. Expliciete A3-paginering
- Splits weken met pure chunklogica in blokken van 4/6/8.
- Paginateer projectgroepen daarnaast verticaal met een vast row-budget: een projectkop blijft bij minimaal één activiteit, passende groepen blijven heel en grote projecten splitsen alleen tussen activiteiten met herhaalde projectkop.
- Bouw iedere pagina expliciet op met eigen documentheader, week-/dagheaders, tabel, relevante monteurslegenda en footer “Pagina X / Y”.
- Verwijder A2-keuze, primaire transform-scaling en de ondertekenregel.

### 4. Leesbaarheid en branding
- Toon `WEEK 40` en dag + datum, bijvoorbeeld `MA 05/10`.
- Houd project-/activiteittekst ruim leesbaar, weekgrenzen sterk en statuskleuren exact printbaar; voeg randen/patronen als extra niet-kleurcodering toe.
- Externe export krijgt opdrachtgever in titel/header/samenvatting en klantbranding zonder interne vertrouwelijkheidsmelding.
- Interne export krijgt “Intern planningsoverzicht”, opdrachtgever per groep/project en “Intern gebruik”.
- Monteurmodus “Initialen + namenlijst” toont volledige namen afdrukbaar per pagina, nooit alleen via tooltips.

### 5. Opdrachtgever herkenbaar in Overzicht
- Voeg in uitgeklapte projectregels een subtiele opdrachtgeverregel/chip toe via de bestaande lookup.
- Houd de ingeklapte sidebar compact en verander geen bestaande filters of planninginteracties.

## Technische details
- Breid de exporttypes uit met `opdrachtgever_id`, opdrachtgevernaam, exportmodus en weekindeling.
- Houd filter-, groeps-, weekchunk- en rowchunk-logica als pure geëxporteerde helpers zodat deze gericht testbaar zijn.
- De export gebruikt uitsluitend reeds geladen data; er komen geen writes, migrations of schemawijzigingen.

## Controle
- Unit tests voor externe klantfiltering, uitsluiting van null-opdrachtgever, weekchunks 4/6/8, interne opdrachtgeversgroepering en verticale projectgroeppaginering.
- Bestaande relevante tests plus TypeScript-check.
- Browsercontrole van de dialoog op desktop en mobiel, inclusief disabled klant-export zonder opdrachtgever.
- Print-HTML controleren op A3, expliciete pagina’s, dagdatums, klant-/intern-labels en afwezigheid van A2/ondertekenregel.
