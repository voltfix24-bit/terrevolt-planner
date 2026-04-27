ALTER TABLE public.projecten
  ADD COLUMN IF NOT EXISTS tijd_tekeningen_aanwezig TEXT,
  ADD COLUMN IF NOT EXISTS def_tekeningen_aanwezig TEXT;