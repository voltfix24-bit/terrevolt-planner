-- 1. Herstel bestaande corrupte posities chronologisch op (jaar, week_nr).
UPDATE public.project_weken pw
SET positie = s.rn - 1
FROM (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY project_id
           ORDER BY jaar, week_nr
         ) AS rn
  FROM public.project_weken
) s
WHERE pw.id = s.id
  AND pw.positie IS DISTINCT FROM (s.rn - 1);

-- 2. Voorkom dat dubbele posities opnieuw kunnen ontstaan.
--    DEFERRABLE INITIALLY DEFERRED zodat normalize/shift binnen één transactie
--    intermediate violations mag hebben; de check valt pas op COMMIT.
ALTER TABLE public.project_weken
  ADD CONSTRAINT project_weken_project_positie_unique
  UNIQUE (project_id, positie)
  DEFERRABLE INITIALLY DEFERRED;

-- 3. Atomische normalize-RPC: zet voor één project de posities op 0..n-1
--    in chronologische volgorde, in één enkele UPDATE = één transactie.
--    Vervangt het bestaande per-rij Promise.all patroon vanuit de client.
CREATE OR REPLACE FUNCTION public.normalize_project_weken(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '42501';
  END IF;
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id ontbreekt' USING ERRCODE = '22023';
  END IF;

  UPDATE public.project_weken pw
  SET positie = s.rn - 1
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY jaar, week_nr) AS rn
    FROM public.project_weken
    WHERE project_id = p_project_id
  ) s
  WHERE pw.id = s.id
    AND pw.project_id = p_project_id
    AND pw.positie IS DISTINCT FROM (s.rn - 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_project_weken(uuid) TO authenticated;