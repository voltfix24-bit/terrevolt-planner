CREATE OR REPLACE FUNCTION public.fill_cell_range(
  p_source_cel_id uuid,
  p_targets jsonb,
  p_overwrite_ids uuid[]
)
RETURNS TABLE(id uuid, week_id uuid, dag_index int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_src           public.planning_cellen%ROWTYPE;
  v_monteurs      uuid[];
  v_overwrite     uuid[] := COALESCE(p_overwrite_ids, ARRAY[]::uuid[]);
  v_target        jsonb;
  v_week_id       uuid;
  v_dag_index     int;
  v_existing_id   uuid;
  v_new_id        uuid;
  v_inserted      jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '42501';
  END IF;

  IF p_source_cel_id IS NULL THEN
    RAISE EXCEPTION 'Broncel ontbreekt' USING ERRCODE = '22023';
  END IF;

  IF p_targets IS NULL OR jsonb_typeof(p_targets) <> 'array' THEN
    RAISE EXCEPTION 'Doelreeks ontbreekt of is ongeldig' USING ERRCODE = '22023';
  END IF;

  SELECT pc.*
  INTO v_src
  FROM public.planning_cellen AS pc
  WHERE pc.id = p_source_cel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Broncel niet gevonden' USING ERRCODE = 'P0002';
  END IF;

  IF v_src.activiteit_id IS NULL THEN
    RAISE EXCEPTION 'Broncel heeft geen activiteit' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(cm.monteur_id), ARRAY[]::uuid[])
  INTO v_monteurs
  FROM public.cel_monteurs AS cm
  WHERE cm.cel_id = p_source_cel_id
    AND cm.monteur_id IS NOT NULL;

  FOR v_target IN SELECT jsonb_array_elements(p_targets)
  LOOP
    v_week_id   := (v_target->>'week_id')::uuid;
    v_dag_index := (v_target->>'dag_index')::int;

    IF v_week_id IS NULL OR v_dag_index IS NULL THEN
      RAISE EXCEPTION 'Doel mist week_id of dag_index' USING ERRCODE = '22023';
    END IF;

    IF v_dag_index < 0 OR v_dag_index > 4 THEN
      RAISE EXCEPTION 'Ongeldige dag_index %', v_dag_index USING ERRCODE = '22023';
    END IF;

    IF v_week_id = v_src.week_id AND v_dag_index = v_src.dag_index THEN
      CONTINUE;
    END IF;

    SELECT pc.id
    INTO v_existing_id
    FROM public.planning_cellen AS pc
    WHERE pc.activiteit_id = v_src.activiteit_id
      AND pc.week_id = v_week_id
      AND pc.dag_index = v_dag_index;

    IF v_existing_id IS NOT NULL THEN
      IF NOT (v_existing_id = ANY(v_overwrite)) THEN
        RAISE EXCEPTION 'Doel-dag is intussen gevuld door iemand anders'
          USING ERRCODE = '23505';
      END IF;

      DELETE FROM public.cel_monteurs AS cm
      WHERE cm.cel_id = v_existing_id;

      DELETE FROM public.planning_cellen AS pc
      WHERE pc.id = v_existing_id;
    END IF;

    INSERT INTO public.planning_cellen AS pc
      (activiteit_id, week_id, dag_index, kleur_code, notitie, capaciteit)
    VALUES
      (v_src.activiteit_id, v_week_id, v_dag_index, v_src.kleur_code, v_src.notitie, v_src.capaciteit)
    RETURNING pc.id INTO v_new_id;

    IF array_length(v_monteurs, 1) > 0 THEN
      INSERT INTO public.cel_monteurs(cel_id, monteur_id)
      SELECT v_new_id, monteur_id
      FROM unnest(v_monteurs) AS copied_monteurs(monteur_id);
    END IF;

    v_inserted := v_inserted || jsonb_build_object(
      'id', v_new_id,
      'week_id', v_week_id,
      'dag_index', v_dag_index
    );
  END LOOP;

  RETURN QUERY
  SELECT
    (inserted_item.value->>'id')::uuid AS id,
    (inserted_item.value->>'week_id')::uuid AS week_id,
    (inserted_item.value->>'dag_index')::int AS dag_index
  FROM jsonb_array_elements(v_inserted) AS inserted_item(value);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fill_cell_range(uuid, jsonb, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fill_cell_range(uuid, jsonb, uuid[]) TO authenticated, service_role;