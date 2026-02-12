import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileSystemPlugin } from './src/plugins/vite-file-system-plugin';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '127.0.0.1',
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
        },
        watch: {
          ignored: ['**/agent/**', '**/.beads/**', '**/node_modules/**'],
        },
        proxy: {
          '/api/freepik': {
            target: 'https://api.freepik.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/freepik/, ''),
          },
          '/api/fal': {
            target: 'https://queue.fal.run',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/fal/, ''),
          },
          '/api/r2': {
            target: 'https://r2-media-upload.tnguyen633.workers.dev',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/r2/, ''),
          },
          '/api/runpod': {
            target: 'https://api.runpod.ai',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/runpod/, ''),
          },
        },
      },
      plugins: [tailwindcss(), react(), fileSystemPlugin()],
      define: {},
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      }
    };
});
