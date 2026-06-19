-- Mandagenregister basis
ALTER TABLE public.monteurs
  ADD COLUMN IF NOT EXISTS dienstverband text NOT NULL DEFAULT 'loondienst';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'monteurs_dienstverband_check'
      AND conrelid = 'public.monteurs'::regclass
  ) THEN
    ALTER TABLE public.monteurs
      ADD CONSTRAINT monteurs_dienstverband_check
      CHECK (dienstverband IN ('zzp', 'loondienst'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.monteur_register (
  monteur_id uuid PRIMARY KEY REFERENCES public.monteurs(id) ON DELETE CASCADE,
  geboortedatum date,
  nationaliteit text,
  id_type text CHECK (id_type IN ('paspoort', 'id-kaart', 'rijbewijs', 'verblijfsdocument')),
  id_nummer text,
  id_geldig_tot date,
  bsn text CHECK (bsn IS NULL OR bsn ~ '^[0-9]{9}$'),
  bedrijfsnaam text,
  kvk_nummer text CHECK (kvk_nummer IS NULL OR kvk_nummer ~ '^[0-9]{8}$'),
  btw_nummer text,
  uurtarief numeric(10,2),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monteur_register TO authenticated;
GRANT ALL ON public.monteur_register TO service_role;
ALTER TABLE public.monteur_register ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_monteur_register_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_monteur_register_updated_at ON public.monteur_register;
CREATE TRIGGER trg_touch_monteur_register_updated_at
  BEFORE UPDATE ON public.monteur_register
  FOR EACH ROW EXECUTE FUNCTION public.touch_monteur_register_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_zzp_geen_bsn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dienstverband text;
BEGIN
  SELECT dienstverband INTO v_dienstverband FROM public.monteurs WHERE id = NEW.monteur_id;
  IF v_dienstverband = 'zzp' AND NEW.bsn IS NOT NULL THEN
    RAISE EXCEPTION 'Een ZZP-monteur mag geen BSN bevatten.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zzp_geen_bsn ON public.monteur_register;
CREATE TRIGGER trg_zzp_geen_bsn
  BEFORE INSERT OR UPDATE ON public.monteur_register
  FOR EACH ROW EXECUTE FUNCTION public.enforce_zzp_geen_bsn();

CREATE OR REPLACE FUNCTION public.wis_bsn_bij_zzp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.dienstverband = 'zzp' AND OLD.dienstverband IS DISTINCT FROM 'zzp' THEN
    UPDATE public.monteur_register SET bsn = NULL WHERE monteur_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wis_bsn_bij_zzp ON public.monteurs;
CREATE TRIGGER trg_wis_bsn_bij_zzp
  AFTER UPDATE OF dienstverband ON public.monteurs
  FOR EACH ROW EXECUTE FUNCTION public.wis_bsn_bij_zzp();

CREATE TABLE IF NOT EXISTS public.mandagen_regels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projecten(id) ON DELETE CASCADE,
  monteur_id uuid NOT NULL REFERENCES public.monteurs(id) ON DELETE CASCADE,
  datum date NOT NULL,
  uren numeric(5,2) NOT NULL DEFAULT 8 CHECK (uren >= 0 AND uren <= 24),
  status text NOT NULL DEFAULT 'concept' CHECK (status IN ('concept', 'gecontroleerd', 'geexporteerd')),
  opmerking text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, monteur_id, datum)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mandagen_regels TO authenticated;
GRANT ALL ON public.mandagen_regels TO service_role;
ALTER TABLE public.mandagen_regels ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mandagen_regels_project_datum
  ON public.mandagen_regels(project_id, datum);
CREATE INDEX IF NOT EXISTS idx_mandagen_regels_monteur_datum
  ON public.mandagen_regels(monteur_id, datum);

CREATE OR REPLACE FUNCTION public.touch_mandagen_regels_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_mandagen_regels_updated_at ON public.mandagen_regels;
CREATE TRIGGER trg_touch_mandagen_regels_updated_at
  BEFORE INSERT OR UPDATE ON public.mandagen_regels
  FOR EACH ROW EXECUTE FUNCTION public.touch_mandagen_regels_updated_at();

CREATE TABLE IF NOT EXISTS public.mandagen_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projecten(id) ON DELETE CASCADE,
  periode_van date NOT NULL,
  periode_tot date NOT NULL,
  dienstverband text NOT NULL CHECK (dienstverband IN ('zzp', 'loondienst')),
  bestandsnaam text,
  rij_count integer NOT NULL DEFAULT 0,
  aangemaakt_door uuid,
  aangemaakt_op timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.mandagen_exports TO authenticated;
GRANT ALL ON public.mandagen_exports TO service_role;
ALTER TABLE public.mandagen_exports ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mandagen_exports_project_periode
  ON public.mandagen_exports(project_id, periode_van, periode_tot);

DROP POLICY IF EXISTS monteur_register_manager_select ON public.monteur_register;
CREATE POLICY monteur_register_manager_select ON public.monteur_register
  FOR SELECT USING (public.is_planner_manager(auth.uid()));

DROP POLICY IF EXISTS monteur_register_manager_write ON public.monteur_register;
CREATE POLICY monteur_register_manager_write ON public.monteur_register
  FOR ALL USING (public.is_planner_manager(auth.uid()))
  WITH CHECK (public.is_planner_manager(auth.uid()));

DROP POLICY IF EXISTS mandagen_regels_manager_select ON public.mandagen_regels;
CREATE POLICY mandagen_regels_manager_select ON public.mandagen_regels
  FOR SELECT USING (public.is_planner_manager(auth.uid()));

DROP POLICY IF EXISTS mandagen_regels_manager_write ON public.mandagen_regels;
CREATE POLICY mandagen_regels_manager_write ON public.mandagen_regels
  FOR ALL USING (public.is_planner_manager(auth.uid()))
  WITH CHECK (public.is_planner_manager(auth.uid()));

DROP POLICY IF EXISTS mandagen_exports_manager_select ON public.mandagen_exports;
CREATE POLICY mandagen_exports_manager_select ON public.mandagen_exports
  FOR SELECT USING (public.is_planner_manager(auth.uid()));

DROP POLICY IF EXISTS mandagen_exports_manager_insert ON public.mandagen_exports;
CREATE POLICY mandagen_exports_manager_insert ON public.mandagen_exports
  FOR INSERT WITH CHECK (public.is_planner_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.iso_planning_date(p_jaar integer, p_week integer, p_dag_index integer)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT to_date(p_jaar::text || to_char(p_week, 'FM00') || (p_dag_index + 1)::text, 'IYYYIWID')::date;
$$;

CREATE OR REPLACE FUNCTION public.mandagenregister_export(
  p_project_id uuid, p_van date, p_tot date
)
RETURNS TABLE (
  project_id uuid, project_label text, monteur_id uuid, naam text,
  dienstverband text, bedrijfsnaam text, kvk_nummer text, btw_nummer text,
  bsn text, geboortedatum date, nationaliteit text, id_type text,
  id_nummer text, id_geldig_tot date, datum date, uren numeric,
  status text, activiteiten text, activiteit_count integer,
  compleet boolean, ontbrekende_velden text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Geen toegang tot mandagenregister.' USING ERRCODE = '42501';
  END IF;
  IF p_project_id IS NULL OR p_van IS NULL OR p_tot IS NULL THEN
    RAISE EXCEPTION 'Project en periode zijn verplicht.' USING ERRCODE = '22023';
  END IF;
  IF p_tot < p_van THEN
    RAISE EXCEPTION 'Einddatum ligt voor begindatum.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH geplande_dagen AS (
    SELECT pw.project_id, cm.monteur_id,
      public.iso_planning_date(pw.jaar, pw.week_nr, pc.dag_index) AS datum,
      string_agg(DISTINCT pa.naam, ', ' ORDER BY pa.naam) AS activiteiten,
      count(DISTINCT pc.id)::integer AS activiteit_count
    FROM public.cel_monteurs cm
    JOIN public.planning_cellen pc ON pc.id = cm.cel_id
    JOIN public.project_weken pw ON pw.id = pc.week_id
    JOIN public.project_activiteiten pa ON pa.id = pc.activiteit_id
    WHERE pw.project_id = p_project_id AND pc.kleur_code IS NOT NULL
    GROUP BY pw.project_id, cm.monteur_id, public.iso_planning_date(pw.jaar, pw.week_nr, pc.dag_index)
  ), verrijkt AS (
    SELECT gd.project_id,
      concat_ws(' · ', p.case_nummer, p.station_naam) AS project_label,
      m.id AS monteur_id, m.naam, m.dienstverband,
      r.bedrijfsnaam, r.kvk_nummer, r.btw_nummer,
      CASE WHEN m.dienstverband = 'loondienst' THEN r.bsn ELSE NULL END AS bsn,
      r.geboortedatum, r.nationaliteit, r.id_type, r.id_nummer, r.id_geldig_tot,
      gd.datum,
      COALESCE(mr.uren, 8)::numeric AS uren,
      COALESCE(mr.status, 'concept') AS status,
      gd.activiteiten, gd.activiteit_count,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN r.geboortedatum IS NULL THEN 'geboortedatum' END,
        CASE WHEN NULLIF(trim(COALESCE(r.nationaliteit, '')), '') IS NULL THEN 'nationaliteit' END,
        CASE WHEN r.id_type IS NULL THEN 'id_type' END,
        CASE WHEN NULLIF(trim(COALESCE(r.id_nummer, '')), '') IS NULL THEN 'id_nummer' END,
        CASE WHEN r.id_geldig_tot IS NULL THEN 'id_geldig_tot' END,
        CASE WHEN r.id_geldig_tot IS NOT NULL AND r.id_geldig_tot < gd.datum THEN 'id_verlopen' END,
        CASE WHEN m.dienstverband = 'zzp' AND NULLIF(trim(COALESCE(r.bedrijfsnaam, '')), '') IS NULL THEN 'bedrijfsnaam' END,
        CASE WHEN m.dienstverband = 'zzp' AND NULLIF(trim(COALESCE(r.kvk_nummer, '')), '') IS NULL THEN 'kvk_nummer' END,
        CASE WHEN m.dienstverband = 'loondienst' AND NULLIF(trim(COALESCE(r.bsn, '')), '') IS NULL THEN 'bsn' END
      ], NULL) AS ontbrekende_velden
    FROM geplande_dagen gd
    JOIN public.projecten p ON p.id = gd.project_id
    JOIN public.monteurs m ON m.id = gd.monteur_id
    LEFT JOIN public.monteur_register r ON r.monteur_id = m.id
    LEFT JOIN public.mandagen_regels mr
      ON mr.project_id = gd.project_id AND mr.monteur_id = gd.monteur_id AND mr.datum = gd.datum
    WHERE gd.datum BETWEEN p_van AND p_tot
  )
  SELECT v.project_id, v.project_label, v.monteur_id, v.naam, v.dienstverband,
    v.bedrijfsnaam, v.kvk_nummer, v.btw_nummer, v.bsn, v.geboortedatum,
    v.nationaliteit, v.id_type, v.id_nummer, v.id_geldig_tot, v.datum,
    v.uren, v.status, v.activiteiten, v.activiteit_count,
    cardinality(v.ontbrekende_velden) = 0 AS compleet, v.ontbrekende_velden
  FROM verrijkt v
  ORDER BY v.dienstverband, v.naam, v.datum;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_mandagen_regel(
  p_project_id uuid, p_monteur_id uuid, p_datum date,
  p_uren numeric, p_status text DEFAULT 'gecontroleerd', p_opmerking text DEFAULT NULL
)
RETURNS public.mandagen_regels LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.mandagen_regels;
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Geen toegang tot mandagenregister.' USING ERRCODE = '42501';
  END IF;
  IF p_uren < 0 OR p_uren > 24 THEN
    RAISE EXCEPTION 'Uren moeten tussen 0 en 24 liggen.' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('concept', 'gecontroleerd', 'geexporteerd') THEN
    RAISE EXCEPTION 'Ongeldige status.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.mandagen_regels(project_id, monteur_id, datum, uren, status, opmerking, updated_by)
  VALUES (p_project_id, p_monteur_id, p_datum, p_uren, p_status, p_opmerking, auth.uid())
  ON CONFLICT (project_id, monteur_id, datum)
  DO UPDATE SET uren = EXCLUDED.uren, status = EXCLUDED.status,
    opmerking = EXCLUDED.opmerking, updated_by = auth.uid(), updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_mandagen_export(
  p_project_id uuid, p_van date, p_tot date,
  p_dienstverband text, p_bestandsnaam text DEFAULT NULL
)
RETURNS public.mandagen_exports LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer; v_row public.mandagen_exports;
BEGIN
  IF NOT public.is_planner_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Geen toegang tot mandagenregister.' USING ERRCODE = '42501';
  END IF;
  IF p_dienstverband NOT IN ('zzp', 'loondienst') THEN
    RAISE EXCEPTION 'Ongeldig dienstverband.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.mandagenregister_export(p_project_id, p_van, p_tot)
  WHERE dienstverband = p_dienstverband;

  INSERT INTO public.mandagen_exports(
    project_id, periode_van, periode_tot, dienstverband,
    bestandsnaam, rij_count, aangemaakt_door
  ) VALUES (
    p_project_id, p_van, p_tot, p_dienstverband,
    p_bestandsnaam, COALESCE(v_count, 0), auth.uid()
  ) RETURNING * INTO v_row;

  UPDATE public.mandagen_regels mr
  SET status = 'geexporteerd', updated_at = now(), updated_by = auth.uid()
  FROM public.monteurs m
  WHERE mr.monteur_id = m.id
    AND mr.project_id = p_project_id
    AND mr.datum BETWEEN p_van AND p_tot
    AND m.dienstverband = p_dienstverband;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.iso_planning_date(integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iso_planning_date(integer, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.mandagenregister_export(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mandagenregister_export(uuid, date, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_mandagen_regel(uuid, uuid, date, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_mandagen_regel(uuid, uuid, date, numeric, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.log_mandagen_export(uuid, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_mandagen_export(uuid, date, date, text, text) TO authenticated, service_role;