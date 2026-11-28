/*
 * Datum — drawing tool, driven the way a careless person drives it.
 * ---------------------------------------------------------------------------
 * Not a unit test. It opens the real drawing tool in a real page and does
 * hundreds of real things to it in a random order — taps, drags, typed sizes,
 * every button, and a great deal of Undo and Redo — and after every single one
 * it checks that the tool is still somewhere a person could carry on from:
 *
 *   - the side panel and the drawing are on the same step
 *   - there is always a way forward (a Next, a question, or something to tap)
 *   - a house with no scale is being asked for one
 *   - nothing half-placed has been left behind on another step
 *   - no extension is standing on the house
 *   - nothing on screen says "undefined" or "NaN", and nothing threw
 *   - Undo then Redo puts back exactly what was there
 *
 * How to run it. Serve the folder, open the site, tick a build type, get to
 * the drawing step (#/draw), then in the browser console:
 *
 *     const t = await import('/tests/sketch-monkey.mjs');
 *     const report = await t.run({ seed: 1, steps: 400 });
 *     console.table(report.failures);
 *
 * Every failure carries the seed, the step number and the last few actions,
 * so `run({ seed, steps })` with the same numbers reproduces it exactly.
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (id) => document.getElementById(id);
const all = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
const shown = (el) => !!el && !el.hidden && el.offsetParent !== null && !el.disabled;

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- hands ----------------------------------------------------------------- */

function centre(el) {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}
function fire(type, x, y, target, touch) {
  const ev = new PointerEvent(type, {
    bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
    pointerId: 7, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
    pointerType: touch ? 'touch' : 'mouse'
  });
  (target || $('sk-svg')).dispatchEvent(ev);
}
function under(x, y) {
  const el = document.elementFromPoint(x, y), svg = $('sk-svg');
  return el && svg && svg.contains(el) ? el : svg;
}
async function tap(x, y, touch) {
  const t = under(x, y);
  fire('pointerdown', x, y, t, touch);
  fire('pointerup', x, y, t, touch);
  // a real browser follows a tap with a click on the same thing
  t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  await wait(40);
}
async function drag(x1, y1, x2, y2, touch) {
  const t = under(x1, y1), svg = $('sk-svg'), n = 6;
  fire('pointerdown', x1, y1, t, touch);
  for (let i = 1; i <= n; i++) {
    fire('pointermove', x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n, svg, touch);
    if (i === 2) await wait(20);
  }
  fire('pointerup', x2, y2, svg, touch);
  await wait(40);
}
function key(k, target) {
  (target || document).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

/* ---- what "still usable" means ------------------------------------------------ */

function inside(poly, p) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function nearEdge(poly, p, tol) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    if (Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)) < tol) return true;
  }
  return false;
}
const deepIn = (poly, p) => inside(poly, p) && !nearEdge(poly, p, 0.02);
const mid = (ring) => [ring.reduce((t, p) => t + p[0], 0) / ring.length, ring.reduce((t, p) => t + p[1], 0) / ring.length];

function badNumbers(v, path, out) {
  if (typeof v === 'number') { if (!isFinite(v) || v < -1e-6) out.push(path + '=' + v); }
  else if (v && typeof v === 'object') Object.keys(v).forEach((k) => badNumbers(v[k], path + '.' + k, out));
}

function check(S, SK, errors) {
  const f = [], fail = (inv, detail) => f.push({ inv, detail: String(detail || '') });
  const overlay = $('sk-overlay');
  if (!overlay || !overlay.classList.contains('on')) return f;            // closed: nothing to hold to
  if (errors.length) fail('threw', errors.splice(0).join(' | '));
  const say = ($('sk-say') || {}).textContent || '';
  if (/went wrong/i.test(say)) fail('says-went-wrong', say);

  if (!S.started) {
    if (!shown($('sk-choose'))) fail('not-started-but-no-first-screen');
    return f;
  }
  const ground = S.floors[0], floor = S.floors[S.active];
  if (!floor) { fail('no-such-floor', S.active + ' of ' + S.floors.length); return f; }

  // the step the panel is on is the step the tool is on
  const rail = all('#sk-stages [data-stage]'), here = rail.filter((b) => b.classList.contains('here'));
  if (!rail.some((b) => b.getAttribute('data-stage') === S.stage)) fail('step-not-on-rail', S.stage);
  if (here.length !== 1 || here[0].getAttribute('data-stage') !== S.stage) {
    fail('rail-out-of-step', 'tool on ' + S.stage + ', rail shows ' + here.map((b) => b.getAttribute('data-stage')).join(','));
  }
  if (!(($('sk-stagename') || {}).textContent || '').trim()) fail('no-heading');

  // a house with no scale is owed the measuring question, and gets it
  const calibUp = shown($('sk-calib')), upUp = shown($('sk-upstairs'));
  if (ground.closed && !S.scale && !calibUp) fail('unscaled-and-not-asked');
  if (calibUp !== !!S.calibrating) fail('measuring-panel-out-of-step', 'shown ' + calibUp + ', state ' + !!S.calibrating);
  if (upUp !== !!S.askUp) fail('upstairs-panel-out-of-step', 'shown ' + upUp + ', state ' + !!S.askUp);
  if (S.stage !== 'outline' && !(ground.closed && S.scale)) fail('past-shape-without-a-house', S.stage);

  // there is always something to do next
  const next = $('sk-next'), drawing = S.drawing && S.drawing.length;
  const canTap = (S.stage === 'outline' && !floor.closed) || drawing;
  if (!shown(next) && !calibUp && !upUp && !canTap) fail('no-way-forward', 'step ' + S.stage);

  // nothing half-placed on the wrong step
  const blockDrawn = !!document.querySelector('#sk-svg polygon.sk-block');
  if (S.block && S.stage !== 'outline') fail('part-left-on-another-step', S.stage);
  if (!!S.block !== blockDrawn) fail('part-drawn-out-of-step', 'state ' + !!S.block + ', drawn ' + blockDrawn);
  if (S.block && shown(next) && !/join/i.test(next.textContent)) fail('part-without-join-button', next.textContent);

  // an inside wall is a wall: it has a length, and both its ends are in the house
  S.floors.forEach((fl, fi) => {
    if (!fl.closed) return;
    const homes = [fl.outline].concat(S.extensions.filter((x) => x.closed && (fi === 0 || (fi === 1 && x.storeys > 1))).map((x) => x.outline));
    fl.internals.forEach((sg, k) => {
      if (Math.hypot(sg[1][0] - sg[0][0], sg[1][1] - sg[0][1]) < 0.2) fail('inside-wall-of-no-length', 'floor ' + fi + ' wall ' + k);
      sg.forEach((p) => {
        if (!homes.some((h) => inside(h, p) || nearEdge(h, p, 0.05))) fail('inside-wall-outside-the-house', 'floor ' + fi + ' wall ' + k);
      });
    });
    fl.openings.forEach((o) => {
      if (o.on === 'int' && !fl.internals[o.idx]) fail('doorway-in-a-wall-that-is-gone', 'floor ' + fi + ' wall ' + o.idx);
    });
  });

  // the list of room names only ever opens on the Rooms step
  if (shown($('sk-roommenu')) && S.stage !== 'rooms') fail('room-menu-on-another-step', S.stage);

  // nothing drawn on the plan sits on anything else: the × that removes a
  // thing, the + that adds a corner, and the length labels each have their own
  // clear spot, or a tap lands on the wrong one and nobody can read either
  if (!(S.drawing && S.drawing.length)) {
    const boxes = (sel, k) => all('#sk-svg ' + sel).map((el) => { const r = el.getBoundingClientRect(); return { k, r }; });
    const marks = [].concat(boxes('.sk-kill circle', 'x'), boxes('.sk-add circle', '+'), boxes('.sk-tag rect', 'label'),
      boxes('.sk-arrow circle', 'arrow'), boxes('.sk-moveh circle', 'move'), boxes('.sk-node', 'corner'));
    const clash = [];
    for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) {
      const a = marks[i], b = marks[j];
      const mine = a.k === 'x' || a.k === '+' || b.k === 'x' || b.k === '+' || (a.k === 'label' && b.k === 'label');
      if (!mine) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox > 2 && oy > 2) clash.push(a.k + ' on ' + b.k);
    }
    if (clash.length) fail('marks-on-top-of-each-other', S.stage + ': ' + clash.slice(0, 3).join(', '));
  }

  // the panel belongs to the step
  const side = (document.querySelector('.sk-side') || {}).innerText || '';
  if (S.stage === 'extension' && !S.calibrating && !S.askUp && !/storey/i.test(side)) fail('extension-step-without-its-tools');
  if (S.stage === 'garden' && !/garden/i.test(side)) fail('garden-step-without-its-tools');

  // indices point at things that exist
  if (S.extIdx < 0 || S.extIdx >= S.extensions.length) fail('no-such-extension', S.extIdx);
  if (S.pick && S.pick.kind === 'garea' && !S.garden.areas[S.pick.i]) fail('picked-surface-gone', S.pick.i);
  const tabs = all('#sk-floors [data-skfloor]');
  if (shown($('sk-floors')) && tabs.length !== S.floors.length) fail('floor-tabs-out-of-step', tabs.length + ' tabs, ' + S.floors.length + ' floors');

  // nothing is standing on the house
  if (ground.closed) {
    S.extensions.forEach((x, k) => {
      if (!x.closed || x.outline.length < 3) return;
      const on = x.outline.some((p) => deepIn(ground.outline, p)) || ground.outline.some((p) => deepIn(x.outline, p)) ||
        deepIn(ground.outline, mid(x.outline));
      if (on) fail('extension-on-the-house', 'extension ' + (k + 1));
    });
    // The house may come to lie over a patio (a part added to it later): that is
    // allowed, but then that much patio must not be priced. A surface wholly
    // under the house is worth nothing.
    try {
      const g = SK.measure().garden;
      S.garden.areas.forEach((a) => {
        const under = a.outline.every((p) => inside(ground.outline, p) || nearEdge(ground.outline, p, 0.02));
        if (under && g && g.areas[a.kind] > 0.6 && S.garden.areas.filter((o) => o.kind === a.kind).length === 1) {
          fail('surface-under-the-house-still-priced', a.kind + ' ' + g.areas[a.kind]);
        }
      });
    } catch (e) { /* measure() is checked on its own below */ }
  }

  // the numbers the price is built from are numbers
  try {
    const bad = [];
    badNumbers(SK.measure(), 'm', bad);
    if (bad.length) fail('bad-measurement', bad.slice(0, 4).join(', '));
  } catch (e) { fail('measure-threw', e.message); }

  // the guide always has something to say, and what it points at is really there
  const G = window.DATUM && window.DATUM.GUIDE;
  if (G) {
    try {
      const g = G.where();
      if (!g || !g.now) fail('guide-has-nothing-to-say', S.stage);
      if (g && g.target && (g.target.hidden || g.target.offsetParent === null) && g.target.id !== 'sk-svg') fail('guide-points-at-nothing', g.target.id || g.target.className);
      if (g && g.page === 'draw' && S.stage !== 'outline' && !g.target) fail('guide-points-nowhere', S.stage + ': ' + g.now.slice(0, 60));
      if (g && /undefined|NaN|“”/.test(g.now + g.then + g.sofar)) fail('guide-leaked-text', (g.now + ' | ' + g.then + ' | ' + g.sofar).slice(0, 160));
    } catch (e) { fail('guide-threw', e.message); }
  }

  // nothing on screen has leaked
  const texts = side + ' ' + all('#sk-svg text').map((t) => t.textContent).join(' ');
  const leak = texts.match(/undefined|NaN|\[object|null m|Infinity/);
  if (leak) fail('leaked-text', leak[0] + ' in: ' + texts.slice(Math.max(0, leak.index - 40), leak.index + 30));
  return f;
}

const parts = (S) => ({
  floors: S.floors.map((fl) => ({ o: fl.outline, c: fl.closed, i: fl.internals, op: fl.openings, mk: fl.markers })),
  ext: S.extensions, extIdx: S.extIdx, garden: S.garden, scale: S.scale, stage: S.stage, active: S.active,
  block: S.block, drawing: S.drawing || null, askUp: !!S.askUp, askedUp: !!S.askedUp, calibrating: !!S.calibrating
});
const picture = (S) => JSON.stringify(parts(S));
/** Which parts of two pictures differ, and how. */
function differs(a, b) {
  const x = JSON.parse(a), y = JSON.parse(b);
  return Object.keys(x).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]))
    .map((k) => k + ': ' + JSON.stringify(x[k]).slice(0, 70) + ' -> ' + JSON.stringify(y[k]).slice(0, 70)).join(' ; ');
}

/* ---- the things a person might do ---------------------------------------------- */

function actions(S, R) {
  const pick = (list) => list[Math.floor(R() * list.length)];
  const svgBox = () => $('sk-svg').getBoundingClientRect();
  const clickOne = (sel) => async () => {
    const els = all(sel).filter(shown);
    if (!els.length) return null;
    const el = pick(els);
    const label = (el.id || sel) + ':' + (el.textContent || '').trim().slice(0, 18);
    el.click();
    return label;
  };
  const twice = (sel) => async () => {
    let el = all(sel).filter(shown)[0];
    if (!el) return null;
    el.click(); await wait(40);
    el = all(sel).filter(shown)[0];
    if (el) el.click();
    return sel + ' x2';
  };
  const touchy = () => R() < 0.3;

  return [
    // getting started
    [6, async () => {
      if (S.started || !shown($('sk-choose'))) return null;
      if (R() < 0.75) {
        $('sk-box-w').value = String(3 + Math.round(R() * 18) / 2);
        $('sk-box-d').value = String(3 + Math.round(R() * 22) / 2);
        $('sk-box-go').click();
        return 'start from sizes';
      }
      $('sk-blank').click();
      return 'start blank';
    }],
    // the big button, whatever it currently is — but never the one that leaves
    [14, async () => {
      const n = $('sk-next');
      if (!shown(n) || n.getAttribute('data-act') === 'sk-finish') return null;
      const label = 'next:' + n.textContent.trim();
      n.click();
      return label;
    }],
    [12, clickOne('#sk-undo')],
    [7, clickOne('#sk-redo')],
    [6, clickOne('#sk-stages [data-stage]')],
    [5, clickOne('#sk-upstairs [data-up]')],
    [5, clickOne('#sk-addblock')],
    [2, clickOne('#sk-cancelblock')],
    [5, clickOne('#sk-addext')],
    [3, clickOne('#sk-addext2')],
    [2, clickOne('#sk-dropext')],
    [2, clickOne('[data-skext]')],
    [2, clickOne('[data-storeys]')],
    [4, clickOne('#sk-addplot')],
    [5, clickOne('[data-gadd]')],
    [2, clickOne('[data-gmode]')],
    [2, clickOne('#sk-droparea')],
    [1, twice('#sk-dropplot')],
    [3, clickOne('#sk-floors [data-skfloor]')],
    // a floor above always arrives with a shape: the one underneath it
    [2, async () => {
      const b = all('#sk-addfloor2, #sk-addfloor').filter(shown)[0];
      if (!b) return null;
      const had = S.floors.length, below = S.floors.slice().reverse().find((f) => f.closed);
      b.click();
      const top = S.floors[had];
      // thrown, so it is reported like anything else that goes wrong in an action
      if (top && below && (!top.closed || JSON.stringify(top.outline) !== JSON.stringify(below.outline))) {
        throw new Error('floor-above-not-a-copy: floor ' + had);
      }
      return 'add a floor above';
    }],
    [1, twice('#sk-dropfloor')],
    [1, clickOne('#sk-redraw')],
    [1, clickOne('#sk-recal')],
    [4, clickOne('#sk-calib-go')],
    [6, clickOne('#sk-addwall')],
    [5, clickOne('#sk-doorway:not([disabled]), #sk-turnwall:not([disabled]), #sk-wallout:not([disabled])')],
    [2, clickOne('[data-width], #sk-del')],
    [2, clickOne('[data-kind]')],
    [7, clickOne('#sk-roommenu [data-pickroom], #sk-roommenu-remove')],
    // name a room the way a person does: tap in the house, then press what it is
    [6, async () => {
      const fl = document.querySelector('#sk-svg polygon.sk-floor');
      if (S.stage !== 'rooms' || !fl) return null;
      const b = fl.getBoundingClientRect();
      await tap(b.left + b.width * (0.15 + R() * 0.7), b.top + b.height * (0.15 + R() * 0.7), touchy());
      const opts = all('#sk-roommenu [data-pickroom], #sk-roommenu-remove').filter(shown);
      if (!opts.length) return 'tap a room (no list)';
      const o = pick(opts);
      o.click();
      return 'name a room ' + (o.textContent || '').trim();
    }],
    [1, clickOne('#sk-typed-open')],
    [4, clickOne('.sk-fold > summary')],
    // hands on the drawing
    [8, async () => {
      const b = svgBox();
      const x = b.left + 20 + R() * (b.width - 40), y = b.top + 50 + R() * (b.height - 70);
      await tap(x, y, touchy());
      return 'tap canvas';
    }],
    [7, async () => {
      const hs = all('#sk-svg .sk-arrow');
      if (!hs.length) return null;
      const c = centre(pick(hs)), ang = R() * Math.PI * 2, d = 20 + R() * 140;
      await drag(c[0], c[1], c[0] + Math.cos(ang) * d, c[1] + Math.sin(ang) * d, touchy());
      return 'drag an arrow';
    }],
    [5, async () => {
      const hs = all('#sk-svg .sk-moveh');
      if (!hs.length) return null;
      const c = centre(pick(hs));
      await drag(c[0] + 3, c[1] + 3, c[0] + (R() - 0.5) * 320, c[1] + (R() - 0.5) * 320, touchy());
      return 'drag by the middle';
    }],
    [5, async () => {
      const hs = all('#sk-svg circle.sk-node');
      if (!hs.length) return null;
      const c = centre(pick(hs));
      await drag(c[0], c[1], c[0] + (R() - 0.5) * 200, c[1] + (R() - 0.5) * 200, touchy());
      return 'drag a corner';
    }],
    [3, async () => {
      const hs = all('#sk-svg .sk-add');
      if (!hs.length) return null;
      const c = centre(pick(hs));
      await tap(c[0], c[1], touchy());
      return 'tap +';
    }],
    [3, async () => {
      const hs = all('#sk-svg .sk-kill');
      if (!hs.length) return null;
      const c = centre(hs[0]);
      await tap(c[0], c[1], touchy());
      return 'tap ×';
    }],
    [6, async () => {
      const hs = all('#sk-svg .sk-tag.tap');
      if (!hs.length) return null;
      const c = centre(pick(hs));
      await tap(c[0], c[1]);
      const inp = $('sk-lenedit-in');
      if (!shown(inp)) return 'tap a size (no box)';
      const v = pick(['0', '', '0.2', '100', '2', '3.5', '4.25', '6', '9', '12.5', '1']);
      inp.value = v;
      if (R() < 0.85) key('Enter', inp); else key('Escape', inp);
      return 'type a size ' + (v || '(empty)');
    }],
    [1, async () => { key('Escape', $('sk-overlay')); return 'escape'; }]
  ];
}

/* ---- the run --------------------------------------------------------------------- */

export async function run(opts) {
  const o = Object.assign({ seed: 1, steps: 300, pause: 45, maxFailures: 40 }, opts || {});
  const SK = window.DATUM && window.DATUM.SKETCH, S = SK && SK._S;
  if (!S) throw new Error('The drawing tool is not on this page.');
  const R = rng(o.seed), errors = [], failures = [], seen = {}, done = {}, trail = [];
  const onErr = (e) => errors.push((e.message || (e.reason && e.reason.message) || String(e.reason || e)).slice(0, 140));
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onErr);

  const reopen = async () => {
    if (!$('sk-overlay').classList.contains('on')) {
      if (location.hash !== '#/draw') location.hash = '#/draw';
      else { location.hash = '#/start'; await wait(120); location.hash = '#/draw'; }
      await wait(500);
    }
  };
  const note = (found, step, what) => found.forEach((f) => {
    const k = f.inv + '|' + f.detail.replace(/[0-9.]+/g, '#');
    if (seen[k] || failures.length >= o.maxFailures) return;
    seen[k] = 1;
    failures.push({ inv: f.inv, detail: f.detail, seed: o.seed, step, after: what, trail: trail.slice(-8).join(' > ') });
  });

  try {
    await reopen();
    // a clean start, so the same seed always does the same thing
    if (S.started) { $('sk-restart').click(); await wait(60); $('sk-restart').click(); await wait(200); }
    const acts = actions(S, R), total = acts.reduce((t, a) => t + a[0], 0);

    for (let step = 1; step <= o.steps; step++) {
      await reopen();
      let what = null, tries = 0;
      while (!what && tries++ < 12) {
        let r = R() * total, a = acts[0];
        for (let i = 0; i < acts.length; i++) { r -= acts[i][0]; if (r <= 0) { a = acts[i]; break; } }
        try { what = await a[1](); } catch (e) { what = 'threw in action'; errors.push('action: ' + e.message); }
      }
      if (!what) continue;
      trail.push(what);
      done[what.split(':')[0]] = (done[what.split(':')[0]] || 0) + 1;
      await wait(o.pause);
      note(check(S, SK, errors), step, what);

      // every so often: undo as far as it will go, redo all of it, and expect the same drawing back
      if (S.started && step % 9 === 0 && $('sk-overlay').classList.contains('on') && !(S.drawing && S.drawing.length)) {
        const before = picture(S), redoWas = SK._depth()[1];
        let n = 0;
        while (n < 30 && SK._depth()[0] > 0) {
          const p = picture(S);
          $('sk-undo').click(); await wait(25);
          n++;
          // one press of Undo takes something back, every time
          if (picture(S) === p && SK._depth()[0] > 0) note([{ inv: 'undo-did-nothing', detail: '' }], step, 'undo ' + n);
          note(check(S, SK, errors), step, 'undo ' + n + ' (round trip)');
        }
        let back = 0;
        // forward again by exactly as far as we went back: older redo entries are not ours
        while (back < 40 && SK._depth()[1] > redoWas) {
          $('sk-redo').click(); await wait(25);
          back++;
          note(check(S, SK, errors), step, 'redo ' + back + ' (round trip)');
        }
        if (n && picture(S) !== before) {
          note([{ inv: 'undo-redo-not-the-same', detail: n + ' back and forward. ' + differs(before, picture(S)) }], step, 'round trip');
        }
        trail.push('round trip x' + n);
      }
    }
  } finally {
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onErr);
  }
  return { seed: o.seed, steps: o.steps, failures, did: done };
}
