ALTER TABLE public.projecten
  ADD COLUMN IF NOT EXISTS straat text,
  ADD COLUMN IF NOT EXISTS postcode text,
  ADD COLUMN IF NOT EXISTS stad text,
  ADD COLUMN IF NOT EXISTS gemeente text;