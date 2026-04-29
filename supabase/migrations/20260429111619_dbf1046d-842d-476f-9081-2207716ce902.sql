CREATE TABLE public.project_concept_planning (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  dag_offset INTEGER NOT NULL,
  activiteit_id UUID,
  kleur_code TEXT,
  capaciteit INTEGER DEFAULT 0,
  notitie TEXT DEFAULT '',
  positie INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.project_concept_planning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all_project_concept_planning"
ON public.project_concept_planning
FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX idx_concept_planning_project ON public.project_concept_planning(project_id);

CREATE TABLE public.project_concept_monteurs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concept_cel_id UUID NOT NULL,
  monteur_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.project_concept_monteurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all_project_concept_monteurs"
ON public.project_concept_monteurs
FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX idx_concept_monteurs_cel ON public.project_concept_monteurs(concept_cel_id);