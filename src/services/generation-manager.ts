import { useCallback } from 'react';
import { AppSettings, PromptItem, GeneratedImage, ReferenceImage, GenerationModel } from '../types';
import { logger } from './logger';

interface GenerationManagerProps {
  apiKey: string;
  kieApiKey: string;
  runpodApiKey: string;
  settings: AppSettings;
  prompts: PromptItem[];
  onGenerateStart: () => void;
  onGenerateProgress: (status: string) => void;
  onGenerateComplete: (images: GeneratedImage[]) => void;
  onGenerateError: (error: string) => void;
}

export const useGenerationManager = ({
  apiKey,
  kieApiKey,
  runpodApiKey,
  settings,
  prompts,
  onGenerateStart,
  onGenerateProgress,
  onGenerateComplete,
  onGenerateError,
}: GenerationManagerProps) => {
  
  const getApiKeyForModel = useCallback((model: GenerationModel): string => {
    switch (model) {
      case 'gemini':
        return apiKey;
      case 'seedream-edit':
      case 'seedream-txt2img':
        return kieApiKey;
      case 'comfyui-lustify':
        return runpodApiKey;
      default:
        return apiKey;
    }
  }, [apiKey, kieApiKey, runpodApiKey]);

  const validateApiKeys = useCallback((): boolean => {
    const spicyMode = settings.spicyMode?.enabled;
    const subMode = settings.spicyMode?.subMode;

    if (!spicyMode) {
      if (!apiKey) {
        onGenerateError('Gemini API key required');
        return false;
      }
    } else if (subMode === 'extreme') {
      if (!runpodApiKey) {
        onGenerateError('RunPod API key required for Extreme Mode');
        return false;
      }
    } else {
      if (!kieApiKey) {
        onGenerateError('Kie.ai API key required for Spicy Mode');
        return false;
      }
    }
    return true;
  }, [apiKey, kieApiKey, runpodApiKey, settings.spicyMode, onGenerateError]);

  const getActiveModel = useCallback((): GenerationModel => {
    if (!settings.spicyMode?.enabled) {
      return 'gemini';
    }
    return settings.spicyMode.subMode === 'extreme' 
      ? 'comfyui-lustify'
      : settings.spicyMode.subMode === 'edit'
      ? 'seedream-edit'
      : 'seedream-txt2img';
  }, [settings.spicyMode]);

  const buildGenerationRequest = useCallback((
    prompt: PromptItem,
    model: GenerationModel
  ) => {
    return {
      prompt: prompt.text,
      referenceImages: prompt.referenceImages,
      settings,
      apiKey: getApiKeyForModel(model),
    };
  }, [settings, getApiKeyForModel]);

  return {
    getApiKeyForModel,
    validateApiKeys,
    getActiveModel,
    buildGenerationRequest,
  };
};

// Helper to extract reference images from settings for retry
export const getReferenceImagesForRetry = (
  settingsSnapshot: AppSettings,
  mode: 'edit' | 'generate'
): ReferenceImage[] => {
  if (mode === 'edit' && settingsSnapshot.fixedBlockImages) {
    return settingsSnapshot.fixedBlockImages;
  }
  return [];
};

export default useGenerationManager;
