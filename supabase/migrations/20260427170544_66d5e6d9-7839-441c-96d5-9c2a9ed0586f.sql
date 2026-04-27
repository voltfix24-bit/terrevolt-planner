ALTER TABLE public.projecten
  ADD COLUMN IF NOT EXISTS bouwkundig_benodigd TEXT,
  ADD COLUMN IF NOT EXISTS bouwkundig_aannemer TEXT,
  ADD COLUMN IF NOT EXISTS bouwkundig_dagen INTEGER,
  ADD COLUMN IF NOT EXISTS asbest_benodigd TEXT,
  ADD COLUMN IF NOT EXISTS asbest_uitvoerder TEXT,
  ADD COLUMN IF NOT EXISTS asbest_dagen INTEGER;