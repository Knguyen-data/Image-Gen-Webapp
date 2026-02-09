export interface PromptFolder {
  id: string;
  name: string;
  order: number;
  createdAt: number;
}

export interface SavedPromptImage {
  id: string;
  base64: string;
  mimeType: string;
}

export interface SavedPromptSettings {
  model?: string;
  aspectRatio?: string;
  temperature?: number;
  imageSize?: string;
}

export interface SavedPrompt {
  id: string;
  folderId: string;
  prompt: string;
  negativePrompt?: string;
  referenceImages: SavedPromptImage[];
  settings?: SavedPromptSettings;
  isFavorite: boolean;
  usedCount: number;
  createdAt: number;
  updatedAt: number;
}
