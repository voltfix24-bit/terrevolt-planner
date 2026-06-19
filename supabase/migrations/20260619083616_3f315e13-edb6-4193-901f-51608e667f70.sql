-- =========================================================================
-- 1) Snapshot table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.planning_restore_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projecten(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  label text NOT NULL,
  reason text,
  project_weken jsonb NOT NULL,
  planning_cellen jsonb NOT NULL,
  cel_monteurs jsonb NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_restore_snapshots TO authenticated;
GRANT ALL ON public.planning_restore_snapshots TO service_role;

ALTER TABLE public.planning_restore_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers read snapshots"   ON public.planning_restore_snapshots;
DROP POLICY IF EXISTS "managers insert snapshots" ON public.planning_restore_snapshots;
DROP POLICY IF EXISTS "managers delete snapshots" ON public.planning_restore_snapshots;

CREATE POLICY "managers read snapshots"
  ON public.planning_restore_snapshots FOR SELECT TO authenticated
  USING (public.is_planner_manager(auth.uid()));
CREATE POLICY "managers insert snapshots"
  ON public.planning_restore_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.is_planner_manager(auth.uid()));
CREATE POLICY "managers delete snapshots"
  ON public.planning_restore_snapshots FOR DELETE TO authenticated
  USING (public.is_planner_manager(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_planning_snapshots_project
  ON public.planning_restore_snapshots(project_id, created_at DESC);

-- =========================================================================
-- 2) Assess planning risk
-- =========================================================================
CREATE OR REPLACE FUNCTION public.assess_project_planning(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_first date; v_last date; v_count int; v_range int;
  v_reasons text[] := ARRAY[]::text[];
  v_status text := 'safe';
BEGIN
  SELECT
    MIN(to_date(jaar::text || to_char(week_nr,'FM00') || '1','IYYYIWID')),
    MAX(to_date(jaar::text || to_char(week_nr,'FM00') || '1','IYYYIWID')),
    COUNT(*)
  INTO v_first, v_last, v_count
  FROM public.project_weken WHERE project_id = p_project_id;

  IF v_count IS NULL OR v_count = 0 THEN
    RETURN jsonb_build_object(
      'status','safe','week_count',0,'range_weeks',0,
      'first_date',NULL,'last_date',NULL,'reasons','[]'::jsonb
    );
  END IF;

  v_range := ((v_last - v_first)/7) + 1;

  IF EXTRACT(ISOYEAR FROM v_first)::int < 2024 THEN
    v_reasons := v_reasons || format('vroegste week vóór 2024 (%s)', v_first);
    v_status := 'blocked';
  END IF;
  IF EXTRACT(ISOYEAR FROM v_last)::int > 2028 THEN
    v_reasons := v_reasons || format('laatste week na 2028 (%s)', v_last);
    v_status := 'blocked';
  END IF;
  IF v_range > 80 THEN
    v_reasons := v_reasons || format('range %s weken > 80', v_range);
    v_status := 'blocked';
  END IF;
  IF v_count > 100 THEN
    v_reasons := v_reasons || format('aantal weken %s > 100', v_count);
    v_status := 'blocked';
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'week_count', v_count,
    'range_weeks', v_range,
    'first_date', v_first,
    'last_date', v_last,
    'reasons', to_jsonb(v_reasons)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.assess_project_planning(uuid) TO authenticated;

-- =========================================================================
-- 3) Snapshot helper
-- =========================================================================
CREATE OR REPLACE FUNCTION public.snapshot_project_planning(
  p_project_id uuid, p_label text, p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_weken jsonb; v_cellen jsonb; v_cm jsonb;
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '42501';
  END IF;
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id ontbreekt' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(pw)), '[]'::jsonb) INTO v_weken
  FROM public.project_weken pw WHERE pw.project_id = p_project_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(pc)), '[]'::jsonb) INTO v_cellen
  FROM public.planning_cellen pc
  JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
  WHERE pa.project_id = p_project_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(cm)), '[]'::jsonb) INTO v_cm
  FROM public.cel_monteurs cm
  JOIN public.planning_cellen pc ON pc.id = cm.cel_id
  JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
  WHERE pa.project_id = p_project_id;

  INSERT INTO public.planning_restore_snapshots
    (project_id, label, reason, project_weken, planning_cellen, cel_monteurs)
  VALUES (p_project_id, p_label, p_reason, v_weken, v_cellen, v_cm)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.snapshot_project_planning(uuid,text,text) TO authenticated;

-- =========================================================================
-- 4) Dangling-cells helper
-- =========================================================================
CREATE OR REPLACE FUNCTION public.count_dangling_planning_cellen(p_project_ids uuid[] DEFAULT NULL)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.planning_cellen pc
  LEFT JOIN public.project_weken pw ON pw.id = pc.week_id
  LEFT JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
  WHERE (p_project_ids IS NULL OR pa.project_id = ANY(p_project_ids))
    AND (pw.id IS NULL OR pa.id IS NULL);
$$;
GRANT EXECUTE ON FUNCTION public.count_dangling_planning_cellen(uuid[]) TO authenticated;

-- =========================================================================
-- 5) shift_project_weken: add p_force + snapshot + validation
-- =========================================================================
DROP FUNCTION IF EXISTS public.shift_project_weken(uuid, integer);
DROP FUNCTION IF EXISTS public.shift_project_weken(uuid, integer, boolean);

CREATE OR REPLACE FUNCTION public.shift_project_weken(
  p_project_id uuid, p_delta integer, p_force boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_first_after date; v_last_after date; v_range_after int; v_weeks_count int;
  v_reasons text[] := ARRAY[]::text[];
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Niet geautoriseerd om weken te verschuiven' USING ERRCODE = '42501';
  END IF;
  IF p_project_id IS NULL THEN RAISE EXCEPTION 'project_id ontbreekt' USING ERRCODE = '22023'; END IF;
  IF p_delta IS NULL THEN RAISE EXCEPTION 'delta ontbreekt' USING ERRCODE = '22023'; END IF;
  IF p_delta = 0 THEN RETURN 0; END IF;

  SELECT MIN(d), MAX(d), COUNT(*) INTO v_first_after, v_last_after, v_weeks_count FROM (
    SELECT (to_date(jaar::text || to_char(week_nr,'FM00') || '1','IYYYIWID') + (p_delta*7))::date AS d
    FROM public.project_weken WHERE project_id = p_project_id
  ) s;
  IF v_weeks_count IS NULL OR v_weeks_count = 0 THEN
    RETURN 0;
  END IF;
  v_range_after := ((v_last_after - v_first_after)/7) + 1;

  IF EXTRACT(ISOYEAR FROM v_first_after)::int < 2024 THEN
    v_reasons := v_reasons || format('vroegste week vóór 2024 (%s)', v_first_after);
  END IF;
  IF EXTRACT(ISOYEAR FROM v_last_after)::int > 2028 THEN
    v_reasons := v_reasons || format('laatste week na 2028 (%s)', v_last_after);
  END IF;
  IF v_range_after > 80 THEN
    v_reasons := v_reasons || format('range %s weken > 80', v_range_after);
  END IF;
  IF v_weeks_count > 100 THEN
    v_reasons := v_reasons || format('aantal weken %s > 100', v_weeks_count);
  END IF;

  IF array_length(v_reasons,1) > 0 AND NOT p_force THEN
    RAISE EXCEPTION 'Planning valt buiten veilige periode: %', array_to_string(v_reasons, '; ')
      USING ERRCODE = '22023',
            HINT = 'Gebruik p_force=true om dit expliciet te overschrijven';
  END IF;

  -- Snapshot vóór wijziging
  PERFORM public.snapshot_project_planning(
    p_project_id,
    'pre-shift delta=' || p_delta::text,
    CASE WHEN array_length(v_reasons,1) > 0 THEN array_to_string(v_reasons, '; ') ELSE NULL END
  );

  WITH shifted AS (
    SELECT pw.id,
           ((to_date(pw.jaar::text || to_char(pw.week_nr,'FM00') || '1','IYYYIWID') + (p_delta*7))::date) AS nd
    FROM public.project_weken pw WHERE pw.project_id = p_project_id
  )
  UPDATE public.project_weken pw
  SET jaar = EXTRACT(ISOYEAR FROM s.nd)::int,
      week_nr = EXTRACT(WEEK FROM s.nd)::int
  FROM shifted s WHERE pw.id = s.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.normalize_project_weken(p_project_id);

  IF public.count_dangling_planning_cellen(ARRAY[p_project_id]) > 0 THEN
    RAISE EXCEPTION 'Dangling planning_cellen gedetecteerd na shift'
      USING ERRCODE = '23503';
  END IF;

  RETURN v_count;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Weken verschuiven mislukt: doelweken botsen met bestaande planning (delta % weken)', p_delta
      USING ERRCODE = '23505';
  WHEN check_violation THEN
    RAISE EXCEPTION 'Weken verschuiven mislukt: doel-jaar ligt buiten het toegestane bereik (2000–2100)'
      USING ERRCODE = '23514';
END;
$$;

-- =========================================================================
-- 6) restore_concept_planning: risk_status, snapshot per project, blocked-skip
-- =========================================================================
DROP FUNCTION IF EXISTS public.restore_concept_planning(timestamptz, boolean);
DROP FUNCTION IF EXISTS public.restore_concept_planning(timestamptz, boolean, uuid[]);
DROP FUNCTION IF EXISTS public.restore_concept_planning(timestamptz, boolean, uuid[], uuid[]);

CREATE OR REPLACE FUNCTION public.restore_concept_planning(
  p_target_ts timestamptz,
  p_apply boolean DEFAULT false,
  p_project_ids uuid[] DEFAULT NULL,
  p_force_project_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_concept uuid[];
  v_force uuid[] := COALESCE(p_force_project_ids, ARRAY[]::uuid[]);
  v_summary jsonb;
  v_proj jsonb;
  v_apply_ids uuid[];
  v_w_ins int := 0; v_w_upd int := 0; v_w_del int := 0;
  v_c_ins int := 0; v_c_upd int := 0; v_c_del int := 0;
  v_m_ins int := 0; v_m_del int := 0;
  r RECORD;
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '42501';
  END IF;
  IF p_target_ts IS NULL THEN
    RAISE EXCEPTION 'target_ts ontbreekt' USING ERRCODE = '22023';
  END IF;

  IF p_project_ids IS NULL THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_concept
    FROM public.projecten WHERE status = 'concept';
  ELSE
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_concept
    FROM public.projecten WHERE status = 'concept' AND id = ANY(p_project_ids);
  END IF;

  IF array_length(v_concept,1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'message', 'Geen concept-projecten in scope', 'projects', '[]'::jsonb);
  END IF;

  -- Bouw desired state voor weken
  CREATE TEMP TABLE tmp_weken_desired ON COMMIT DROP AS
  WITH rids AS (
    SELECT row_id FROM public.audit_log
      WHERE table_name='project_weken' AND created_at > p_target_ts
        AND COALESCE((new_data->>'project_id')::uuid,(old_data->>'project_id')::uuid) = ANY(v_concept)
    UNION
    SELECT id AS row_id FROM public.project_weken WHERE project_id = ANY(v_concept)
  ),
  last_pre AS (
    SELECT DISTINCT ON (al.row_id) al.row_id, al.operation, al.new_data
    FROM public.audit_log al
    WHERE al.table_name='project_weken' AND al.created_at <= p_target_ts
      AND al.row_id IN (SELECT row_id FROM rids)
    ORDER BY al.row_id, al.created_at DESC, al.id DESC
  ),
  first_post AS (
    SELECT DISTINCT ON (al.row_id) al.row_id, al.operation, al.old_data
    FROM public.audit_log al
    WHERE al.table_name='project_weken' AND al.created_at > p_target_ts
      AND al.row_id IN (SELECT row_id FROM rids)
    ORDER BY al.row_id, al.created_at ASC, al.id ASC
  )
  SELECT r.row_id AS id,
         CASE
           WHEN lp.row_id IS NOT NULL THEN
             CASE WHEN lp.operation='DELETE' THEN NULL ELSE lp.new_data END
           WHEN fp.row_id IS NOT NULL THEN
             CASE WHEN fp.operation='INSERT' THEN NULL ELSE fp.old_data END
           ELSE
             (SELECT to_jsonb(t) FROM public.project_weken t WHERE t.id = r.row_id)
         END AS data
  FROM rids r
  LEFT JOIN last_pre lp ON lp.row_id = r.row_id
  LEFT JOIN first_post fp ON fp.row_id = r.row_id;

  DELETE FROM tmp_weken_desired d
  WHERE NOT (
    (d.data IS NOT NULL AND (d.data->>'project_id')::uuid = ANY(v_concept))
    OR EXISTS (SELECT 1 FROM public.project_weken pw WHERE pw.id=d.id AND pw.project_id = ANY(v_concept))
  );

  -- Bouw desired state voor cellen
  CREATE TEMP TABLE tmp_cells_desired ON COMMIT DROP AS
  WITH rids AS (
    SELECT al.row_id
    FROM public.audit_log al
    LEFT JOIN public.project_activiteiten pa
      ON pa.id = COALESCE((al.new_data->>'activiteit_id')::uuid,(al.old_data->>'activiteit_id')::uuid)
    WHERE al.table_name='planning_cellen' AND al.created_at > p_target_ts
      AND pa.project_id = ANY(v_concept)
    UNION
    SELECT pc.id FROM public.planning_cellen pc
      JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
      WHERE pa.project_id = ANY(v_concept)
  ),
  last_pre AS (
    SELECT DISTINCT ON (al.row_id) al.row_id, al.operation, al.new_data
    FROM public.audit_log al
    WHERE al.table_name='planning_cellen' AND al.created_at <= p_target_ts
      AND al.row_id IN (SELECT row_id FROM rids)
    ORDER BY al.row_id, al.created_at DESC, al.id DESC
  ),
  first_post AS (
    SELECT DISTINCT ON (al.row_id) al.row_id, al.operation, al.old_data
    FROM public.audit_log al
    WHERE al.table_name='planning_cellen' AND al.created_at > p_target_ts
      AND al.row_id IN (SELECT row_id FROM rids)
    ORDER BY al.row_id, al.created_at ASC, al.id ASC
  )
  SELECT r.row_id AS id,
         CASE
           WHEN lp.row_id IS NOT NULL THEN
             CASE WHEN lp.operation='DELETE' THEN NULL ELSE lp.new_data END
           WHEN fp.row_id IS NOT NULL THEN
             CASE WHEN fp.operation='INSERT' THEN NULL ELSE fp.old_data END
           ELSE
             (SELECT to_jsonb(t) FROM public.planning_cellen t WHERE t.id = r.row_id)
         END AS data
  FROM rids r
  LEFT JOIN last_pre lp ON lp.row_id = r.row_id
  LEFT JOIN first_post fp ON fp.row_id = r.row_id;

  -- Bouw desired state voor cel_monteurs
  CREATE TEMP TABLE tmp_celm_desired ON COMMIT DROP AS
  WITH rids AS (
    SELECT al.row_id
    FROM public.audit_log al
    LEFT JOIN public.planning_cellen pc
      ON pc.id = COALESCE((al.new_data->>'cel_id')::uuid,(al.old_data->>'cel_id')::uuid)
    LEFT JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
    WHERE al.table_name='cel_monteurs' AND al.created_at > p_target_ts
      AND pa.project_id = ANY(v_concept)
    UNION
    SELECT cm.id FROM public.cel_monteurs cm
      JOIN public.planning_cellen pc ON pc.id = cm.cel_id
      JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
      WHERE pa.project_id = ANY(v_concept)
  ),
  last_pre AS (
    SELECT DISTINCT ON (al.row_id) al.row_id, al.operation, al.new_data
    FROM public.audit_log al
    WHERE al.table_name='cel_monteurs' AND al.created_at <= p_target_ts
      AND al.row_id IN (SELECT row_id FROM rids)
    ORDER BY al.row_id, al.created_at DESC, al.id DESC
  ),
  first_post AS (
    SELECT DISTINCT ON (al.row_id) al.row_id, al.operation, al.old_data
    FROM public.audit_log al
    WHERE al.table_name='cel_monteurs' AND al.created_at > p_target_ts
      AND al.row_id IN (SELECT row_id FROM rids)
    ORDER BY al.row_id, al.created_at ASC, al.id ASC
  )
  SELECT r.row_id AS id,
         CASE
           WHEN lp.row_id IS NOT NULL THEN
             CASE WHEN lp.operation='DELETE' THEN NULL ELSE lp.new_data END
           WHEN fp.row_id IS NOT NULL THEN
             CASE WHEN fp.operation='INSERT' THEN NULL ELSE fp.old_data END
           ELSE
             (SELECT to_jsonb(t) FROM public.cel_monteurs t WHERE t.id = r.row_id)
         END AS data
  FROM rids r
  LEFT JOIN last_pre lp ON lp.row_id = r.row_id
  LEFT JOIN first_post fp ON fp.row_id = r.row_id;

  -- Bereken per-project risk_status op basis van desired weken
  CREATE TEMP TABLE tmp_project_risk ON COMMIT DROP AS
  WITH desired_dates AS (
    SELECT (d.data->>'project_id')::uuid AS project_id,
           to_date((d.data->>'jaar') || to_char((d.data->>'week_nr')::int, 'FM00') || '1', 'IYYYIWID') AS dte
    FROM tmp_weken_desired d
    WHERE d.data IS NOT NULL
  ),
  agg AS (
    SELECT project_id, MIN(dte) AS first_d, MAX(dte) AS last_d, COUNT(*) AS week_count
    FROM desired_dates GROUP BY project_id
  )
  SELECT p.id AS project_id,
         a.first_d, a.last_d,
         COALESCE(a.week_count,0)::int AS week_count,
         CASE WHEN a.first_d IS NULL THEN 0
              ELSE ((a.last_d - a.first_d)/7) + 1 END AS range_weeks
  FROM public.projecten p
  LEFT JOIN agg a ON a.project_id = p.id
  WHERE p.id = ANY(v_concept);

  -- Diff-tellers (totalen)
  SELECT
    COUNT(*) FILTER (WHERE d.data IS NOT NULL AND pw.id IS NULL),
    COUNT(*) FILTER (WHERE d.data IS NOT NULL AND pw.id IS NOT NULL AND (
        (d.data->>'project_id')::uuid IS DISTINCT FROM pw.project_id
     OR (d.data->>'jaar')::int       IS DISTINCT FROM pw.jaar
     OR (d.data->>'week_nr')::int    IS DISTINCT FROM pw.week_nr
     OR (d.data->>'positie')::int    IS DISTINCT FROM pw.positie
     OR COALESCE(d.data->>'opmerking','') IS DISTINCT FROM COALESCE(pw.opmerking,'')
    )),
    COUNT(*) FILTER (WHERE d.data IS NULL AND pw.id IS NOT NULL)
  INTO v_w_ins, v_w_upd, v_w_del
  FROM tmp_weken_desired d LEFT JOIN public.project_weken pw ON pw.id = d.id;

  SELECT
    COUNT(*) FILTER (WHERE d.data IS NOT NULL AND pc.id IS NULL),
    COUNT(*) FILTER (WHERE d.data IS NOT NULL AND pc.id IS NOT NULL AND (
        (d.data->>'activiteit_id')::uuid IS DISTINCT FROM pc.activiteit_id
     OR (d.data->>'week_id')::uuid       IS DISTINCT FROM pc.week_id
     OR (d.data->>'dag_index')::int      IS DISTINCT FROM pc.dag_index
     OR COALESCE(d.data->>'kleur_code','') IS DISTINCT FROM COALESCE(pc.kleur_code,'')
     OR COALESCE(d.data->>'notitie','')    IS DISTINCT FROM COALESCE(pc.notitie,'')
     OR COALESCE((d.data->>'capaciteit')::int,0) IS DISTINCT FROM COALESCE(pc.capaciteit,0)
    )),
    COUNT(*) FILTER (WHERE d.data IS NULL AND pc.id IS NOT NULL)
  INTO v_c_ins, v_c_upd, v_c_del
  FROM tmp_cells_desired d LEFT JOIN public.planning_cellen pc ON pc.id = d.id;

  SELECT
    COUNT(*) FILTER (WHERE d.data IS NOT NULL AND cm.id IS NULL),
    COUNT(*) FILTER (WHERE d.data IS NULL AND cm.id IS NOT NULL)
  INTO v_m_ins, v_m_del
  FROM tmp_celm_desired d LEFT JOIN public.cel_monteurs cm ON cm.id = d.id;

  -- Per-project samenvatting incl. risk_status
  SELECT jsonb_agg(jsonb_build_object(
    'project_id', p.id,
    'case_nummer', p.case_nummer,
    'station_naam', p.station_naam,
    'risk_status', CASE
      WHEN tpr.first_d IS NOT NULL AND (
          EXTRACT(ISOYEAR FROM tpr.first_d)::int < 2024
       OR EXTRACT(ISOYEAR FROM tpr.last_d)::int  > 2028
       OR tpr.range_weeks > 80
       OR tpr.week_count > 100
      ) THEN 'blocked'
      ELSE 'safe'
    END,
    'desired_first_date', tpr.first_d,
    'desired_last_date',  tpr.last_d,
    'desired_week_count', tpr.week_count,
    'desired_range_weeks', tpr.range_weeks,
    'weken_insert', COALESCE(w.ins,0), 'weken_update', COALESCE(w.upd,0), 'weken_delete', COALESCE(w.del,0),
    'cellen_insert', COALESCE(c.ins,0), 'cellen_update', COALESCE(c.upd,0), 'cellen_delete', COALESCE(c.del,0),
    'monteurs_insert', COALESCE(m.ins,0), 'monteurs_delete', COALESCE(m.del,0)
  ) ORDER BY p.case_nummer)
  INTO v_proj
  FROM public.projecten p
  LEFT JOIN tmp_project_risk tpr ON tpr.project_id = p.id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE d.data IS NOT NULL AND pw.id IS NULL) AS ins,
      COUNT(*) FILTER (WHERE d.data IS NOT NULL AND pw.id IS NOT NULL AND to_jsonb(pw) - 'created_at' - 'updated_at' IS DISTINCT FROM d.data - 'created_at' - 'updated_at') AS upd,
      COUNT(*) FILTER (WHERE d.data IS NULL AND pw.id IS NOT NULL) AS del
    FROM tmp_weken_desired d
    LEFT JOIN public.project_weken pw ON pw.id = d.id
    WHERE COALESCE((d.data->>'project_id')::uuid, pw.project_id) = p.id
  ) w ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE d.data IS NOT NULL AND pc.id IS NULL) AS ins,
      COUNT(*) FILTER (WHERE d.data IS NOT NULL AND pc.id IS NOT NULL AND to_jsonb(pc) IS DISTINCT FROM d.data) AS upd,
      COUNT(*) FILTER (WHERE d.data IS NULL AND pc.id IS NOT NULL) AS del
    FROM tmp_cells_desired d
    LEFT JOIN public.planning_cellen pc ON pc.id = d.id
    LEFT JOIN public.project_activiteiten pa
      ON pa.id = COALESCE((d.data->>'activiteit_id')::uuid, pc.activiteit_id)
    WHERE pa.project_id = p.id
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE d.data IS NOT NULL AND cm.id IS NULL) AS ins,
      COUNT(*) FILTER (WHERE d.data IS NULL AND cm.id IS NOT NULL) AS del
    FROM tmp_celm_desired d
    LEFT JOIN public.cel_monteurs cm ON cm.id = d.id
    LEFT JOIN public.planning_cellen pc2 ON pc2.id = COALESCE((d.data->>'cel_id')::uuid, cm.cel_id)
    LEFT JOIN public.project_activiteiten pa2 ON pa2.id = pc2.activiteit_id
    WHERE pa2.project_id = p.id
  ) m ON true
  WHERE p.id = ANY(v_concept);

  v_summary := jsonb_build_object(
    'target_ts', p_target_ts,
    'applied', p_apply,
    'scope_project_ids', to_jsonb(v_concept),
    'force_project_ids', to_jsonb(v_force),
    'totals', jsonb_build_object(
      'project_weken',   jsonb_build_object('insert', v_w_ins, 'update', v_w_upd, 'delete', v_w_del),
      'planning_cellen', jsonb_build_object('insert', v_c_ins, 'update', v_c_upd, 'delete', v_c_del),
      'cel_monteurs',    jsonb_build_object('insert', v_m_ins, 'delete', v_m_del)
    ),
    'projects', COALESCE(v_proj, '[]'::jsonb)
  );

  IF NOT p_apply THEN
    RETURN v_summary;
  END IF;

  -- ===== APPLY =====
  -- Bepaal welke projecten daadwerkelijk toegepast mogen worden (blocked alleen via force)
  SELECT COALESCE(array_agg(project_id), ARRAY[]::uuid[]) INTO v_apply_ids
  FROM tmp_project_risk tpr
  WHERE NOT (
    tpr.first_d IS NOT NULL AND (
        EXTRACT(ISOYEAR FROM tpr.first_d)::int < 2024
     OR EXTRACT(ISOYEAR FROM tpr.last_d)::int  > 2028
     OR tpr.range_weeks > 80
     OR tpr.week_count > 100
    )
    AND NOT (tpr.project_id = ANY(v_force))
  );

  IF array_length(v_apply_ids,1) IS NULL THEN
    RETURN jsonb_set(v_summary, '{message}', to_jsonb('Geen projecten te applyen (alle blocked, gebruik p_force_project_ids)'::text));
  END IF;

  PERFORM public.set_audit_label('Herstel concept-planning naar ' || to_char(p_target_ts AT TIME ZONE 'Europe/Amsterdam','YYYY-MM-DD HH24:MI'));

  -- Snapshot per project vóór wijziging
  FOR r IN SELECT unnest(v_apply_ids) AS pid LOOP
    PERFORM public.snapshot_project_planning(
      r.pid,
      'pre-restore ' || to_char(p_target_ts AT TIME ZONE 'Europe/Amsterdam','YYYY-MM-DD HH24:MI'),
      CASE WHEN r.pid = ANY(v_force) THEN 'forced restore' ELSE NULL END
    );
  END LOOP;

  -- Beperk desired-tabellen tot v_apply_ids
  DELETE FROM tmp_weken_desired d
  WHERE NOT (
    (d.data IS NOT NULL AND (d.data->>'project_id')::uuid = ANY(v_apply_ids))
    OR EXISTS (SELECT 1 FROM public.project_weken pw WHERE pw.id=d.id AND pw.project_id = ANY(v_apply_ids))
  );
  DELETE FROM tmp_cells_desired d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.planning_cellen pc
    JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
    WHERE pc.id = d.id AND pa.project_id = ANY(v_apply_ids)
  ) AND NOT (d.data IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.project_activiteiten pa
    WHERE pa.id = (d.data->>'activiteit_id')::uuid AND pa.project_id = ANY(v_apply_ids)
  ));
  DELETE FROM tmp_celm_desired d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.cel_monteurs cm
    JOIN public.planning_cellen pc ON pc.id = cm.cel_id
    JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
    WHERE cm.id = d.id AND pa.project_id = ANY(v_apply_ids)
  ) AND NOT (d.data IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.planning_cellen pc
    JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
    WHERE pc.id = (d.data->>'cel_id')::uuid AND pa.project_id = ANY(v_apply_ids)
  ));

  DELETE FROM public.cel_monteurs cm
  USING tmp_celm_desired d
  WHERE cm.id = d.id AND d.data IS NULL;

  DELETE FROM public.planning_cellen pc
  USING tmp_cells_desired d
  WHERE pc.id = d.id AND d.data IS NULL;

  DELETE FROM public.project_weken pw
  USING tmp_weken_desired d
  WHERE pw.id = d.id AND d.data IS NULL;

  INSERT INTO public.project_weken (id, project_id, jaar, week_nr, positie, opmerking)
  SELECT (d.data->>'id')::uuid,
         (d.data->>'project_id')::uuid,
         (d.data->>'jaar')::int,
         (d.data->>'week_nr')::int,
         (d.data->>'positie')::int,
         COALESCE(d.data->>'opmerking','')
  FROM tmp_weken_desired d
  WHERE d.data IS NOT NULL
  ON CONFLICT (id) DO UPDATE SET
    project_id = EXCLUDED.project_id, jaar = EXCLUDED.jaar,
    week_nr = EXCLUDED.week_nr, positie = EXCLUDED.positie,
    opmerking = EXCLUDED.opmerking;

  INSERT INTO public.planning_cellen (id, activiteit_id, week_id, dag_index, kleur_code, notitie, capaciteit)
  SELECT (d.data->>'id')::uuid,
         (d.data->>'activiteit_id')::uuid,
         (d.data->>'week_id')::uuid,
         (d.data->>'dag_index')::int,
         d.data->>'kleur_code',
         COALESCE(d.data->>'notitie',''),
         COALESCE((d.data->>'capaciteit')::int, 0)
  FROM tmp_cells_desired d
  WHERE d.data IS NOT NULL
  ON CONFLICT (id) DO UPDATE SET
    activiteit_id = EXCLUDED.activiteit_id, week_id = EXCLUDED.week_id,
    dag_index = EXCLUDED.dag_index, kleur_code = EXCLUDED.kleur_code,
    notitie = EXCLUDED.notitie, capaciteit = EXCLUDED.capaciteit;

  INSERT INTO public.cel_monteurs (id, cel_id, monteur_id)
  SELECT (d.data->>'id')::uuid, (d.data->>'cel_id')::uuid, (d.data->>'monteur_id')::uuid
  FROM tmp_celm_desired d
  WHERE d.data IS NOT NULL
  ON CONFLICT (id) DO UPDATE SET cel_id = EXCLUDED.cel_id, monteur_id = EXCLUDED.monteur_id;

  -- Dangling check
  IF public.count_dangling_planning_cellen(v_apply_ids) > 0 THEN
    RAISE EXCEPTION 'Dangling planning_cellen gedetecteerd na restore' USING ERRCODE = '23503';
  END IF;

  RETURN jsonb_set(v_summary, '{applied_project_ids}', to_jsonb(v_apply_ids));
END;
$$;
GRANT EXECUTE ON FUNCTION public.restore_concept_planning(timestamptz, boolean, uuid[], uuid[]) TO authenticated;