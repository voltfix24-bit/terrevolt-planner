alter table public.monteurs
  add column if not exists werkdagen int[] default '{1,2,3,4,5}';

create table if not exists public.monteur_afwezigheid (
  id uuid primary key default gen_random_uuid(),
  monteur_id uuid references public.monteurs(id) on delete cascade,
  datum_van date not null,
  datum_tot date not null,
  type text not null check (type in (
    'vakantie', 'ziek', 'opleiding', 'vrije_dag', 'overig'
  )),
  omschrijving text,
  created_at timestamptz default now()
);

alter table public.monteur_afwezigheid enable row level security;

create policy "public_all_monteur_afwezigheid"
  on public.monteur_afwezigheid
  for all
  using (true)
  with check (true);

create table if not exists public.feestdagen (
  id uuid primary key default gen_random_uuid(),
  datum date not null unique,
  naam text not null,
  jaar int not null
);

alter table public.feestdagen enable row level security;

create policy "public_all_feestdagen"
  on public.feestdagen
  for all
  using (true)
  with check (true);

insert into public.feestdagen (datum, naam, jaar) values
  ('2026-01-01', 'Nieuwjaarsdag', 2026),
  ('2026-04-03', 'Goede Vrijdag', 2026),
  ('2026-04-05', 'Eerste Paasdag', 2026),
  ('2026-04-06', 'Tweede Paasdag', 2026),
  ('2026-04-27', 'Koningsdag', 2026),
  ('2026-05-05', 'Bevrijdingsdag', 2026),
  ('2026-05-14', 'Hemelvaartsdag', 2026),
  ('2026-05-24', 'Eerste Pinksterdag', 2026),
  ('2026-05-25', 'Tweede Pinksterdag', 2026),
  ('2026-12-25', 'Eerste Kerstdag', 2026),
  ('2026-12-26', 'Tweede Kerstdag', 2026)
on conflict (datum) do nothing;

insert into public.feestdagen (datum, naam, jaar) values
  ('2025-01-01', 'Nieuwjaarsdag', 2025),
  ('2025-04-18', 'Goede Vrijdag', 2025),
  ('2025-04-20', 'Eerste Paasdag', 2025),
  ('2025-04-21', 'Tweede Paasdag', 2025),
  ('2025-04-26', 'Koningsdag', 2025),
  ('2025-05-05', 'Bevrijdingsdag', 2025),
  ('2025-05-29', 'Hemelvaartsdag', 2025),
  ('2025-06-08', 'Eerste Pinksterdag', 2025),
  ('2025-06-09', 'Tweede Pinksterdag', 2025),
  ('2025-12-25', 'Eerste Kerstdag', 2025),
  ('2025-12-26', 'Tweede Kerstdag', 2025),
  ('2027-01-01', 'Nieuwjaarsdag', 2027),
  ('2027-03-26', 'Goede Vrijdag', 2027),
  ('2027-03-28', 'Eerste Paasdag', 2027),
  ('2027-03-29', 'Tweede Paasdag', 2027),
  ('2027-04-27', 'Koningsdag', 2027),
  ('2027-05-05', 'Bevrijdingsdag', 2027),
  ('2027-05-06', 'Hemelvaartsdag', 2027),
  ('2027-05-16', 'Eerste Pinksterdag', 2027),
  ('2027-05-17', 'Tweede Pinksterdag', 2027),
  ('2027-12-25', 'Eerste Kerstdag', 2027),
  ('2027-12-26', 'Tweede Kerstdag', 2027)
on conflict (datum) do nothing;