import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// VaporRank frontend — React + Vite + Tailwind CSS v4.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Local dev: forward API calls to the Express service.
      '/api': 'http://localhost:4000',
    },
  },
});
