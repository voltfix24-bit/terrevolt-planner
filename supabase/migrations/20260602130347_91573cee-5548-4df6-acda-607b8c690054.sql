
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'activiteit_types','cel_monteurs','feestdagen','monteur_afwezigheid','monteurs',
    'opdrachtgevers','percelen','planning_cellen','ploeg_monteurs','ploegen',
    'project_activiteiten','project_concept_monteurs','project_concept_planning',
    'project_ls_kabels','project_ms_kabels','project_tekeningen','project_templates',
    'project_weken','projecten'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS auth_select_%1$s ON public.%1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_insert_%1$s ON public.%1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_update_%1$s ON public.%1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_delete_%1$s ON public.%1$s;', t);
    EXECUTE format('CREATE POLICY public_all_%1$s ON public.%1$s FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%1$s TO anon, authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%1$s TO service_role;', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "auth_select_project_tekeningen_storage" ON storage.objects;
DROP POLICY IF EXISTS "auth_insert_project_tekeningen_storage" ON storage.objects;
DROP POLICY IF EXISTS "auth_update_project_tekeningen_storage" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_project_tekeningen_storage" ON storage.objects;

CREATE POLICY "public_all_project_tekeningen_storage"
ON storage.objects FOR ALL
TO anon, authenticated
USING (bucket_id = 'project-tekeningen')
WITH CHECK (bucket_id = 'project-tekeningen');
