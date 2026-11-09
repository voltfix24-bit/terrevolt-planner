CREATE TABLE public.pv_regels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projecten(id) ON DELETE CASCADE,
  monteur_id uuid NOT NULL REFERENCES public.monteurs(id) ON DELETE CASCADE,
  datum date NOT NULL,
  omschrijving text,
  case_nummer text,
  uitvoerder text,
  uren numeric NOT NULL DEFAULT 8,
  overuren numeric NOT NULL DEFAULT 0,
  niet_doorgegaan boolean NOT NULL DEFAULT false,
  positie integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pv_regels_project_datum ON public.pv_regels(project_id, datum);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pv_regels TO authenticated;
GRANT ALL ON public.pv_regels TO service_role;
ALTER TABLE public.pv_regels ENABLE ROW LEVEL SECURITY;
CREATE POLICY pv_regels_manager_all ON public.pv_regels FOR ALL TO authenticated
  USING (public.is_planner_manager(auth.uid())) WITH CHECK (public.is_planner_manager(auth.uid()));