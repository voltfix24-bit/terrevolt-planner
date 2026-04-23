
alter table public.activiteit_types
  add column if not exists min_personen_totaal int default 1,
  add column if not exists min_personen_gekwalificeerd int default 1;

alter table public.project_activiteiten
  add column if not exists min_personen_totaal int default 1,
  add column if not exists min_personen_gekwalificeerd int default 1;

-- Backfill from existing min_personen so behavior stays consistent
update public.activiteit_types
  set min_personen_totaal = coalesce(min_personen, 1),
      min_personen_gekwalificeerd = coalesce(min_personen, 1)
  where min_personen_totaal is null or min_personen_totaal = 1;

update public.project_activiteiten
  set min_personen_totaal = coalesce(min_personen, 1),
      min_personen_gekwalificeerd = coalesce(min_personen, 1)
  where min_personen_totaal is null or min_personen_totaal = 1;
