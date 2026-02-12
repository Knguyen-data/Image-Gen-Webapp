-- LoRA Storage Buckets - Supabase Storage Configuration
-- Creates private storage buckets for training images and trained LoRA models

-- Bucket: lora-training-images (stores user-uploaded face photos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lora-training-images',
  'lora-training-images',
  false, -- Private bucket
  10485760, -- 10MB max file size
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);

-- Bucket: lora-models (stores trained .safetensors files)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lora-models',
  'lora-models',
  false, -- Private bucket
  524288000, -- 500MB max file size
  ARRAY['application/octet-stream'] -- .safetensors files
);

-- Storage RLS Policies for lora-training-images bucket

-- Users can upload training images to their own folder
CREATE POLICY "Users can upload own training images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'lora-training-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can read their own training images
CREATE POLICY "Users can read own training images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'lora-training-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own training images
CREATE POLICY "Users can delete own training images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'lora-training-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage RLS Policies for lora-models bucket

-- Users can upload trained models to their own folder
CREATE POLICY "Users can upload own LoRA models"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'lora-models' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can read their own LoRA models
CREATE POLICY "Users can read own LoRA models"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'lora-models' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own LoRA models
CREATE POLICY "Users can delete own LoRA models"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'lora-models' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
