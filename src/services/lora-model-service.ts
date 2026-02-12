/**
 * LoRA Model Service
 * Handles LoRA training, listing, and management
 * Currently stubbed - replace with actual backend implementation
 */

import { LoraModel, LoraStatus, LoraTrainingConfig } from '../types';

export interface LoraModelService {
  listLoras(): Promise<LoraModel[]>;
  startTraining(config: LoraTrainingConfig): Promise<string>;
  getTrainingStatus(jobId: string): Promise<{ status: LoraStatus; progress: number; error?: string }>;
  deleteLora(loraId: string): Promise<void>;
  getLoraFilename(loraId: string): Promise<string>;
}

class LoraModelServiceStub implements LoraModelService {
  private mockLoras: LoraModel[] = [];

  async listLoras(): Promise<LoraModel[]> {
    return this.mockLoras;
  }

  async startTraining(config: LoraTrainingConfig): Promise<string> {
    console.warn('[LoRA Service] Training not yet implemented. Config:', {
      name: config.name,
      triggerWord: config.triggerWord,
      photoCount: config.photos.length,
      steps: config.steps,
      learningRate: config.learningRate,
    });

    const jobId = `mock-job-${Date.now()}`;

    const newLora: LoraModel = {
      id: jobId,
      name: config.name,
      triggerWord: config.triggerWord,
      status: 'training',
      createdAt: Date.now(),
      trainingProgress: 0,
    };

    this.mockLoras.push(newLora);

    setTimeout(() => {
      const lora = this.mockLoras.find(l => l.id === jobId);
      if (lora) {
        lora.status = 'ready';
        lora.trainingProgress = 100;
        lora.fileSize = 144 * 1024 * 1024;
      }
    }, 3000);

    return jobId;
  }

  async getTrainingStatus(jobId: string): Promise<{ status: LoraStatus; progress: number; error?: string }> {
    const lora = this.mockLoras.find(l => l.id === jobId);

    if (!lora) {
      return { status: 'failed', progress: 0, error: 'Job not found' };
    }

    return {
      status: lora.status,
      progress: lora.trainingProgress || 0,
      error: lora.errorMessage,
    };
  }

  async deleteLora(loraId: string): Promise<void> {
    console.log('[LoRA Service] Delete LoRA:', loraId);
    this.mockLoras = this.mockLoras.filter(l => l.id !== loraId);
  }

  async getLoraFilename(loraId: string): Promise<string> {
    const lora = this.mockLoras.find(l => l.id === loraId);
    if (lora) {
      return `lora_${lora.name.toLowerCase().replace(/\s+/g, '_')}_${loraId.slice(0, 8)}.safetensors`;
    }
    return `lora_${loraId}.safetensors`;
  }
}

export const loraService = new LoraModelServiceStub();
