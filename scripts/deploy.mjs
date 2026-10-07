// Deploy to Cloudflare Workers: test, build, upload, and make sure the
// treasure secret exists. The secret is created once and never replaced,
// because a new one would void every map players are holding.
//
//   npm run deploy               uses CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID)
//                                if set, otherwise your `npx wrangler login` session
//   npm run deploy -- --dry-run  everything except the upload

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

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

// The treasure secret: set it on the first deploy only.
const list = run('npx', ['wrangler', 'secret', 'list'], { capture: true });
if (list.status !== 0) {
  process.stderr.write(`${list.stdout ?? ''}${list.stderr ?? ''}`);
  console.error('\nDeployed, but could not check TREASURE_SECRET. Run `npx wrangler secret list` to see whether it is set.');
  process.exit(1);
}
if (/TREASURE_SECRET/.test(list.stdout)) {
  console.log('\nTREASURE_SECRET is already set; leaving it alone.');
} else {
  step('Set TREASURE_SECRET (first deploy only)', 'npx', ['wrangler', 'secret', 'put', 'TREASURE_SECRET'], {
    input: `${randomBytes(32).toString('hex')}\n`,
    capture: true,
  });
  console.log('Set a random TREASURE_SECRET. It lives only in Cloudflare.');
}

const url = deployed.stdout.match(/https:\/\/\S+\.workers\.dev/);
if (url) console.log(`\nLive at ${url[0]}`);
