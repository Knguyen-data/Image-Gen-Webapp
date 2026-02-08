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
        proxy: {
          '/api/freepik': {
            target: 'https://api.freepik.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/freepik/, ''),
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
