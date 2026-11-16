// Dev build for the v2 TypeScript sources: strips types with Node's built-in
// stripTypeScriptTypes (erasable syntax only), rewrites relative `.ts` import
// specifiers to `.js`, and writes dist-v2/ together with v2.html, i18n/ko.json and data/ (fetched at runtime).
// Usage: node scripts/build-v2.mjs   (then serve dist-v2/ and open v2.html)
import { stripTypeScriptTypes } from 'node:module';
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');
const outDir = join(root, 'dist-v2');
const SPECIFIER = /((?:\bfrom|\bimport)\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+)\.ts\2/g;

/** List every .ts file under dir. */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') ? [p] : [];
  });
}

rmSync(outDir, { recursive: true, force: true });
let count = 0;
for (const file of walk(srcDir)) {
  const js = stripTypeScriptTypes(readFileSync(file, 'utf8'), { mode: 'strip' }).replace(SPECIFIER, '$1$2$3.js$2');
  const out = join(outDir, relative(srcDir, file)).replace(/\.ts$/, '.js');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, js);
  count++;
}
copyFileSync(join(root, 'v2.html'), join(outDir, 'v2.html'));
mkdirSync(join(outDir, 'i18n'), { recursive: true });
copyFileSync(join(root, 'i18n', 'ko.json'), join(outDir, 'i18n', 'ko.json'));
cpSync(join(root, 'data'), join(outDir, 'data'), { recursive: true });
console.log(`build-v2: ${count} modules -> ${relative(root, outDir)}/`);
