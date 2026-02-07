import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTxt2ImgTask,
  generateWithSeedreamTxt2Img,
} from '../services/seedream-txt2img-service';
import type { SeedreamSettings, SeedreamAspectRatio } from '../types';

// Mock the rate limiter
vi.mock('../services/seedream-rate-limiter', () => ({
  waitForSlot: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock('../services/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock seedream-service functions
vi.mock('../services/seedream-service', () => ({
  queryTask: vi.fn(),
  pollForResult: vi.fn(),
  downloadImageAsBase64: vi.fn(),
}));

describe('seedream-txt2img-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('createTxt2ImgTask', () => {
    it('should return taskId on success', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: {
            taskId: 'txt2img-task-123',
          },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const settings: SeedreamSettings = {
        aspectRatio: '16:9',
        quality: 'high',
      };

      const result = await createTxt2ImgTask(
        'test-api-key',
        'a futuristic city skyline',
        settings
      );

      expect(result).toBe('txt2img-task-123');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.kie.ai/api/v1/jobs/createTask',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key',
          },
        })
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.model).toBe('seedream/4.5-text-to-image');
      expect(callBody.input.prompt).toBe('a futuristic city skyline');
      expect(callBody.input.aspect_ratio).toBe('16:9');
      expect(callBody.input.quality).toBe('high');
    });

    it('should throw on auth error (401)', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const settings: SeedreamSettings = {
        aspectRatio: '1:1',
        quality: 'basic',
      };

      await expect(
        createTxt2ImgTask('invalid-key', 'test prompt', settings)
      ).rejects.toThrow('Authentication failed. Please check your Kie.ai API key.');
    });

    it('should throw on insufficient credits (402)', async () => {
      const mockResponse = {
        ok: false,
        status: 402,
        statusText: 'Payment Required',
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const settings: SeedreamSettings = {
        aspectRatio: '1:1',
        quality: 'basic',
      };

      await expect(
        createTxt2ImgTask('test-key', 'prompt', settings)
      ).rejects.toThrow('Insufficient credits. Please top up your Kie.ai account.');
    });

    it('should throw on rate limit (429)', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const settings: SeedreamSettings = {
        aspectRatio: '1:1',
        quality: 'basic',
      };

      await expect(
        createTxt2ImgTask('test-key', 'prompt', settings)
      ).rejects.toThrow('Rate limit exceeded. Please wait and try again.');
    });

    it('should throw on non-200 code in response', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 500,
          msg: 'Internal server error',
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const settings: SeedreamSettings = {
        aspectRatio: '1:1',
        quality: 'basic',
      };

      await expect(
        createTxt2ImgTask('test-key', 'prompt', settings)
      ).rejects.toThrow('Task creation failed: Internal server error');
    });

    it('should handle different quality settings', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: { taskId: 'task-quality-test' },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const settings: SeedreamSettings = {
        aspectRatio: '3:2',
        quality: 'basic',
      };

      await createTxt2ImgTask('test-key', 'quality test prompt', settings);

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.input.quality).toBe('basic');
      expect(callBody.input.aspect_ratio).toBe('3:2');
    });

    it('should handle different aspect ratios', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: { taskId: 'task-aspect-test' },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const aspectRatios: SeedreamAspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2', '21:9'];

      for (const aspectRatio of aspectRatios) {
        vi.clearAllMocks();
        (global.fetch as any).mockResolvedValue(mockResponse);

        const settings: SeedreamSettings = {
          aspectRatio,
          quality: 'high',
        };

        await createTxt2ImgTask('test-key', 'aspect test', settings);

        const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
        expect(callBody.input.aspect_ratio).toBe(aspectRatio);
      }
    });
  });

  describe('generateWithSeedreamTxt2Img', () => {
    it('should complete full generation flow', async () => {
      // Mock createTask
      const mockCreateResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: { taskId: 'txt2img-full-flow' },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockCreateResponse);

      // Mock pollForResult
      const { pollForResult } = await import('../services/seedream-service');
      (pollForResult as any).mockResolvedValue({
        taskId: 'txt2img-full-flow',
        state: 'success',
        resultUrls: ['https://example.com/generated.jpg'],
      });

      // Mock downloadImageAsBase64
      const { downloadImageAsBase64 } = await import('../services/seedream-service');
      (downloadImageAsBase64 as any).mockResolvedValue({
        base64: 'generatedImageBase64Data',
        mimeType: 'image/webp',
      });

      const settings: SeedreamSettings = {
        aspectRatio: '16:9',
        quality: 'high',
      };

      const onProgress = vi.fn();

      const result = await generateWithSeedreamTxt2Img(
        'test-api-key',
        'a beautiful sunset over mountains',
        settings,
        onProgress
      );

      expect(result.base64).toBe('generatedImageBase64Data');
      expect(result.mimeType).toBe('image/webp');
      expect(onProgress).toHaveBeenCalledWith('creating', 'Creating generation task...');
      expect(onProgress).toHaveBeenCalledWith('generating', 'Generating image...');
      expect(onProgress).toHaveBeenCalledWith('downloading', 'Downloading result...');
      expect(onProgress).toHaveBeenCalledWith('complete', 'Done!');
    });

    it('should throw if no result URLs returned', async () => {
      // Mock createTask
      const mockCreateResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: { taskId: 'txt2img-no-results' },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockCreateResponse);

      // Mock pollForResult with empty resultUrls
      const { pollForResult } = await import('../services/seedream-service');
      (pollForResult as any).mockResolvedValue({
        taskId: 'txt2img-no-results',
        state: 'success',
        resultUrls: [],
      });

      const settings: SeedreamSettings = {
        aspectRatio: '1:1',
        quality: 'basic',
      };

      await expect(
        generateWithSeedreamTxt2Img('test-key', 'test prompt', settings)
      ).rejects.toThrow('No result images returned');
    });

    it('should propagate errors from createTask', async () => {
      const mockResponse = {
        ok: false,
        status: 402,
        statusText: 'Payment Required',
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const settings: SeedreamSettings = {
        aspectRatio: '1:1',
        quality: 'basic',
      };

      await expect(
        generateWithSeedreamTxt2Img('test-key', 'prompt', settings)
      ).rejects.toThrow('Insufficient credits');
    });

    it('should propagate errors from pollForResult', async () => {
      // Mock createTask success
      const mockCreateResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: { taskId: 'txt2img-poll-error' },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockCreateResponse);

      // Mock pollForResult failure
      const { pollForResult } = await import('../services/seedream-service');
      (pollForResult as any).mockRejectedValue(new Error('Generation failed: Content filter triggered'));

      const settings: SeedreamSettings = {
        aspectRatio: '1:1',
        quality: 'basic',
      };

      await expect(
        generateWithSeedreamTxt2Img('test-key', 'inappropriate content', settings)
      ).rejects.toThrow('Content filter triggered');
    });

    it('should propagate errors from downloadImageAsBase64', async () => {
      // Mock createTask success
      const mockCreateResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: { taskId: 'txt2img-download-error' },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockCreateResponse);

      // Mock pollForResult success
      const { pollForResult } = await import('../services/seedream-service');
      (pollForResult as any).mockResolvedValue({
        taskId: 'txt2img-download-error',
        state: 'success',
        resultUrls: ['https://example.com/broken-link.jpg'],
      });

      // Mock downloadImageAsBase64 failure
      const { downloadImageAsBase64 } = await import('../services/seedream-service');
      (downloadImageAsBase64 as any).mockRejectedValue(new Error('Download failed: 404 Not Found'));

      const settings: SeedreamSettings = {
        aspectRatio: '1:1',
        quality: 'basic',
      };

      await expect(
        generateWithSeedreamTxt2Img('test-key', 'test prompt', settings)
      ).rejects.toThrow('Download failed: 404 Not Found');
    });

    it('should work without onProgress callback', async () => {
      // Mock createTask
      const mockCreateResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: { taskId: 'txt2img-no-callback' },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockCreateResponse);

      // Mock pollForResult
      const { pollForResult } = await import('../services/seedream-service');
      (pollForResult as any).mockResolvedValue({
        taskId: 'txt2img-no-callback',
        state: 'success',
        resultUrls: ['https://example.com/result.jpg'],
      });

      // Mock downloadImageAsBase64
      const { downloadImageAsBase64 } = await import('../services/seedream-service');
      (downloadImageAsBase64 as any).mockResolvedValue({
        base64: 'resultBase64',
        mimeType: 'image/webp',
      });

      const settings: SeedreamSettings = {
        aspectRatio: '1:1',
        quality: 'basic',
      };

      // Should not throw when called without onProgress
      const result = await generateWithSeedreamTxt2Img(
        'test-key',
        'test prompt',
        settings
      );

      expect(result.base64).toBe('resultBase64');
      expect(result.mimeType).toBe('image/webp');
    });
  });
});
