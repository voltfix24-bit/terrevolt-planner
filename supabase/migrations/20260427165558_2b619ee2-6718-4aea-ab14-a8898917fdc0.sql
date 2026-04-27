ALTER TABLE public.projecten
  ADD COLUMN IF NOT EXISTS gsu_datum date,
  ADD COLUMN IF NOT EXISTS geu_datum date;