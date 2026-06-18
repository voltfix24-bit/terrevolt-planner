
-- 1. Verwijder publieke storage-policies op project-tekeningen.
DROP POLICY IF EXISTS "tekeningen_select_all" ON storage.objects;
DROP POLICY IF EXISTS "tekeningen_insert_all" ON storage.objects;
DROP POLICY IF EXISTS "tekeningen_update_all" ON storage.objects;
DROP POLICY IF EXISTS "tekeningen_delete_all" ON storage.objects;

-- 2. Restrict undo_batch tot planner-managers.
CREATE OR REPLACE FUNCTION public.undo_batch(p_batch_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(batch uuid, undone_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_batch UUID;
  v_count INT := 0;
  r RECORD;
  v_cols TEXT;
  v_sql TEXT;
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_batch_id IS NULL THEN
    SELECT batch_id INTO v_batch
    FROM public.audit_log
    WHERE undone = false
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    v_batch := p_batch_id;
  END IF;

  IF v_batch IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 0;
    RETURN;
  END IF;

  PERFORM set_config('app.suppress_audit', 'on', true);

  FOR r IN
    SELECT * FROM public.audit_log
    WHERE batch_id = v_batch AND undone = false
    ORDER BY id DESC
  LOOP
    BEGIN
      IF r.operation = 'INSERT' THEN
        EXECUTE format('DELETE FROM public.%I WHERE id = $1', r.table_name) USING r.row_id;
      ELSIF r.operation = 'DELETE' THEN
        SELECT string_agg(format('%I', key), ', ') INTO v_cols
        FROM jsonb_object_keys(r.old_data) AS key;
        v_sql := format(
          'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)',
          r.table_name, r.table_name
        );
        EXECUTE v_sql USING r.old_data;
      ELSIF r.operation = 'UPDATE' THEN
        v_sql := format(
          'UPDATE public.%I SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)) WHERE id = $2',
          r.table_name,
          (SELECT string_agg(format('%I', key), ',') FROM jsonb_object_keys(r.old_data) AS key WHERE key <> 'id'),
          (SELECT string_agg(format('%I', key), ',') FROM jsonb_object_keys(r.old_data) AS key WHERE key <> 'id'),
          r.table_name
        );
        EXECUTE v_sql USING r.old_data, r.row_id;
      END IF;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  UPDATE public.audit_log
  SET undone = true, undone_at = now()
  WHERE batch_id = v_batch AND undone = false;

  PERFORM set_config('app.suppress_audit', 'off', true);

  RETURN QUERY SELECT v_batch, v_count;
END;
$function$;

-- 3. Vaste search_path op set_audit_label.
CREATE OR REPLACE FUNCTION public.set_audit_label(p_label text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.audit_label', coalesce(p_label, ''), true);
END;
$function$;

-- 4. Audit-trigger hoeft niet als RPC oproepbaar te zijn.
REVOKE EXECUTE ON FUNCTION public.audit_trigger() FROM anon, authenticated, PUBLIC;
