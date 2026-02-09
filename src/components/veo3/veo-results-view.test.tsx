import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VeoResultsView } from './veo-results-view';
import React from 'react';

// Mock the VideoCard component as it's an external dependency and not the focus of this test
vi.mock('../video-card', () => ({
  VideoCard: ({ videoUrl, resolution, prompt, title }: any) => (
    <div data-testid="mock-video-card">
      <span>Video URL: {videoUrl}</span>
      <span>Resolution: {resolution}</span>
      <span>Prompt: {prompt}</span>
      <span>Title: {title}</span>
    </div>
  ),
}));

describe('VeoResultsView', () => {
  it('should render without crash when result is undefined', () => {
    render(<VeoResultsView result={undefined} />);
    expect(screen.queryByTestId('mock-video-card')).toBeNull();
  });

  it('should render without crash when result.data is undefined', () => {
    const result = {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      status: 'success' as const,
      isIdle: false,
      isPending: false,
      isSuccess: true,
      isPaused: false,
      failureCount: 0,
      fetchStatus: 'idle' as const,
    };
    render(<VeoResultsView result={result} />);
    expect(screen.queryByTestId('mock-video-card')).toBeNull();
  });

  it('should render correctly when result.data exists', () => {
    const result = {
      data: {
        response: {
          resultUrls: ['https://example.com/video.mp4'],
          title: 'Test Video',
          prompt: 'A test prompt',
          resolution: '1080p',
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      status: 'success' as const,
      isIdle: false,
      isPending: false,
      isSuccess: true,
      isPaused: false,
      failureCount: 0,
      fetchStatus: 'idle' as const,
    };
    render(<VeoResultsView result={result} />);
    expect(screen.queryByTestId('mock-video-card')).not.toBeNull();
    expect(screen.queryByText('Video URL: https://example.com/video.mp4')).not.toBeNull();
    expect(screen.queryByText('Resolution: 1080p')).not.toBeNull();
    expect(screen.queryByText('Prompt: A test prompt')).not.toBeNull();
    expect(screen.queryByText('Title: Test Video')).not.toBeNull();
  });

  it('should handle result.data.response being undefined', () => {
    const result = {
      data: {
        response: undefined,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      status: 'success' as const,
      isIdle: false,
      isPending: false,
      isSuccess: true,
      isPaused: false,
      failureCount: 0,
      fetchStatus: 'idle' as const,
    };
    render(<VeoResultsView result={result} />);
    expect(screen.queryByTestId('mock-video-card')).toBeNull();
  });

  it('should handle empty resultUrls array', () => {
    const result = {
      data: {
        response: {
          resultUrls: [],
          title: 'Test Video',
          prompt: 'A test prompt',
          resolution: '1080p',
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      status: 'success' as const,
      isIdle: false,
      isPending: false,
      isSuccess: true,
      isPaused: false,
      failureCount: 0,
      fetchStatus: 'idle' as const,
    };
    render(<VeoResultsView result={result} />);
    expect(screen.queryByTestId('mock-video-card')).toBeNull();
  });

  it('should use default resolution "720p" if not provided', () => {
    const result = {
      data: {
        response: {
          resultUrls: ['https://example.com/video.mp4'],
          title: 'Test Video',
          prompt: 'A test prompt',
          // resolution is missing
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      status: 'success' as const,
      isIdle: false,
      isPending: false,
      isSuccess: true,
      isPaused: false,
      failureCount: 0,
      fetchStatus: 'idle' as const,
    };
    render(<VeoResultsView result={result} />);
    expect(screen.queryByTestId('mock-video-card')).not.toBeNull();
    expect(screen.queryByText('Resolution: 720p')).not.toBeNull();
  });
});
