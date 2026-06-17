-- Stap 1: nieuwe kolom toevoegen (nullable, we vullen daarna)
ALTER TABLE public.project_weken
  ADD COLUMN IF NOT EXISTS jaar integer;

-- Stap 2: backfill — gebruik projecten.jaar; fallback huidig jaar
UPDATE public.project_weken pw
SET jaar = COALESCE(p.jaar, EXTRACT(YEAR FROM now())::int)
FROM public.projecten p
WHERE pw.project_id = p.id
  AND pw.jaar IS NULL;

UPDATE public.project_weken
SET jaar = EXTRACT(YEAR FROM now())::int
WHERE jaar IS NULL;

-- Stap 3: not-null + check
ALTER TABLE public.project_weken
  ALTER COLUMN jaar SET NOT NULL;

ALTER TABLE public.project_weken
  ADD CONSTRAINT project_weken_jaar_chk
  CHECK (jaar BETWEEN 2000 AND 2100);

-- Stap 4: vervang unieke index (project_id, week_nr) → (project_id, jaar, week_nr)
DROP INDEX IF EXISTS project_weken_project_week_unique;

CREATE UNIQUE INDEX IF NOT EXISTS project_weken_project_jaar_week_unique
  ON public.project_weken (project_id, jaar, week_nr);

CREATE INDEX IF NOT EXISTS idx_project_weken_jaar_week
  ON public.project_weken (jaar, week_nr);