-- Add training_progress column for real-time progress tracking
ALTER TABLE public.lora_models
  ADD COLUMN IF NOT EXISTS training_progress INT DEFAULT 0;
