# Mobiele capaciteit gelijkmaken aan desktop

## Uitvoering
- Breid de mobiele read-only data-ophaalactie uit met werkdagen, afwezigheid en feestdagen.
- Bouw de week- en dagcapaciteit met de bestaande `checkBeschikbaarheid`-regel als enige bron.
- Pas Vandaag en Capaciteit aan zodat beschikbaar, vrij, feestdagen en overboeking correct worden getoond.
- Voeg regressietests toe voor parttime, verlof, feestdagen, on-hold, duplicaten en overboeking.
- Controleer typecheck, volledige tests, actuele buildstatus en beide mobiele schermen op 390×844 zonder horizontale overflow.

## Technische details
- Geen database- of desktopwijzigingen; alleen read-only queries en mobiele helpers/components.
- `planned` telt unieke monteur-dagen buiten on-hold, ook wanneer de monteur die dag niet beschikbaar is.
- `available` telt uitsluitend slots die `checkBeschikbaarheid` beschikbaar verklaart; `free` blijft minimaal nul en bezettingspercentage kan boven 100% uitkomen.
