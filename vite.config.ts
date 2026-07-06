import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  // Pointe sur index.html — évite que Vite parse le monolithe index.html
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  server: {
    port: 3000,
    // Forcer Vite à servir index.html comme point d'entrée
    open: '/index.html',
    fs: {
      allow: ['.'],
    },
  },
});
