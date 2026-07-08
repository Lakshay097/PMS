import { readFileSync, writeFileSync, existsSync } from 'fs';

const swPath = 'public/sw.js';

if (!existsSync(swPath)) {
  console.warn('[postbuild] public/sw.js not found — skipping version bump');
  process.exit(0);
}

const buildId = Date.now().toString(36);

let content = readFileSync(swPath, 'utf-8');
content = content.replace(
  /const CACHE_VERSION = '.*?';/,
  `const CACHE_VERSION = '${buildId}';`
);

writeFileSync(swPath, content);
console.log(`[postbuild] sw.js CACHE_VERSION set to ${buildId}`);