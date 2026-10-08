import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// Stamp the build with the commit it came from, so the start screen can say
// exactly which version you're playing.
function build() {
  // Cloudflare's builds say which commit they're building; locally, ask git.
  let hash = process.env.WORKERS_CI_COMMIT_SHA?.slice(0, 7) || 'local';
  if (hash === 'local') try {
    hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || hash;
  } catch {
    // not a git checkout
  }
  const date = new Date().toISOString().slice(0, 10);
  return { hash, date };
}

export default defineConfig({
  define: { __BUILD__: JSON.stringify(build()) },
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
