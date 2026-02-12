-- LoRA Model Management System - Database Schema
-- Creates tables for storing LoRA models, training images, and tracking training status

-- Table: lora_models
-- Stores LoRA model metadata and training status
CREATE TABLE public.lora_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_word TEXT NOT NULL, -- Word to use in prompts (e.g., "ohwx person")
  status TEXT NOT NULL CHECK (status IN ('uploading', 'training', 'ready', 'failed')),
  storage_url TEXT, -- Supabase storage path or R2 URL
  file_size_bytes BIGINT, -- Size of trained .safetensors file
  training_config JSONB DEFAULT '{}', -- { steps, learningRate, networkDim, networkAlpha, resolution }
  training_images_count INT DEFAULT 0,
  error_message TEXT, -- Populated if status = 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ -- When training finished (ready or failed)
);

-- Table: lora_training_images
-- Stores references to training images in storage
CREATE TABLE public.lora_training_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lora_id UUID NOT NULL REFERENCES public.lora_models(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL, -- Path in lora-training-images bucket
  original_filename TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance optimization

-- Optimize user-scoped queries (show user's LoRAs sorted by date)
CREATE INDEX idx_lora_models_user ON public.lora_models(user_id, created_at DESC);

-- Optimize status filtering (show all training/ready models)
CREATE INDEX idx_lora_models_status ON public.lora_models(status, created_at DESC);

-- Optimize training image lookups
CREATE INDEX idx_lora_training_images_lora ON public.lora_training_images(lora_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.lora_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lora_training_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- lora_models: Users can CRUD only their own models
CREATE POLICY "Users can manage own LoRA models"
ON public.lora_models
FOR ALL
USING (auth.uid() = user_id);

-- lora_training_images: Users can access images for their LoRAs only
CREATE POLICY "Users can manage own training images"
ON public.lora_training_images
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.lora_models
    WHERE lora_models.id = lora_training_images.lora_id
    AND lora_models.user_id = auth.uid()
  )
);
