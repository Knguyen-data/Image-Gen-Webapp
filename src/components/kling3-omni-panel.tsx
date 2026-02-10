import React, { useRef, useMemo, useState } from 'react';
import { ReferenceImage, ReferenceVideo, VideoSettings, Kling3Element } from '../types';
import { useMentionAutocomplete, MentionOption } from '../hooks/use-mention-autocomplete';
import MentionDropdown from './mention-dropdown';

interface Kling3OmniPanelProps {
  videoSettings: VideoSettings | null;
  setVideoSettings: (settings: VideoSettings) => void;
  onVideoGenerate: () => void;
  isGenerating: boolean;
  handleImageUpload: (file: File) => Promise<ReferenceImage>;
}

const Kling3OmniPanel: React.FC<Kling3OmniPanelProps> = ({
  videoSettings,
  setVideoSettings,
  onVideoGenerate,
  isGenerating,
  handleImageUpload,
}) => {
  if (!videoSettings) return null;

  const inputMode: string = (videoSettings as any).kling3OmniInputMode || 'image-to-video';
  const isV2V = inputMode === 'video-to-video';
  const isI2V = inputMode === 'image-to-video';
  const isT2V = inputMode === 'text-to-video';

  // --- Aspect Ratio ---
  const selectedAspect = (videoSettings as any).kling3AspectRatio || '16:9';
  const aspectClass = selectedAspect === '9:16' ? 'aspect-[9/16]'
    : selectedAspect === '1:1' ? 'aspect-square'
    : 'aspect-video';

  // --- Frame Upload Helpers (I2V) ---
  const handleFrameUpload = async (files: FileList | null, which: 'kling3OmniStartImage' | 'kling3OmniEndImage') => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return;
    const img = await handleImageUpload(file);
    setVideoSettings({ ...videoSettings, [which]: img } as any);
  };

  // Handle drop from gallery (application/json) OR file system
  const handleFrameDrop = async (e: React.DragEvent, which: 'kling3OmniStartImage' | 'kling3OmniEndImage') => {
    e.preventDefault();
    e.currentTarget.classList.remove('border-dash-400', 'bg-gray-800/60');

    // Try gallery drag (application/json) first
    const jsonData = e.dataTransfer.getData('application/json');
    if (jsonData) {
      try {
        const refImage = JSON.parse(jsonData) as ReferenceImage;
        if (refImage.base64 && refImage.mimeType) {
          setVideoSettings({ ...videoSettings, [which]: refImage } as any);
          return;
        }
      } catch { /* not valid JSON, fall through to file handling */ }
    }

    // Fall back to file drop
    await handleFrameUpload(e.dataTransfer.files, which);
  };

  // --- Reference Images (T2V, I2V) ---
  const refImages: ReferenceImage[] = (videoSettings as any).kling3OmniImageUrls || [];
  const addReferenceImage = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return;
    const img = await handleImageUpload(file);
    setVideoSettings({ ...videoSettings, kling3OmniImageUrls: [...refImages, img] } as any);
  };
  const handleRefImageDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('border-dash-400', 'bg-gray-800/60');
    if (refImages.length >= 4) return;

    // Try gallery drag first
    const jsonData = e.dataTransfer.getData('application/json');
    if (jsonData) {
      try {
        const refImage = JSON.parse(jsonData) as ReferenceImage;
        if (refImage.base64 && refImage.mimeType) {
          setVideoSettings({ ...videoSettings, kling3OmniImageUrls: [...refImages, refImage] } as any);
          return;
        }
      } catch { /* fall through */ }
    }

    await addReferenceImage(e.dataTransfer.files);
  };
  const removeReferenceImage = (idx: number) => {
    setVideoSettings({ ...videoSettings, kling3OmniImageUrls: refImages.filter((_, i) => i !== idx) } as any);
  };

  // --- Elements (T2V, I2V) ---
  const [elementsExpanded, setElementsExpanded] = useState(false);

  // Element images stored as { referenceImages: ReferenceImage[], frontalImage?: ReferenceImage }
  type ElementData = { referenceImages: ReferenceImage[]; frontalImage?: ReferenceImage };
  const elements: ElementData[] = (videoSettings as any).kling3OmniElements || [];
  const setElements = (updated: ElementData[]) => {
    setVideoSettings({ ...videoSettings, kling3OmniElements: updated } as any);
  };
  const addElement = () => {
    if (elements.length >= 2) return;
    setElements([...elements, { referenceImages: [] }]);
    setElementsExpanded(true);
  };
  const removeElement = (idx: number) => {
    setElements(elements.filter((_, i) => i !== idx));
  };
  const addElementRefImage = async (files: FileList | null, elementIdx: number) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return;
    const img = await handleImageUpload(file);
    const updated = elements.map((el, i) =>
      i === elementIdx ? { ...el, referenceImages: [...el.referenceImages, img] } : el
    );
    setElements(updated);
  };
  const removeElementRefImage = (elementIdx: number, imgIdx: number) => {
    const updated = elements.map((el, i) =>
      i === elementIdx ? { ...el, referenceImages: el.referenceImages.filter((_, j) => j !== imgIdx) } : el
    );
    setElements(updated);
  };
  const setElementFrontalImage = async (files: FileList | null, elementIdx: number) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return;
    const img = await handleImageUpload(file);
    const updated = elements.map((el, i) =>
      i === elementIdx ? { ...el, frontalImage: img } : el
    );
    setElements(updated);
  };
  const clearElementFrontalImage = (elementIdx: number) => {
    const updated = elements.map((el, i) =>
      i === elementIdx ? { ...el, frontalImage: undefined } : el
    );
    setElements(updated);
  };

  // --- Video Upload (V2V) ---
  const refVideo = (videoSettings as any).kling3OmniReferenceVideo as ReferenceVideo | undefined;
  const handleVideoUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('video/')) return;
    const previewUrl = URL.createObjectURL(file);
    setVideoSettings({
      ...videoSettings,
      kling3OmniReferenceVideo: { id: crypto.randomUUID(), file, previewUrl }
    } as any);
  };
  const clearVideo = () => {
    if (refVideo?.previewUrl) URL.revokeObjectURL(refVideo.previewUrl);
    setVideoSettings({ ...videoSettings, kling3OmniReferenceVideo: undefined } as any);
  };

  // --- Multi-Prompt (T2V, I2V only) ---
  const multiPromptEnabled = !!(videoSettings as any).kling3OmniMultiPromptEnabled;
  const multiPrompt: string[] = (videoSettings as any).kling3OmniMultiPrompt || [''];
  const updatePrompt = (idx: number, val: string) => {
    const updated = multiPrompt.map((s, i) => i === idx ? val : s);
    setVideoSettings({ ...videoSettings, kling3OmniMultiPrompt: updated } as any);
  };
  const addPrompt = () => {
    if (multiPrompt.length >= 6) return;
    setVideoSettings({ ...videoSettings, kling3OmniMultiPrompt: [...multiPrompt, ''] } as any);
  };
  const removePrompt = (idx: number) => {
    if (multiPrompt.length <= 1) return;
    setVideoSettings({ ...videoSettings, kling3OmniMultiPrompt: multiPrompt.filter((_, i) => i !== idx) } as any);
  };

  // --- V2V Optional Start Frame ---
  const v2vStartImage = (videoSettings as any).kling3OmniStartImage as ReferenceImage | undefined;

  // --- Mention Autocomplete ---
  const mentionOptions = useMemo<MentionOption[]>(() => {
    if (isV2V) {
      return refVideo
        ? [{ label: '@Video1', description: 'Reference video', icon: '🎥' }]
        : [];
    }
    // I2V and T2V: reference images + elements
    const imageOpts = refImages.map((_, idx) => ({
      label: `@Image${idx + 1}`,
      description: `Reference image ${idx + 1}`,
      icon: '🖼️',
    }));
    const elementOpts = elements.map((_, idx) => ({
      label: `@Element${idx + 1}`,
      description: `Element ${idx + 1} (consistent identity)`,
      icon: '👤',
    }));
    return [...imageOpts, ...elementOpts];
  }, [isV2V, refVideo, refImages, elements]);

  // Single prompt textarea ref + hook
  const singlePromptRef = useRef<HTMLTextAreaElement>(null);
  const singlePromptValue = (videoSettings as any).kling3OmniPrompt || '';
  const setSinglePromptValue = (val: string) =>
    setVideoSettings({ ...videoSettings, kling3OmniPrompt: val } as any);
  const singleMention = useMentionAutocomplete(
    mentionOptions, singlePromptRef, singlePromptValue, setSinglePromptValue
  );

  // Multi-prompt textarea refs + hooks (max 6 shots)
  const multiRefs = [
    useRef<HTMLTextAreaElement>(null),
    useRef<HTMLTextAreaElement>(null),
    useRef<HTMLTextAreaElement>(null),
    useRef<HTMLTextAreaElement>(null),
    useRef<HTMLTextAreaElement>(null),
    useRef<HTMLTextAreaElement>(null),
  ];
  const multiMentions = multiRefs.map((ref, idx) =>
    useMentionAutocomplete(
      mentionOptions,
      ref,
      multiPrompt[idx] || '',
      (val: string) => updatePrompt(idx, val)
    )
  );

  return (
    <>
      {/* 1. Input Mode Toggle */}
      <div className="px-6 py-4 border-b border-gray-800">
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
          Input Mode
        </label>
        <div className="flex gap-2">
          {([
            { value: 'text-to-video' as const, label: '📝 Text' },
            { value: 'image-to-video' as const, label: '🖼️ Image' },
            { value: 'video-to-video' as const, label: '🎥 Video' },
          ]).map(opt => (
            <button
              key={opt.value}
              onClick={() => setVideoSettings({ ...videoSettings, kling3OmniInputMode: opt.value } as any)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                inputMode === opt.value
                  ? 'bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50 shadow-[0_0_12px_rgba(34,197,94,0.15)]'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-1.5">
          {isT2V ? 'Generate video from text prompt only.'
           : isI2V ? 'Animate an image with start/end frames and reference images.'
           : 'Transform or restyle an existing video with a reference clip.'}
        </p>
      </div>

      {/* 2. Input Area (mode-dependent) */}
      {/* I2V: Start/End Frame Drop Zones */}
      {isI2V && (
        <div className="px-6 py-4 border-b border-gray-800 space-y-2">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Frames (Optional)
          </label>
          <div className="flex gap-3">
            {/* Start Frame */}
            {(() => {
              const startImg = (videoSettings as any).kling3OmniStartImage as ReferenceImage | undefined;
              return (
                <div className="flex-1">
                  <span className="text-[10px] text-gray-500 mb-1 block">Start Frame</span>
                  {startImg ? (
                    <div className={`relative group rounded-lg overflow-hidden border border-dash-500/40 ${aspectClass} bg-gray-900`}>
                      <img src={startImg.previewUrl} alt="Start frame" className="w-full h-full object-contain bg-black" />
                      <button
                        onClick={() => setVideoSettings({ ...videoSettings, kling3OmniStartImage: undefined } as any)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        &times;
                      </button>
                    </div>
                  ) : (
                    <label
                      className={`flex flex-col items-center justify-center ${aspectClass} rounded-lg border-2 border-dashed border-gray-700 hover:border-dash-500/50 bg-gray-900/50 cursor-pointer transition-colors`}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-dash-400', 'bg-gray-800/60'); }}
                      onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-dash-400', 'bg-gray-800/60'); }}
                      onDrop={(e) => handleFrameDrop(e, 'kling3OmniStartImage')}
                    >
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFrameUpload(e.target.files, 'kling3OmniStartImage')} />
                      <span className="text-gray-600 text-lg mb-1">+</span>
                      <span className="text-[10px] text-gray-600">Drop or click</span>
                    </label>
                  )}
                </div>
              );
            })()}
            {/* End Frame */}
            {(() => {
              const endImg = (videoSettings as any).kling3OmniEndImage as ReferenceImage | undefined;
              return (
                <div className="flex-1">
                  <span className="text-[10px] text-gray-500 mb-1 block">End Frame</span>
                  {endImg ? (
                    <div className={`relative group rounded-lg overflow-hidden border border-dash-500/40 ${aspectClass} bg-gray-900`}>
                      <img src={endImg.previewUrl} alt="End frame" className="w-full h-full object-contain bg-black" />
                      <button
                        onClick={() => setVideoSettings({ ...videoSettings, kling3OmniEndImage: undefined } as any)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        &times;
                      </button>
                    </div>
                  ) : (
                    <label
                      className={`flex flex-col items-center justify-center ${aspectClass} rounded-lg border-2 border-dashed border-gray-700 hover:border-dash-500/50 bg-gray-900/50 cursor-pointer transition-colors`}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-dash-400', 'bg-gray-800/60'); }}
                      onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-dash-400', 'bg-gray-800/60'); }}
                      onDrop={(e) => handleFrameDrop(e, 'kling3OmniEndImage')}
                    >
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFrameUpload(e.target.files, 'kling3OmniEndImage')} />
                      <span className="text-gray-600 text-lg mb-1">+</span>
                      <span className="text-[10px] text-gray-600">Drop or click</span>
                    </label>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* V2V: Video Upload (required) + Optional Start Frame */}
      {isV2V && (
        <div className="px-6 py-4 border-b border-gray-800 space-y-3">
          {/* Video Upload */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
              Reference Video (Required)
            </label>
            {refVideo ? (
              <div className="relative group rounded-lg overflow-hidden border border-dash-500/40 bg-gray-900">
                <video src={refVideo.previewUrl} className={`w-full ${aspectClass} object-contain bg-black`} controls />
                <button
                  onClick={clearVideo}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  &times;
                </button>
              </div>
            ) : (
              <label
                className={`flex flex-col items-center justify-center ${aspectClass} rounded-lg border-2 border-dashed border-dash-500/50 hover:border-dash-400 bg-gray-900/50 cursor-pointer transition-colors`}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-dash-400', 'bg-gray-800/60'); }}
                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-dash-400', 'bg-gray-800/60'); }}
                onDrop={async (e) => { e.preventDefault(); e.currentTarget.classList.remove('border-dash-400', 'bg-gray-800/60'); handleVideoUpload(e.dataTransfer.files); }}
              >
                <input type="file" accept="video/*" className="hidden" onChange={(e) => handleVideoUpload(e.target.files)} />
                <span className="text-dash-400 text-3xl mb-2">🎥</span>
                <span className="text-sm text-gray-400">Drop video or click to upload</span>
                <span className="text-[10px] text-gray-600 mt-1">MP4, MOV, WebM</span>
              </label>
            )}
          </div>

          {/* Optional Start Frame for V2V */}
          <div>
            <span className="text-xs text-gray-500 mb-1 block">Start Frame (Optional)</span>
            {v2vStartImage ? (
              <div className={`relative group rounded-lg overflow-hidden border border-dash-500/40 ${aspectClass} bg-gray-900`}>
                <img src={v2vStartImage.previewUrl} alt="Start frame" className="w-full h-full object-contain bg-black" />
                <button
                  onClick={() => setVideoSettings({ ...videoSettings, kling3OmniStartImage: undefined } as any)}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  &times;
                </button>
              </div>
            ) : (
              <label
                className={`flex flex-col items-center justify-center ${aspectClass} rounded-lg border-2 border-dashed border-gray-700 hover:border-dash-500/50 bg-gray-900/50 cursor-pointer transition-colors`}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-dash-400', 'bg-gray-800/60'); }}
                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-dash-400', 'bg-gray-800/60'); }}
                onDrop={(e) => handleFrameDrop(e, 'kling3OmniStartImage')}
              >
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFrameUpload(e.target.files, 'kling3OmniStartImage')} />
                <span className="text-gray-600 text-lg mb-1">+</span>
                <span className="text-[10px] text-gray-600">Drop or click</span>
              </label>
            )}
          </div>
        </div>
      )}

      {/* T2V & I2V: Reference Images */}
      {(isT2V || isI2V) && (
        <div className="px-6 py-4 border-b border-gray-800 space-y-2">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Reference Images (Optional, max 4)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {refImages.map((img, idx) => (
              <div key={img.id} className="relative group rounded-lg overflow-hidden border border-dash-500/40 aspect-square bg-gray-900">
                <img src={img.previewUrl} alt={`Reference ${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeReferenceImage(idx)}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  &times;
                </button>
                <span className="absolute bottom-1 left-1 text-[9px] bg-black/70 text-dash-300 px-1.5 py-0.5 rounded">@Image{idx + 1}</span>
              </div>
            ))}
            {refImages.length < 4 && (
              <label
                className="flex flex-col items-center justify-center aspect-square rounded-lg border-2 border-dashed border-gray-700 hover:border-dash-500/50 bg-gray-900/50 cursor-pointer transition-colors"
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-dash-400', 'bg-gray-800/60'); }}
                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-dash-400', 'bg-gray-800/60'); }}
                onDrop={handleRefImageDrop}
              >
                <input type="file" accept="image/*" className="hidden" onChange={(e) => addReferenceImage(e.target.files)} />
                <span className="text-gray-600 text-lg">+</span>
                <span className="text-[10px] text-gray-600 mt-1">Add</span>
              </label>
            )}
          </div>
          {refImages.length > 0 && (
            <p className="text-[10px] text-gray-600">
              Use @Image1, @Image2, etc. in prompts to reference these images
            </p>
          )}
        </div>
      )}

      {/* T2V & I2V: Elements (@Element1, @Element2) */}
      {(isT2V || isI2V) && (
        <div className="px-6 py-4 border-b border-gray-800 space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setElementsExpanded(!elementsExpanded)}
              className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300 transition-colors"
            >
              <span className={`text-[10px] transition-transform ${elementsExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
              Elements ({elements.length}/2)
            </button>
            {elements.length < 2 && (
              <button
                onClick={addElement}
                className="text-[10px] font-medium text-dash-400 hover:text-dash-300 transition-colors"
              >+ Add Element</button>
            )}
          </div>
          {elementsExpanded && elements.length > 0 && (
            <div className="space-y-3">
              {elements.map((el, elIdx) => (
                <div key={elIdx} className="bg-gray-900/50 rounded-lg p-3 border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-dash-400 font-medium">@Element{elIdx + 1}</span>
                    <button
                      onClick={() => removeElement(elIdx)}
                      className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                    >&times; Remove</button>
                  </div>
                  {/* Reference Images for this element */}
                  <div>
                    <span className="text-[10px] text-gray-500 block mb-1">Reference Images</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {el.referenceImages.map((img, imgIdx) => (
                        <div key={img.id} className="relative group rounded overflow-hidden border border-dash-500/30 aspect-square bg-gray-900">
                          <img src={img.previewUrl} alt={`Ref ${imgIdx + 1}`} className="w-full h-full object-cover" />
                          <button
                            onClick={() => removeElementRefImage(elIdx, imgIdx)}
                            className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 rounded-full flex items-center justify-center text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 text-[10px] transition-opacity"
                          >&times;</button>
                        </div>
                      ))}
                      <label className="flex flex-col items-center justify-center aspect-square rounded border-2 border-dashed border-gray-700 hover:border-dash-500/50 bg-gray-900/50 cursor-pointer transition-colors">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => addElementRefImage(e.target.files, elIdx)} />
                        <span className="text-gray-600 text-sm">+</span>
                      </label>
                    </div>
                  </div>
                  {/* Frontal Image for this element */}
                  <div>
                    <span className="text-[10px] text-gray-500 block mb-1">Frontal Image (Optional)</span>
                    {el.frontalImage ? (
                      <div className="relative group rounded overflow-hidden border border-dash-500/30 w-16 h-16 bg-gray-900">
                        <img src={el.frontalImage.previewUrl} alt="Frontal" className="w-full h-full object-cover" />
                        <button
                          onClick={() => clearElementFrontalImage(elIdx)}
                          className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 rounded-full flex items-center justify-center text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 text-[10px] transition-opacity"
                        >&times;</button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-16 h-16 rounded border-2 border-dashed border-gray-700 hover:border-dash-500/50 bg-gray-900/50 cursor-pointer transition-colors">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => setElementFrontalImage(e.target.files, elIdx)} />
                        <span className="text-gray-600 text-sm">+</span>
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {elements.length > 0 && (
            <p className="text-[10px] text-gray-600">
              Use @Element1, @Element2 in prompts for consistent identity. Max 4 total (elements + reference images).
            </p>
          )}
        </div>
      )}

      {/* 3. Prompt Area */}
      <div className="px-6 py-4 border-b border-gray-800 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {multiPromptEnabled && !isV2V ? `Shots (${multiPrompt.length}/6)` : 'Video Prompt'}
          </label>
          {!isV2V && (
            <button
              onClick={() => setVideoSettings({ ...videoSettings, kling3OmniMultiPromptEnabled: !multiPromptEnabled } as any)}
              className={`text-[10px] font-medium transition-colors ${
                multiPromptEnabled ? 'text-dash-400 hover:text-dash-300' : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              {multiPromptEnabled ? 'Single Prompt' : 'Multi-Shot'}
            </button>
          )}
        </div>

        {multiPromptEnabled && !isV2V ? (
          <>
            <div className="space-y-2">
              {multiPrompt.map((p, idx) => (
                <div key={idx} className="flex items-start gap-2 bg-gray-900/50 rounded-lg p-2 border border-gray-800">
                  <span className="text-[10px] font-mono text-dash-400/70 mt-2 w-4 text-right shrink-0">{idx + 1}</span>
                  <div className="flex-1 relative">
                    <textarea
                      ref={multiRefs[idx]}
                      className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-gray-300 resize-y min-h-[36px] focus:ring-1 focus:ring-dash-400 focus:border-dash-500/50 transition-all placeholder:text-gray-600"
                      rows={2}
                      value={p}
                      onChange={(e) => {
                        updatePrompt(idx, e.target.value);
                        multiMentions[idx].onChange(e);
                      }}
                      onKeyDown={multiMentions[idx].onKeyDown}
                      placeholder={`Shot ${idx + 1} prompt...`}
                    />
                    <MentionDropdown
                      isOpen={multiMentions[idx].isOpen}
                      options={multiMentions[idx].options}
                      selectedIndex={multiMentions[idx].selectedIndex}
                      position={multiMentions[idx].position}
                      onSelect={multiMentions[idx].onSelect}
                    />
                  </div>
                  <button
                    onClick={() => removePrompt(idx)}
                    disabled={multiPrompt.length <= 1}
                    className="text-gray-600 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed mt-1.5 shrink-0 transition-colors"
                    title="Remove shot"
                  >&times;</button>
                </div>
              ))}
            </div>
            <button
              onClick={addPrompt}
              disabled={multiPrompt.length >= 6}
              className="text-[10px] font-medium text-dash-400 hover:text-dash-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
            >+ Add Shot</button>
            <p className="text-[10px] text-gray-600">
              Omni auto-distributes duration across shots. No per-shot timing needed.
            </p>
          </>
        ) : (
          <div className="relative">
            <textarea
              ref={singlePromptRef}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 resize-y min-h-[80px] focus:ring-1 focus:ring-dash-400 focus:border-dash-500/50 transition-all placeholder:text-gray-600"
              rows={3}
              value={singlePromptValue}
              onChange={(e) => {
                setSinglePromptValue(e.target.value);
                singleMention.onChange(e);
              }}
              onKeyDown={singleMention.onKeyDown}
              placeholder={isT2V ? 'Describe the video scene...'
                : isI2V ? 'Describe how the image should animate... Use @Image1 for reference images.'
                : 'Describe how to transform the video... Use @Video1 to reference the clip.'}
            />
            <MentionDropdown
              isOpen={singleMention.isOpen}
              options={singleMention.options}
              selectedIndex={singleMention.selectedIndex}
              position={singleMention.position}
              onSelect={singleMention.onSelect}
            />
          </div>
        )}
      </div>

      {/* 4. Generate Button */}
      <div className="px-6 py-4 border-b border-gray-800">
        <button
          onClick={onVideoGenerate}
          disabled={isGenerating}
          className="w-full py-3 rounded-lg text-sm font-semibold transition-all bg-dash-700 hover:bg-dash-600 text-white ring-1 ring-dash-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? 'Generating...' : '🎬 Generate Video'}
        </button>
      </div>

      {/* 5. Settings */}
      <div className="px-6 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Settings
          </label>
        </div>

        {/* Quality Tier */}
        <div className="space-y-2">
          <span className="text-xs text-gray-500">Quality Tier</span>
          <div className="flex gap-2">
            {([
              { value: 'standard', label: 'Standard' },
              { value: 'pro', label: 'Pro' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setVideoSettings({ ...videoSettings, kling3Tier: opt.value } as any)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  ((videoSettings as any).kling3Tier || 'pro') === opt.value
                    ? 'bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50 shadow-[0_0_12px_rgba(34,197,94,0.15)]'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-2">
          <span className="text-xs text-gray-500">Aspect Ratio</span>
          <div className="flex gap-2">
            {([
              { value: '16:9', label: '16:9' },
              { value: '9:16', label: '9:16' },
              { value: '1:1', label: '1:1' },
              { value: 'auto', label: 'Auto' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setVideoSettings({ ...videoSettings, kling3AspectRatio: opt.value } as any)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  ((videoSettings as any).kling3AspectRatio || '16:9') === opt.value
                    ? 'bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50 shadow-[0_0_12px_rgba(34,197,94,0.15)]'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-600">Auto: matches input image aspect ratio (I2V only)</p>
        </div>

        {/* Duration */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Total Duration</span>
            <span className="text-xs text-dash-400 font-mono">{((videoSettings as any).kling3Duration || 5)}s</span>
          </div>
          <input
            type="range"
            min="3"
            max="15"
            step="1"
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dash-400"
            value={(videoSettings as any).kling3Duration || 5}
            onChange={(e) => setVideoSettings({ ...videoSettings, kling3Duration: parseInt(e.target.value) } as any)}
          />
          <p className="text-[10px] text-gray-600">Distributed evenly across all shots (3–15s)</p>
        </div>

        {/* Generate Audio (T2V + I2V only) */}
        {!isV2V && (
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-500 block">Generate Audio</span>
              <span className="text-[10px] text-gray-600">AI-generated sound for the video</span>
            </div>
            <button
              onClick={() => setVideoSettings({ ...videoSettings, kling3GenerateAudio: !(videoSettings as any).kling3GenerateAudio } as any)}
              className={`w-10 h-5 rounded-full relative transition-colors ${
                (videoSettings as any).kling3GenerateAudio
                  ? 'bg-dash-700 ring-1 ring-dash-400'
                  : 'bg-gray-700'
              }`}
            >
              <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${
                (videoSettings as any).kling3GenerateAudio ? 'left-6' : 'left-1'
              }`} />
            </button>
          </div>
        )}

        {/* CFG Scale (V2V only) */}
        {isV2V && (
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">CFG Scale</span>
              <span className="text-xs text-dash-400 font-mono">{((videoSettings as any).kling3CfgScale ?? 0.5).toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dash-400"
              value={(videoSettings as any).kling3CfgScale ?? 0.5}
              onChange={(e) => setVideoSettings({ ...videoSettings, kling3CfgScale: parseFloat(e.target.value) } as any)}
            />
            <p className="text-[10px] text-gray-600">0 = creative, 0.5 = balanced, 2 = strict adherence</p>
          </div>
        )}

        {/* Negative Prompt (V2V only) */}
        {isV2V && (
          <div className="space-y-2">
            <span className="text-xs text-gray-500">Negative Prompt</span>
            <textarea
              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-300 font-mono resize-y min-h-[40px] focus:ring-1 focus:ring-dash-400 focus:border-dash-500/50 transition-all placeholder:text-gray-600"
              rows={2}
              value={(videoSettings as any).kling3NegativePrompt || 'blur, distort, and low quality'}
              onChange={(e) => setVideoSettings({ ...videoSettings, kling3NegativePrompt: e.target.value } as any)}
              placeholder="Things to avoid (e.g. blurry, shaky, watermark)..."
            />
          </div>
        )}

        {/* 6. Info Box */}
        <div className="p-3 bg-dash-900/20 border border-dash-500/30 rounded-lg text-xs text-dash-300">
          <p className="font-medium mb-1">Kling 3 Omni — Multimodal</p>
          <p className="text-dash-400/80">
            {isT2V ? 'Text-to-video with optional reference images and multi-shot control.'
             : isI2V ? 'Animate images with start/end frames, reference style, and multi-shot prompts.'
             : 'Video-to-video transformation with CFG scale and negative prompt control.'}
          </p>
        </div>
      </div>
    </>
  );
};

export default Kling3OmniPanel;
