-- =========================================
-- AUDIT LOG + UNDO SYSTEM
-- =========================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  row_id UUID,
  old_data JSONB,
  new_data JSONB,
  batch_id UUID NOT NULL,
  label TEXT,
  undone BOOLEAN NOT NULL DEFAULT false,
  undone_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS audit_log_batch_idx ON public.audit_log(batch_id);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_undone_idx ON public.audit_log(undone, created_at DESC);

GRANT SELECT, UPDATE ON public.audit_log TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO authenticated, anon;
GRANT ALL ON public.audit_log TO service_role;
GRANT ALL ON SEQUENCE public.audit_log_id_seq TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_audit_log" ON public.audit_log;
CREATE POLICY "public_select_audit_log" ON public.audit_log FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_update_audit_log" ON public.audit_log;
CREATE POLICY "public_update_audit_log" ON public.audit_log FOR UPDATE USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;

-- =========================================
-- TRIGGER FUNCTION
-- =========================================

CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suppress TEXT;
  v_batch TEXT;
  v_batch_id UUID;
  v_label TEXT;
  v_row_id UUID;
BEGIN
  -- Skip logging during undo operations
  v_suppress := current_setting('app.suppress_audit', true);
  IF v_suppress = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Per-transaction batch id (all rows touched in same REST call share it)
  v_batch := current_setting('app.tx_batch_' || txid_current()::text, true);
  IF v_batch IS NULL OR v_batch = '' THEN
    v_batch_id := gen_random_uuid();
    PERFORM set_config('app.tx_batch_' || txid_current()::text, v_batch_id::text, true);
  ELSE
    v_batch_id := v_batch::uuid;
  END IF;

  v_label := nullif(current_setting('app.audit_label', true), '');

  IF TG_OP = 'DELETE' THEN
    v_row_id := (to_jsonb(OLD)->>'id')::uuid;
    INSERT INTO public.audit_log(table_name, operation, row_id, old_data, new_data, batch_id, label)
    VALUES (TG_TABLE_NAME, 'DELETE', v_row_id, to_jsonb(OLD), NULL, v_batch_id, v_label);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_row_id := (to_jsonb(NEW)->>'id')::uuid;
    INSERT INTO public.audit_log(table_name, operation, row_id, old_data, new_data, batch_id, label)
    VALUES (TG_TABLE_NAME, 'UPDATE', v_row_id, to_jsonb(OLD), to_jsonb(NEW), v_batch_id, v_label);
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    v_row_id := (to_jsonb(NEW)->>'id')::uuid;
    INSERT INTO public.audit_log(table_name, operation, row_id, old_data, new_data, batch_id, label)
    VALUES (TG_TABLE_NAME, 'INSERT', v_row_id, NULL, to_jsonb(NEW), v_batch_id, v_label);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- =========================================
-- ATTACH TRIGGERS TO ALL DATA TABLES
-- =========================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'planning_cellen','cel_monteurs','project_concept_planning','project_concept_monteurs',
    'project_weken','projecten','project_activiteiten','project_ls_kabels','project_ms_kabels',
    'project_tekeningen','monteurs','monteur_afwezigheid','ploegen','ploeg_monteurs',
    'activiteit_types','opdrachtgevers','percelen','feestdagen','project_templates'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_trg ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()',
      t
    );
  END LOOP;
END $$;

-- =========================================
-- UNDO FUNCTION
-- =========================================

CREATE OR REPLACE FUNCTION public.undo_batch(p_batch_id UUID DEFAULT NULL)
RETURNS TABLE(batch UUID, undone_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch UUID;
  v_count INT := 0;
  r RECORD;
  v_cols TEXT;
  v_sql TEXT;
BEGIN
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

  -- Reverse chronological order to respect FK dependencies
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
      -- skip rows that fail (already changed elsewhere)
      NULL;
    END;
  END LOOP;

  UPDATE public.audit_log
  SET undone = true, undone_at = now()
  WHERE batch_id = v_batch AND undone = false;

  PERFORM set_config('app.suppress_audit', 'off', true);

  RETURN QUERY SELECT v_batch, v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_batch(UUID) TO authenticated, anon;

-- =========================================
-- HELPER: set label for next mutation in same tx (best-effort)
-- =========================================
CREATE OR REPLACE FUNCTION public.set_audit_label(p_label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.audit_label', coalesce(p_label, ''), true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_audit_label(TEXT) TO authenticated, anon;
