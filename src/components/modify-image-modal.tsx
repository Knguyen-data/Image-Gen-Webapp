import React, { useState, useRef, useEffect } from 'react';
import { GeneratedImage, ReferenceImage } from '../types';

interface ModifyImageModalProps {
  isOpen: boolean;
  sourceImage: GeneratedImage | null;
  onClose: () => void;
  onSubmit: (prompt: string, additionalRefs: ReferenceImage[], model: 'gemini' | 'seedream') => void;
  isLoading: boolean;
  hasGeminiKey: boolean;
  hasKieApiKey: boolean;
}

const ModifyImageModal: React.FC<ModifyImageModalProps> = ({
  isOpen,
  sourceImage,
  onClose,
  onSubmit,
  isLoading,
  hasGeminiKey,
  hasKieApiKey
}) => {
  const [modifyPrompt, setModifyPrompt] = useState('');
  const [additionalRefs, setAdditionalRefs] = useState<ReferenceImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'seedream'>('gemini');
  const [validationError, setValidationError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setModifyPrompt('');
      setAdditionalRefs([]);
      setValidationError('');
      // Default based on source image model if available
      if (sourceImage?.generatedBy?.startsWith('seedream')) {
        setSelectedModel('seedream');
      } else {
        setSelectedModel('gemini');
      }
    }
  }, [isOpen, sourceImage]);

  if (!isOpen || !sourceImage) return null;

  const handleImageUpload = (file: File): Promise<ReferenceImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Clean = result.split(',')[1];
        resolve({
          id: crypto.randomUUID(),
          base64: base64Clean,
          mimeType: file.type,
          previewUrl: result
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (files: FileList | null): Promise<ReferenceImage[]> => {
    if (!files) return [];
    const promises: Promise<ReferenceImage>[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) {
        promises.push(handleImageUpload(files[i]));
      }
    }
    return Promise.all(promises);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newImages = await processFiles(e.target.files);
    setAdditionalRefs(prev => [...prev, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const newImages = await processFiles(e.dataTransfer.files);
    setAdditionalRefs(prev => [...prev, ...newImages]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const removeRefImage = (id: string) => {
    setAdditionalRefs(prev => prev.filter(img => img.id !== id));
  };

  const handleSubmitClick = () => {
    if (!modifyPrompt.trim()) {
      setValidationError('Please enter a modification prompt');
      return;
    }
    onSubmit(modifyPrompt, additionalRefs, selectedModel);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-5xl flex flex-col shadow-2xl max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-800">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Modify Image
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {isLoading
                ? 'Processing... You can close this modal and continue working.'
                : 'Describe the changes you want to make to this image'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body - Two Column Layout */}
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">

            {/* Left: Original Image */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-300 block">Original Image</label>
              <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden aspect-square flex items-center justify-center">
                <img
                  src={`data:${sourceImage.mimeType};base64,${sourceImage.base64}`}
                  alt="Original"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className="text-xs text-gray-500 font-mono p-3 bg-gray-950 rounded border border-gray-800">
                <p className="text-gray-400 mb-1">Original Prompt:</p>
                <p className="text-gray-300">{sourceImage.promptUsed}</p>
              </div>
            </div>

            {/* Right: Modification Form */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-300 block mb-2">
                  Modification Prompt <span className="text-red-400">*</span>
                </label>
                <textarea
                  autoFocus
                  value={modifyPrompt}
                  onChange={(e) => {
                    setModifyPrompt(e.target.value);
                    setValidationError('');
                  }}
                  disabled={isLoading}
                  placeholder="E.g., Change the background to a sunset, add a rainbow, make it vintage style..."
                  className="w-full h-32 bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none disabled:opacity-50"
                />
                {validationError && (
                  <p className="text-xs text-red-400 mt-1">{validationError}</p>
                )}
              </div>

              {/* Model Selector */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-300 block">
                  Modification Model
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedModel('gemini')}
                    disabled={!hasGeminiKey || isLoading}
                    className={`p-3 rounded-lg border transition-all text-left ${
                      selectedModel === 'gemini'
                        ? 'border-dash-500 bg-dash-900/20'
                        : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                    } ${!hasGeminiKey ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-dash-400">🔷</span>
                      <span className={`font-medium ${selectedModel === 'gemini' ? 'text-white' : 'text-gray-300'}`}>
                        Gemini
                      </span>
                      {!hasGeminiKey && <span className="text-[10px] text-red-400">No key</span>}
                    </div>
                    <p className="text-[10px] text-gray-500">
                      Nano Banana Pro - Creative edits
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedModel('seedream')}
                    disabled={!hasKieApiKey || isLoading}
                    className={`p-3 rounded-lg border transition-all text-left ${
                      selectedModel === 'seedream'
                        ? 'border-red-500 bg-red-900/20'
                        : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                    } ${!hasKieApiKey ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-red-400">🌶️</span>
                      <span className={`font-medium ${selectedModel === 'seedream' ? 'text-white' : 'text-gray-300'}`}>
                        Seedream 4.5
                      </span>
                      {!hasKieApiKey && <span className="text-[10px] text-red-400">No key</span>}
                    </div>
                    <p className="text-[10px] text-gray-500">
                      High quality image edits
                    </p>
                  </button>
                </div>
              </div>

              {/* Additional Reference Images */}
              <div>
                <label className="text-sm font-semibold text-gray-300 block mb-2">
                  Additional Reference Images (Optional)
                </label>

                {/* Dropzone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onPaste={async (e) => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    const imageFiles: File[] = [];
                    for (let i = 0; i < items.length; i++) {
                      if (items[i].type.startsWith('image/')) {
                        const file = items[i].getAsFile();
                        if (file) imageFiles.push(file);
                      }
                    }
                    if (imageFiles.length > 0) {
                      const fileList = Object.assign(imageFiles, {
                        length: imageFiles.length,
                        item: (idx: number) => imageFiles[idx]
                      }) as unknown as FileList;
                      const newImages = await processFiles(fileList);
                      setAdditionalRefs(prev => [...prev, ...newImages]);
                    }
                  }}
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-gray-700 hover:border-gray-600 bg-gray-950'
                  } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <svg className="w-10 h-10 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-400">
                    {isDragging ? 'Drop images here' : 'Click, drag, or paste images (Ctrl+V)'}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">PNG, JPG, WEBP</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  disabled={isLoading}
                  className="hidden"
                />

                {/* Preview Additional Refs */}
                {additionalRefs.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {additionalRefs.map(img => (
                      <div key={img.id} className="relative group">
                        <img
                          src={img.previewUrl}
                          alt="Reference"
                          className="w-full h-20 object-cover rounded border border-gray-700"
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); removeRefImage(img.id); }}
                          disabled={isLoading}
                          className="absolute top-1 right-1 p-1 bg-red-900/80 hover:bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        >
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-800 bg-gray-900/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmitClick}
            disabled={isLoading || !modifyPrompt.trim()}
            className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-600 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            )}
            {isLoading ? 'Modifying...' : 'Modify Image'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModifyImageModal;
