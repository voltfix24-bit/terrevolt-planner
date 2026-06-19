CREATE OR REPLACE FUNCTION public.mandagenregister_project_range(p_project_id uuid)
RETURNS TABLE (
  project_id uuid,
  first_planned date,
  last_planned date,
  planned_days integer,
  planned_monteurs integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Geen toegang tot mandagenregister.' USING ERRCODE = '42501';
  END IF;

  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Project ontbreekt.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH planned AS (
    SELECT
      pw.project_id,
      public.iso_planning_date(pw.jaar, pw.week_nr, pc.dag_index) AS datum,
      cm.monteur_id
    FROM public.project_weken pw
    JOIN public.planning_cellen pc ON pc.week_id = pw.id
    JOIN public.cel_monteurs cm ON cm.cel_id = pc.id
    WHERE pw.project_id = p_project_id
      AND pc.kleur_code IS NOT NULL
  )
  SELECT
    p_project_id AS project_id,
    MIN(planned.datum)::date AS first_planned,
    MAX(planned.datum)::date AS last_planned,
    COUNT(DISTINCT planned.datum)::integer AS planned_days,
    COUNT(DISTINCT planned.monteur_id)::integer AS planned_monteurs
  FROM planned;
END;
$$;

REVOKE ALL ON FUNCTION public.mandagenregister_project_range(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mandagenregister_project_range(uuid) TO authenticated, service_role;