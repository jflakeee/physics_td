// Build: v1 (plain ES modules) at dist/ root, v2 (TypeScript, esbuild) at dist/v2/.
// v2 moves to the root once it is feature-complete (DETAILED_DESIGN_V2 §22: v1 → dist/legacy/).
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

await mkdir('dist', { recursive: true });
for (const f of ['index.html', 'src.js', 'engine.js', 'topview-engine.js', 'placement-controls.js']) await copyFile(f, join('dist', f));
const html = await readFile('dist/index.html', 'utf8');
if (!html.includes('src="./src.js"')) throw Error('Missing entry');
await writeFile('dist/.nojekyll', '');
console.log('v1 web build verified');

const { build } = await import('esbuild');
await mkdir('dist/v2', { recursive: true });
const r = await build({
  entryPoints: ['src/main.ts'], bundle: true, format: 'iife', target: 'es2020', minify: true,
  outfile: 'dist/v2/app.js', metafile: true, legalComments: 'none',
});
for (const f of ['index.html', 'app.css']) await copyFile(join('web', f), join('dist/v2', f));
const bytes = Object.values(r.metafile.outputs).reduce((a, o) => a + o.bytes, 0);
console.log(`v2 build: dist/v2/app.js ${(bytes / 1024).toFixed(1)} KB`);
