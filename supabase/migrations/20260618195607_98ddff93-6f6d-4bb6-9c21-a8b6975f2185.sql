ALTER TABLE public.planning_cellen
  DROP CONSTRAINT IF EXISTS unique_cel,
  ADD CONSTRAINT unique_cel UNIQUE (activiteit_id, week_id, dag_index) DEFERRABLE INITIALLY DEFERRED;