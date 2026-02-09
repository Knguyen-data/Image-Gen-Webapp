import React from 'react';
import { ReferenceImage } from '../../types';

interface VeoImageUploadProps {
  /** Upload handler that returns a ReferenceImage with base64 + previewUrl */
  handleImageUpload: (file: File) => Promise<ReferenceImage>;
}

/** Shared props for frame drop zones (I2V mode) */
export interface VeoFrameZoneProps extends VeoImageUploadProps {
  startImage?: ReferenceImage;
  endImage?: ReferenceImage;
  onSetStartImage: (img: ReferenceImage | undefined) => void;
  onSetEndImage: (img: ReferenceImage | undefined) => void;
}

/** Shared props for material images (Reference-to-Video mode) */
export interface VeoMaterialZoneProps extends VeoImageUploadProps {
  materials: ReferenceImage[];
  onSetMaterials: (imgs: ReferenceImage[]) => void;
  maxImages?: number;
}

// ============ Frame Drop Zones (Image-to-Video) ============

export const VeoFrameZones: React.FC<VeoFrameZoneProps> = ({
  startImage, endImage, onSetStartImage, onSetEndImage, handleImageUpload,
}) => {
  const handleUpload = async (files: FileList | null, setter: (img: ReferenceImage | undefined) => void) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return;
    const img = await handleImageUpload(file);
    setter(img);
  };

  const handleDrop = async (e: React.DragEvent, setter: (img: ReferenceImage | undefined) => void) => {
    e.preventDefault();
    e.currentTarget.classList.remove('border-violet-400', 'bg-gray-800/60');

    // Try gallery drag (application/json) first
    const jsonData = e.dataTransfer.getData('application/json');
    if (jsonData) {
      try {
        const refImage = JSON.parse(jsonData) as ReferenceImage;
        if (refImage.base64 && refImage.mimeType) {
          setter(refImage);
          return;
        }
      } catch { /* fall through to file handling */ }
    }

    await handleUpload(e.dataTransfer.files, setter);
  };

  const dragHandlers = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.currentTarget.classList.add('border-violet-400', 'bg-gray-800/60'); },
    onDragLeave: (e: React.DragEvent) => { e.preventDefault(); e.currentTarget.classList.remove('border-violet-400', 'bg-gray-800/60'); },
  };

  return (
    <div className="px-6 py-4 border-b border-gray-800 space-y-2">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Frames (Optional)
      </label>
      <div className="flex gap-3">
        {/* Start Frame */}
        <div className="flex-1">
          <span className="text-[10px] text-gray-500 mb-1 block">First Frame</span>
          {startImage ? (
            <div className="relative group rounded-lg overflow-hidden border border-violet-500/40 aspect-video bg-gray-900">
              <img src={startImage.previewUrl} alt="First frame" className="w-full h-full object-contain bg-black" />
              <button
                onClick={() => onSetStartImage(undefined)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >&times;</button>
            </div>
          ) : (
            <label
              className="flex flex-col items-center justify-center aspect-video rounded-lg border-2 border-dashed border-gray-700 hover:border-violet-500/50 bg-gray-900/50 cursor-pointer transition-colors"
              {...dragHandlers}
              onDrop={(e) => handleDrop(e, onSetStartImage)}
            >
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files, onSetStartImage)} />
              <span className="text-gray-600 text-lg mb-1">+</span>
              <span className="text-[10px] text-gray-600">Drop or click</span>
            </label>
          )}
        </div>
        {/* End Frame */}
        <div className="flex-1">
          <span className="text-[10px] text-gray-500 mb-1 block">Last Frame (Optional)</span>
          {endImage ? (
            <div className="relative group rounded-lg overflow-hidden border border-violet-500/40 aspect-video bg-gray-900">
              <img src={endImage.previewUrl} alt="Last frame" className="w-full h-full object-contain bg-black" />
              <button
                onClick={() => onSetEndImage(undefined)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >&times;</button>
            </div>
          ) : (
            <label
              className="flex flex-col items-center justify-center aspect-video rounded-lg border-2 border-dashed border-gray-700 hover:border-violet-500/50 bg-gray-900/50 cursor-pointer transition-colors"
              {...dragHandlers}
              onDrop={(e) => handleDrop(e, onSetEndImage)}
            >
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files, onSetEndImage)} />
              <span className="text-gray-600 text-lg mb-1">+</span>
              <span className="text-[10px] text-gray-600">Drop or click</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ Material Images (Reference-to-Video) ============

export const VeoMaterialZone: React.FC<VeoMaterialZoneProps> = ({
  materials, onSetMaterials, handleImageUpload, maxImages = 3,
}) => {
  const addMaterial = async (files: FileList | null) => {
    if (!files || files.length === 0 || materials.length >= maxImages) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return;
    const img = await handleImageUpload(file);
    onSetMaterials([...materials, img]);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('border-violet-400', 'bg-gray-800/60');
    if (materials.length >= maxImages) return;

    const jsonData = e.dataTransfer.getData('application/json');
    if (jsonData) {
      try {
        const refImage = JSON.parse(jsonData) as ReferenceImage;
        if (refImage.base64 && refImage.mimeType) {
          onSetMaterials([...materials, refImage]);
          return;
        }
      } catch { /* fall through */ }
    }

    await addMaterial(e.dataTransfer.files);
  };

  const removeMaterial = (idx: number) => {
    onSetMaterials(materials.filter((_, i) => i !== idx));
  };

  return (
    <div className="px-6 py-4 border-b border-gray-800 space-y-2">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Material Images (1-{maxImages}, Required)
      </label>
      <div className="grid grid-cols-3 gap-2">
        {materials.map((img, idx) => (
          <div key={img.id} className="relative group rounded-lg overflow-hidden border border-violet-500/40 aspect-square bg-gray-900">
            <img src={img.previewUrl} alt={`Material ${idx + 1}`} className="w-full h-full object-cover" />
            <button
              onClick={() => removeMaterial(idx)}
              className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >&times;</button>
            <span className="absolute bottom-1 left-1 text-[9px] bg-black/70 text-violet-300 px-1.5 py-0.5 rounded">
              Img {idx + 1}
            </span>
          </div>
        ))}
        {materials.length < maxImages && (
          <label
            className="flex flex-col items-center justify-center aspect-square rounded-lg border-2 border-dashed border-gray-700 hover:border-violet-500/50 bg-gray-900/50 cursor-pointer transition-colors"
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-violet-400', 'bg-gray-800/60'); }}
            onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-violet-400', 'bg-gray-800/60'); }}
            onDrop={handleDrop}
          >
            <input type="file" accept="image/*" className="hidden" onChange={(e) => addMaterial(e.target.files)} />
            <span className="text-gray-600 text-lg">+</span>
            <span className="text-[10px] text-gray-600 mt-1">Add</span>
          </label>
        )}
      </div>
      <p className="text-[10px] text-gray-600">
        JPG, PNG, WEBP. Max 10MB each. These images guide the visual style of the generated video.
      </p>
    </div>
  );
};
