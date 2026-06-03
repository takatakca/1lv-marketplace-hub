-- RLS policies on storage.objects for vendor-assets (private bucket).
-- Anyone (anon + authenticated) can read; only the owning user can write
-- under their own user_id prefix (path = "<auth.uid()>/...").

CREATE POLICY "vendor-assets public read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'vendor-assets');

CREATE POLICY "vendor-assets owner insert"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'vendor-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "vendor-assets owner update"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'vendor-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "vendor-assets owner delete"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'vendor-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
