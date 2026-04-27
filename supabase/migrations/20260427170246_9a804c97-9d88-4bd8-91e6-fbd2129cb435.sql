-- Tabel met metadata van werktekeningen per project
CREATE TABLE public.project_tekeningen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  soort TEXT NOT NULL CHECK (soort IN ('tijdelijk', 'definitief')),
  storage_path TEXT NOT NULL,
  bestandsnaam TEXT NOT NULL,
  bestandsgrootte BIGINT,
  mime_type TEXT,
  titel TEXT,
  tekening_nummer TEXT,
  revisie TEXT,
  notitie TEXT,
  positie INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_tekeningen_project ON public.project_tekeningen(project_id, soort, positie);

ALTER TABLE public.project_tekeningen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all_project_tekeningen"
ON public.project_tekeningen
FOR ALL
USING (true)
WITH CHECK (true);

-- Storage bucket voor de bestanden (privé, we serveren via signed URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-tekeningen', 'project-tekeningen', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tekeningen_select_all"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-tekeningen');

CREATE POLICY "tekeningen_insert_all"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'project-tekeningen');

CREATE POLICY "tekeningen_update_all"
ON storage.objects FOR UPDATE
USING (bucket_id = 'project-tekeningen');

CREATE POLICY "tekeningen_delete_all"
ON storage.objects FOR DELETE
USING (bucket_id = 'project-tekeningen');