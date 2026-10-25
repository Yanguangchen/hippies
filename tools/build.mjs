import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';

const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex').slice(0, 12);
const modelVersion = await hash('Assets/models/beer.glb');
await build({
  define: { __BEER_MODEL_URL__: JSON.stringify(`/Assets/models/beer.glb?v=${modelVersion}`) }, entryPoints: ['src/beer-hero.js'], bundle: true, minify: true,
  format: 'esm', outfile: 'Assets/js/beer-hero.js' });
const cssVersion = await hash('styles.css');
const jsVersion = await hash('Assets/js/beer-hero.js');
for (const directory of ['.', 'blog']) {
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.html')) continue;
    const path = `${directory}/${file}`;
    const html = await readFile(path, 'utf8');
    const updated = html
      .replace(/(href="(?:\.\.\/)?styles\.css)(?:\?v=[^"]*)?"/g, `$1?v=${cssVersion}"`)
      .replace(/(src="Assets\/js\/beer-hero\.js)(?:\?v=[^"]*)?"/g, `$1?v=${jsVersion}"`);
    if (html !== updated) await writeFile(path, updated);
  }
}
