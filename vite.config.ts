import { webcrypto } from 'crypto';
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// FIX: garante crypto.getRandomValues no Node (build / CI)
if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

export default defineConfig({
  // NECESSÁRIO para GitHub Pages
  base: '/renota-app/',

  server: {
    port: 3000,
    host: '0.0.0.0',
  },

  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
