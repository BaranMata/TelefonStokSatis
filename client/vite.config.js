import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Geliştirme modunda /api istekleri Express sunucusuna (3000) yönlendirilir.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
