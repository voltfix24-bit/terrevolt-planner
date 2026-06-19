# Lovable prompt — Mandagenregister UI

Bouw de UI voor het mandagenregister op basis van de migratie `20260619113000_mandagenregister_basis.sql`.

## Doel
De app moet vanuit de bestaande planning automatisch een mandagenregister kunnen maken per project/periode. Geen dubbele Excel-invoer. Planning blijft bron; alleen uren/status/opmerking mogen in het mandagenregister gecorrigeerd worden.

## Database/RPC beschikbaar

Nieuwe velden/tabellen/functies:

- `monteurs.dienstverband`: `'zzp' | 'loondienst'`
- `monteur_register`: manager-only PII/ZZP-gegevens per monteur
- `mandagen_regels`: manager-only correcties per project/monteur/datum met `uren`, `status`, `opmerking`
- `mandagen_exports`: manager-only exportlog
- `mandagenregister_export(p_project_id uuid, p_van date, p_tot date)`
- `upsert_mandagen_regel(p_project_id uuid, p_monteur_id uuid, p_datum date, p_uren numeric, p_status text, p_opmerking text)`
- `log_mandagen_export(p_project_id uuid, p_van date, p_tot date, p_dienstverband text, p_bestandsnaam text)`

Alle PII-schermen en exports zijn alleen voor `is_planner_manager`.

## 1. Monteurbeheer uitbreiden

Zoek het bestaande scherm waar monteurs worden beheerd, waarschijnlijk `Capaciteit` of `Instellingen`.

Voeg per monteur een manager-only sectie toe: **Gegevens mandagenregister**.

Velden:

- Dienstverband: `Loondienst` / `ZZP`, opslaan in `monteurs.dienstverband`
- Altijd tonen:
  - geboortedatum
  - nationaliteit
  - ID-type: paspoort, id-kaart, rijbewijs, verblijfsdocument
  - ID-nummer
  - ID geldig tot
- Alleen loondienst:
  - BSN, 9 cijfers, liefst elfproef-validatie client-side
- Alleen ZZP:
  - bedrijfsnaam
  - KvK-nummer, 8 cijfers
  - btw-nummer
  - uurtarief

Opslaan:

- `monteurs.dienstverband` via update op `monteurs`
- registervelden via upsert op `monteur_register` met `monteur_id`

Belangrijk:

- Toon BSN nooit wanneer dienstverband `zzp` is.
- Bij wissel naar ZZP wist de database BSN automatisch, maar de UI moet het veld ook direct leeg/verbergen.
- Toon een compacte volledigheidsbadge: `Compleet` / `Mist KvK` / `Mist BSN` / `ID verlopen`.

## 2. Projectpagina: sectie Mandagenregister

Voeg op `ProjectDetail` een manager-only sectie of knop toe: **Mandagenregister**.

Invoer:

- Project is impliciet via route-id.
- Periode van/tm, default huidige ISO-week maandag t/m zondag.
- Knop: `Register ophalen`.

Actie:

- Roep `mandagenregister_export(projectId, van, tot)` aan.
- Toon de regels gegroepeerd per dienstverband en per monteur.
- Pivot naar week/dagkolommen:
  - ma, di, wo, do, vr, za, zo
  - uren per dag
  - weektotaal
  - activiteiten als tooltip of kleine subtitel

Uren aanpassen:

- Uren moeten inline aanpasbaar zijn per monteur/datum.
- Bij wijziging roep `upsert_mandagen_regel(...)` aan met status `gecontroleerd`.
- Na opslaan refresh de exportdata.

Volledigheidscheck:

- Gebruik `compleet` en `ontbrekende_velden` uit de RPC.
- Als een rij niet compleet is: toon bovenaan een waarschuwing per monteur met ontbrekende velden.
- Blokkeer standaard de download zolang er onvolledige regels zijn.
- Eventueel mag er een manager-only checkbox zijn: `Toch exporteren ondanks ontbrekende gegevens`.

## 3. Downloads/export

Maak twee aparte downloads:

1. `Mandagenregister_ZZP_<project>_<periode>.csv` of `.xlsx` als bestaande exporthelper beschikbaar is
2. `Mandagenregister_Loondienst_<project>_<periode>.csv` of `.xlsx`

ZZP-export kolommen:

- naam
- bedrijfsnaam
- KvK-nummer
- btw-nummer
- nationaliteit
- ID-type
- ID-nummer
- ID geldig tot
- datum of dagkolommen
- uren
- totaal
- activiteiten/opmerking

Loondienst-export kolommen:

- naam
- BSN
- geboortedatum
- nationaliteit
- ID-type
- ID-nummer
- ID geldig tot
- datum of dagkolommen
- uren
- totaal
- activiteiten/opmerking

Belangrijk:

- ZZP-export mag nooit BSN bevatten.
- Loondienst-export mag geen KvK/btw nodig hebben.
- Na succesvolle download/logische export roep `log_mandagen_export(...)` aan per dienstverband.
- Toon een toast: `Mandagenregister ZZP gelogd` of `Mandagenregister Loondienst gelogd`.

## 4. Exporthistorie tonen

Toon in de mandagenregister-sectie de laatste exports uit `mandagen_exports` voor dit project:

- periode
- dienstverband
- rij_count
- aangemaakt_op
- bestandsnaam

Dit hoeft in eerste versie alleen read-only.

## 5. Veiligheid en scope

- Alleen managers mogen registervelden, BSN/KvK en mandagenexports zien.
- Niet-managers zien de sectie niet.
- Raak bestaande planningdata niet aan.
- Raak project_activiteiten, planning_cellen, cel_monteurs, sorteringen en projectvelden niet aan behalve lezen via de RPC.
- Geen extra zware libraries tenzij de app al een exportlibrary gebruikt.
- TypeScript build moet schoon blijven.

## Testcases

1. ZZP-monteur met KvK compleet → komt in ZZP-export, zonder BSN.
2. ZZP-monteur zonder KvK → waarschuwing en download geblokkeerd.
3. Loondienst-monteur zonder BSN → waarschuwing en download geblokkeerd.
4. Monteur op meerdere activiteiten op dezelfde dag → 1 registerregel met samengevoegde activiteiten.
5. Uren aanpassen van 8 naar 6 → `mandagen_regels` krijgt/updated 1 rij en export toont 6.
6. Export downloaden → `mandagen_exports` krijgt record.
7. Niet-manager kan mandagenregister en PII niet zien.
