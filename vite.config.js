import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发模式：5173 前端，3001 后端 API，通过 proxy 转发 /api
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
