/*
 * Datum — the guide
 * ---------------------------------------------------------------------------
 * Nobody should ever be lost. Wherever somebody is — choosing the work,
 * drawing the house, answering questions, reading the price — this can say, in
 * a sentence, where they are, what to do now and what comes after, and can put
 * a glow on the one thing to press next.
 *
 * There is ONE brain, `where()`. It reads the page as it actually is: the
 * route, the drawing tool's own state, and which buttons are really on screen.
 * The Help panel, the glow and the "stuck?" nudge are three faces of that one
 * answer, so the guide cannot say one thing while the screen shows another —
 * and tests/sketch-monkey.mjs checks, after every random action, that it has
 * something to say and that whatever it points at is really there.
 *
 * It is optional. The glow can be switched off and stays off; the panel only
 * opens when Help is pressed. Nothing here changes what the site does.
 */
(function (root, doc) {
  'use strict';

  var KEY = 'datum.guide.v1';
  var $ = function (id) { return doc.getElementById(id); };
  var shown = function (el) { return !!el && !el.hidden && el.offsetParent !== null; };
  var SK = function () { return root.DATUM && root.DATUM.SKETCH; };

  var pref = { glow: true, seen: false };
  try { var saved = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (saved) { pref.glow = saved.glow !== false; pref.seen = !!saved.seen; } } catch (e) {}
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) {} }

  var JOURNEY = ['Say what you are building', 'Draw your house', 'Answer a few questions', 'See your price'];
  var AFTER = { extension: 'your extension', garden: 'your garden', internal: 'the inside walls',
                openings: 'doors and windows', rooms: 'naming the rooms' };

  /* ---- the brain -------------------------------------------------------------- */

  function pageName() {
    var ov = $('sk-overlay');
    if (ov && ov.classList.contains('on')) return 'draw';
    var parts = root.location.hash.replace(/^#/, '').split('/').filter(Boolean);
    if (!parts.length) return 'landing';
    if (parts[0] === 'start') return 'start';
    if (parts[0] === 'draw') return 'draw';
    if (parts[0] === 'estimate' || parts[1] === 'estimate') return 'estimate';
    return 'step';
  }

  /** What has been built so far, in one line. */
  function soFar() {
    var sk = SK(), S = sk && sk._S;
    if (!S || !S.started) return '';
    var m;
    try { m = sk.measure(); } catch (e) { return ''; }
    if (!m || !m.scaled || !m.totalArea) return '';
    var bits = ['a house of ' + m.totalArea.toFixed(0) + ' m² on ' + (m.floors === 1 ? 'one floor' : m.floors + ' floors')];
    var xs = m.extensions || [];
    if (xs.length) {
      var xa = xs.reduce(function (t, x) { return t + x.area * x.storeys; }, 0);
      bits.push((xs.length === 1 ? 'an extension' : xs.length + ' extensions') + ' of ' + xa.toFixed(0) + ' m²');
    }
    if (m.rooms && m.rooms.length) bits.push(m.rooms.length + (m.rooms.length === 1 ? ' room named' : ' rooms named'));
    if (m.garden) bits.push('a garden');
    return 'So far: ' + bits.join(', ') + '.';
  }

  function drawing() {
    var sk = SK(), S = sk && sk._S, next = $('sk-next');
    var out = { sub: '', now: '', target: null, then: '' };
    if (!S) return out;
    var nextOn = shown(next), nextTxt = nextOn ? next.textContent : '';

    if (!S.started) {
      out.sub = 'The size of your house';
      out.now = 'Type roughly how wide and how deep your house is. A guess is fine. Then press “Draw my house”.';
      out.target = $('sk-box-go');
      out.then = 'After this: you can add any part that sticks out, then your extension.';
      return out;
    }
    var head = ($('sk-stagename') || {}).textContent || '', of = ($('sk-of') || {}).textContent || '';
    out.sub = head + (of ? ' · ' + of.toLowerCase() : '');
    var go = /^Next — (.+)$/.exec(nextTxt);
    var stageAfter = go ? go[1] : '';
    out.then = /^Done/.test(nextTxt) ? 'After this: a few questions, then your price.'
      : stageAfter ? 'After this: ' + (AFTER[{ extension: 'extension', garden: 'garden', 'inside walls': 'internal', 'doors & windows': 'openings', rooms: 'rooms' }[stageAfter]] || stageAfter) + '.'
      : '';

    if (S.calibrating) {
      out.now = 'Type how long the orange wall is, then press “That’s it”. A rough guess is fine.';
      out.target = $('sk-calib-go');
      return out;
    }
    if (S.askUp) {
      out.now = 'Does your house have an upstairs? Press Yes or No. Yes adds it, the same shape as downstairs, and you can change it.';
      out.target = $('sk-upstairs');
      return out;
    }
    var run = S.drawing && S.drawing.length, f = S.floors[S.active] || S.floors[0];
    var runText = run > 2
      ? 'Carry on round the corners. To finish, tap the first corner again, or press the blue button.'
      : 'Tap the next corner, going round the outside.';

    if (S.stage === 'outline') {
      if (!S.block && !run && S.pick && S.pick.kind === 'corner') {
        out.now = 'The blue dot is the corner you picked. Drag it to where it is on your house, or tap the red × to take it away. Tap an empty part of the grid to let go of it.';
        out.target = $('sk-svg');
      } else if (S.block) {
        out.now = 'Drag the new part to where it is on your house. Drag its arrows to make it the right size. Then press “Join it to the house”.';
        out.target = next;
      } else if (run) {
        out.now = runText; out.target = run > 2 ? next : $('sk-svg');
      } else if (!f.closed) {
        if (nextOn) { out.now = 'Press the blue button to start this floor the same shape as the one below. You can change it after.'; out.target = next; }
        else { out.now = 'Tap each outside corner of your house on the grid, going round until you are back where you started.'; out.target = $('sk-svg'); }
      } else if (S.active > 0) {
        out.now = 'This is the ' + String(f.name || 'floor above').toLowerCase() + '. It starts the same shape as the floor below. If yours is different, drag a blue arrow or tap a number. When it looks right, press “' + (nextTxt || 'Next') + '”.';
        out.target = next;
      } else {
        out.now = 'Check the sizes look about right. To change one, drag a blue arrow or tap a number. If part of your house sticks out, press “Add a part that sticks out”. When it looks right, press “' + (nextTxt || 'Next') + '”.';
        out.target = next;
      }
      return out;
    }
    if (S.stage === 'extension') {
      var has = S.extensions.some(function (x) { return x.closed; }), add = $('sk-addext');
      if (run) { out.now = runText; out.target = run > 2 ? next : $('sk-svg'); }
      else if (!has && shown(add) && !/btn-ghost/.test(add.className)) {
        out.now = 'Press “Add an extension”. It appears on the back of your house, ready to move.';
        out.target = add;
      } else if (!has) {
        out.now = 'Building an extension? Press “Add an extension”. If not, press “' + nextTxt + '”.';
        out.target = next;
      } else {
        out.now = 'Drag the extension to where you want it. Drag its arrows to make it the right size, or tap a number to type one. Then press “' + nextTxt + '”.';
        out.target = next;
      }
      return out;
    }
    if (S.stage === 'garden') {
      var plot = S.garden.plot.closed, addP = $('sk-addplot');
      if (run) { out.now = runText; out.target = run > 2 ? next : $('sk-svg'); }
      else if (!plot && shown(addP) && !/btn-ghost/.test(addP.className)) {
        out.now = 'Press “Add my garden”. A fence line appears round your house, ready to move.';
        out.target = addP;
      } else if (!plot) {
        out.now = 'Want the garden in your price? Press “Add my garden”. If not, press “' + nextTxt + '”.';
        out.target = next;
      } else if (S.gardenMode === 'tree') {
        out.now = 'Tap where each tree is. Press “+ Trees” again when you have finished.';
        out.target = doc.querySelector('#sk-tools [data-gmode="tree"]');
      } else {
        out.now = 'Use the + buttons to add a patio, a lawn or a drive, then drag each one into place. When you have finished, press “' + nextTxt + '”.';
        out.target = next;
      }
      return out;
    }
    var upper = S.floors.length > 1 ? ' on the ' + f.name.toLowerCase() : '';
    if ((S.stage === 'internal' || S.stage === 'openings' || S.stage === 'rooms') && !f.closed) {
      out.now = 'This floor has no shape yet. Press “' + nextTxt + '”.';
      out.target = next;
      return out;
    }
    if (S.stage === 'internal') {
      var addW = $('sk-addwall'), nWalls = f.internals.length;
      var gotWall = S.pick && S.pick.kind === 'iwall';
      if (S.selected) {
        out.now = 'Drag the doorway along its wall, and choose how wide it is. When you have finished, press “' + nextTxt + '”.';
        out.target = next;
      } else if (gotWall) {
        out.now = 'Drag this wall to where it is, or drag an end to make it shorter. The buttons add a doorway or mark it as coming out. The × removes it.';
        out.target = next;
      } else if (!nWalls) {
        out.now = 'This step is optional. To add an inside wall' + upper + ', press “Add a wall”, then drag it to where it is. No inside walls to add? Press “' + nextTxt + '”.';
        out.target = shown(addW) ? addW : next;
      } else {
        out.now = 'Press “Add a wall” for another one, or drag a wall to move it. Tap a wall to add a doorway. When you have finished, press “' + nextTxt + '”.';
        out.target = next;
      }
      return out;
    }
    if (S.stage === 'openings') {
      out.now = 'Choose a window or a door on the right, then tap the outside wall it is in. When you have finished, press “' + nextTxt + '”.';
      out.target = next;
      return out;
    }
    if (S.stage === 'rooms') {
      var menu = $('sk-roommenu');
      if (shown(menu)) { out.now = 'Press what this room is.'; out.target = menu; }
      else { out.now = 'Tap a room on the drawing and choose what it is. When every room is named, press “' + nextTxt + '”.'; out.target = next; }
      return out;
    }
    out.now = 'Press “' + (nextTxt || 'Next') + '” to carry on.';
    out.target = next;
    return out;
  }

  /**
   * Where somebody is, what to do now, and what comes after.
   * { page, at, sub, now, then, target, sofar, key }
   */
  function where() {
    var page = pageName();
    var w = { page: page, at: -1, sub: '', now: '', then: '', target: null, sofar: '', key: page };
    if (page === 'landing') { w.now = 'Press “Price my project” to start.'; return w; }

    if (page === 'start') {
      var picked = doc.querySelectorAll('#start-grid [aria-pressed="true"]').length, go = $('start-go');
      w.at = 0;
      if (!picked || !shown(go)) {
        w.now = 'Tap the kind of work you want done. You can tap more than one.';
        w.target = $('start-grid');
      } else {
        w.now = 'Tap anything else you want done. Then press “' + go.textContent.replace(/\s*→\s*$/, '') + '”.';
        w.target = go;
      }
      w.then = 'After this: you draw your house. It takes about a minute.';
      w.key = 'start:' + (picked ? 1 : 0);
    } else if (page === 'draw') {
      var d = drawing();
      w.at = 1; w.sub = d.sub; w.now = d.now; w.then = d.then; w.target = d.target;
      var S = SK() && SK()._S;
      w.key = 'draw:' + (S ? [S.stage, !!S.started, !!S.calibrating, !!S.askUp, !!S.block].join('/') : '');
    } else if (page === 'step') {
      var ask = $('flow-ask'), h1 = ask && ask.querySelector('h1');
      var nx = null;
      Array.prototype.forEach.call(doc.querySelectorAll('#flow-ask a.btn, #flow-ask button.btn'), function (b) {
        if (!nx && shown(b) && /next|estimate|on to/i.test(b.textContent)) nx = b;
      });
      var label = nx ? nx.textContent.replace(/\s*→\s*$/, '').trim() : 'Next';
      w.at = 2;
      w.sub = h1 ? h1.textContent : '';
      w.now = 'Answer the questions on this page. If you are not sure about one, leave it as it is. Then press “' + label + '”.';
      w.target = nx;
      w.then = /estimate/i.test(label) ? 'After this: your price.' : 'After this: a few more questions, then your price.';
      w.key = 'step:' + root.location.hash;
    } else {
      w.at = 3;
      w.now = 'This is your estimate. Scroll down to see everything in it. To change an answer, press “Change something”.';
      w.target = null;
      w.key = 'estimate';
    }
    if (w.target && !shown(w.target)) w.target = null;
    w.sofar = soFar();
    return w;
  }

  /* ---- the faces ----------------------------------------------------------------- */

  var btn, panel, halo, tip, open = false, showUntil = 0, lastAct = Date.now(), nudged = {}, undos = [], tipTimer = 0;

  function build() {
    btn = doc.createElement('button');
    btn.type = 'button'; btn.id = 'guide-btn'; btn.className = 'guide-btn';
    btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'guide-panel');
    btn.innerHTML = '<i aria-hidden="true">?</i><span>Help</span>';

    panel = doc.createElement('div');
    panel.id = 'guide-panel'; panel.className = 'guide-panel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Help: where you are and what to do next');
    panel.innerHTML =
      '<div class="guide-head"><b>Help</b><button type="button" class="guide-x" id="guide-x" aria-label="Close help">×</button></div>' +
      '<p class="guide-lab">Where you are</p><ol class="guide-journey" id="guide-journey"></ol>' +
      '<p class="guide-lab">Do this now</p><p class="guide-now" id="guide-now"></p>' +
      '<button type="button" class="btn btn-sm guide-show" id="guide-show">Show me where</button>' +
      '<p class="guide-then" id="guide-then"></p>' +
      '<p class="guide-sofar" id="guide-sofar"></p>' +
      '<label class="guide-toggle"><input type="checkbox" id="guide-glow"> <span>Keep a glow on what to press next</span></label>';

    halo = doc.createElement('div');
    halo.className = 'guide-halo'; halo.hidden = true; halo.setAttribute('aria-hidden', 'true');

    tip = doc.createElement('button');
    tip.type = 'button'; tip.className = 'guide-tip'; tip.hidden = true;

    doc.body.appendChild(halo); doc.body.appendChild(panel); doc.body.appendChild(tip); doc.body.appendChild(btn);

    btn.addEventListener('click', function () { toggle(!open); });
    tip.addEventListener('click', function () { hideTip(); toggle(true); });
    panel.addEventListener('click', function (e) {
      var t = e.target;
      if (t.id === 'guide-x') { toggle(false); return; }
      if (t.id === 'guide-show') { showMe(); return; }
    });
    panel.addEventListener('change', function (e) {
      if (e.target.id === 'guide-glow') { pref.glow = !!e.target.checked; save(); tick(); }
    });
    // Escape closes Help first — the drawing tool also listens for it, and would close itself
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) { e.preventDefault(); e.stopImmediatePropagation(); toggle(false); }
      lastAct = Date.now();
    }, true);
    doc.addEventListener('pointerdown', function (e) {
      lastAct = Date.now();
      var t = e.target;
      if (t && t.closest && t.closest('#sk-undo')) {
        var now = Date.now();
        undos = undos.filter(function (x) { return now - x < 9000; });
        undos.push(now);
        if (undos.length >= 3 && !open) { undos = []; say('Going round in circles? Press ' + helpName() + '.', 7000); }
      }
      // a press anywhere outside Help puts it away on a phone, where it covers the page
      if (open && root.innerWidth < 700 && t && t.closest && !t.closest('#guide-panel, #guide-btn')) toggle(false);
    }, true);
    root.addEventListener('hashchange', function () { root.setTimeout(tick, 60); });
    root.addEventListener('resize', tick);
    root.addEventListener('scroll', place, true);
    root.setInterval(tick, 300);
    tick();
  }

  function toggle(on) {
    open = !!on;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('on', open);
    if (open) { hideTip(); if (!pref.seen) { pref.seen = true; save(); } }
    tick();
  }

  function say(text, ms) {
    tip.textContent = text; tip.hidden = false;
    root.clearTimeout(tipTimer);
    tipTimer = root.setTimeout(hideTip, ms || 8000);
  }
  function hideTip() { tip.hidden = true; root.clearTimeout(tipTimer); }
  /** What the button looks like to the person being told to press it. */
  function helpName() { return root.innerWidth < 700 ? 'the ? button' : 'Help'; }

  function showMe() {
    var w = where();
    showUntil = Date.now() + 7000;
    if (root.innerWidth < 700) toggle(false);          // out of the way of the thing it is pointing at
    if (w.target && w.target.scrollIntoView && w.target.id !== 'sk-svg') {
      try { w.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    }
    tick();
  }

  var CUR = null;
  function tick() {
    if (!btn) return;
    var w = where();
    CUR = w;
    var on = w.page !== 'landing';
    btn.hidden = !on;
    if (!on) { panel.hidden = true; open = false; halo.hidden = true; hideTip(); return; }

    // the first time somebody arrives, say that help exists — once
    if (!pref.seen && w.page === 'start' && !open && tip.hidden && !nudged.hello) {
      nudged.hello = 1;
      say('Not sure what to do at any point? Press ' + helpName() + '.', 9000);
    }
    // sitting still on the same thing for a long while looks like being stuck
    if (!open && tip.hidden && !nudged[w.key] && Date.now() - lastAct > 40000 && w.page !== 'estimate') {
      nudged[w.key] = 1;
      say('Stuck? Press ' + helpName() + ' and it will say what to do.', 8000);
    }

    if (open) {
      $('guide-journey').innerHTML = JOURNEY.map(function (name, i) {
        var cls = i < w.at ? 'done' : i === w.at ? 'here' : '';
        return '<li class="' + cls + '"><i>' + (i < w.at ? '✓' : i + 1) + '</i><span>' + name +
          (i === w.at && w.sub ? '<small>' + esc(w.sub) + '</small>' : '') + '</span></li>';
      }).join('');
      $('guide-now').textContent = w.now;
      $('guide-then').textContent = w.then; $('guide-then').hidden = !w.then;
      $('guide-sofar').textContent = w.sofar; $('guide-sofar').hidden = !w.sofar;
      $('guide-show').hidden = !w.target;
      $('guide-glow').checked = !!pref.glow;
    }
    place();
  }

  /** Put the glow on whatever is next — if it should be glowing at all. */
  function place() {
    if (!halo || !CUR) return;
    var w = CUR, t = w.target, now = Date.now(), asked = now < showUntil;
    // On a page of questions the glow would say "skip these": it waits until somebody has
    // stopped, or asks. The drawing itself is never glowed unless asked — it is the whole screen.
    var patient = (w.page === 'step' || (w.page === 'start' && t && t.id === 'start-grid')) && now - lastAct < 12000;
    var big = t && (t.id === 'sk-svg' || t.id === 'start-grid');
    var want = t && shown(t) && (asked || (pref.glow && !patient && !big && w.page !== 'estimate'));
    // never over the Help panel itself
    if (want && open && root.innerWidth < 700) want = false;
    if (!want) { halo.hidden = true; return; }
    var r = t.getBoundingClientRect();
    if (!r.width || !r.height) { halo.hidden = true; return; }
    var pad = big ? -6 : 5;
    halo.hidden = false;
    halo.classList.toggle('strong', asked);
    halo.style.left = (r.left - pad) + 'px';
    halo.style.top = (r.top - pad) + 'px';
    halo.style.width = (r.width + pad * 2) + 'px';
    halo.style.height = (r.height + pad * 2) + 'px';
  }

  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  root.DATUM = root.DATUM || {};
  root.DATUM.GUIDE = { where: where, open: function () { toggle(true); }, close: function () { toggle(false); } };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', build);
  else build();
})(window, document);
