/*
 * Datum — the whole journey, for every kind of project.
 * ---------------------------------------------------------------------------
 * Picks build types, draws a house, then answers every question page with
 * random answers all the way to the estimate, and checks at each page that:
 *
 *   - nothing on screen says "undefined", "NaN" or "[object"
 *   - there is a way on (a Next, or the estimate itself)
 *   - nothing threw
 *   - the estimate is two real numbers, low no more than high
 *   - a job with nothing chosen says so, and a job with work in it has lines
 *
 * Run it from the browser console on the site, from any page:
 *
 *     const t = await import('/tests/flow-walk.mjs');
 *     console.table((await t.run({ seed: 1 })).failures);
 *
 * It clears the saved drawing and project first, and again when it finishes.
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
const money = (el) => Number(((el && el.textContent) || '').replace(/[^0-9.]/g, ''));

// the six cards on the chooser, by position: extension, renovation, loft, new build, outdoor, outbuilding
const PROJECTS = [[0], [1], [2], [3], [4], [5], [0, 1], [0, 2], [0, 1, 4], [1, 2, 5], [0, 4, 5]];

export async function run(opts) {
  const o = Object.assign({ seed: 1, projects: PROJECTS, answers: true }, opts || {});
  const R = rng(o.seed), failures = [], errors = [];
  const onErr = (e) => errors.push((e.message || (e.reason && e.reason.message) || String(e.reason || e)).slice(0, 160));
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onErr);
  const fail = (project, where, inv, detail) => failures.push({ project: project.join('+'), where, inv, detail: String(detail || '').slice(0, 200), seed: o.seed });
  const page = (project, where) => {
    if (errors.length) fail(project, where, 'threw', errors.splice(0).join(' | '));
    const view = document.querySelector('.view.on'), text = (view && view.innerText) || '';
    const leak = text.match(/undefined|NaN|\[object|Infinity/);
    if (leak) fail(project, where, 'leaked-text', text.slice(Math.max(0, leak.index - 50), leak.index + 30).replace(/\s+/g, ' '));
  };

  try {
    for (const project of o.projects) {
      // a clean visitor every time
      ['datum.drawing.v1', 'datum.project.v1'].forEach((k) => localStorage.removeItem(k));
      const SK = window.DATUM.SKETCH;
      if (SK && SK.reset) SK.reset();
      location.hash = '#/'; await wait(250);
      location.hash = '#/start'; await wait(500);
      // untick whatever is ticked, then tick this project's cards
      for (let guard = 0; guard < 8; guard++) {
        const on = all('#start-grid > *').findIndex((c) => c.getAttribute('aria-pressed') === 'true');
        if (on < 0) break;
        all('#start-grid > *')[on].click(); await wait(120);
      }
      for (const i of project) { all('#start-grid > *')[i].click(); await wait(150); }
      const pressed = all('#start-grid > *').map((c, i) => (c.getAttribute('aria-pressed') === 'true' ? i : -1)).filter((i) => i >= 0);
      // a new build stands alone, so ticking it with others is expected to leave fewer ticked
      if (!pressed.length) { fail(project, 'chooser', 'nothing-ticked', ''); continue; }
      page(project, 'chooser');
      const go = $('start-go');
      if (!shown(go)) { fail(project, 'chooser', 'no-way-forward', 'no start button'); continue; }
      go.click(); await wait(900);

      // draw: a house from its sizes, then straight through the steps
      if (location.hash === '#/draw') {
        if (!shown($('sk-choose'))) { fail(project, 'draw', 'no-first-screen', ''); continue; }
        $('sk-box-w').value = String(4 + Math.round(R() * 10) / 2);
        $('sk-box-d').value = String(5 + Math.round(R() * 12) / 2);
        $('sk-box-go').click(); await wait(500);
        for (let guard = 0; guard < 14 && $('sk-overlay').classList.contains('on'); guard++) {
          page(project, 'draw:' + SK._S.stage);
          if (shown($('sk-upstairs'))) { const yes = R() < 0.5, had = SK._S.floors.length;
            all('#sk-upstairs [data-up]')[yes ? 0 : 1].click(); await wait(500);
            // an upstairs arrives as the same shape as downstairs, ready to change
            if (yes) {
              const fl = SK._S.floors;
              if (fl.length !== had + 1 || !fl[had].closed || JSON.stringify(fl[had].outline) !== JSON.stringify(fl[had - 1].outline)) {
                fail(project, 'draw', 'upstairs-not-a-copy-of-downstairs', '');
              }
            }
            continue; }
          // put something on the steps that have a one-press way to
          const add = [$('sk-addext'), $('sk-addplot')].filter(shown)[0];
          if (add && R() < 0.8) { add.click(); await wait(400); }
          if (SK._S.stage === 'garden' && SK._S.garden.plot.closed && R() < 0.7) {
            const g = all('[data-gadd]').filter(shown);
            if (g.length) { g[Math.floor(R() * g.length)].click(); await wait(300); }
          }
          // inside walls: a few of them, and sometimes a doorway or one coming out
          if (SK._S.stage === 'internal' && shown($('sk-addwall'))) {
            const n = Math.floor(R() * 4);
            for (let k = 0; k < n; k++) { $('sk-addwall').click(); await wait(200); }
            for (const id of ['sk-doorway', 'sk-wallout']) {
              if (n && R() < 0.4 && $(id) && !$(id).disabled) { $(id).click(); await wait(200); }
            }
          }
          const next = $('sk-next');
          if (!shown(next)) { fail(project, 'draw:' + SK._S.stage, 'no-way-forward', ''); break; }
          next.click(); await wait(600);
        }
        if ($('sk-overlay').classList.contains('on')) { fail(project, 'draw', 'never-finished', SK._S.stage); continue; }
      }

      // the question pages, to the estimate
      let reached = false;
      for (let guard = 0; guard < 40; guard++) {
        await wait(350);
        const where = location.hash;
        page(project, where);
        if (/estimate/.test(where)) { reached = true; break; }
        const ask = $('flow-ask');
        if (o.answers && ask) {
          // press a random choice in most groups, nudge most steppers, add the odd tree
          for (const seg of all('.seg[data-meas], .seg[data-mod], .seg[data-soil]', ask)) {
            if (R() < 0.7) { const b = all('button', seg); b[Math.floor(R() * b.length)].click(); await wait(40); }
          }
          for (const lv of all('[data-level]', ask)) { if (R() < 0.25) { lv.click(); await wait(30); } }
          for (const st of all('[data-nudge][data-dir="1"]', ask)) {
            const n = Math.floor(R() * 4);
            for (let k = 0; k < n; k++) { st.click(); await wait(15); }
          }
          for (const st of all('[data-nudge][data-dir="-1"]', ask)) { if (R() < 0.3) { st.click(); await wait(15); } }
          if ($('tree-add') && R() < 0.4) { $('tree-add').click(); await wait(80); }
          await wait(120);
          page(project, where + ' (answered)');
        }
        const next = all('#flow-ask a.btn, #flow-ask button.btn').filter(shown).filter((b) => /next|estimate|on to/i.test(b.textContent))[0];
        if (!next) { fail(project, where, 'no-way-forward', (ask ? ask.innerText : '').replace(/\s+/g, ' ').slice(0, 120)); break; }
        next.click();
      }
      if (!reached) { fail(project, location.hash, 'never-reached-estimate', ''); continue; }

      // the estimate itself
      await wait(1900);                                     // the figures count up
      // in a tab that is not on screen nothing animates, and the figures would
      // sit at nought for ever: finish whatever is still counting
      try { if (window.gsap) window.gsap.globalTimeline.getChildren(true, true, true).forEach((t) => t.progress(1)); } catch (e) { /* no animation library */ }
      await wait(60);
      page(project, 'estimate');
      const lo = money($('fig-low')), hi = money($('fig-high')), items = ($('items') || {}).innerText || '';
      const note = ($('readout-note') || {}).textContent || '';
      if (!isFinite(lo) || !isFinite(hi) || lo > hi) fail(project, 'estimate', 'bad-figures', lo + ' to ' + hi);
      if (hi === 0 && !/nothing chosen/i.test(note)) fail(project, 'estimate', 'nought-without-saying-why', note);
      if (hi > 0 && !/£/.test(items)) fail(project, 'estimate', 'price-with-no-lines', '');
      if (hi > 0 && /nothing chosen/i.test(note)) fail(project, 'estimate', 'says-nothing-chosen-but-priced', hi);
      // and back out the way a person would
      const back = $('result-back');
      if (!shown(back)) fail(project, 'estimate', 'no-way-back', '');
    }
  } finally {
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onErr);
    ['datum.drawing.v1', 'datum.project.v1'].forEach((k) => localStorage.removeItem(k));
  }
  return { seed: o.seed, projects: o.projects.length, failures };
}
