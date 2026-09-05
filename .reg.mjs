import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs = [];
process.stdout.write('routes: ');
for (const route of ['#/', '#/start', '#/draw', '#/extension/build', '#/renovation/work', '#/renovation/house',
                     '#/loft/size', '#/newbuild/form', '#/external/area', '#/estimate']) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(route + ' ' + e.message));
  pg.on('console', m => { const t=m.text(); if (m.type()==='error' && !/ERR_CONNECTION_RESET|404|fonts/.test(t)) errs.push(route+' '+t); });
  await pg.goto('http://127.0.0.1:8788/dist/index.html' + route, { waitUntil: 'networkidle' });
  await pg.waitForTimeout(280); process.stdout.write('·');
  await ctx.close();
}
console.log(' ok');
for (const [label, opts] of [['desktop', { viewport:{width:1280,height:950} }],
                             ['phone', { viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 }]]) {
  const ctx = await b.newContext(opts); const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(label+' '+e.message));
  pg.on('console', m => { const t=m.text(); if (m.type()==='error' && !/ERR_CONNECTION_RESET|404|fonts/.test(t)) errs.push(label+' '+t); });
  await pg.goto('http://127.0.0.1:8788/dist/index.html#/start', { waitUntil: 'networkidle' });
  await pg.evaluate(()=>localStorage.clear()); await pg.reload({ waitUntil: 'networkidle' }); await pg.waitForTimeout(300);
  for (const t of ['extension','renovation','loft']) { await pg.locator(`[data-pick="${t}"]`).click(); await pg.waitForTimeout(100); }
  await pg.locator('#start-go').click(); await pg.waitForTimeout(400);
  await pg.locator('#sk-example').click(); await pg.waitForTimeout(500);
  const m = await pg.evaluate(()=>window.DATUM.SKETCH.measure());
  await pg.locator('#sk-apply').click(); await pg.waitForTimeout(700);
  const seen = [];
  for (let i=0;i<20;i++){ const h = await pg.evaluate(()=>location.hash); if (h==='#/estimate') break;
    (await pg.locator('#flow-ask .q-title').allInnerTexts()).forEach(t=>seen.push(t.trim()));
    const nx = pg.locator('#flow-ask .flow-nav a.btn:not(.btn-ghost)'); if (!(await nx.count())) break;
    await nx.click(); await pg.waitForTimeout(240); }
  const dupes = [...new Set(seen.filter((t,i)=>seen.indexOf(t)!==i))];
  console.log(label, '· example house', m.totalArea.toFixed(0)+'m²', m.rooms.length+' rooms →',
    await pg.evaluate(()=>location.hash), (await pg.locator('body').innerText()).match(/£[\d,]+/g).slice(0,2).join('–'),
    '| questions', seen.length, '| dupes', dupes.length ? dupes : 'none');
  await ctx.close();
}
const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } }); const pg = await ctx.newPage();
pg.on('pageerror', e => errs.push('admin ' + e.message));
await pg.goto('http://127.0.0.1:8788/dist/admin.html', { waitUntil: 'networkidle' }); await pg.waitForTimeout(500);
await pg.locator('#sidenav button', { hasText: 'Renovations' }).first().click(); await pg.waitForTimeout(400);
console.log('admin:', (await pg.locator('#rail').innerText()).split('\n').filter(Boolean)[3]);
console.log('errors:', errs.length ? [...new Set(errs)] : 'none');
await b.close();
