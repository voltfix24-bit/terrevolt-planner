CREATE OR REPLACE FUNCTION public.mandagenregister_export(p_project_id uuid, p_van date, p_tot date)
 RETURNS TABLE(project_id uuid, project_label text, monteur_id uuid, naam text, dienstverband text, bedrijfsnaam text, kvk_nummer text, btw_nummer text, bsn text, geboortedatum date, nationaliteit text, id_type text, id_nummer text, id_geldig_tot date, datum date, uren numeric, status text, activiteiten text, activiteit_count integer, compleet boolean, ontbrekende_velden text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- Dataminimalisatie:
      --  • ZZP: alleen KvK is verplicht voor export. Naam komt uit monteurs.
      --    BSN, geboortedatum, nationaliteit, ID-velden zijn optioneel.
      --  • Loondienst: BSN, geboortedatum, nationaliteit en geldig ID blijven verplicht.
      CASE
        WHEN m.dienstverband = 'zzp' THEN
          ARRAY_REMOVE(ARRAY[
            CASE WHEN NULLIF(trim(COALESCE(r.kvk_nummer, '')), '') IS NULL THEN 'kvk_nummer' END
          ], NULL)
        ELSE
          ARRAY_REMOVE(ARRAY[
            CASE WHEN r.geboortedatum IS NULL THEN 'geboortedatum' END,
            CASE WHEN NULLIF(trim(COALESCE(r.nationaliteit, '')), '') IS NULL THEN 'nationaliteit' END,
            CASE WHEN r.id_type IS NULL THEN 'id_type' END,
            CASE WHEN NULLIF(trim(COALESCE(r.id_nummer, '')), '') IS NULL THEN 'id_nummer' END,
            CASE WHEN r.id_geldig_tot IS NULL THEN 'id_geldig_tot' END,
            CASE WHEN r.id_geldig_tot IS NOT NULL AND r.id_geldig_tot < gd.datum THEN 'id_verlopen' END,
            CASE WHEN NULLIF(trim(COALESCE(r.bsn, '')), '') IS NULL THEN 'bsn' END
          ], NULL)
      END AS ontbrekende_velden
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
$function$;