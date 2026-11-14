import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 3000,
    open: false,
    host: true
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsInlineLimit: 0
  },
  optimizeDeps: {
    include: ['three', '@mediapipe/tasks-vision']
  }
});

