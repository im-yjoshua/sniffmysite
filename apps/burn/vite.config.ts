import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// BurnRate.lol frontend — React + Vite + Tailwind CSS v4.
// Port 5174 (VaporRank takes 5173) so both frontends run side by side in dev.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      // Local dev: forward API calls to the Express service.
      '/api': 'http://localhost:4000',
    },
  },
});
