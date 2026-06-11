-- Secure the planner and prepare stable cross-application identifiers.

CREATE TABLE IF NOT EXISTS public.planner_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'manager' CHECK (role = 'manager'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.planner_users ENABLE ROW LEVEL SECURITY;

INSERT INTO public.planner_users (user_id, role, active)
SELECT id, 'manager', true
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_planner_manager(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.planner_users
    WHERE user_id = check_user_id
      AND role = 'manager'
      AND active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_planner_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_planner_manager(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "planner_users_manager_access" ON public.planner_users;
CREATE POLICY "planner_users_manager_access"
ON public.planner_users
FOR ALL
TO authenticated
USING (public.is_planner_manager())
WITH CHECK (public.is_planner_manager());

REVOKE ALL ON public.planner_users FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planner_users TO authenticated;
GRANT ALL ON public.planner_users TO service_role;

DO $$
DECLARE
  t text;
  p record;
  tables text[] := ARRAY[
    'activiteit_types','cel_monteurs','feestdagen','monteur_afwezigheid','monteurs',
    'opdrachtgevers','percelen','planning_cellen','ploeg_monteurs','ploegen',
    'project_activiteiten','project_concept_monteurs','project_concept_planning',
    'project_ls_kabels','project_ms_kabels','project_tekeningen','project_templates',
    'project_weken','projecten','audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_planner_manager()) WITH CHECK (public.is_planner_manager())',
      'planner_manager_' || t,
      t
    );
  END LOOP;
END $$;

REVOKE ALL ON SEQUENCE public.audit_log_id_seq FROM anon;
GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO authenticated;

REVOKE ALL ON FUNCTION public.undo_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_batch(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.set_audit_label(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_audit_label(text) TO authenticated;

DROP POLICY IF EXISTS "public_all_project_tekeningen_storage" ON storage.objects;
DROP POLICY IF EXISTS "project_tekeningen_select" ON storage.objects;
DROP POLICY IF EXISTS "project_tekeningen_insert" ON storage.objects;
DROP POLICY IF EXISTS "project_tekeningen_update" ON storage.objects;
DROP POLICY IF EXISTS "project_tekeningen_delete" ON storage.objects;

CREATE POLICY "planner_manager_project_tekeningen"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'project-tekeningen' AND public.is_planner_manager())
WITH CHECK (bucket_id = 'project-tekeningen' AND public.is_planner_manager());

ALTER TABLE public.projecten
  ADD COLUMN IF NOT EXISTS urenapp_project_id uuid;

ALTER TABLE public.monteurs
  ADD COLUMN IF NOT EXISTS urenapp_profile_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS projecten_urenapp_project_unique
  ON public.projecten (urenapp_project_id)
  WHERE urenapp_project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS monteurs_urenapp_profile_unique
  ON public.monteurs (urenapp_profile_id)
  WHERE urenapp_profile_id IS NOT NULL;