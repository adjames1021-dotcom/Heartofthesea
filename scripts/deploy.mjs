// Deploy to Cloudflare Workers: test, build, upload.
//
//   npm run deploy               uses CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID)
//                                if set, otherwise your `npx wrangler login` session
//   npm run deploy -- --dry-run  everything except the upload

import { spawnSync } from 'node:child_process';

const dry = process.argv.includes('--dry-run');

function run(cmd, args, { input, capture = false } = {}) {
  const r = spawnSync(cmd, args, {
    stdio: [input === undefined ? 'inherit' : 'pipe', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'],
    input,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (r.error) throw r.error;
  return r;
}

function step(name, cmd, args, opts = {}) {
  console.log(`\n== ${name}`);
  const r = run(cmd, args, opts);
  if (r.status !== 0) {
    if (opts.capture) process.stderr.write(`${r.stdout ?? ''}${r.stderr ?? ''}`);
    console.error(`\n${name} failed.`);
    process.exit(r.status ?? 1);
  }
  return r;
}

if (!dry && !process.env.CLOUDFLARE_API_TOKEN) {
  console.log('CLOUDFLARE_API_TOKEN is not set, so wrangler will use your `npx wrangler login` session.');
}

step('Tests', 'npm', ['test', '--silent']);
step('Build', 'npx', ['vite', 'build']);

if (dry) {
  step('Bundle check (nothing is uploaded)', 'npx', ['wrangler', 'deploy', '--dry-run', '--outdir', '.wrangler/dry-run']);
  console.log('\nDry run passed.');
  process.exit(0);
}

const deployed = step('Deploy', 'npx', ['wrangler', 'deploy'], { capture: true });
process.stdout.write(deployed.stdout);

const url = deployed.stdout.match(/https:\/\/\S+\.workers\.dev/);
if (url) console.log(`\nLive at ${url[0]}`);
