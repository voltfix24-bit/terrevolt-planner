-- Safe project planning window normalization.
-- Keeps all actual planning_cellen intact and only removes empty project_weken
-- outside a compact buffer around the first/last planned cell.

CREATE OR REPLACE FUNCTION public.normalize_project_planning_window(
  p_project_id uuid,
  p_apply boolean DEFAULT false,
  p_weeks_before integer DEFAULT 4,
  p_weeks_after integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_planned date;
  v_last_planned date;
  v_keep_from date;
  v_keep_to date;
  v_total_weeks int := 0;
  v_delete_weeks int := 0;
  v_remaining_weeks int := 0;
  v_planned_weeks int := 0;
  v_snapshot_id uuid;
  v_dangling int := 0;
  v_project_label text;
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '42501';
  END IF;
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id ontbreekt' USING ERRCODE = '22023';
  END IF;
  IF p_weeks_before < 0 OR p_weeks_after < 0 THEN
    RAISE EXCEPTION 'weken marge mag niet negatief zijn' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(p.case_nummer, p.station_naam, p.id::text)
  INTO v_project_label
  FROM public.projecten p
  WHERE p.id = p_project_id;

  IF v_project_label IS NULL THEN
    RAISE EXCEPTION 'Project niet gevonden' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*)::int
  INTO v_total_weeks
  FROM public.project_weken
  WHERE project_id = p_project_id;

  SELECT
    MIN(to_date(pw.jaar::text || to_char(pw.week_nr, 'FM00') || '1', 'IYYYIWID') + pc.dag_index),
    MAX(to_date(pw.jaar::text || to_char(pw.week_nr, 'FM00') || '1', 'IYYYIWID') + pc.dag_index),
    COUNT(DISTINCT pw.id)::int
  INTO v_first_planned, v_last_planned, v_planned_weeks
  FROM public.planning_cellen pc
  JOIN public.project_weken pw ON pw.id = pc.week_id
  JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
  WHERE pa.project_id = p_project_id;

  IF v_first_planned IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'applied', false,
      'project_id', p_project_id,
      'project', v_project_label,
      'message', 'Geen planning_cellen gevonden; er is niets te normaliseren',
      'total_weeks', v_total_weeks,
      'delete_weeks', 0,
      'remaining_weeks', v_total_weeks,
      'dangling_planning_cellen', public.count_dangling_planning_cellen(ARRAY[p_project_id])
    );
  END IF;

  v_keep_from := v_first_planned - (p_weeks_before * 7);
  v_keep_to := v_last_planned + (p_weeks_after * 7);

  CREATE TEMP TABLE tmp_weeks_to_delete ON COMMIT DROP AS
  SELECT pw.id
  FROM public.project_weken pw
  WHERE pw.project_id = p_project_id
    AND NOT EXISTS (
      SELECT 1 FROM public.planning_cellen pc WHERE pc.week_id = pw.id
    )
    AND (
      to_date(pw.jaar::text || to_char(pw.week_nr, 'FM00') || '1', 'IYYYIWID') < v_keep_from
      OR to_date(pw.jaar::text || to_char(pw.week_nr, 'FM00') || '1', 'IYYYIWID') > v_keep_to
    );

  SELECT COUNT(*)::int INTO v_delete_weeks FROM tmp_weeks_to_delete;
  v_remaining_weeks := v_total_weeks - v_delete_weeks;

  IF NOT p_apply THEN
    RETURN jsonb_build_object(
      'ok', true,
      'applied', false,
      'project_id', p_project_id,
      'project', v_project_label,
      'first_planned', v_first_planned,
      'last_planned', v_last_planned,
      'keep_from', v_keep_from,
      'keep_to', v_keep_to,
      'weeks_before', p_weeks_before,
      'weeks_after', p_weeks_after,
      'total_weeks', v_total_weeks,
      'planned_weeks', COALESCE(v_planned_weeks, 0),
      'delete_weeks', v_delete_weeks,
      'remaining_weeks', v_remaining_weeks,
      'dangling_planning_cellen', public.count_dangling_planning_cellen(ARRAY[p_project_id])
    );
  END IF;

  SELECT public.snapshot_project_planning(
    p_project_id,
    'pre-normalize planning window',
    format('keep %s t/m %s; delete %s lege weken', v_keep_from, v_keep_to, v_delete_weeks)
  ) INTO v_snapshot_id;

  PERFORM set_config(
    'app.audit_label',
    'Planningvenster genormaliseerd: ' || v_project_label,
    true
  );

  DELETE FROM public.project_weken pw
  USING tmp_weeks_to_delete d
  WHERE pw.id = d.id;

  PERFORM public.normalize_project_weken(p_project_id);

  SELECT public.count_dangling_planning_cellen(ARRAY[p_project_id]) INTO v_dangling;
  IF v_dangling > 0 THEN
    RAISE EXCEPTION 'Dangling planning_cellen gedetecteerd na normaliseren (% rijen)', v_dangling
      USING ERRCODE = '23503';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'applied', true,
    'project_id', p_project_id,
    'project', v_project_label,
    'snapshot_id', v_snapshot_id,
    'first_planned', v_first_planned,
    'last_planned', v_last_planned,
    'keep_from', v_keep_from,
    'keep_to', v_keep_to,
    'weeks_before', p_weeks_before,
    'weeks_after', p_weeks_after,
    'total_weeks_before', v_total_weeks,
    'planned_weeks', COALESCE(v_planned_weeks, 0),
    'deleted_weeks', v_delete_weeks,
    'remaining_weeks', v_remaining_weeks,
    'dangling_planning_cellen', v_dangling,
    'assessment_after', public.assess_project_planning(p_project_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_project_planning_window(uuid, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_project_planning_window(uuid, boolean, integer, integer) TO authenticated, service_role;
