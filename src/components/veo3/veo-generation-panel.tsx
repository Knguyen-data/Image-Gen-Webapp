import React, { useState, useCallback } from "react";
import {
  ReferenceImage,
  VideoScene,
  VeoGenerationType,
  VeoModel,
  VeoAspectRatio,
} from "../../types";
import { VeoFrameZones, VeoMaterialZone } from "./veo-image-upload";
import VeoSettingsPanel, { VeoSettings } from "./veo-settings-panel";
import VeoResultsView from "./veo-results-view";
import { VeoTaskResult } from "./veo-results-view-types";
import BulkInputModal from '../bulk-input-modal';
import PromptEnhanceButton from '../prompt-enhance-button';

// ============ Validation ============

interface ValidationError {
  field: string;
  message: string;
}

const validateVeoForm = (
  mode: VeoGenerationType,
  prompt: string,
  settings: VeoSettings,
  startImage?: ReferenceImage,
  materials?: ReferenceImage[],
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Prompt validation (all modes)
  if (!prompt || prompt.trim().length < 10) {
    errors.push({
      field: "prompt",
      message: "Prompt must be at least 10 characters",
    });
  }
  if (prompt.length > 2000) {
    errors.push({
      field: "prompt",
      message: "Prompt exceeds maximum length (2000 chars)",
    });
  }

  // Mode-specific
  switch (mode) {
    case "FIRST_AND_LAST_FRAMES_2_VIDEO":
      if (!startImage) {
        errors.push({
          field: "startImage",
          message: "First frame image is required for Image-to-Video",
        });
      }
      break;

    case "REFERENCE_2_VIDEO":
      if (settings.model !== "veo3_fast") {
        errors.push({
          field: "model",
          message: "Reference mode requires the Fast model",
        });
      }
      if (settings.aspectRatio === "Auto") {
        errors.push({
          field: "aspectRatio",
          message:
            "Reference mode requires explicit aspect ratio (16:9 or 9:16)",
        });
      }
      if (!materials || materials.length < 1 || materials.length > 3) {
        errors.push({
          field: "materials",
          message: "Reference mode requires 1-3 material images",
        });
      }
      break;
  }

  // Seeds range check
  if (
    settings.seeds !== undefined &&
    (settings.seeds < 10000 || settings.seeds > 99999)
  ) {
    errors.push({
      field: "seeds",
      message: "Seed must be between 10000 and 99999",
    });
  }

  // Watermark length
  if (settings.watermark && settings.watermark.length > 50) {
    errors.push({
      field: "watermark",
      message: "Watermark text too long (max 50 chars)",
    });
  }

  return errors;
};

// ============ Component ============

interface VeoGenerationPanelProps {
  /** Upload handler from parent (base64 conversion) */
  handleImageUpload: (file: File) => Promise<ReferenceImage>;
  /** Callback to submit generation — parent handles API calls */
  onGenerate: (params: {
    mode: VeoGenerationType;
    prompt: string;
    settings: VeoSettings;
    startImage?: ReferenceImage;
    endImage?: ReferenceImage;
    materials?: ReferenceImage[];
  }) => void;
  /** Whether generation is in progress */
  isGenerating: boolean;
  /** Current task result (for progress/results display) */
  taskResult?: VeoTaskResult | null;
  /** Callbacks for result actions */
  onGet1080p?: (taskId: string) => void;
  onGet4k?: (taskId: string) => void;
  onExtend?: (taskId: string) => void;
  isUpgrading?: boolean;
  /** Optional scenes from the main queue to allow quick import */
  scenes?: VideoScene[];
  /** Callback to update scenes in parent state */
  setScenes?: (scenes: VideoScene[]) => void;
  /** Gemini API key for prompt enhancement */
  geminiApiKey?: string;
}

const VeoGenerationPanel: React.FC<VeoGenerationPanelProps> = ({
  handleImageUpload,
  onGenerate,
  isGenerating,
  taskResult,
  onGet1080p,
  onGet4k,
  onExtend,
  isUpgrading,
  scenes = [],
  setScenes,
  geminiApiKey = '',
}) => {
  // Generation mode
  const [mode, setMode] = useState<VeoGenerationType>("TEXT_2_VIDEO");

  // Prompt
  const [prompt, setPrompt] = useState("");

  // Settings
  const [settings, setSettings] = useState<VeoSettings>({
    model: "veo3_fast",
    aspectRatio: "16:9",
    enableTranslation: true,
  });

  // I2V frames
  const [startImage, setStartImage] = useState<ReferenceImage | undefined>();
  const [endImage, setEndImage] = useState<ReferenceImage | undefined>();

  // Reference materials
  const [materials, setMaterials] = useState<ReferenceImage[]>([]);

  // Validation errors
  const [errors, setErrors] = useState<ValidationError[]>([]);

  // When switching to REFERENCE_2_VIDEO, enforce constraints
  const handleModeChange = useCallback((newMode: VeoGenerationType) => {
    setMode(newMode);
    setErrors([]);

    if (newMode === "REFERENCE_2_VIDEO") {
      setSettings((prev) => ({
        ...prev,
        model: "veo3_fast",
        aspectRatio: prev.aspectRatio === "Auto" ? "16:9" : prev.aspectRatio,
      }));
    }
  }, []);

  // Handle settings changes with mode constraints
  const handleSettingsUpdate = useCallback(
    (newSettings: VeoSettings) => {
      if (mode === "REFERENCE_2_VIDEO") {
        // Enforce constraints
        newSettings.model = "veo3_fast";
        if (newSettings.aspectRatio === "Auto") {
          newSettings.aspectRatio = "16:9";
        }
      }
      setSettings(newSettings);
    },
    [mode],
  );

  // Submit handler
  const handleSubmit = () => {
    const validationErrors = validateVeoForm(
      mode,
      prompt,
      settings,
      startImage,
      materials,
    );
    setErrors(validationErrors);

    if (validationErrors.length > 0) return;

    onGenerate({
      mode,
      prompt,
      settings,
      startImage:
        mode === "FIRST_AND_LAST_FRAMES_2_VIDEO" ? startImage : undefined,
      endImage: mode === "FIRST_AND_LAST_FRAMES_2_VIDEO" ? endImage : undefined,
      materials: mode === "REFERENCE_2_VIDEO" ? materials : undefined,
    });
  };

  // Reset for new video
  const handleNewVideo = () => {
    setPrompt("");
    setErrors([]);
  };

  const handleBulkProcess = (lines: string[]) => {
    if (lines.length === 0) return;
    
    // Process prompts in bulk
    const queue = lines.filter(l => l.trim().length >= 10);
    if (queue.length === 0) {
      alert("Prompts must be at least 10 characters.");
      return;
    }

    // Auto-generate for each prompt in the bulk list
    const generateAll = async () => {
      for (const p of queue) {
        onGenerate({
          mode,
          prompt: p,
          settings,
          startImage: mode === "FIRST_AND_LAST_FRAMES_2_VIDEO" ? startImage : undefined,
          endImage: mode === "FIRST_AND_LAST_FRAMES_2_VIDEO" ? endImage : undefined,
          materials: mode === "REFERENCE_2_VIDEO" ? materials : undefined,
        });
        // Tiny delay to ensure timestamps/IDs are unique and UI remains fluid
        await new Promise(r => setTimeout(r, 200));
      }
    };

    generateAll();
    setIsBulkModalOpen(false);
  };

  const handleSceneToVeo = (scene: VideoScene) => {
    // Inject scene into the current Veo form
    setPrompt(scene.prompt);
    if (mode === "FIRST_AND_LAST_FRAMES_2_VIDEO" && scene.referenceImage) {
      setStartImage(scene.referenceImage);
    }
    // Note: materials mode requires manual 1-3 image selection 
    // but we'll put the first one in just in case it's helpful
    if (mode === "REFERENCE_2_VIDEO" && scene.referenceImage) {
      setMaterials([scene.referenceImage]);
    }
  };

  // Get error for a specific field
  const fieldError = (field: string) =>
    errors.find((e) => e.field === field)?.message;

  // Mode tab config
  const modeTabs: { value: VeoGenerationType; label: string; desc: string }[] =
    [
      { value: "TEXT_2_VIDEO", label: "Text", desc: "Text prompts only" },
      {
        value: "FIRST_AND_LAST_FRAMES_2_VIDEO",
        label: "Image",
        desc: "First + last frames",
      },
      {
        value: "REFERENCE_2_VIDEO",
        label: "Reference",
        desc: "Material-based (Fast only)",
      },
    ];

  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  return (
    <>
      <BulkInputModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onProcess={handleBulkProcess}
      />

      {/* 1. Mode Selection */}
      <div className="px-6 py-4 border-b border-gray-800">
        <div className="flex justify-between items-center mb-2">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Generation Mode
          </label>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsBulkModalOpen(true)}
              className="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded border border-gray-700 transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Bulk
            </button>
            <button 
              onClick={() => {
                const finalPrompt = prompt.trim();
                if (!finalPrompt) {
                  alert("Please enter a prompt first.");
                  return;
                }
                const newScene: VideoScene = { 
                  id: crypto.randomUUID(), 
                  prompt: finalPrompt, 
                  referenceImage: startImage,
                  usePrompt: true 
                };
                if (setScenes) {
                  setScenes([...scenes, newScene]);
                  setPrompt(""); // Clear after adding to queue
                }
              }}
              className="text-[10px] bg-dash-900/20 hover:bg-dash-900/40 text-dash-300 px-2 py-1 rounded border border-dash-700/50 transition-colors flex items-center gap-1 shadow-sm active:scale-95"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              Queue
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          {modeTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleModeChange(tab.value)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === tab.value
                  ? "bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50 shadow-[0_0_12px_rgba(34,197,94,0.15)]"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-1.5">
          {modeTabs.find((t) => t.value === mode)?.desc}
        </p>
      </div>

      {/* 2. Image Upload (mode-dependent) */}
      {mode === "FIRST_AND_LAST_FRAMES_2_VIDEO" && (
        <>
          <VeoFrameZones
            startImage={startImage}
            endImage={endImage}
            onSetStartImage={setStartImage}
            onSetEndImage={setEndImage}
            handleImageUpload={handleImageUpload}
          />
          {fieldError("startImage") && (
            <div className="px-6 -mt-2">
              <p className="text-[10px] text-red-400">
                {fieldError("startImage")}
              </p>
            </div>
          )}
        </>
      )}

      {mode === "REFERENCE_2_VIDEO" && (
        <>
          <VeoMaterialZone
            materials={materials}
            onSetMaterials={setMaterials}
            handleImageUpload={handleImageUpload}
            maxImages={3}
          />
          {fieldError("materials") && (
            <div className="px-6 -mt-2">
              <p className="text-[10px] text-red-400">
                {fieldError("materials")}
              </p>
            </div>
          )}
        </>
      )}

      {/* Quick Queue Import */}
      {scenes.length > 0 && (
        <div className="px-6 py-2 border-b border-gray-800">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block mb-2">
            Import from Scene Queue
          </label>
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
            {scenes.map((scene, idx) => (
              <button
                key={scene.id}
                onClick={() => handleSceneToVeo(scene)}
                className="flex-shrink-0 w-12 h-12 rounded-lg border border-gray-800 overflow-hidden hover:border-dash-500/50 transition-all relative group"
                title={scene.prompt}
              >
                {scene.referenceImage ? (
                  <img src={scene.referenceImage.previewUrl} className="w-full h-full object-cover opacity-60 group-hover:opacity-100" />
                ) : (
                  <div className="w-full h-full bg-gray-950 flex items-center justify-center text-[10px] text-gray-600">
                    {idx + 1}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. Prompt */}
      <div className="px-6 py-4 border-b border-gray-800 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Video Prompt
          </label>
          <PromptEnhanceButton
            prompt={prompt}
            onEnhance={setPrompt}
            target="veo-3.1"
            apiKey={geminiApiKey}
            referenceImage={startImage ? { base64: startImage.base64, mimeType: startImage.mimeType } : undefined}
            disabled={isGenerating}
          />
        </div>
        <textarea
          className={`w-full bg-gray-950 border rounded-lg p-3 text-sm text-gray-200 resize-y min-h-[80px] focus:ring-1 focus:ring-dash-400 focus:border-dash-500/50 transition-all placeholder:text-gray-600 ${
            fieldError("prompt") ? "border-red-500/50" : "border-gray-700"
          }`}
          rows={3}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            if (errors.length > 0) setErrors([]);
          }}
          placeholder={
            mode === "TEXT_2_VIDEO"
              ? "Describe the video scene in detail..."
              : mode === "FIRST_AND_LAST_FRAMES_2_VIDEO"
                ? "Describe how the image should animate..."
                : "Describe how the materials should be used in the video..."
          }
          maxLength={2000}
        />
        <div className="flex justify-between items-center">
          {fieldError("prompt") ? (
            <p className="text-[10px] text-red-400">{fieldError("prompt")}</p>
          ) : (
            <span className="text-[10px] text-gray-600">Min 10 chars</span>
          )}
          <span
            className={`text-[10px] font-mono ${prompt.length > 1800 ? "text-amber-400" : "text-gray-600"}`}
          >
            {prompt.length}/2000
          </span>
        </div>
      </div>

      {/* 4. Generate Button */}
      <div className="px-6 py-4 border-b border-gray-800">
        <button
          onClick={handleSubmit}
          disabled={isGenerating}
          className="w-full py-3 rounded-lg text-sm font-semibold transition-all bg-dash-700 hover:bg-dash-600 text-white ring-1 ring-dash-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? "Generating..." : "Generate Video"}
        </button>

        {/* Validation errors summary */}
        {errors.length > 0 && (
          <div className="mt-2 space-y-1">
            {errors.map((err, idx) => (
              <p key={idx} className="text-[10px] text-red-400">
                {err.message}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* 5. Results */}
      {taskResult && (
        <VeoResultsView
          taskId={taskResult.taskId}
          status={taskResult.status}
          result={taskResult.result}
          error={taskResult.error}
          progress={taskResult.progress}
          onGet1080p={onGet1080p}
          onGet4k={onGet4k}
          onExtend={onExtend}
        />
      )}

      {/* 6. Settings */}
      <VeoSettingsPanel
        settings={settings}
        onUpdate={handleSettingsUpdate}
        generationMode={mode}
      />

      {/* 7. Info Box */}
      <div className="px-6 py-4">
        <div className="p-3 bg-dash-900/20 border border-dash-500/30 rounded-lg text-xs text-dash-300">
          <p className="font-medium mb-1">Veo 3.1 — Google AI Video</p>
          <p className="text-dash-400/80">
            {mode === "TEXT_2_VIDEO"
              ? "Text-to-video generation with Quality or Fast models."
              : mode === "FIRST_AND_LAST_FRAMES_2_VIDEO"
                ? "Image-to-video with optional first and last frame control."
                : "Reference-to-Video uses 1-3 material images to guide generation (Fast model, 16:9/9:16 only)."}
          </p>
        </div>
      </div>
    </>
  );
};

export default VeoGenerationPanel;
