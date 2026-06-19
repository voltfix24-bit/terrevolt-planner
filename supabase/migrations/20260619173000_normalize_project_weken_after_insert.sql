-- Zorg dat project_weken ook bij bulk-inserts vanuit de UI altijd een geldige
-- chronologische positie krijgen voordat de deferrable unique constraint wordt
-- gevalideerd. Dit voorkomt fouten zoals:
-- duplicate key value violates unique constraint "project_weken_project_positie_unique"
-- wanneer de UI een oudere week toevoegt terwijl er al verborgen weken bestaan.

CREATE OR REPLACE FUNCTION public.normalize_project_weken_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  FOR v_project_id IN
    SELECT DISTINCT project_id
    FROM new_project_weken
    WHERE project_id IS NOT NULL
  LOOP
    UPDATE public.project_weken pw
    SET positie = s.rn - 1
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY jaar, week_nr) AS rn
      FROM public.project_weken
      WHERE project_id = v_project_id
    ) s
    WHERE pw.id = s.id
      AND pw.project_id = v_project_id
      AND pw.positie IS DISTINCT FROM (s.rn - 1);
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_weken_normalize_after_insert ON public.project_weken;

CREATE TRIGGER trg_project_weken_normalize_after_insert
AFTER INSERT ON public.project_weken
REFERENCING NEW TABLE AS new_project_weken
FOR EACH STATEMENT
EXECUTE FUNCTION public.normalize_project_weken_after_insert();
