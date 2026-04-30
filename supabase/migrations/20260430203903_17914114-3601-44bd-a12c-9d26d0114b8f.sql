-- STAP 1: Indexes op drukste tabellen
CREATE INDEX IF NOT EXISTS idx_planning_cellen_activiteit ON public.planning_cellen (activiteit_id);
CREATE INDEX IF NOT EXISTS idx_planning_cellen_week ON public.planning_cellen (week_id);
CREATE INDEX IF NOT EXISTS idx_cel_monteurs_cel ON public.cel_monteurs (cel_id);
CREATE INDEX IF NOT EXISTS idx_cel_monteurs_monteur ON public.cel_monteurs (monteur_id);
CREATE INDEX IF NOT EXISTS idx_project_activiteiten_project ON public.project_activiteiten (project_id, positie);
CREATE INDEX IF NOT EXISTS idx_project_weken_project ON public.project_weken (project_id, positie);
CREATE INDEX IF NOT EXISTS idx_project_weken_week_nr ON public.project_weken (week_nr);
CREATE INDEX IF NOT EXISTS idx_projecten_status_jaar ON public.projecten (status, jaar);
CREATE INDEX IF NOT EXISTS idx_concept_planning_offset ON public.project_concept_planning (project_id, dag_offset);

-- STAP 2: Foreign key met SET NULL op project_activiteiten.activiteit_type_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints
    WHERE constraint_name = 'project_activiteiten_activiteit_type_id_fkey'
      AND delete_rule = 'SET NULL'
  ) THEN
    ALTER TABLE public.project_activiteiten
      DROP CONSTRAINT IF EXISTS project_activiteiten_activiteit_type_id_fkey;
    ALTER TABLE public.project_activiteiten
      ADD CONSTRAINT project_activiteiten_activiteit_type_id_fkey
      FOREIGN KEY (activiteit_type_id)
      REFERENCES public.activiteit_types(id)
      ON DELETE SET NULL;
  END IF;
END $$;