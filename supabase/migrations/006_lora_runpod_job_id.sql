-- Add runpod_job_id column to lora_models for tracking training jobs
ALTER TABLE public.lora_models
  ADD COLUMN IF NOT EXISTS runpod_job_id TEXT;

-- Index for looking up models by job ID (used during polling)
CREATE INDEX IF NOT EXISTS idx_lora_models_runpod_job
  ON public.lora_models(runpod_job_id)
  WHERE runpod_job_id IS NOT NULL;
