-- 1. UNIQUE (project_id, jaar, week_nr) deferrable maken zodat we binnen één
--    transactie alle weken tegelijk kunnen verschuiven zonder tussentijdse
--    constraint-botsing. Het bestaande unique INDEX kan dat niet, dus we
--    vervangen het door een UNIQUE CONSTRAINT met dezelfde dekking.
DROP INDEX IF EXISTS public.project_weken_project_jaar_week_unique;

ALTER TABLE public.project_weken
  ADD CONSTRAINT project_weken_project_jaar_week_unique
  UNIQUE (project_id, jaar, week_nr)
  DEFERRABLE INITIALLY DEFERRED;

-- 2. Transactionele week-shift RPC.
--    - SECURITY DEFINER + interne is_planner_manager check
--    - ISO-week rekenen via to_date('YYYY-WW-D', 'IYYY-IW-ID') + N*7 dagen
--    - EXTRACT(ISOYEAR/WEEK) levert weer ISO-waarden op
--    - Beide DEFERRED unique constraints op project_weken worden pas op
--      COMMIT gecheckt, dus de UPDATE mag tijdelijk botsen.
CREATE OR REPLACE FUNCTION public.shift_project_weken(
  p_project_id uuid,
  p_delta integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Niet geautoriseerd om weken te verschuiven'
      USING ERRCODE = '42501';
  END IF;
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id ontbreekt' USING ERRCODE = '22023';
  END IF;
  IF p_delta IS NULL THEN
    RAISE EXCEPTION 'delta ontbreekt' USING ERRCODE = '22023';
  END IF;

  -- Niets te doen.
  IF p_delta = 0 THEN
    RETURN 0;
  END IF;

  -- Verschuif alle (jaar, week_nr) van het project met dezelfde delta.
  -- We berekenen de ISO-maandag van de huidige week, tellen er p_delta * 7
  -- dagen bij op en extracten daar weer ISO-jaar en ISO-week uit.
  WITH shifted AS (
    SELECT pw.id,
           ((to_date(pw.jaar::text || to_char(pw.week_nr, 'FM00') || '1',
                     'IYYYIWID')
             + (p_delta * 7))::date) AS nd
    FROM public.project_weken pw
    WHERE pw.project_id = p_project_id
  )
  UPDATE public.project_weken pw
  SET jaar = EXTRACT(ISOYEAR FROM s.nd)::int,
      week_nr = EXTRACT(WEEK FROM s.nd)::int
  FROM shifted s
  WHERE pw.id = s.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Normaliseer posities (chronologisch 0..n-1). Onder dezelfde transactie:
  -- de DEFERRED UNIQUE (project_id, positie) wordt pas op COMMIT gecheckt,
  -- samen met de jaar/week_nr unique. Als beide kloppen → COMMIT slaagt;
  -- anders → ROLLBACK en het project blijft volledig ongewijzigd.
  PERFORM public.normalize_project_weken(p_project_id);

  RETURN v_count;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Weken verschuiven mislukt: doelweken botsen met bestaande planning (delta % weken)', p_delta
      USING ERRCODE = '23505';
  WHEN check_violation THEN
    RAISE EXCEPTION 'Weken verschuiven mislukt: doel-jaar ligt buiten het toegestane bereik (2000–2100)'
      USING ERRCODE = '23514';
END;
$$;

GRANT EXECUTE ON FUNCTION public.shift_project_weken(uuid, integer) TO authenticated;