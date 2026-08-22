/*
 * Datum — build
 * Inlines the stylesheet and scripts into one self-contained page.
 *
 *   dist/index.html     full standalone document, drop on any static host
 *   dist/artifact.html  page content only, for the Claude Artifact wrapper
 *
 * There is no framework and no dependency. `node build.mjs` is the whole thing.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const html = read('./index.html');
const css = read('./assets/styles.css');
const scripts = ['rates', 'trees', 'engine', 'iso', 'app']
  .map((n) => read(`./src/${n}.js`))
  .join('\n');

const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=IBM+Plex+Mono:wght@400;500;600&family=Instrument+Sans:wght@400..700&display=swap';

const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/\n\s*<script src="[^"]+"><\/script>/g, '')
  .trim();

const inlined = `<style>\n${css}\n</style>\n\n${body}\n\n<script>\n${scripts}\n</script>\n`;

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });

writeFileSync(
  new URL('./dist/index.html', import.meta.url),
  `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Datum</title>
<meta name="description" content="Price your extension properly — foundations, drawings, fees and VAT — then put that exact price to vetted builders.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
</head>
<body>
${inlined}</body>
</html>
`
);

writeFileSync(
  new URL('./dist/artifact.html', import.meta.url),
  `<title>Datum</title>\n<link rel="stylesheet" href="${FONTS}">\n${inlined}`
);

console.log(`dist/index.html    ${(read('./dist/index.html').length / 1024).toFixed(1)} KB`);
console.log(`dist/artifact.html ${(read('./dist/artifact.html').length / 1024).toFixed(1)} KB`);
