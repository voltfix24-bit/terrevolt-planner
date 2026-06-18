
-- 1. Kolommen op projecten
ALTER TABLE public.projecten
  ADD COLUMN IF NOT EXISTS planning_sort_order integer,
  ADD COLUMN IF NOT EXISTS planning_sort_bucket text;

CREATE INDEX IF NOT EXISTS projecten_planning_sort_bucket_idx
  ON public.projecten (planning_sort_bucket, planning_sort_order);

-- 2. Bucket-helper: status:future|past|none
CREATE OR REPLACE FUNCTION public.compute_project_overview_bucket(p_project_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_today date := current_date;
  v_has_any boolean;
  v_has_future boolean;
  v_cat text;
BEGIN
  SELECT COALESCE(status::text, 'concept') INTO v_status
  FROM public.projecten WHERE id = p_project_id;
  IF v_status IS NULL THEN RETURN NULL; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.planning_cellen pc
    JOIN public.project_weken pw ON pw.id = pc.week_id
    JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
    WHERE pa.project_id = p_project_id
  ) INTO v_has_any;

  IF NOT v_has_any THEN
    v_cat := 'none';
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.planning_cellen pc
      JOIN public.project_weken pw ON pw.id = pc.week_id
      JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
      WHERE pa.project_id = p_project_id
        AND (to_date(pw.jaar::text || to_char(pw.week_nr,'FM00') || '1', 'IYYYIWID')
             + pc.dag_index) >= v_today
    ) INTO v_has_future;
    v_cat := CASE WHEN v_has_future THEN 'future' ELSE 'past' END;
  END IF;

  RETURN v_status || ':' || v_cat;
END;
$$;

-- 3. Reorder RPC
CREATE OR REPLACE FUNCTION public.reorder_project_in_overview(
  p_project_id uuid,
  p_before_project_id uuid DEFAULT NULL,
  p_after_project_id  uuid DEFAULT NULL
)
RETURNS TABLE(project_id uuid, planning_sort_order integer, planning_sort_bucket text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket text;
  v_before_bucket text;
  v_after_bucket text;
  r RECORD;
  v_pos integer;
  v_step constant integer := 1000;
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Niet geautoriseerd om handmatige sortering te wijzigen'
      USING ERRCODE = '42501';
  END IF;
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id ontbreekt' USING ERRCODE = '22023';
  END IF;
  IF p_before_project_id IS NOT NULL AND p_after_project_id IS NOT NULL THEN
    RAISE EXCEPTION 'Geef maximaal één van before/after, niet beide'
      USING ERRCODE = '22023';
  END IF;
  IF p_before_project_id = p_project_id OR p_after_project_id = p_project_id THEN
    RAISE EXCEPTION 'Project kan niet voor of na zichzelf gezet worden'
      USING ERRCODE = '22023';
  END IF;

  v_bucket := public.compute_project_overview_bucket(p_project_id);
  IF v_bucket IS NULL THEN
    RAISE EXCEPTION 'Project niet gevonden' USING ERRCODE = 'P0002';
  END IF;

  IF p_before_project_id IS NOT NULL THEN
    v_before_bucket := public.compute_project_overview_bucket(p_before_project_id);
    IF v_before_bucket IS DISTINCT FROM v_bucket THEN
      RAISE EXCEPTION 'Slepen tussen verschillende statussen of planning-categorieën is niet toegestaan'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_after_project_id IS NOT NULL THEN
    v_after_bucket := public.compute_project_overview_bucket(p_after_project_id);
    IF v_after_bucket IS DISTINCT FROM v_bucket THEN
      RAISE EXCEPTION 'Slepen tussen verschillende statussen of planning-categorieën is niet toegestaan'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Lock alle projecten in de bucket. We bepalen de bucket dynamisch — dus we
  -- bouwen een lijst op met een CTE die voor elk kandidaat-project de huidige
  -- bucket berekent en filtert. Tegelijk locken we de rijen om races te
  -- voorkomen.
  CREATE TEMP TABLE tmp_bucket_members ON COMMIT DROP AS
  SELECT p.id,
         p.planning_sort_order AS old_order,
         p.case_nummer,
         p.gsu_datum,
         p.created_at
  FROM public.projecten p
  WHERE public.compute_project_overview_bucket(p.id) = v_bucket
    AND p.id <> p_project_id
  FOR UPDATE;

  -- Doelpositie in de geordende lijst bepalen.
  -- Order = (old_order NULLS LAST, gsu_datum, case_nummer, id)
  -- Insert: voor before, na after, anders aan het eind.
  WITH ordered AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY
             old_order NULLS LAST,
             gsu_datum NULLS LAST,
             case_nummer NULLS LAST,
             id
           ) AS rn
    FROM tmp_bucket_members
  )
  SELECT CASE
           WHEN p_before_project_id IS NOT NULL THEN
             (SELECT rn FROM ordered WHERE id = p_before_project_id)
           WHEN p_after_project_id IS NOT NULL THEN
             (SELECT rn FROM ordered WHERE id = p_after_project_id) + 1
           ELSE
             (SELECT COALESCE(MAX(rn), 0) + 1 FROM ordered)
         END
  INTO v_pos;

  IF v_pos IS NULL THEN
    -- before/after stond niet (meer) in bucket → race
    RAISE EXCEPTION 'Referentieproject niet meer in dezelfde groep (refresh nodig)'
      USING ERRCODE = '40001';
  END IF;

  -- Hernummer alle bucket-leden incl. het verplaatste project op v_pos.
  -- Stap = 1000 (ruimte voor toekomstige tussenvoegingen).
  WITH combined AS (
    SELECT id, gsu_datum, case_nummer, old_order
    FROM tmp_bucket_members
  ),
  ordered AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY
             old_order NULLS LAST,
             gsu_datum NULLS LAST,
             case_nummer NULLS LAST,
             id
           ) AS rn
    FROM combined
  ),
  spliced AS (
    SELECT id,
           CASE WHEN rn < v_pos THEN rn ELSE rn + 1 END AS final_rn
    FROM ordered
    UNION ALL
    SELECT p_project_id, v_pos
  )
  UPDATE public.projecten p
  SET planning_sort_order  = s.final_rn * v_step,
      planning_sort_bucket = v_bucket
  FROM spliced s
  WHERE p.id = s.id;

  RETURN QUERY
  SELECT p.id, p.planning_sort_order, p.planning_sort_bucket
  FROM public.projecten p
  WHERE p.id IN (SELECT id FROM tmp_bucket_members)
     OR p.id = p_project_id;
END;
$$;

-- 4. Reset RPC — wist handmatige sortering binnen één bucket
CREATE OR REPLACE FUNCTION public.reset_overview_manual_sort(p_bucket text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '42501';
  END IF;
  IF p_bucket IS NULL OR length(p_bucket) = 0 THEN
    RAISE EXCEPTION 'bucket ontbreekt' USING ERRCODE = '22023';
  END IF;

  UPDATE public.projecten
  SET planning_sort_order = NULL,
      planning_sort_bucket = NULL
  WHERE planning_sort_bucket = p_bucket;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_project_overview_bucket(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_project_in_overview(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_overview_manual_sort(text) TO authenticated, service_role;
