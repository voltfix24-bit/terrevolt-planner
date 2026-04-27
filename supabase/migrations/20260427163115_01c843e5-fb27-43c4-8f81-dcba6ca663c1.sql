
-- =========================================================
-- Beheer-tabellen
-- =========================================================
CREATE TABLE public.opdrachtgevers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam text NOT NULL,
  positie integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.opdrachtgevers ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_all_opdrachtgevers ON public.opdrachtgevers FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.percelen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam text NOT NULL,
  positie integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.percelen ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_all_percelen ON public.percelen FOR ALL USING (true) WITH CHECK (true);

-- Seed wat sensible defaults zodat de selects niet leeg zijn
INSERT INTO public.opdrachtgevers (naam, positie) VALUES
  ('Stedin', 0), ('Liander', 1), ('Enexis', 2);
INSERT INTO public.percelen (naam, positie) VALUES
  ('Perceel 1', 0), ('Perceel 2', 1), ('Perceel 3', 2);

-- =========================================================
-- Drop oude kolommen op projecten
-- =========================================================
ALTER TABLE public.projecten
  DROP COLUMN IF EXISTS case_type,
  DROP COLUMN IF EXISTS ms_type,
  DROP COLUMN IF EXISTS trafo_kva,
  DROP COLUMN IF EXISTS ls_rek_vervangen,
  DROP COLUMN IF EXISTS werkplan_msh,
  DROP COLUMN IF EXISTS werkplan_lsh,
  DROP COLUMN IF EXISTS werkplan_msr,
  DROP COLUMN IF EXISTS werkplan_lsr;

-- =========================================================
-- Deel A — Projectgegevens (extra)
-- =========================================================
ALTER TABLE public.projecten
  ADD COLUMN opdrachtgever_id uuid,
  ADD COLUMN perceel_id uuid,
  ADD COLUMN locatie text;

-- =========================================================
-- Deel B — Huidige situatie
-- =========================================================
ALTER TABLE public.projecten
  ADD COLUMN huidig_rmu_type text,                    -- prefab_hoog | prefab_laag | magnefix_md | magnefix_mf | coq | abb | siemens | anders
  ADD COLUMN huidig_rmu_aantal_richtingen integer,
  ADD COLUMN huidig_vermogensveld text,               -- ja | nee
  ADD COLUMN huidig_trafo_aanwezig text,              -- ja | nee
  ADD COLUMN huidig_trafo_type text,
  ADD COLUMN huidig_lsrek_aanwezig text,              -- ja | nee
  ADD COLUMN huidig_lsrek_type text,                  -- open | gesloten
  ADD COLUMN huidig_flex_ov_aanwezig text,            -- ja | nee
  ADD COLUMN huidig_ov_kwh_meter text,                -- nee | 1_fase | 3_fase
  ADD COLUMN huidig_ms_kabels_aanwezig text,          -- ja | nee
  ADD COLUMN huidig_ms_kabels_type text,              -- gplk | kunststof | gemengd
  ADD COLUMN huidig_ms_kabels_aantal integer,
  ADD COLUMN huidig_ls_kabels_aanwezig text,          -- ja | nee
  ADD COLUMN huidig_ls_kabels_type text,              -- gplk | kunststof | gemengd
  ADD COLUMN huidig_ls_kabels_aantal integer,
  ADD COLUMN huidig_kabels_herbruikbaar text;         -- ja | nee | deels | onbekend

-- =========================================================
-- Deel C — Tijdelijke situatie
-- =========================================================
ALTER TABLE public.projecten
  ADD COLUMN tijdelijke_situatie text,                -- geen | nsa | provisorium
  ADD COLUMN nsa_luik_aanwezig text,                  -- ja | nee
  ADD COLUMN prov_ms_eindsluitingen_aantal integer,
  ADD COLUMN prov_ms_eindsluitingen_type text,        -- magnefix | anders
  ADD COLUMN prov_ms_moffen_aantal integer,
  ADD COLUMN prov_ls_eindsluitingen_aantal integer,
  ADD COLUMN prov_ls_moffen_aantal integer,
  ADD COLUMN prov_tijdelijke_lskast text;             -- ja | nee

-- =========================================================
-- Deel D — Definitieve situatie
-- =========================================================
ALTER TABLE public.projecten
  ADD COLUMN def_rmu_vervangen text,                  -- ja | nee
  ADD COLUMN def_rmu_merk_configuratie text,
  ADD COLUMN def_ombouw_ims text,                     -- ja | nee
  ADD COLUMN def_aantal_ms_richtingen integer,
  ADD COLUMN def_vermogensveld text,                  -- ja | nee
  ADD COLUMN def_trafo_vervangen text,                -- ja | nee
  ADD COLUMN def_trafo_type text,
  ADD COLUMN def_trafo_gedraaid text,                 -- ja | nee
  ADD COLUMN def_ls_situatie text,                    -- behouden | herschikken | uitbreidingsrek | nieuw_le630 | nieuw_gt630_le1000
  ADD COLUMN def_ls_aantal_stroken_herschikken integer,
  ADD COLUMN def_zekeringen_wisselen text,            -- ja | nee
  ADD COLUMN def_ggi_nieuw text,                      -- ja | nee
  ADD COLUMN def_ggi_aantal integer,
  ADD COLUMN def_vereffening_vernieuwen text,         -- ja | nee
  ADD COLUMN def_aardelektrode text,                  -- ja | nee
  ADD COLUMN def_aardmeting text,                     -- ja | nee
  ADD COLUMN def_flex_ov_nieuw text,                  -- ja | nee
  ADD COLUMN def_ov_kwh_meter_nieuw text,             -- ja | nee
  ADD COLUMN def_opleverdossier text;                 -- inclusief_civiel | exclusief_civiel

-- =========================================================
-- Repeatable kabelrijen
-- =========================================================
CREATE TABLE public.project_ms_kabels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  soort text NOT NULL DEFAULT 'huidig',  -- 'huidig' | 'provisorium' (toekomst)
  positie integer NOT NULL DEFAULT 0,
  diameter text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_project_ms_kabels_project ON public.project_ms_kabels(project_id);
ALTER TABLE public.project_ms_kabels ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_all_project_ms_kabels ON public.project_ms_kabels FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.project_ls_kabels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  soort text NOT NULL DEFAULT 'huidig',
  positie integer NOT NULL DEFAULT 0,
  diameter text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_project_ls_kabels_project ON public.project_ls_kabels(project_id);
ALTER TABLE public.project_ls_kabels ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_all_project_ls_kabels ON public.project_ls_kabels FOR ALL USING (true) WITH CHECK (true);
