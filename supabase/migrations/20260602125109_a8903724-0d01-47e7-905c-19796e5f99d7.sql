-- Tighten RLS: only authenticated users may access application data.
-- Storage bucket 'project-tekeningen' is also restricted to authenticated users.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'activiteit_types','cel_monteurs','feestdagen','monteur_afwezigheid','monteurs',
    'opdrachtgevers','percelen','planning_cellen','ploeg_monteurs','ploegen',
    'project_activiteiten','project_concept_monteurs','project_concept_planning',
    'project_ls_kabels','project_ms_kabels','project_tekeningen','project_templates',
    'project_weken','projecten'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop existing permissive policy
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'public_all_' || t, t);

    -- Revoke anon access; grant only to authenticated
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    -- Make sure RLS is enabled
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Auth-only policies
    EXECUTE format($f$CREATE POLICY "auth_select_%s" ON public.%I FOR SELECT TO authenticated USING (true)$f$, t, t);
    EXECUTE format($f$CREATE POLICY "auth_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)$f$, t, t);
    EXECUTE format($f$CREATE POLICY "auth_update_%s" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)$f$, t, t);
    EXECUTE format($f$CREATE POLICY "auth_delete_%s" ON public.%I FOR DELETE TO authenticated USING (true)$f$, t, t);
  END LOOP;
END $$;

-- Storage: restrict project-tekeningen bucket to authenticated users
DROP POLICY IF EXISTS "project_tekeningen_select" ON storage.objects;
DROP POLICY IF EXISTS "project_tekeningen_insert" ON storage.objects;
DROP POLICY IF EXISTS "project_tekeningen_update" ON storage.objects;
DROP POLICY IF EXISTS "project_tekeningen_delete" ON storage.objects;
DROP POLICY IF EXISTS "Public read project-tekeningen" ON storage.objects;
DROP POLICY IF EXISTS "Public write project-tekeningen" ON storage.objects;
DROP POLICY IF EXISTS "Public update project-tekeningen" ON storage.objects;
DROP POLICY IF EXISTS "Public delete project-tekeningen" ON storage.objects;

CREATE POLICY "project_tekeningen_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-tekeningen');

CREATE POLICY "project_tekeningen_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-tekeningen');

CREATE POLICY "project_tekeningen_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'project-tekeningen')
  WITH CHECK (bucket_id = 'project-tekeningen');

CREATE POLICY "project_tekeningen_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'project-tekeningen');
