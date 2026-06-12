
ALTER TABLE public.monteurs
  ADD COLUMN urenapp_sync_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN urenapp_sync_exclusion_reason text NULL;

ALTER TABLE public.monteurs
  ADD CONSTRAINT monteurs_urenapp_sync_reason_chk
  CHECK (
    (urenapp_sync_enabled = true  AND urenapp_sync_exclusion_reason IS NULL)
    OR
    (urenapp_sync_enabled = false AND urenapp_sync_exclusion_reason IN ('sporadisch_ingehuurd','geen_urenapp_account','anders'))
  );
