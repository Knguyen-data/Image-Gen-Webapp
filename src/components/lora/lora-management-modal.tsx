import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Plus, Trash2, Upload, ChevronRight, ChevronLeft, Check,
  Sparkles, Loader2, AlertCircle, Clock, CheckCircle2, XCircle,
  ImagePlus, Settings2, Eye, ArrowLeft,
} from 'lucide-react';
import type { LoraModel, LoraTrainingConfig, LoraModelStatus } from '../../types';
import {
  listUserLoras,
  deleteLora,
  getTrainingImageUrl,
  DEFAULT_LORA_TRAINING_CONFIG,
  loraService,
} from '../../services/lora-model-service';
import { supabase } from '../../services/supabase';

// ─── Types ──────────────────────────────────────────────────────────

type WizardStep = 'basics' | 'images' | 'settings' | 'review';

interface PreviewImage {
  file: File;
  previewUrl: string;
}

interface LoraManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATUS_CONFIG: Record<LoraModelStatus, {
  label: string;
  color: string;
  bg: string;
  Icon: React.FC<{ className?: string }>;
}> = {
  uploading: {
    label: 'Uploading',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/30',
    Icon: Upload,
  },
  training: {
    label: 'Training',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/30',
    Icon: Loader2,
  },
  ready: {
    label: 'Ready',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    Icon: CheckCircle2,
  },
  failed: {
    label: 'Failed',
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/30',
    Icon: XCircle,
  },
};

// ─── Status Badge ───────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: LoraModelStatus }> = ({ status }) => {
  const { label, color, bg, Icon } = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border ${bg} ${color}`}>
      <Icon className={`w-3 h-3 ${status === 'training' ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
};

// ─── Wizard: Step 1 — Basics ────────────────────────────────────────

const StepBasics: React.FC<{
  name: string;
  triggerWord: string;
  onNameChange: (v: string) => void;
  onTriggerChange: (v: string) => void;
}> = ({ name, triggerWord, onNameChange, onTriggerChange }) => (
  <div className="space-y-5">
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1.5">Model Name</label>
      <input
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="e.g. My Face LoRA"
        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-colors"
        autoFocus
      />
      <p className="text-[11px] text-zinc-500 mt-1">A descriptive name for your trained model.</p>
    </div>
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1.5">Trigger Word</label>
      <input
        type="text"
        value={triggerWord}
        onChange={(e) => onTriggerChange(e.target.value)}
        placeholder="e.g. ohwx person"
        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none font-mono transition-colors"
      />
      <p className="text-[11px] text-zinc-500 mt-1">
        Include this word in your prompt to activate the LoRA. Use something unique that won't appear naturally.
      </p>
    </div>
  </div>
);

// ─── Wizard: Step 2 — Images ────────────────────────────────────────

const StepImages: React.FC<{
  images: PreviewImage[];
  onAdd: (files: FileList) => void;
  onRemove: (index: number) => void;
}> = ({ images, onAdd, onRemove }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        onAdd(e.dataTransfer.files);
      }
    },
    [onAdd]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-300">Upload <span className="text-violet-400 font-medium">10-20</span> training photos</p>
        <span className={`text-xs font-mono ${images.length >= 10 ? 'text-emerald-400' : 'text-zinc-500'}`}>
          {images.length} / 20
        </span>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-violet-500 bg-violet-500/5'
            : 'border-zinc-700 hover:border-zinc-600 bg-zinc-950/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <ImagePlus className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
        <p className="text-sm text-zinc-400">
          Drag & drop images here or <span className="text-violet-400">browse</span>
        </p>
        <p className="text-[11px] text-zinc-600 mt-1">JPG, PNG, WebP — clear, well-lit photos of the subject</p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => e.target.files && onAdd(e.target.files)}
        />
      </div>

      {/* Thumbnails */}
      {images.length > 0 && (
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
          {images.map((img, i) => (
            <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-zinc-800">
              <img
                src={img.previewUrl}
                alt={`Training ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
              <span className="absolute bottom-0.5 right-0.5 text-[9px] text-zinc-400 bg-black/50 px-1 rounded">
                {i + 1}
              </span>
            </div>
          ))}
        </div>
      )}

      {images.length > 0 && images.length < 10 && (
        <p className="text-xs text-amber-400/80 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          At least 10 images are recommended for good results.
        </p>
      )}
    </div>
  );
};

// ─── Wizard: Step 3 — Advanced Settings ─────────────────────────────

type TrainingNumericFields = 'steps' | 'learningRate' | 'networkDim' | 'networkAlpha' | 'resolution';

const StepSettings: React.FC<{
  config: LoraTrainingConfig;
  onChange: (c: LoraTrainingConfig) => void;
}> = ({ config, onChange }) => {
  const update = (key: TrainingNumericFields, value: number) =>
    onChange({ ...config, [key]: value });

  const resetToDefaults = () => {
    onChange({
      ...config,
      steps: 1000,
      learningRate: 0.0001,
      networkDim: 32,
      networkAlpha: 32,
      resolution: 1024,
    });
  };

  const fields: Array<{
    key: TrainingNumericFields;
    label: string;
    min: number;
    max: number;
    step: number;
    format?: (v: number) => string;
    hint: string;
  }> = [
    { key: 'steps', label: 'Training Steps', min: 500, max: 2000, step: 100, hint: 'More steps = better quality but longer training' },
    { key: 'learningRate', label: 'Learning Rate', min: 0.00001, max: 0.001, step: 0.00001, format: (v) => v.toExponential(1), hint: 'Lower = more stable, higher = faster convergence' },
    { key: 'networkDim', label: 'Network Dim', min: 8, max: 128, step: 8, hint: 'Higher = more capacity, larger file' },
    { key: 'networkAlpha', label: 'Network Alpha', min: 8, max: 128, step: 8, hint: 'Usually matches network dim' },
    { key: 'resolution', label: 'Resolution', min: 512, max: 768, step: 256, format: (v) => `${v}×${v}`, hint: '512 is standard, 768 for higher detail' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-300">Advanced Training Settings</p>
        <button
          onClick={resetToDefaults}
          className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
        >
          Reset to defaults
        </button>
      </div>

      <div className="space-y-4">
        {fields.map(({ key, label, min, max, step, format, hint }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-zinc-400">{label}</label>
              <span className="text-xs font-mono text-violet-400">
                {format ? format(config[key]) : config[key]}
              </span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={config[key]}
              onChange={(e) => update(key, parseFloat(e.target.value))}
              className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500
                [&::-webkit-slider-thumb]:hover:bg-violet-400 [&::-webkit-slider-thumb]:transition-colors
                [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-violet-500 [&::-moz-range-thumb]:border-0"
            />
            <p className="text-[10px] text-zinc-600 mt-0.5">{hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Wizard: Step 4 — Review ────────────────────────────────────────

const StepReview: React.FC<{
  name: string;
  triggerWord: string;
  imageCount: number;
  config: LoraTrainingConfig;
}> = ({ name, triggerWord, imageCount, config }) => (
  <div className="space-y-4">
    <p className="text-sm text-zinc-300">Review your LoRA training configuration</p>

    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
      <Row label="Name" value={name} />
      <Row label="Trigger Word" value={<code className="text-violet-400 font-mono text-xs">{triggerWord}</code>} />
      <Row label="Training Images" value={`${imageCount} photos`} />
      <div className="border-t border-zinc-800 pt-3 mt-3">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Training Config</p>
        <Row label="Steps" value={config.steps.toString()} />
        <Row label="Learning Rate" value={config.learningRate.toExponential(1)} />
        <Row label="Network Dim" value={config.networkDim.toString()} />
        <Row label="Network Alpha" value={config.networkAlpha.toString()} />
        <Row label="Resolution" value={`${config.resolution}×${config.resolution}`} />
      </div>
    </div>

    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
      <p className="text-xs text-amber-400 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Training will be submitted to RunPod. It typically takes 15-30 minutes depending on the number of images and steps.
          You'll see the status update in the LoRA list.
        </span>
      </p>
    </div>
  </div>
);

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-zinc-500">{label}</span>
    <span className="text-zinc-200">{value}</span>
  </div>
);

// ─── Main Modal ─────────────────────────────────────────────────────

const WIZARD_STEPS: WizardStep[] = ['basics', 'images', 'settings', 'review'];
const STEP_LABELS: Record<WizardStep, string> = {
  basics: 'Basics',
  images: 'Photos',
  settings: 'Settings',
  review: 'Review',
};

const LoraManagementModal: React.FC<LoraManagementModalProps> = ({ isOpen, onClose }) => {
  // ── List state ──
  const [loras, setLoras] = useState<LoraModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Wizard state ──
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('basics');
  const [wizardName, setWizardName] = useState('');
  const [wizardTrigger, setWizardTrigger] = useState('');
  const [wizardImages, setWizardImages] = useState<PreviewImage[]>([]);
  const [wizardConfig, setWizardConfig] = useState<LoraTrainingConfig>({
    ...DEFAULT_LORA_TRAINING_CONFIG,
    name: '',
    triggerWord: '',
    photos: [],
  } as LoraTrainingConfig);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Fetch user + loras ──
  const fetchLoras = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const data = await listUserLoras(user.id);
      setLoras(data);
    } catch (err) {
      console.error('Failed to fetch LoRAs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchLoras();
  }, [isOpen, fetchLoras]);

  // ── Clean up previews on unmount ──
  useEffect(() => {
    return () => {
      wizardImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
    };
  }, [wizardImages]);

  // ── Handlers ──
  const resetWizard = () => {
    wizardImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
    setShowWizard(false);
    setWizardStep('basics');
    setWizardName('');
    setWizardTrigger('');
    setWizardImages([]);
    setWizardConfig({
      name: '',
      triggerWord: '',
      photos: [],
      steps: 1000,
      learningRate: 0.0001,
      networkDim: 32,
      networkAlpha: 32,
      resolution: 1024,
    });
    setSubmitError(null);
  };

  const handleAddImages = (files: FileList) => {
    const newImages: PreviewImage[] = [];
    const remaining = 20 - wizardImages.length;
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        newImages.push({
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
    }
    setWizardImages(prev => [...prev, ...newImages]);
  };

  const handleRemoveImage = (index: number) => {
    setWizardImages(prev => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[index].previewUrl);
      copy.splice(index, 1);
      return copy;
    });
  };

  const handleDelete = async (loraId: string) => {
    if (!userId) return;
    setDeleting(true);
    try {
      await deleteLora(loraId);
      setLoras(prev => prev.filter(l => l.id !== loraId));
    } catch (err) {
      console.error('Failed to delete LoRA:', err);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleSubmitTraining = async () => {
    if (!userId) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      // Build complete config with all required fields
      const config: LoraTrainingConfig = {
        name: wizardName,
        triggerWord: wizardTrigger,
        photos: wizardImages.map(img => img.file),
        steps: wizardConfig.steps,
        learningRate: wizardConfig.learningRate,
        networkDim: wizardConfig.networkDim,
        networkAlpha: wizardConfig.networkAlpha,
        resolution: wizardConfig.resolution,
      };

      // Use loraService.startTraining with full config
      await loraService.startTraining(config, localStorage.getItem('raw_studio_runpod_api_key') || '');

      // Done — refresh list and close wizard
      resetWizard();
      await fetchLoras();
    } catch (err: any) {
      console.error('Training submission failed:', err);
      setSubmitError(err.message || 'Failed to submit training job');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step navigation validation ──
  const canAdvance = (step: WizardStep): boolean => {
    switch (step) {
      case 'basics':
        return wizardName.trim().length > 0 && wizardTrigger.trim().length > 0;
      case 'images':
        return wizardImages.length >= 1; // Minimum 1 for flexibility, recommend 10
      case 'settings':
        return true;
      case 'review':
        return true;
      default:
        return false;
    }
  };

  const stepIndex = WIZARD_STEPS.indexOf(wizardStep);
  const isLastStep = stepIndex === WIZARD_STEPS.length - 1;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">

        {/* ── Header ── */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            {showWizard && (
              <button
                onClick={resetWizard}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-400" />
                {showWizard ? 'Train New LoRA' : 'LoRA Models'}
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {showWizard
                  ? `Step ${stepIndex + 1} of ${WIZARD_STEPS.length}: ${STEP_LABELS[wizardStep]}`
                  : 'Manage your custom-trained LoRA models'
                }
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {showWizard ? (
            <>
              {/* Step progress bar */}
              <div className="flex items-center gap-1 mb-6">
                {WIZARD_STEPS.map((step, i) => (
                  <React.Fragment key={step}>
                    <button
                      onClick={() => i < stepIndex && setWizardStep(step)}
                      disabled={i > stepIndex}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        i === stepIndex
                          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                          : i < stepIndex
                            ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-300 cursor-pointer'
                            : 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                      }`}
                    >
                      {i < stepIndex ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <span className="w-4 text-center">{i + 1}</span>
                      )}
                      <span className="hidden sm:inline">{STEP_LABELS[step]}</span>
                    </button>
                    {i < WIZARD_STEPS.length - 1 && (
                      <div className={`flex-1 h-px ${i < stepIndex ? 'bg-violet-500/40' : 'bg-zinc-800'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Step content */}
              {wizardStep === 'basics' && (
                <StepBasics
                  name={wizardName}
                  triggerWord={wizardTrigger}
                  onNameChange={setWizardName}
                  onTriggerChange={setWizardTrigger}
                />
              )}
              {wizardStep === 'images' && (
                <StepImages
                  images={wizardImages}
                  onAdd={handleAddImages}
                  onRemove={handleRemoveImage}
                />
              )}
              {wizardStep === 'settings' && (
                <StepSettings config={wizardConfig} onChange={setWizardConfig} />
              )}
              {wizardStep === 'review' && (
                <StepReview
                  name={wizardName}
                  triggerWord={wizardTrigger}
                  imageCount={wizardImages.length}
                  config={wizardConfig}
                />
              )}

              {submitError && (
                <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-xs text-red-400 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    {submitError}
                  </p>
                </div>
              )}
            </>
          ) : (
            /* ── LoRA List ── */
            <>
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                </div>
              ) : loras.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                    <Sparkles className="w-7 h-7 text-zinc-600" />
                  </div>
                  <p className="text-zinc-400 text-sm mb-1">No LoRA models yet</p>
                  <p className="text-zinc-600 text-xs mb-4">
                    Train a custom model from your photos to personalize image generation.
                  </p>
                  <button
                    onClick={() => setShowWizard(true)}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow-lg shadow-violet-500/20 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Train Your First LoRA
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {loras.map((lora) => (
                    <div
                      key={lora.id}
                      className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-semibold text-zinc-100 truncate">{lora.name}</h4>
                            <StatusBadge status={lora.status} />
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                            <span className="font-mono text-violet-400/70">{lora.trigger_word}</span>
                            <span>•</span>
                            <span>{lora.training_images_count} images</span>
                            {lora.file_size_bytes && (
                              <>
                                <span>•</span>
                                <span>{formatBytes(lora.file_size_bytes)}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>{formatDate(lora.created_at)}</span>
                          </div>
                          {lora.status === 'failed' && lora.error_message && (
                            <p className="text-[11px] text-red-400/80 mt-1.5 flex items-start gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                              {lora.error_message}
                            </p>
                          )}
                          {lora.status === 'training' && (
                            <div className="mt-2">
                              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-500 ${(lora.training_progress ?? 0) === 0 ? 'animate-pulse' : ''}`}
                                  style={{ width: `${Math.max(lora.training_progress ?? 5, 5)}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Training in progress… {(lora.training_progress ?? 0) > 0 ? `${lora.training_progress}%` : ''}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Delete button */}
                        {deleteTarget === lora.id ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleDelete(lora.id)}
                              disabled={deleting}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                            >
                              {deleting ? 'Deleting…' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setDeleteTarget(null)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteTarget(lora.id)}
                            className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                            title="Delete LoRA"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/50 rounded-b-xl shrink-0">
          {showWizard ? (
            <div className="flex justify-between">
              <button
                onClick={() => {
                  if (stepIndex === 0) {
                    resetWizard();
                  } else {
                    setWizardStep(WIZARD_STEPS[stepIndex - 1]);
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                {stepIndex === 0 ? 'Cancel' : 'Back'}
              </button>
              {isLastStep ? (
                <button
                  onClick={handleSubmitTraining}
                  disabled={submitting}
                  className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-violet-600 hover:bg-violet-500 transition-all shadow-lg shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Start Training
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => setWizardStep(WIZARD_STEPS[stepIndex + 1])}
                  disabled={!canAdvance(wizardStep)}
                  className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-violet-600 hover:bg-violet-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex justify-between">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Close
              </button>
              {loras.length > 0 && (
                <button
                  onClick={() => setShowWizard(true)}
                  className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow-lg shadow-violet-500/20 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Train New LoRA
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default LoraManagementModal;
