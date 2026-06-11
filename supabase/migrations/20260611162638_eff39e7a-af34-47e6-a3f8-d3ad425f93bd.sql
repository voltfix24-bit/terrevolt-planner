ALTER TABLE public.projecten DROP CONSTRAINT IF EXISTS projecten_status_check;
ALTER TABLE public.projecten ADD CONSTRAINT projecten_status_check
  CHECK (status = ANY (ARRAY['concept'::text, 'gepland'::text, 'in_uitvoering'::text, 'afgerond'::text, 'inactief'::text]));