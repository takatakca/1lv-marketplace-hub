
-- RLS policies for vendor-assets storage bucket
CREATE POLICY "Vendor assets are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'vendor-assets');

CREATE POLICY "Vendors can upload their own assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'vendor-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Vendors can update their own assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'vendor-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Vendors can delete their own assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'vendor-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
