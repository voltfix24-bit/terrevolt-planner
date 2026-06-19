
DO $$
DECLARE
  v_label text := 'Planning handmatig naar week 36 2026 gezet';
  v_projects jsonb := jsonb_build_array(
    jsonb_build_object('id','19477381-c040-4dd0-9576-6f3b4a47830b','case','0306637','delta',54),
    jsonb_build_object('id','43065d5e-2d72-480a-83f1-c258d8700f75','case','0314635','delta',52),
    jsonb_build_object('id','71f627d9-9ad0-40f8-ad13-9b5ee1fa6e7a','case','318773','delta',52),
    jsonb_build_object('id','9d329ad6-f9eb-410c-a2da-14f6d29918f3','case','328211','delta',53)
  );
  r jsonb;
  v_pid uuid;
  v_delta int;
  v_count int;
  v_dangling int;
  v_weken jsonb; v_cellen jsonb; v_cm jsonb;
BEGIN
  PERFORM set_config('app.audit_label', v_label, true);

  FOR r IN SELECT * FROM jsonb_array_elements(v_projects) LOOP
    v_pid := (r->>'id')::uuid;
    v_delta := (r->>'delta')::int;

    -- Snapshot
    SELECT COALESCE(jsonb_agg(to_jsonb(pw)), '[]'::jsonb) INTO v_weken
      FROM public.project_weken pw WHERE pw.project_id = v_pid;
    SELECT COALESCE(jsonb_agg(to_jsonb(pc)), '[]'::jsonb) INTO v_cellen
      FROM public.planning_cellen pc
      JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
      WHERE pa.project_id = v_pid;
    SELECT COALESCE(jsonb_agg(to_jsonb(cm)), '[]'::jsonb) INTO v_cm
      FROM public.cel_monteurs cm
      JOIN public.planning_cellen pc ON pc.id = cm.cel_id
      JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
      WHERE pa.project_id = v_pid;
    INSERT INTO public.planning_restore_snapshots
      (project_id, label, reason, project_weken, planning_cellen, cel_monteurs)
    VALUES (v_pid, 'pre-shift delta=' || v_delta::text || ' (' || v_label || ')',
            'forced shift naar week 36 2026', v_weken, v_cellen, v_cm);

    -- Shift
    WITH shifted AS (
      SELECT pw.id,
             ((to_date(pw.jaar::text || to_char(pw.week_nr,'FM00') || '1','IYYYIWID') + (v_delta*7))::date) AS nd
      FROM public.project_weken pw WHERE pw.project_id = v_pid
    )
    UPDATE public.project_weken pw
    SET jaar = EXTRACT(ISOYEAR FROM s.nd)::int,
        week_nr = EXTRACT(WEEK FROM s.nd)::int
    FROM shifted s WHERE pw.id = s.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Normalize posities
    UPDATE public.project_weken pw
    SET positie = s.rn - 1
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY jaar, week_nr) AS rn
      FROM public.project_weken WHERE project_id = v_pid
    ) s
    WHERE pw.id = s.id AND pw.project_id = v_pid
      AND pw.positie IS DISTINCT FROM (s.rn - 1);

    -- Dangling check
    SELECT public.count_dangling_planning_cellen(ARRAY[v_pid]) INTO v_dangling;
    IF v_dangling > 0 THEN
      RAISE EXCEPTION 'Dangling planning_cellen na shift project %', r->>'case';
    END IF;

    RAISE NOTICE 'project % (case %) → % weken verschoven met delta % (dangling=%)',
      v_pid, r->>'case', v_count, v_delta, v_dangling;
  END LOOP;
END $$;
