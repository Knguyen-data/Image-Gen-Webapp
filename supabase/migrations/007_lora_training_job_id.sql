-- Add training job tracking columns to lora_models
-- Run this migration to fix training status updates

ALTER TABLE public.lora_models ADD COLUMN IF NOT EXISTS training_job_id TEXT;
ALTER TABLE public.lora_models ADD COLUMN IF NOT EXISTS training_progress INT DEFAULT 0;

-- Update status CHECK to include any intermediate states if needed
-- (current: 'uploading', 'training', 'ready', 'failed' - already covers our use case)
