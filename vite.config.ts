import { defineConfig } from 'vite';

// API + WebSocket requests proxy to the Vyrthlands backend (npm run server).
export default defineConfig({
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8081', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8081', ws: true },
    },
  },
});
