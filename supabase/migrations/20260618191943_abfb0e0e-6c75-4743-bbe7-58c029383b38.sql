
CREATE OR REPLACE FUNCTION public.restore_concept_planning(
  p_target_ts timestamptz,
  p_apply boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_concept uuid[];
  v_summary jsonb;
  v_proj jsonb;
  v_w_ins int := 0; v_w_upd int := 0; v_w_del int := 0;
  v_c_ins int := 0; v_c_upd int := 0; v_c_del int := 0;
  v_m_ins int := 0; v_m_del int := 0;
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '42501';
  END IF;
  IF p_target_ts IS NULL THEN
    RAISE EXCEPTION 'target_ts ontbreekt' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_concept
  FROM public.projecten WHERE status = 'concept';

  IF array_length(v_concept,1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'message', 'Geen concept-projecten', 'projects', '[]'::jsonb);
  END IF;

  -- ============== project_weken desired state ==============
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

  -- Strip rows whose desired+current project_id is not in concept (defensive)
  DELETE FROM tmp_weken_desired d
  WHERE NOT (
    (d.data IS NOT NULL AND (d.data->>'project_id')::uuid = ANY(v_concept))
    OR EXISTS (SELECT 1 FROM public.project_weken pw WHERE pw.id=d.id AND pw.project_id = ANY(v_concept))
  );

  -- ============== planning_cellen desired state ==============
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

  -- ============== cel_monteurs desired state ==============
  -- cel_monteurs has no 'id' column - PK? Let's check via composite. Actually columns shown: cel_id, monteur_id, id.
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

  -- ============== Diff counters ==============
  -- project_weken
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

  -- planning_cellen
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

  -- cel_monteurs (only ins/del meaningful since composite of cel_id+monteur_id; treat any change as del+ins)
  SELECT
    COUNT(*) FILTER (WHERE d.data IS NOT NULL AND cm.id IS NULL),
    COUNT(*) FILTER (WHERE d.data IS NULL AND cm.id IS NOT NULL)
  INTO v_m_ins, v_m_del
  FROM tmp_celm_desired d LEFT JOIN public.cel_monteurs cm ON cm.id = d.id;

  -- ============== Per-project summary ==============
  SELECT jsonb_agg(jsonb_build_object(
    'project_id', p.id,
    'case_nummer', p.case_nummer,
    'station_naam', p.station_naam,
    'weken_insert', COALESCE(w.ins,0), 'weken_update', COALESCE(w.upd,0), 'weken_delete', COALESCE(w.del,0),
    'cellen_insert', COALESCE(c.ins,0), 'cellen_update', COALESCE(c.upd,0), 'cellen_delete', COALESCE(c.del,0),
    'monteurs_insert', COALESCE(m.ins,0), 'monteurs_delete', COALESCE(m.del,0)
  ) ORDER BY p.case_nummer)
  INTO v_proj
  FROM public.projecten p
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

  -- ============== APPLY ==============
  PERFORM public.set_audit_label('Herstel concept-planning naar ' || to_char(p_target_ts AT TIME ZONE 'Europe/Amsterdam','YYYY-MM-DD HH24:MI'));

  -- Delete order: cel_monteurs, planning_cellen, project_weken
  DELETE FROM public.cel_monteurs cm
  USING tmp_celm_desired d
  WHERE cm.id = d.id AND d.data IS NULL;

  DELETE FROM public.planning_cellen pc
  USING tmp_cells_desired d
  WHERE pc.id = d.id AND d.data IS NULL;

  DELETE FROM public.project_weken pw
  USING tmp_weken_desired d
  WHERE pw.id = d.id AND d.data IS NULL;

  -- Upsert project_weken (deferred uniques will validate at commit)
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
    project_id = EXCLUDED.project_id,
    jaar       = EXCLUDED.jaar,
    week_nr    = EXCLUDED.week_nr,
    positie    = EXCLUDED.positie,
    opmerking  = EXCLUDED.opmerking;

  -- Upsert planning_cellen
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
    activiteit_id = EXCLUDED.activiteit_id,
    week_id       = EXCLUDED.week_id,
    dag_index     = EXCLUDED.dag_index,
    kleur_code    = EXCLUDED.kleur_code,
    notitie       = EXCLUDED.notitie,
    capaciteit    = EXCLUDED.capaciteit;

  -- Upsert cel_monteurs
  INSERT INTO public.cel_monteurs (id, cel_id, monteur_id)
  SELECT (d.data->>'id')::uuid,
         (d.data->>'cel_id')::uuid,
         (d.data->>'monteur_id')::uuid
  FROM tmp_celm_desired d
  WHERE d.data IS NOT NULL
  ON CONFLICT (id) DO UPDATE SET
    cel_id     = EXCLUDED.cel_id,
    monteur_id = EXCLUDED.monteur_id;

  RETURN v_summary;
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_concept_planning(timestamptz, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_concept_planning(timestamptz, boolean) TO authenticated, service_role;
