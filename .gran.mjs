import { chromium } from 'playwright';
const SP='/tmp/claude-0/-home-user-BuildingQuotes/cea6cd11-69a6-58d3-823a-1526f65658d8/scratchpad';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs = [];
async function grandma(label, opts, shot) {
  const ctx = await b.newContext(opts);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(label+' '+e.message));
  pg.on('console', m => { const t=m.text(); if (m.type()==='error' && !/ERR_CONNECTION_RESET|404|fonts/.test(t)) errs.push(label+' '+t); });
  const at = (x,y) => pg.locator('#sk-svg').evaluate((s,p)=>{const pt=s.createSVGPoint();pt.x=p[0]*44;pt.y=p[1]*44;
    const q=pt.matrixTransform(s.getScreenCTM());return{x:q.x,y:q.y};},[x,y]);
  async function tap(x,y){ const s=await at(x,y); await pg.mouse.click(s.x,s.y); await pg.waitForTimeout(120); }
  const M = () => pg.evaluate(()=>window.DATUM.SKETCH.measure());
  const hint = () => pg.locator('#sk-hint').innerText();
  const next = () => pg.locator('#sk-next').innerText().catch(()=>'(none)');

  console.log(`\n===== ${label}: grandma, taps only, never draws a line =====`);
  await pg.goto('http://127.0.0.1:8788/dist/index.html#/start', { waitUntil: 'networkidle' });
  await pg.evaluate(()=>localStorage.clear()); await pg.reload({ waitUntil: 'networkidle' }); await pg.waitForTimeout(300);
  await pg.locator('[data-pick="renovation"]').click(); await pg.waitForTimeout(150);
  await pg.locator('#start-go').click(); await pg.waitForTimeout(400);
  await pg.locator('#sk-blank').click(); await pg.waitForTimeout(300);
  console.log('1. sees:', await pg.locator('#sk-stagename').innerText(), '—', await hint());
  console.log('   shapes offered:', await pg.locator('.sk-shapes button').allInnerTexts());

  await pg.locator('[data-shape="l"]').click(); await pg.waitForTimeout(400);
  console.log('2. picked L →', await pg.locator('#sk-stagename').innerText(), '—', await hint());
  console.log('   label:', await pg.locator('#sk-len-label').innerText(), '| prefilled:', await pg.locator('#sk-len').inputValue(),
              await pg.locator('#sk-unit').innerText(), '| button:', await pg.locator('#sk-calib-go').innerText());
  await pg.screenshot({ path: `${SP}/${shot}-1.png` });

  // she thinks in feet
  await pg.locator('[data-units="ft"]').click(); await pg.waitForTimeout(150);
  console.log('   switched to feet → field shows', await pg.locator('#sk-len').inputValue(), await pg.locator('#sk-unit').innerText());
  await pg.locator('#sk-len').fill('30');
  await pg.locator('#sk-calib-go').click(); await pg.waitForTimeout(400);
  let m = await M();
  console.log('3. 30 ft across the front → footprint', m.footprint.toFixed(1), 'm² (30 ft = 9.14 m; L shape ≈ 0.86 of 9.1×7.1)');
  console.log('   now asked:', await pg.locator('#sk-stagename').innerText(), '—', await hint());
  console.log('   options:', await pg.locator('#sk-upstairs button').allInnerTexts());
  await pg.screenshot({ path: `${SP}/${shot}-2.png` });

  await pg.locator('[data-up="same"]').click(); await pg.waitForTimeout(400);
  m = await M();
  console.log('4. said yes → floors', m.floors, '| total', m.totalArea.toFixed(1), 'm² | floor tabs:', await pg.locator('#sk-floors button').allInnerTexts());
  console.log('   next button:', await next());

  await pg.locator('#sk-next').click(); await pg.waitForTimeout(300);
  console.log('5.', await pg.locator('#sk-stagename').innerText(), '—', await hint());
  // rooms downstairs, no walls drawn at all
  for (const [t,x,y] of [['hall',1.5,1.5],['living',6.5,1.5],['kitchen',3,5.5],['wc',1.2,4]]) {
    await pg.locator(`[data-room="${t}"]`).click(); await tap(x,y);
  }
  m = await M();
  console.log('   labelled 4 rooms with no walls →', m.rooms.length, 'kept:', m.rooms.join(','));
  console.log('   next button now:', await next(), '| hint:', await hint());

  await pg.locator('#sk-next').click(); await pg.waitForTimeout(350);
  console.log('6. auto-switched to floor', await pg.evaluate(()=>window.DATUM.SKETCH._S.active), '—', await hint());
  for (const [t,x,y] of [['bedroom',1.5,1.5],['bedroom',6.5,1.5],['bedroom',3,5.5],['bathroom',1.2,4]]) {
    await pg.locator(`[data-room="${t}"]`).click(); await tap(x,y);
  }
  m = await M();
  console.log('   upstairs rooms →', m.rooms.length, 'total | inside walls estimated:', m.internalEstimated, '→', m.internalWall.toFixed(1), 'm');
  console.log('   next button now:', await next());
  await pg.screenshot({ path: `${SP}/${shot}-3.png` });

  await pg.locator('#sk-next').click(); await pg.waitForTimeout(300);
  console.log('7.', await pg.locator('#sk-stagename').innerText(), '—', await hint());
  console.log('   choices:', await pg.locator('[data-kind]').allInnerTexts());
  await pg.locator('[data-kind="door"]').click(); await tap(2, 0);
  await pg.locator('[data-kind="window"]').click(); await tap(6, 0); await tap(0, 3);
  m = await M();
  console.log('   placed →', m.extDoors, 'door,', m.windows, 'windows');

  await pg.locator('#sk-next').click(); await pg.waitForTimeout(300);
  console.log('8.', await pg.locator('#sk-stagename').innerText(), '—', await hint(), '| choices:', await pg.locator('[data-wallmode]').allInnerTexts());
  console.log('   (she skips it)');
  await pg.locator('#sk-next').click(); await pg.waitForTimeout(300);
  console.log('9.', await pg.locator('#sk-stagename').innerText(), '—', await hint());
  await pg.locator('#sk-addext').click(); await pg.waitForTimeout(400);
  m = await M();
  console.log('   tapped "Add a rear extension" →', m.extension ? m.extension.area.toFixed(1)+' m², '+m.extension.width.toFixed(1)+' × '+m.extension.depth.toFixed(1) : 'none');
  await pg.screenshot({ path: `${SP}/${shot}-4.png` });

  const chk = await pg.locator('#sk-checks').isVisible();
  console.log('10. checks:', chk ? (await pg.locator('#sk-checks').innerText()).replace(/\n/g,' | ') : 'clean');
  console.log('    readout:', (await pg.locator('#sk-read').innerText()).replace(/\n/g,' | '));
  await pg.locator('#sk-apply').click(); await pg.waitForTimeout(700);
  for (let i=0;i<12;i++){ const nx = pg.locator('#flow-ask .flow-nav a.btn:not(.btn-ghost)');
    if (!(await nx.count())) break; await nx.click(); await pg.waitForTimeout(250);
    if ((await pg.evaluate(()=>location.hash))==='#/estimate') break; }
  console.log('11. →', await pg.evaluate(()=>location.hash), (await pg.locator('body').innerText()).match(/£[\d,]+/g).slice(0,2).join('–'));
  await ctx.close();
}
await grandma('desktop', { viewport: { width: 1280, height: 950 } }, 'g');
await grandma('phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 'gm');
console.log('\nerrors:', errs.length ? [...new Set(errs)] : 'none');
await b.close();
