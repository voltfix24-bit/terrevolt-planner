
-- Monteurs
create table public.monteurs (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  type text not null check (type in ('schakelmonteur', 'montagemonteur')),
  aanwijzing_ls text check (aanwijzing_ls in ('VOP', 'VP', 'AVP')),
  aanwijzing_ms text check (aanwijzing_ms in ('VOP', 'VP', 'AVP')),
  actief boolean default true,
  created_at timestamptz default now()
);

-- Activiteit templates
create table public.activiteit_types (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  capaciteit_type text check (capaciteit_type in ('schakel', 'montage', 'geen')),
  min_personen int default 1,
  min_aanwijzing_ls text check (min_aanwijzing_ls in ('VOP', 'VP', 'AVP')),
  min_aanwijzing_ms text check (min_aanwijzing_ms in ('VOP', 'VP', 'AVP')),
  kleur_default text default 'c3',
  positie int default 0,
  created_at timestamptz default now()
);

-- Project templates
create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  type text not null check (type in ('NSA', 'provisorium', 'compact', 'custom')),
  omschrijving text,
  activiteit_type_ids uuid[] default '{}',
  created_at timestamptz default now()
);

-- Projecten
create table public.projecten (
  id uuid primary key default gen_random_uuid(),
  case_nummer text,
  station_naam text,
  gsu_geu text,
  ms_type text,
  trafo_kva text,
  case_type text check (case_type in ('NSA', 'provisorium', 'compact', 'custom')),
  ls_rek_vervangen text check (ls_rek_vervangen in ('ja', 'nee')),
  wv_naam text,
  status text default 'concept' check (status in ('concept', 'gepland', 'in_uitvoering', 'afgerond')),
  jaar int default 2026,
  werkplan_msh boolean default false,
  werkplan_lsh boolean default false,
  werkplan_msr boolean default false,
  werkplan_lsr boolean default false,
  notities text,
  template_id uuid references public.project_templates(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Weken per project
create table public.project_weken (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projecten(id) on delete cascade,
  week_nr int not null,
  positie int not null,
  opmerking text default ''
);

-- Activiteiten per project
create table public.project_activiteiten (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projecten(id) on delete cascade,
  activiteit_type_id uuid references public.activiteit_types(id),
  naam text not null,
  capaciteit_type text check (capaciteit_type in ('schakel', 'montage', 'geen')),
  min_personen int default 1,
  min_aanwijzing_ls text check (min_aanwijzing_ls in ('VOP', 'VP', 'AVP')),
  min_aanwijzing_ms text check (min_aanwijzing_ms in ('VOP', 'VP', 'AVP')),
  positie int default 0
);

-- Cellen
create table public.planning_cellen (
  id uuid primary key default gen_random_uuid(),
  activiteit_id uuid references public.project_activiteiten(id) on delete cascade,
  week_id uuid references public.project_weken(id) on delete cascade,
  dag_index int not null check (dag_index between 0 and 4),
  kleur_code text default null,
  notitie text default '',
  capaciteit int default 0,
  constraint unique_cel unique (activiteit_id, week_id, dag_index)
);

-- Cel-monteur koppelingen
create table public.cel_monteurs (
  id uuid primary key default gen_random_uuid(),
  cel_id uuid references public.planning_cellen(id) on delete cascade,
  monteur_id uuid references public.monteurs(id) on delete cascade,
  constraint unique_cel_monteur unique (cel_id, monteur_id)
);

-- Enable RLS
alter table public.monteurs enable row level security;
alter table public.activiteit_types enable row level security;
alter table public.project_templates enable row level security;
alter table public.projecten enable row level security;
alter table public.project_weken enable row level security;
alter table public.project_activiteiten enable row level security;
alter table public.planning_cellen enable row level security;
alter table public.cel_monteurs enable row level security;

-- Public access policies (no auth yet)
create policy "public_all_monteurs" on public.monteurs for all using (true) with check (true);
create policy "public_all_activiteit_types" on public.activiteit_types for all using (true) with check (true);
create policy "public_all_project_templates" on public.project_templates for all using (true) with check (true);
create policy "public_all_projecten" on public.projecten for all using (true) with check (true);
create policy "public_all_project_weken" on public.project_weken for all using (true) with check (true);
create policy "public_all_project_activiteiten" on public.project_activiteiten for all using (true) with check (true);
create policy "public_all_planning_cellen" on public.planning_cellen for all using (true) with check (true);
create policy "public_all_cel_monteurs" on public.cel_monteurs for all using (true) with check (true);

-- Seeds
insert into public.activiteit_types (naam, capaciteit_type, min_personen, positie) values
  ('Civiele werkzaamheden', 'geen', 1, 0),
  ('Levering provisorium/NSA', 'geen', 1, 1),
  ('Aarding slaan', 'geen', 1, 2),
  ('Eindsluitingen prov./compact', 'montage', 2, 3),
  ('Schakelen/montage MS', 'schakel', 2, 4),
  ('Schakelen/montage LS', 'schakel', 2, 5),
  ('Inmeten', 'montage', 1, 6),
  ('Transport', 'geen', 1, 7),
  ('Bouwkunde', 'geen', 1, 8),
  ('Inrichten', 'montage', 1, 9),
  ('Afvoeren provisorium/NSA', 'geen', 1, 10),
  ('Boring', 'geen', 1, 11),
  ('Zuigwagen', 'geen', 1, 12);

insert into public.project_templates (naam, type, omschrijving) values
  ('NSA-case', 'NSA', 'MS-renovatie met noodstroomaggregaat'),
  ('Compactstation', 'compact', 'Nieuw compactstation plaatsen'),
  ('Provisorium', 'provisorium', 'Tijdelijk provisorium plaatsen en retour');
