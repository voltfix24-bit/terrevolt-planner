-- Voorkom dubbele planningweken per project: één rij per (project, week_nr).
-- Bestaande duplicaten worden eerst opgeruimd (jongste rij per (project, week_nr) blijft staan).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY project_id, week_nr
           ORDER BY positie ASC, id ASC
         ) AS rn
  FROM public.project_weken
)
DELETE FROM public.project_weken pw
USING ranked r
WHERE pw.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS project_weken_project_week_unique
  ON public.project_weken (project_id, week_nr);