
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS drive_folder_id text;

-- Storage bucket for empresa uploads (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('empresa-documentos', 'empresa-documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Allow anon/authenticated to read/write within this bucket (single-tenant MVP, matches existing project policies)
DROP POLICY IF EXISTS "empresa_docs_read" ON storage.objects;
DROP POLICY IF EXISTS "empresa_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "empresa_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "empresa_docs_delete" ON storage.objects;

CREATE POLICY "empresa_docs_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'empresa-documentos');
CREATE POLICY "empresa_docs_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'empresa-documentos');
CREATE POLICY "empresa_docs_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'empresa-documentos');
CREATE POLICY "empresa_docs_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'empresa-documentos');
