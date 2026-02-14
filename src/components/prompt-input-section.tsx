import React, { useState } from 'react';
import { PromptItem, ReferenceImage, AppSettings } from '../../types';
import { MAX_PROMPTS, MAX_REFERENCE_IMAGES } from '../../constants';

interface PromptInputSectionProps {
  prompts: PromptItem[];
  setPrompts: (prompts: PromptItem[]) => void;
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  isGenerating: boolean;
  onBulkOpen: () => void;
  onGenerate: (isBatch: boolean) => void;
  supportsReferenceImages: () => boolean;
  getModeName: () => string;
  processFiles: (files: FileList | null) => Promise<{ images: ReferenceImage[], nonImageCount: number }>;
}

export const PromptInputSection: React.FC<PromptInputSectionProps> = ({
  prompts,
  setPrompts,
  settings,
  setSettings,
  isGenerating,
  onBulkOpen,
  onGenerate,
  supportsReferenceImages,
  getModeName,
  processFiles,
}) => {
  const [activePromptIndex, setActivePromptIndex] = useState(0);

  const activePrompt = prompts[activePromptIndex] || prompts[0];
  const fixedBlockEnabled = settings.fixedBlockEnabled || false;
  const fixedBlockText = settings.fixedBlockText || '';
  const fixedBlockPosition = settings.fixedBlockPosition || 'top';
  const fixedBlockImages = settings.fixedBlockImages || [];

  const updatePromptText = (text: string) => {
    const newPrompts = [...prompts];
    newPrompts[activePromptIndex].text = text;
    setPrompts(newPrompts);
  };

  const addPrompt = () => {
    if (prompts.length >= MAX_PROMPTS) {
      alert(`Maximum ${MAX_PROMPTS} prompts allowed.`);
      return;
    }
    setPrompts([...prompts, { id: crypto.randomUUID(), text: '', referenceImages: [] }]);
    setActivePromptIndex(prompts.length);
  };

  const removePrompt = (index: number) => {
    if (prompts.length <= 1) {
      updatePromptText('');
      const newPrompts = [...prompts];
      newPrompts[0].referenceImages = [];
      setPrompts(newPrompts);
      return;
    }
    const newPrompts = prompts.filter((_, i) => i !== index);
    setPrompts(newPrompts);
  };

  const addLocalImages = async (promptIndex: number, files: FileList | null) => {
    if (!files) return;

    if (!supportsReferenceImages()) {
      alert(`${getModeName()} does not support reference images.`);
      return;
    }

    const { images, nonImageCount } = await processFiles(files);
    if (nonImageCount > 0) {
      alert(`${nonImageCount} non-image file(s) were ignored.`);
    }

    const newPrompts = [...prompts];
    const currentRefCount = newPrompts[promptIndex].referenceImages.length;
    const totalAfterAdd = currentRefCount + images.length;

    if (totalAfterAdd > MAX_REFERENCE_IMAGES) {
      const allowedCount = MAX_REFERENCE_IMAGES - currentRefCount;
      if (allowedCount <= 0) {
        alert(`Maximum ${MAX_REFERENCE_IMAGES} reference images per prompt reached.`);
        return;
      }
      const truncatedImages = images.slice(0, allowedCount);
      newPrompts[promptIndex].referenceImages = [...newPrompts[promptIndex].referenceImages, ...truncatedImages];
      alert(`Only ${allowedCount} of ${images.length} image(s) added.`);
    } else {
      newPrompts[promptIndex].referenceImages = [...newPrompts[promptIndex].referenceImages, ...images];
    }
    setPrompts(newPrompts);
  };

  const removeLocalImage = (promptIndex: number, imgId: string) => {
    const newPrompts = [...prompts];
    newPrompts[promptIndex].referenceImages = newPrompts[promptIndex].referenceImages.filter(img => img.id !== imgId);
    setPrompts(newPrompts);
  };

  const getCurrentPreview = () => {
    if (!activePrompt) return '';
    let p = activePrompt.text.trim();
    
    if (fixedBlockEnabled && fixedBlockText.trim()) {
      if (fixedBlockPosition === 'top') {
        p = `FIXED BLOCK:\n${fixedBlockText.trim()}\n\n${p}`;
      } else {
        p += `\n\nFIXED BLOCK:\n${fixedBlockText.trim()}`;
      }
    }

    const fixedImgCount = fixedBlockEnabled ? fixedBlockImages.length : 0;
    const localCount = activePrompt.referenceImages.length;
    
    if (localCount + fixedImgCount > 0) {
      p += `\n\n[REFS: ${localCount} Local${fixedImgCount > 0 ? `, ${fixedImgCount} Fixed` : ''}]`;
    }
    return p;
  };

  const validPromptsCount = prompts.filter(p => p.text && p.text.trim().length > 0).length;
  const totalImages = validPromptsCount * (settings.outputCount || 1);

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Header with Stats */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Prompts
        </span>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{validPromptsCount} valid</span>
          <span>•</span>
          <span>~{totalImages} images</span>
        </div>
      </div>

      {/* Prompt Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 custom-scrollbar">
        {prompts.map((prompt, index) => (
          <button
            key={prompt.id}
            onClick={() => setActivePromptIndex(index)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activePromptIndex === index
                ? 'bg-dash-600/25 text-dash-200 ring-1 ring-dash-400/50'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            #{index + 1}
          </button>
        ))}
        <button
          onClick={addPrompt}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
        >
          + Add
        </button>
      </div>

      {/* Text Area */}
      <textarea
        className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-dash-500/50 focus:ring-1 focus:ring-dash-500/30"
        rows={4}
        placeholder="Enter your prompt here..."
        value={activePrompt?.text || ''}
        onChange={(e) => updatePromptText(e.target.value)}
      />

      {/* Reference Images for Current Prompt */}
      {activePrompt && activePrompt.referenceImages.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs text-gray-500">Reference Images ({activePrompt.referenceImages.length})</span>
          <div className="flex flex-wrap gap-2">
            {activePrompt.referenceImages.map((img) => (
              <div key={img.id} className="relative group w-16 h-16">
                <img
                  src={img.previewUrl || `data:${img.mimeType};base64,${img.base64}`}
                  alt="Reference"
                  className="w-full h-full object-cover rounded-lg"
                />
                <button
                  onClick={() => removeLocalImage(activePromptIndex, img.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image Upload */}
      <div className="flex items-center gap-2">
        <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs text-gray-400 cursor-pointer transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Add Image
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => addLocalImages(activePromptIndex, e.target.files)}
          />
        </label>

        <button
          onClick={onBulkOpen}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs text-gray-400 cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Bulk Input
        </button>
      </div>

      {/* Fixed Block Toggle */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-800">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={fixedBlockEnabled}
            onChange={(e) => setSettings({ ...settings, fixedBlockEnabled: e.target.checked })}
            className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-dash-400 focus:ring-dash-400/50"
          />
          <span className="text-xs text-gray-400">Fixed Block</span>
        </label>
        
        {prompts.length > 1 && (
          <button
            onClick={() => {
              if (confirm('Delete all prompts?')) {
                setPrompts([{ id: crypto.randomUUID(), text: '', referenceImages: [] }]);
                setActivePromptIndex(0);
              }
            }}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Clear All
          </button>
        )}
      </div>
    </div>
  );
};

export default PromptInputSection;
