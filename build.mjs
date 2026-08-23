/*
 * Datum — build
 * Inlines each page's stylesheets and scripts into one self-contained file.
 *
 *   dist/<page>.html           full standalone document, drop on any static host
 *   dist/<page>.artifact.html  page content only, for the Claude Artifact wrapper
 *
 * There is no framework and no dependency. `node build.mjs` is the whole thing.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=IBM+Plex+Mono:wght@400;500;600&family=Instrument+Sans:wght@400..700&display=swap';

const PAGES = [
  {
    src: 'index.html',
    out: 'index',
    title: 'Datum',
    description: 'Price your extension properly — foundations, drawings, fees and VAT — then put that exact price to vetted builders.',
    css: ['assets/styles.css', 'assets/app.css'],
    js: ['vendor/gsap.min.js', 'vendor/ScrollTrigger.min.js',
         'src/ratebook.js', 'src/trees.js', 'src/store.js', 'src/rates.js',
         'src/engine.js', 'src/draw2d.js', 'src/router.js', 'src/hero.js', 'src/flow.js'],
  },
  {
    src: 'admin.html',
    out: 'admin',
    title: 'Datum Rate Book',
    description: 'Configure pricing for extensions, renovations, loft conversions, new builds and outdoor work.',
    css: ['assets/styles.css', 'assets/admin.css'],
    js: ['src/ratebook.js', 'src/trees.js', 'src/store.js', 'src/admin.js'],
  },
];

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });

/* Bodies are kept so the two pages can also be shipped as one document — see
   the combined demo at the bottom of this file. */
const bodies = {};

for (const page of PAGES) {
  const html = read(`./${page.src}`);
  const css = page.css.map((p) => read(`./${p}`)).join('\n\n');
  const js = page.js.map((n) => read(`./${n}`)).join('\n;\n');

  const body = html
    .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
    .replace(/\n\s*<script src="[^"]+"><\/script>/g, '')
    .trim();

  bodies[page.out] = body;
  const inlined = `<style>\n${css}\n</style>\n\n${body}\n\n<script>\n${js}\n</script>\n`;

  writeFileSync(
    new URL(`./dist/${page.out}.html`, import.meta.url),
    `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.title}</title>
<meta name="description" content="${page.description}">
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
    new URL(`./dist/${page.out}.artifact.html`, import.meta.url),
    `<title>${page.title}</title>\n<link rel="stylesheet" href="${FONTS}">\n${inlined}`
  );

  const kb = (n) => (read(`./dist/${n}`).length / 1024).toFixed(1) + ' KB';
  console.log(`${page.out.padEnd(6)} → dist/${page.out}.html ${kb(`${page.out}.html`)}   dist/${page.out}.artifact.html ${kb(`${page.out}.artifact.html`)}`);
}

/* ===========================================================================
   Combined demo
   ---------------------------------------------------------------------------
   The client estimator and Lee's rate book in one document, so a rate edited
   in the admin visibly moves the price a client sees. Deployed separately they
   are two pages on one domain and share storage anyway; this exists because a
   demo has to work from a single link.
   =========================================================================== */

const SWITCH_CSS = `
#app-admin[hidden], #app-public[hidden] { display: none; }
.demoswitch {
  position: fixed; right: 14px; bottom: 14px; z-index: 100;
  display: flex; gap: 2px; padding: 3px; border-radius: 4px;
  background: var(--ink); box-shadow: 0 8px 24px -10px rgba(0,0,0,.6);
}
.demoswitch button {
  font-family: var(--mono); font-size: .66rem; letter-spacing: .1em; text-transform: uppercase;
  padding: .44rem .7rem; border: 0; border-radius: 2px; cursor: pointer;
  background: transparent; color: color-mix(in srgb, var(--paper) 62%, transparent);
}
.demoswitch button[aria-pressed="true"] { background: var(--accent); color: #fff; }
.demoswitch button:hover { color: var(--paper); }
@media (max-width: 1000px) { .demoswitch { bottom: 5.1rem; right: 10px; } }
@media (prefers-reduced-motion: no-preference) { .demoswitch button { transition: background .15s ease, color .15s ease; } }
`;

const SWITCH_HTML = `
<div class="demoswitch" role="group" aria-label="Demonstration view">
  <button type="button" data-view="public" aria-pressed="true">Client view</button>
  <button type="button" data-view="admin" aria-pressed="false">Rate book</button>
</div>`;

const SWITCH_JS = `
(function (d) {
  var pub = d.getElementById('app-public'), adm = d.getElementById('app-admin');
  function show(which) {
    pub.hidden = which !== 'public';
    adm.hidden = which !== 'admin';
    Array.prototype.forEach.call(d.querySelectorAll('.demoswitch button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === which));
    });
    try { localStorage.setItem('datum.demoview', which); } catch (e) {}
    window.scrollTo(0, 0);
  }
  d.querySelector('.demoswitch').addEventListener('click', function (e) {
    var b = e.target.closest('[data-view]');
    if (b) show(b.getAttribute('data-view'));
  });
  var saved = 'public';
  try { saved = localStorage.getItem('datum.demoview') || 'public'; } catch (e) {}
  show(saved);
})(document);
`;

const demoCss = [read('./assets/styles.css'), read('./assets/app.css'),
                 read('./assets/admin.css'), SWITCH_CSS].join('\n\n');
const demoJs = ['vendor/gsap.min.js', 'vendor/ScrollTrigger.min.js',
                'src/ratebook.js', 'src/trees.js', 'src/store.js', 'src/rates.js',
                'src/engine.js', 'src/draw2d.js', 'src/router.js', 'src/hero.js',
                'src/flow.js', 'src/admin.js']
  .map((n) => read(`./${n}`))
  .join('\n;\n');

const demoBody =
  `<div id="app-public">\n${bodies.index}\n</div>\n` +
  `<div id="app-admin" hidden>\n${bodies.admin}\n</div>\n` +
  SWITCH_HTML;

const demoInlined = `<style>\n${demoCss}\n</style>\n\n${demoBody}\n\n<script>\n${demoJs}\n${SWITCH_JS}\n</script>\n`;

writeFileSync(
  new URL('./dist/demo.html', import.meta.url),
  `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Datum</title>
<meta name="description" content="Extension pricing platform — the client estimator and the rate book behind it.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
</head>
<body>
${demoInlined}</body>
</html>
`
);

writeFileSync(
  new URL('./dist/demo.artifact.html', import.meta.url),
  `<title>Datum</title>\n<link rel="stylesheet" href="${FONTS}">\n${demoInlined}`
);

console.log(`demo   → dist/demo.html ${(read('./dist/demo.html').length / 1024).toFixed(1)} KB   dist/demo.artifact.html ${(read('./dist/demo.artifact.html').length / 1024).toFixed(1)} KB`);
