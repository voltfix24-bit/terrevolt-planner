ALTER TABLE public.opdrachtgevers ADD COLUMN IF NOT EXISTS pv_staat boolean NOT NULL DEFAULT false;
UPDATE public.opdrachtgevers SET pv_staat = true WHERE id = 'd22cc6d4-38a8-492d-90c4-173b714c07c2';