import { useCallback } from 'react';
import { VideoScene, VideoSettings, VideoModel, GeneratedVideo } from '../types';
import { logger } from './logger';

interface VideoGenerationManagerProps {
  videoModel: VideoModel;
  videoScenes: VideoScene[];
  videoSettings: VideoSettings;
  kieApiKey: string;
  freepikApiKey: string;
  onProgress: (status: string) => void;
  onComplete: (videos: GeneratedVideo[]) => void;
  onError: (error: string) => void;
}

export const useVideoGenerationManager = ({
  videoModel,
  videoScenes,
  videoSettings,
  kieApiKey,
  freepikApiKey,
  onProgress,
  onComplete,
  onError,
}: VideoGenerationManagerProps) => {

  const getProviderApiKey = useCallback((): string => {
    return videoSettings.klingProvider === 'kieai' ? kieApiKey : freepikApiKey;
  }, [videoSettings.klingProvider, kieApiKey, freepikApiKey]);

  const validateSettings = useCallback((): boolean => {
    if (videoScenes.length === 0) {
      onError('At least one scene required');
      return false;
    }

    const hasValidScene = videoScenes.some(scene => 
      scene.referenceImage?.base64 || 
      (scene.referenceVideo?.previewUrl && scene.prompt)
    );

    if (!hasValidScene) {
      onError('Each scene needs a reference image or video with prompt');
      return false;
    }

    if (!getProviderApiKey()) {
      onError(`${videoSettings.klingProvider} API key required`);
      return false;
    }

    return true;
  }, [videoScenes, videoSettings.klingProvider, getProviderApiKey, onError]);

  const buildScenePayload = useCallback((scene: VideoScene) => {
    const payload: any = {
      prompt: scene.prompt || '',
      settings: videoSettings,
    };

    if (scene.referenceImage?.base64) {
      payload.referenceImage = {
        base64: scene.referenceImage.base64,
        mimeType: scene.referenceImage.mimeType,
      };
    }

    if (scene.referenceVideo?.previewUrl) {
      payload.referenceVideo = {
        url: scene.referenceVideo.previewUrl,
        duration: scene.referenceVideo.duration,
      };
    }

    return payload;
  }, [videoSettings]);

  const getModelEndpoint = useCallback((): string => {
    switch (videoModel) {
      case 'kling-2.6':
        return 'kling-motion';
      case 'kling-2.6-pro':
        return 'kling-i2v';
      case 'kling-3':
        return 'kling-multishot';
      case 'kling-3-omni':
        return 'kling-omni';
      case 'veo-3.1':
        return 'veo-video';
      default:
        return 'kling-motion';
    }
  }, [videoModel]);

  return {
    getProviderApiKey,
    validateSettings,
    buildScenePayload,
    getModelEndpoint,
  };
};

export default useVideoGenerationManager;
