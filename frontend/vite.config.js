import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: fileURLToPath(new URL('./postcss.config.js', import.meta.url)),
  },
  server: {
    port: 5174,
    proxy: { '/api': { target: 'http://localhost:5001', changeOrigin: true } },
  },
});
