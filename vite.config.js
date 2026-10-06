import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    // `npm run dev` runs the Worker alongside (wrangler dev on 8787) for /api.
    proxy: { '/api': 'http://localhost:8787' },
  },
});
