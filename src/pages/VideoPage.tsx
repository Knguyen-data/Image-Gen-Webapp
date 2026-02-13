import React, { useState, useRef } from 'react';
import { VideoScene, VideoSettings, GeneratedVideo, VideoModel } from '../types';
import { generateMotionVideo } from '../services/kling-motion-control-service';
import { createFreepikProI2VTask, pollFreepikProI2VTask, createKling3Task, pollKling3Task, createKling3OmniTask, createKling3OmniReferenceTask, pollKling3OmniTask, pollKling3OmniReferenceTask } from '../services/freepik-kling-service';
import { uploadUrlToR2 } from '../services/supabase-storage-service';
import { saveGeneratedVideoToDB, deleteGeneratedVideoFromDB } from '../services/indexeddb-video-storage';
import { logger } from '../services/logger';
import { useActivityQueue } from '../hooks/use-activity-queue';
import { useSeedreamCredits } from '../hooks/use-seedream-credits';

interface VideoPageProps {
  kieApiKey: string;
  freepikApiKey: string;
  credits: number | null;
  creditsLoading: boolean;
  isLowCredits: boolean;
  isCriticalCredits: boolean;
  refreshCredits: () => void;
  onOpenSettings: () => void;
}

export const VideoPage: React.FC<VideoPageProps> = ({
  kieApiKey,
  freepikApiKey,
  credits,
  creditsLoading,
  isLowCredits,
  isCriticalCredits,
  refreshCredits,
  onOpenSettings
}) => {
  const [videoModel, setVideoModel] = useState<VideoModel>('kling-2.6');
  const [videoScenes, setVideoScenes] = useState<VideoScene[]>([]);
  const [videoSettings, setVideoSettings] = useState<VideoSettings>({
    referenceVideoMode: 'global',
    orientation: 'image',
    resolution: '720p',
    klingProvider: 'freepik',
    klingProDuration: '5',
    klingProAspectRatio: 'widescreen_16_9',
    klingCfgScale: 0.5,
    klingProNegativePrompt: '',
    klingProGenerateAudio: false,
    kling3AspectRatio: '16:9',
    kling3Duration: 5,
    kling3CfgScale: 0.5,
    kling3NegativePrompt: '',
    kling3GenerateAudio: false,
    kling3InputMode: 'image-to-video',
  } as any);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  const { addJob, updateJob, addLog } = useActivityQueue();

  const generateKling3 = async (onDetail: (detail: string) => void): Promise<GeneratedVideo> => {
    onDetail('Creating task...');
    const taskResult = await createKling3Task(
      freepikApiKey,
      (videoSettings as any).kling3Prompt || '',
      (videoSettings as any).kling3ShotType === 'customize' ? (videoSettings as any).kling3MultiPrompt || [] : [],
      (videoSettings as any).kling3AspectRatio || '16:9',
      (videoSettings as any).kling3Duration || 5,
      (videoSettings as any).kling3NegativePrompt || '',
      (videoSettings as any).kling3GenerateAudio || false,
      onDetail
    );

    if (!taskResult.success) {
      throw new Error(taskResult.error || 'Failed to create Kling 3 task');
    }

    onDetail('Polling...');
    const pollResult = await pollKling3Task(freepikApiKey, taskResult.taskId, onDetail);

    if (!pollResult.success) {
      throw new Error(pollResult.error || 'Kling 3 generation failed');
    }

    const r2Url = await uploadUrlToR2(pollResult.url!);

    return {
      id: `video-${Date.now()}-kling3`,
      sceneId: 'kling3-direct',
      url: r2Url,
      duration: pollResult.duration || 5,
      prompt: (videoSettings as any).kling3Prompt || 'Kling 3 video',
      createdAt: Date.now(),
      status: 'success',
    };
  };

  const generateKling3Omni = async (onDetail: (detail: string) => void): Promise<GeneratedVideo> => {
    onDetail('Creating task...');
    const omniMode = (videoSettings as any).kling3OmniInputMode || 'image-to-video';
    
    let taskResult;
    if (omniMode === 'image-to-video') {
      taskResult = await createKling3OmniTask(
        freepikApiKey,
        (videoSettings as any).kling3OmniPrompt || '',
        (videoSettings as any).kling3OmniStartImage || '',
        (videoSettings as any).kling3OmniMultiPromptEnabled ? (videoSettings as any).kling3OmniMultiPrompt || [] : [],
        (videoSettings as any).kling3OmniAspectRatio || '16:9',
        (videoSettings as any).kling3OmniDuration || 5,
        (videoSettings as any).kling3OmniNegativePrompt || '',
        (videoSettings as any).kling3OmniGenerateAudio || false,
        onDetail
      );
    } else {
      taskResult = await createKling3OmniReferenceTask(
        freepikApiKey,
        (videoSettings as any).kling3OmniPrompt || '',
        (videoSettings as any).kling3OmniReferenceVideo || '',
        (videoSettings as any).kling3OmniMultiPromptEnabled ? (videoSettings as any).kling3OmniMultiPrompt || [] : [],
        (videoSettings as any).kling3OmniAspectRatio || '16:9',
        (videoSettings as any).kling3OmniDuration || 5,
        (videoSettings as any).kling3OmniNegativePrompt || '',
        (videoSettings as any).kling3OmniGenerateAudio || false,
        onDetail
      );
    }

    if (!taskResult.success) {
      throw new Error(taskResult.error || 'Failed to create Kling 3 Omni task');
    }

    onDetail('Polling...');
    let pollResult;
    if (omniMode === 'image-to-video') {
      pollResult = await pollKling3OmniTask(freepikApiKey, taskResult.taskId, onDetail);
    } else {
      pollResult = await pollKling3OmniReferenceTask(freepikApiKey, taskResult.taskId, onDetail);
    }

    if (!pollResult.success) {
      throw new Error(pollResult.error || 'Kling 3 Omni generation failed');
    }

    const r2Url = await uploadUrlToR2(pollResult.url!);

    return {
      id: `video-${Date.now()}-kling3-omni`,
      sceneId: 'kling3-omni',
      url: r2Url,
      duration: pollResult.duration || 5,
      prompt: (videoSettings as any).kling3OmniPrompt || 'Kling 3 Omni video',
      createdAt: Date.now(),
      status: 'success',
    };
  };

  const generateProI2V = async (
    scene: VideoScene,
    sceneIndex: number,
    totalScenes: number,
    onDetail: (detail: string) => void
  ): Promise<GeneratedVideo> => {
    onDetail('Creating task...');
    const result = await createFreepikProI2VTask(
      freepikApiKey,
      scene.prompt,
      scene.imageUrl,
      scene.duration || '5',
      scene.aspectRatio || 'widescreen_16_9',
      scene.negativePrompt || '',
      onDetail
    );

    if (!result.success) {
      throw new Error(result.error || 'Failed to create Pro I2V task');
    }

    onDetail('Polling...');
    const pollResult = await pollFreepikProI2VTask(freepikApiKey, result.taskId, onDetail);

    if (!pollResult.success) {
      throw new Error(pollResult.error || 'Pro I2V generation failed');
    }

    const r2Url = await uploadUrlToR2(pollResult.url!);

    return {
      id: `video-${Date.now()}-${sceneIndex}`,
      sceneId: scene.id,
      url: r2Url,
      duration: pollResult.duration || 5,
      prompt: scene.prompt,
      createdAt: Date.now(),
      status: 'success',
    };
  };

  const handleVideoGenerate = async () => {
    const needsFreepikOnly = ['kling-2.6-pro', 'kling-3', 'kling-3-omni'].includes(videoModel);
    
    if (needsFreepikOnly && !freepikApiKey) {
      alert('Freepik API key required for this model');
      return;
    }
    
    if (!needsFreepikOnly && !kieApiKey) {
      alert('Kie.ai API key required for this model');
      return;
    }

    if (videoModel === 'kling-3') {
      const shotType = (videoSettings as any).kling3ShotType || 'intelligent';
      if (shotType === 'intelligent' && !(videoSettings as any).kling3Prompt?.trim()) {
        alert('Please enter a video prompt');
        return;
      }
    } else if (videoModel === 'kling-3-omni') {
      const omniMode = (videoSettings as any).kling3OmniInputMode || 'image-to-video';
      if (omniMode === 'image-to-video' && !(videoSettings as any).kling3OmniStartImage) {
        alert('I2V mode requires a start frame image');
        return;
      }
      if (omniMode === 'video-to-video' && !(videoSettings as any).kling3OmniReferenceVideo) {
        alert('V2V mode requires a reference video');
        return;
      }
    } else if (videoScenes.length === 0) {
      alert('Add at least one scene');
      return;
    }

    setIsGenerating(true);
    const jobId = addJob({ type: 'video', status: 'active', prompt: 'Video generation' });
    addLog({ level: 'info', message: `Starting ${videoModel} generation` });

    try {
      if (videoModel === 'kling-3' || videoModel === 'kling-3-omni') {
        const placeholderId = `video-${Date.now()}-kling3`;
        const placeholder: GeneratedVideo = {
          id: placeholderId,
          sceneId: videoModel === 'kling-3' ? 'kling3-direct' : 'kling3-omni',
          url: '',
          duration: 0,
          prompt: 'Processing...',
          createdAt: Date.now(),
          status: 'generating',
        };
        setGeneratedVideos(prev => [placeholder, ...prev]);

        const video = videoModel === 'kling-3'
          ? await generateKling3((detail) => setLoadingStatus(detail))
          : await generateKling3Omni((detail) => setLoadingStatus(detail));

        setGeneratedVideos(prev => prev.map(v =>
          v.id === placeholderId ? { ...video, id: placeholderId } : v
        ));

        if (video.status === 'success') {
          setLoadingStatus('🎬 Done!');
          saveGeneratedVideoToDB({ ...video, id: placeholderId }).catch(e =>
            logger.warn('App', 'Failed to persist video', { error: e })
          );
          updateJob(jobId, { status: 'completed' });
          addLog({ level: 'info', message: 'Video generated successfully', jobId });
        }
      } else {
        const placeholderIds: string[] = [];
        for (let i = 0; i < videoScenes.length; i++) {
          const placeholderId = `video-${Date.now()}-${i}`;
          placeholderIds.push(placeholderId);
          setGeneratedVideos(prev => [{
            id: placeholderId,
            sceneId: videoScenes[i].id,
            url: '',
            duration: 0,
            prompt: videoScenes[i].prompt,
            createdAt: Date.now(),
            status: 'generating',
          }, ...prev]);
        }

        const scenePromises = videoScenes.map(async (scene, i) => {
          if (i > 0) await new Promise(r => setTimeout(r, i * 500));
          
          let video: GeneratedVideo;
          if (videoModel === 'kling-2.6-pro') {
            video = await generateProI2V(scene, i, videoScenes.length, (detail) =>
              setLoadingStatus(`Scene ${i + 1}: ${detail}`)
            );
          } else {
            video = await generateMotionVideo(
              kieApiKey,
              freepikApiKey,
              scene,
              videoSettings.globalReferenceVideo,
              videoSettings,
              (stage, detail) => setLoadingStatus(`Scene ${i + 1}: ${detail || stage}`)
            );
          }

          setGeneratedVideos(prev => prev.map(v =>
            v.id === placeholderIds[i] ? { ...video, id: placeholderIds[i] } : v
          ));
          return video;
        });

        const results = await Promise.all(scenePromises);
        const successCount = results.filter(v => v.status === 'success').length;
        setLoadingStatus(`🎬 Done! ${successCount}/${results.length} success`);
      }
    } catch (error: any) {
      logger.error('Video', 'Generation failed', { error });
      setLoadingStatus(`❌ Error: ${error.message}`);
      updateJob(jobId, { status: 'failed', error: error.message });
    } finally {
      setIsGenerating(false);
      refreshCredits();
      setTimeout(() => setLoadingStatus(''), 3000);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Video Generation</h1>
      <p className="text-gray-400">Video generation page - UI components to be implemented</p>
      
      <div className="mt-4">
        <label className="block mb-2">Video Model</label>
        <select
          value={videoModel}
          onChange={(e) => setVideoModel(e.target.value as VideoModel)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2"
        >
          <option value="kling-2.6">Kling 2.6</option>
          <option value="kling-2.6-pro">Kling 2.6 Pro</option>
          <option value="kling-3">Kling 3</option>
          <option value="kling-3-omni">Kling 3 Omni</option>
        </select>
      </div>

      <button
        onClick={handleVideoGenerate}
        disabled={isGenerating}
        className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50"
      >
        {isGenerating ? 'Generating...' : 'Generate Video'}
      </button>

      {loadingStatus && (
        <div className="mt-4 text-yellow-400">{loadingStatus}</div>
      )}

      <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {generatedVideos.map((video) => (
          <div key={video.id} className="bg-gray-800 rounded-lg overflow-hidden">
            {video.url ? (
              <video src={video.url} className="w-full aspect-video" controls />
            ) : (
              <div className="w-full aspect-video bg-gray-700 flex items-center justify-center">
                Generating...
              </div>
            )}
            <div className="p-2">
              <p className="text-sm truncate">{video.prompt}</p>
              {video.status === 'success' && (
                <span className="text-xs text-green-400">✓ {video.duration}s</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VideoPage;
