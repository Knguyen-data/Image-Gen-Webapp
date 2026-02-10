-- Storage bucket: media (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  104857600, -- 100MB
  ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm','video/quicktime','application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 104857600;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload to their folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media'
);

-- Allow authenticated users to update their own uploads
CREATE POLICY "Users can update their uploads"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'media' AND (auth.uid())::text = (storage.foldername(name))[2])
WITH CHECK (bucket_id = 'media');

-- Allow public read access (bucket is public)
CREATE POLICY "Public read access for media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'media');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete their uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'media' AND (auth.uid())::text = (storage.foldername(name))[2]);
