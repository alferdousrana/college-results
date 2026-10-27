/**
 * Supply-chain guard. Runs first in every GitHub workflow and stops the build if the repository
 * looks tampered with:
 *  - JavaScript files at the top level that are not part of the project (e.g. an injected api.js)
 *  - package.json scripts that differ from the expected ones (e.g. "node api.js && vite build")
 *  - install hooks (preinstall/install/postinstall/prepare) that run code during npm ci
 *  - source lines that are extremely long or start with a long run of tabs/spaces
 *    (a trick to push hidden code off-screen), or typical obfuscation markers.
 * Exit code 1 with a clear message when something is found.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const problems = [];

const ALLOWED_ROOT_JS = new Set(['vite.config.js', 'vitest.rules.config.js']);
for (const f of readdirSync(ROOT)) {
  if (/\.(c|m)?js$/.test(f) && !ALLOWED_ROOT_JS.has(f)) problems.push(`Unexpected script at the top of the repository: ${f}`);
}

const EXPECTED_SCRIPTS = {
  dev: 'vite', build: 'vite build', preview: 'vite preview', test: 'vitest run', 'test:watch': 'vitest',
  'test:rules': 'firebase emulators:exec --only firestore "vitest run --config vitest.rules.config.js"',
  'validate:flags': 'node scripts/validate-feature-flags.mjs config/feature-flags.json', 'test:e2e': 'bash tests/e2e/serve_and_run.sh',
};
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
for (const [k, v] of Object.entries(pkg.scripts ?? {})) {
  if (EXPECTED_SCRIPTS[k] !== v) problems.push(`package.json script "${k}" is not the expected one: ${v}`);
}
for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prebuild', 'postbuild', 'pretest']) {
  if (pkg.scripts?.[hook]) problems.push(`package.json has an install/build hook "${hook}"`);
}

const SCAN_DIRS = ['src', 'scripts', 'config', 'dev-control', 'tests', '.github'];
const SCAN_FILES = ['vite.config.js', 'vitest.rules.config.js', 'index.html', 'firestore.rules', 'package.json'];
const EXT = new Set(['.js', '.mjs', '.cjs', '.html', '.json', '.yml', '.yaml', '.css', '.rules']);
const MARKERS = [/global\[['"]!['"]\]/, /createRequire\(import\.meta\.url\)/, /\\x[0-9a-f]{2}\\x[0-9a-f]{2}\\x[0-9a-f]{2}/i, /eval\(\s*atob\(/, /new Function\(\s*atob\(/];
function scanFile(p) {
  const lines = readFileSync(p, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const where = `${p.replace(`${ROOT}/`, '')}:${i + 1}`;
    if (/^[\t ]{200,}\S/.test(line)) problems.push(`${where} starts with ${line.match(/^[\t ]*/)[0].length} spaces/tabs (hidden code?)`);
    if (line.length > 3000 && !p.endsWith('.json')) problems.push(`${where} is ${line.length} characters long (obfuscated code?)`);
    for (const m of MARKERS) if (m.test(line) && !p.endsWith('guard.mjs')) problems.push(`${where} contains a suspicious pattern ${m}`);
  });
}
function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const f of entries) {
    if (f === 'node_modules' || f === 'dist' || f === 'out') continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (EXT.has(extname(f)) && !f.endsWith('fonts-bundle.js')) scanFile(p);
  }
}
for (const d of SCAN_DIRS) walk(join(ROOT, d));
for (const f of SCAN_FILES) { try { scanFile(join(ROOT, f)); } catch { /* missing */ } }

if (problems.length) {
  console.error('::error::The repository looks tampered with. The build was stopped.');
  for (const p of problems) console.error(`::error::${p}`);
  process.exit(1);
}
console.log('Supply-chain guard: no tampering found.');
