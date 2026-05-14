BEGIN;

-- Agreement signed-document upload uses this bucket in agreements.js.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('agreement-signed-documents', 'agreement-signed-documents', false, 104857600, NULL),
  ('agreement-documents', 'agreement-documents', false, 104857600, NULL),
  ('signed-documents', 'signed-documents', false, 104857600, NULL)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 104857600,
  allowed_mime_types = NULL;

DROP POLICY IF EXISTS "agreement_signed_documents_select" ON storage.objects;
DROP POLICY IF EXISTS "agreement_signed_documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "agreement_signed_documents_update" ON storage.objects;
DROP POLICY IF EXISTS "agreement_signed_documents_delete" ON storage.objects;

CREATE POLICY "agreement_signed_documents_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id IN ('agreement-signed-documents', 'agreement-documents', 'signed-documents'));

CREATE POLICY "agreement_signed_documents_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id IN ('agreement-signed-documents', 'agreement-documents', 'signed-documents'));

CREATE POLICY "agreement_signed_documents_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id IN ('agreement-signed-documents', 'agreement-documents', 'signed-documents'))
WITH CHECK (bucket_id IN ('agreement-signed-documents', 'agreement-documents', 'signed-documents'));

CREATE POLICY "agreement_signed_documents_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id IN ('agreement-signed-documents', 'agreement-documents', 'signed-documents'));

COMMIT;

-- Check agreement storage bucket availability
SELECT
  b.id AS bucket_id,
  b.public,
  b.file_size_limit,
  COUNT(o.id) AS file_count
FROM storage.buckets b
LEFT JOIN storage.objects o ON o.bucket_id = b.id
WHERE b.id IN ('agreement-signed-documents', 'agreement-documents', 'signed-documents')
GROUP BY b.id, b.public, b.file_size_limit
ORDER BY b.id;
