import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  uploadImageBase64,
  createEditTask,
  queryTask,
  pollForResult,
  mapAspectRatio,
  generateWithSeedream,
  downloadImageAsBase64,
} from '../services/seedream-service';
import type { SeedreamSettings, SeedreamTask } from '../types';

// Mock the rate limiter
vi.mock('../services/seedream-rate-limiter', () => ({
  waitForSlot: vi.fn().mockResolvedValue(undefined),
}));

describe('seedream-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('uploadImageBase64', () => {
    it('should return download URL on success', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          success: true,
          data: {
            downloadUrl: 'https://example.com/image.jpg',
          },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await uploadImageBase64(
        'test-api-key',
        'base64data',
        'image/jpeg'
      );

      expect(result).toBe('https://example.com/image.jpg');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://kieai.redpandaai.co/api/file-base64-upload',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key',
          },
        })
      );
    });

    it('should throw on auth error (401)', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        uploadImageBase64('invalid-key', 'base64data', 'image/jpeg')
      ).rejects.toThrow('Authentication failed. Please check your Kie.ai API key.');
    });

    it('should handle data URL format correctly', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          success: true,
          data: { downloadUrl: 'https://example.com/image.jpg' },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await uploadImageBase64(
        'test-key',
        'data:image/jpeg;base64,abc123',
        'image/jpeg'
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.base64Data).toBe('data:image/jpeg;base64,abc123');
    });

    it('should throw on non-200 code in response', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 500,
          success: false,
          msg: 'Server error',
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        uploadImageBase64('test-key', 'base64data', 'image/jpeg')
      ).rejects.toThrow('Upload failed: Server error');
    });
  });

  describe('createEditTask', () => {
    it('should return taskId on success', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: {
            taskId: 'task-123',
          },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const settings: SeedreamSettings = {
        aspectRatio: '1:1',
        quality: 'high',
      };

      const result = await createEditTask(
        'test-api-key',
        'a beautiful landscape',
        ['https://example.com/image.jpg'],
        settings
      );

      expect(result).toBe('task-123');
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
      expect(callBody.model).toBe('seedream/4.5-edit');
      expect(callBody.input.prompt).toBe('a beautiful landscape');
      expect(callBody.input.aspect_ratio).toBe('1:1');
      expect(callBody.input.quality).toBe('high');
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
        createEditTask('test-key', 'prompt', ['url'], settings)
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
        createEditTask('test-key', 'prompt', ['url'], settings)
      ).rejects.toThrow('Rate limit exceeded. Please wait and try again.');
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
        createEditTask('invalid-key', 'prompt', ['url'], settings)
      ).rejects.toThrow('Authentication failed. Please check your Kie.ai API key.');
    });
  });

  describe('queryTask', () => {
    it('should return waiting state', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: {
            taskId: 'task-123',
            state: 'waiting',
            costTime: 0,
          },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await queryTask('test-api-key', 'task-123');

      expect(result).toEqual({
        taskId: 'task-123',
        state: 'waiting',
        costTime: 0,
      });
    });

    it('should return success state with resultUrls', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: {
            taskId: 'task-123',
            state: 'success',
            costTime: 5000,
            resultJson: JSON.stringify({
              resultUrls: ['https://example.com/result1.jpg', 'https://example.com/result2.jpg'],
            }),
          },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await queryTask('test-api-key', 'task-123');

      expect(result).toEqual({
        taskId: 'task-123',
        state: 'success',
        costTime: 5000,
        resultUrls: ['https://example.com/result1.jpg', 'https://example.com/result2.jpg'],
      });
    });

    it('should return fail state with failMsg', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: {
            taskId: 'task-123',
            state: 'fail',
            failCode: 'ERR_001',
            failMsg: 'Content filter triggered',
          },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await queryTask('test-api-key', 'task-123');

      expect(result).toEqual({
        taskId: 'task-123',
        state: 'fail',
        failCode: 'ERR_001',
        failMsg: 'Content filter triggered',
      });
    });

    it('should throw on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        queryTask('test-key', 'task-123')
      ).rejects.toThrow('Query failed: 500 Internal Server Error');
    });
  });

  describe('pollForResult', () => {
    it('should poll until success', async () => {
      let callCount = 0;
      (global.fetch as any).mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              code: 200,
              data: {
                taskId: 'task-123',
                state: 'waiting',
              },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            code: 200,
            data: {
              taskId: 'task-123',
              state: 'success',
              resultJson: JSON.stringify({
                resultUrls: ['https://example.com/result.jpg'],
              }),
            },
          }),
        });
      });

      const onProgress = vi.fn();
      const result = await pollForResult('test-api-key', 'task-123', onProgress);

      expect(result.state).toBe('success');
      expect(result.resultUrls).toEqual(['https://example.com/result.jpg']);
      expect(onProgress).toHaveBeenCalled();
    });

    it('should throw on fail state', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: {
            taskId: 'task-123',
            state: 'fail',
            failMsg: 'Generation failed',
          },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        pollForResult('test-key', 'task-123')
      ).rejects.toThrow('Generation failed: Generation failed');
    });

    it('should timeout after max attempts', async () => {
      // Skip this test as it takes too long with real timers
      // The functionality is tested by the pollForResult success test
      // and the fail state test
      vi.useFakeTimers({ shouldAdvanceTime: true });

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: {
            taskId: 'task-123',
            state: 'waiting',
          },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const pollPromise = pollForResult('test-key', 'task-123');

      // Fast-forward through all polling attempts
      for (let i = 0; i < 60; i++) {
        await vi.advanceTimersByTimeAsync(10000);
      }

      await expect(pollPromise).rejects.toThrow('Timeout: Generation did not complete within expected time');

      vi.useRealTimers();
    }, 5000);
  });

  describe('mapAspectRatio', () => {
    it('should map 4:5 to 3:4', () => {
      expect(mapAspectRatio('4:5')).toBe('3:4');
    });

    it('should return same for supported ratios', () => {
      expect(mapAspectRatio('1:1')).toBe('1:1');
      expect(mapAspectRatio('16:9')).toBe('16:9');
      expect(mapAspectRatio('9:16')).toBe('9:16');
      expect(mapAspectRatio('4:3')).toBe('4:3');
      expect(mapAspectRatio('3:4')).toBe('3:4');
      expect(mapAspectRatio('2:3')).toBe('2:3');
      expect(mapAspectRatio('3:2')).toBe('3:2');
      expect(mapAspectRatio('21:9')).toBe('21:9');
    });

    it('should return 1:1 for unsupported ratio', () => {
      expect(mapAspectRatio('5:7')).toBe('1:1');
    });
  });

  describe('downloadImageAsBase64', () => {
    it('should download and convert to base64', async () => {
      const mockBlob = new Blob(['fake image data'], { type: 'image/webp' });
      const mockResponse = {
        ok: true,
        blob: vi.fn().mockResolvedValue(mockBlob),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      // Mock FileReader as a class
      class MockFileReader {
        result: string | null = null;
        onloadend: (() => void) | null = null;
        onerror: ((error: any) => void) | null = null;

        readAsDataURL() {
          setTimeout(() => {
            this.result = 'data:image/webp;base64,ZmFrZSBpbWFnZSBkYXRh';
            this.onloadend?.();
          }, 0);
        }
      }

      global.FileReader = MockFileReader as any;

      const result = await downloadImageAsBase64('https://example.com/image.jpg');

      expect(result.base64).toBe('ZmFrZSBpbWFnZSBkYXRh');
      expect(result.mimeType).toBe('image/webp');
    });

    it('should throw on failed download', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        downloadImageAsBase64('https://example.com/missing.jpg')
      ).rejects.toThrow('Download failed: 404 Not Found');
    });
  });

  describe('generateWithSeedream', () => {
    it('should complete full flow', async () => {
      let callCount = 0;
      (global.fetch as any).mockImplementation((url: string) => {
        callCount++;

        // Upload request
        if (url.includes('file-base64-upload')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              code: 200,
              success: true,
              data: { downloadUrl: 'https://example.com/uploaded.jpg' },
            }),
          });
        }

        // Create task request
        if (url.includes('createTask')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              code: 200,
              data: { taskId: 'task-123' },
            }),
          });
        }

        // Query task requests (poll until success)
        if (url.includes('recordInfo')) {
          if (callCount <= 4) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                code: 200,
                data: {
                  taskId: 'task-123',
                  state: 'waiting',
                },
              }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              code: 200,
              data: {
                taskId: 'task-123',
                state: 'success',
                resultJson: JSON.stringify({
                  resultUrls: ['https://example.com/result.jpg'],
                }),
              },
            }),
          });
        }

        // Download result
        if (url.includes('result.jpg')) {
          const mockBlob = new Blob(['result data'], { type: 'image/webp' });
          return Promise.resolve({
            ok: true,
            blob: () => Promise.resolve(mockBlob),
          });
        }

        return Promise.reject(new Error('Unexpected URL'));
      });

      // Mock FileReader for download
      class MockFileReader {
        result: string | null = null;
        onloadend: (() => void) | null = null;
        onerror: ((error: any) => void) | null = null;

        readAsDataURL() {
          setTimeout(() => {
            this.result = 'data:image/webp;base64,cmVzdWx0IGRhdGE=';
            this.onloadend?.();
          }, 0);
        }
      }

      global.FileReader = MockFileReader as any;

      const settings: SeedreamSettings = {
        aspectRatio: '1:1',
        quality: 'high',
      };

      const onProgress = vi.fn();

      const result = await generateWithSeedream(
        'test-api-key',
        'beautiful landscape',
        'base64sourcedata',
        'image/jpeg',
        settings,
        onProgress
      );

      expect(result.base64).toBe('cmVzdWx0IGRhdGE=');
      expect(result.mimeType).toBe('image/webp');
      expect(onProgress).toHaveBeenCalledWith('uploading', 'Uploading source image...');
      expect(onProgress).toHaveBeenCalledWith('creating', 'Creating edit task...');
      expect(onProgress).toHaveBeenCalledWith('generating', 'Generating image...');
      expect(onProgress).toHaveBeenCalledWith('downloading', 'Downloading result...');
      expect(onProgress).toHaveBeenCalledWith('complete', 'Done!');
    });

    it('should throw if no result URLs returned', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('file-base64-upload')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              code: 200,
              success: true,
              data: { downloadUrl: 'https://example.com/uploaded.jpg' },
            }),
          });
        }

        if (url.includes('createTask')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              code: 200,
              data: { taskId: 'task-123' },
            }),
          });
        }

        if (url.includes('recordInfo')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              code: 200,
              data: {
                taskId: 'task-123',
                state: 'success',
                resultJson: JSON.stringify({
                  resultUrls: [],
                }),
              },
            }),
          });
        }

        return Promise.reject(new Error('Unexpected URL'));
      });

      const settings: SeedreamSettings = {
        aspectRatio: '1:1',
        quality: 'high',
      };

      await expect(
        generateWithSeedream('test-key', 'prompt', 'base64', 'image/jpeg', settings)
      ).rejects.toThrow('No result images returned');
    });
  });
});
