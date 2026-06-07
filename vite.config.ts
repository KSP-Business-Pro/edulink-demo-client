import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  // Pointe sur index_vite.html — évite que Vite parse le monolithe index.html
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index_vite.html'),
    },
  },
  server: {
    port: 3000,
    // Forcer Vite à servir index_vite.html comme point d'entrée
    open: '/index_vite.html',
    fs: {
      allow: ['.'],
    },
  },
});
