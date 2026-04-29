CREATE TABLE public.ploegen (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  naam text NOT NULL,
  type text NOT NULL,
  actief boolean DEFAULT true,
  positie integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.ploegen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all_ploegen" ON public.ploegen FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.ploeg_monteurs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ploeg_id uuid NOT NULL REFERENCES public.ploegen(id) ON DELETE CASCADE,
  monteur_id uuid NOT NULL REFERENCES public.monteurs(id) ON DELETE CASCADE,
  positie integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (ploeg_id, monteur_id)
);

ALTER TABLE public.ploeg_monteurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all_ploeg_monteurs" ON public.ploeg_monteurs FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_ploeg_monteurs_ploeg ON public.ploeg_monteurs(ploeg_id);
CREATE INDEX idx_ploeg_monteurs_monteur ON public.ploeg_monteurs(monteur_id);