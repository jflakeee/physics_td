// Build (DETAILED_DESIGN_V2 §22): v2 (TypeScript, esbuild) at the dist/ root, the v1 game
// (plain ES modules) kept playable under dist/legacy/.
import { mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/legacy', { recursive: true });
for (const f of ['index.html', 'src.js', 'engine.js', 'topview-engine.js', 'placement-controls.js']) await copyFile(f, join('dist/legacy', f));
const html = await readFile('dist/legacy/index.html', 'utf8');
if (!html.includes('src="./src.js"')) throw Error('Missing v1 entry');
console.log('v1 build: dist/legacy/');

const r = await build({
  entryPoints: ['src/main.ts'], bundle: true, format: 'iife', target: 'es2020', minify: true,
  outfile: 'dist/app.js', metafile: true, legalComments: 'none',
});
for (const f of ['index.html', 'app.css']) await copyFile(join('web', f), join('dist', f));
const v2 = await readFile('dist/index.html', 'utf8');
if (!v2.includes('src="./app.js"')) throw Error('Missing v2 entry');
await writeFile('dist/.nojekyll', '');
const bytes = Object.values(r.metafile.outputs).reduce((a, o) => a + o.bytes, 0);
console.log(`v2 build: dist/app.js ${(bytes / 1024).toFixed(1)} KB`);
