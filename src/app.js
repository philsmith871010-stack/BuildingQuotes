/*
 * Datum — interface
 * ---------------------------------------------------------------------------
 * Holds the spec, redraws the drawing, and keeps the number honest.
 */
(function (root, doc) {
  'use strict';

  var D = root.DATUM;
  var RATES = D.RATES, TREES = D.TREES, ISO = D.ISO;
  var LIM = RATES.limits;
  var reduced = root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = {
    width: 5.0,
    depth: 4.0,
    wallType: 'brick',
    bifoldWidth: 3.0,
    wallRemoval: 3.0,
    kitchen: true,
    bathrooms: 0,
    soil: 'high',
    trees: [],
    incVat: true,
    touched: {}
  };

  var $ = function (id) { return doc.getElementById(id); };
  var focusDim = null;

  /* ---- formatting ------------------------------------------------------ */

  function money(n) {
    return '£' + Math.round(n).toLocaleString('en-GB');
  }
  function moneyRounded(n, dir) {
    var step = 500;
    var v = dir === 'down' ? Math.floor(n / step) * step : Math.ceil(n / step) * step;
    return '£' + v.toLocaleString('en-GB');
  }
  function metres(n) { return n.toFixed(2) + ' m'; }

  /* ---- count-up -------------------------------------------------------- */

  var counters = {};
  function countTo(el, target, dir) {
    var key = el.id;
    var from = counters[key] === undefined ? 0 : counters[key];
    counters[key] = target;
    if (reduced || from === target) { el.textContent = moneyRounded(target, dir); return; }
    var t0 = performance.now(), dur = 420;
    function frame(t) {
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = moneyRounded(from + (target - from) * e, dir);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---- confidence ------------------------------------------------------ */

  function answeredCount() {
    return Object.keys(state.touched).length;
  }

  /* ---- drawing --------------------------------------------------------- */

  function draw(result) {
    $('iso-wrap').innerHTML = ISO.render(state, result.ground);
    if (focusDim) {
      var el = doc.querySelector('[data-dim="' + focusDim + '"]');
      if (el) el.focus();
    }
  }

  /* ---- readout --------------------------------------------------------- */

  function paintReadout(r) {
    var inc = state.incVat;
    countTo($('fig-low'), inc ? r.low : r.lowExVat, 'down');
    countTo($('fig-high'), inc ? r.high : r.highExVat, 'up');
    $('readout-label').textContent = inc ? 'Estimated total, including VAT' : 'Estimated total, excluding VAT';

    var pct = Math.round(r.spread * 100);
    var tightness = (RATES.confidence.start - r.spread) / (RATES.confidence.start - RATES.confidence.floor);
    $('gauge').style.width = Math.max(6, Math.round(tightness * 100)) + '%';
    $('gauge-label').textContent = r.spread <= RATES.confidence.floor + 0.001
      ? 'Plus or minus ' + pct + '% — as tight as it gets without a survey'
      : 'Plus or minus ' + pct + '% — keep answering to tighten it';

    $('readout-note').textContent = r.area.toFixed(1) + ' m² of new floor · ' +
      metres(r.ground.depth) + ' foundations · ' + (state.incVat ? 'VAT included' : 'VAT not included');

    $('sticky-lab').textContent = inc ? 'Estimated, inc VAT' : 'Estimated, ex VAT';
    $('sticky-fig').textContent = moneyRounded(inc ? r.low : r.lowExVat, 'down') +
      '–' + moneyRounded(inc ? r.high : r.highExVat, 'up');
  }

  /* ---- breakdown -------------------------------------------------------- */

  function paintStack(r) {
    var inc = state.incVat;
    var segs = [
      { cls: 's-trade', v: r.trade, name: 'Building work' },
      { cls: 's-fees', v: r.fees, name: 'Drawings and fees' },
      { cls: 's-margin', v: r.margin, name: 'Margin' },
      { cls: 's-contingency', v: r.contingency, name: 'Contingency' }
    ];
    if (inc) segs.push({ cls: 's-vat', v: r.vat, name: 'VAT' });
    var total = segs.reduce(function (t, s) { return t + s.v; }, 0) || 1;
    $('stack-bar').innerHTML = segs.map(function (s) {
      return '<span class="' + s.cls + '" style="width:' + ((s.v / total) * 100).toFixed(2) +
        '%" title="' + s.name + ' — ' + money(s.v) + '"></span>';
    }).join('');
  }

  function row(cls, label, detail, amount) {
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td><span class="lbl">' + label + '</span>' +
      (detail ? '<div class="det">' + detail + '</div>' : '') +
      '</td><td class="amt">' + money(amount) + '</td></tr>';
  }

  function paintItems(r) {
    var html = '';
    var group = function (g) { return r.lines.filter(function (l) { return l.group === g; }); };

    group('trade').forEach(function (l) { html += row('', l.label, l.detail, l.amount); });
    html += row('sub', 'Building work', '', r.trade);

    group('fees').forEach(function (l) { html += row('', l.label, l.detail, l.amount); });
    html += row('sub', 'Drawings, fees and permissions', '', r.fees);

    group('margin').forEach(function (l) { html += row('', l.label, l.detail, l.amount); });
    group('contingency').forEach(function (l) { html += row('', l.label, l.detail, l.amount); });

    if (state.incVat) {
      html += row('sub', 'Total, excluding VAT', '', r.exVat);
      html += row('', 'VAT at ' + (RATES.vatRate * 100) + '%', '', r.vat);
      html += row('tot', 'Total, including VAT', '', r.incVat);
    } else {
      html += row('tot', 'Total, excluding VAT', '', r.exVat);
    }
    $('items').innerHTML = html;

    $('margin-note').textContent =
      'On this job the fifteen per cent comes to ' + money(r.margin) + '. ' +
      money(r.datumShare) + ' of that is ours and ' + money(r.tradeShare) +
      ' goes to the builder and the consultants. It sits on the invoice rather than behind it.';
  }

  /* ---- ground flag ------------------------------------------------------ */

  function paintGroundFlag(r) {
    var g = r.ground;
    var el = $('ground-flag');
    if (g.soil.factor === 0) {
      el.innerHTML = '<div class="flag flag-good"><span><b>Nothing to worry about.</b> ' +
        'Sand, gravel and chalk do not shrink, so the trees make no difference to your foundations.</span></div>';
      return;
    }
    if (!g.governing) {
      el.innerHTML = '<div class="flag flag-good"><span><b>Standard foundations.</b> ' +
        'One metre deep, which is what the rate above already allows for.</span></div>';
      return;
    }
    var sp = g.governing.species;
    var msg = '<b>' + sp.name + ' at ' + g.governing.ratio.toFixed(2) + ' × its mature height.</b> ' +
      'Foundations need to go to ' + metres(g.depth) + ' rather than the usual metre. ';
    msg += g.piled
      ? 'At that depth a trench footing stops being sensible, so we have allowed for piles and a ground beam instead — and a builder who quotes you without mentioning this has not looked.'
      : 'That extra digging, carting away and concrete is the line you can see in the breakdown.';
    if (g.capped) msg += ' This is at the limit of what we can estimate remotely — the engineer will need to design it.';
    el.innerHTML = '<div class="flag"><span>' + msg + '</span></div>';
  }

  /* ---- the loop --------------------------------------------------------- */

  function update() {
    var spec = {
      width: state.width, depth: state.depth,
      wallType: state.wallType, bifoldWidth: state.bifoldWidth,
      soil: state.soil, trees: state.trees,
      wallRemoval: state.wallRemoval, kitchen: state.kitchen,
      bathrooms: state.bathrooms, answered: answeredCount()
    };
    var r = D.estimate(spec);
    draw(r);
    paintReadout(r);
    paintStack(r);
    paintItems(r);
    paintGroundFlag(r);
  }

  /* ---- dimension dragging ----------------------------------------------- */

  var drag = null;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function snap(v) { return Math.round(v / LIM.step) * LIM.step; }

  doc.addEventListener('pointerdown', function (e) {
    var chip = e.target.closest ? e.target.closest('[data-dim]') : null;
    if (!chip) return;
    var svg = chip.ownerSVGElement;
    var vb = svg.viewBox.baseVal;
    var scale = svg.getBoundingClientRect().width / vb.width;
    var a = ISO.axis(chip.getAttribute('data-dim'));
    drag = {
      which: chip.getAttribute('data-dim'),
      x: e.clientX, y: e.clientY,
      start: state[chip.getAttribute('data-dim')],
      ax: a[0] * scale, ay: a[1] * scale
    };
    focusDim = drag.which;
    chip.focus();
    e.preventDefault();
  });

  root.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    var denom = drag.ax * drag.ax + drag.ay * drag.ay;
    var delta = (dx * drag.ax + dy * drag.ay) / denom;
    var lo = drag.which === 'width' ? LIM.minWidth : LIM.minDepth;
    var hi = drag.which === 'width' ? LIM.maxWidth : LIM.maxDepth;
    var next = clamp(snap(drag.start + delta), lo, hi);
    if (next !== state[drag.which]) {
      state[drag.which] = next;
      state.touched.size = true;
      update();
    }
  });

  root.addEventListener('pointerup', function () { drag = null; });
  root.addEventListener('pointercancel', function () { drag = null; });

  doc.addEventListener('keydown', function (e) {
    var chip = e.target.closest ? e.target.closest('[data-dim]') : null;
    if (!chip) return;
    var which = chip.getAttribute('data-dim');
    var dir = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') dir = 1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') dir = -1;
    if (!dir) return;
    e.preventDefault();
    var lo = which === 'width' ? LIM.minWidth : LIM.minDepth;
    var hi = which === 'width' ? LIM.maxWidth : LIM.maxDepth;
    focusDim = which;
    state[which] = clamp(snap(state[which] + dir * LIM.step), lo, hi);
    state.touched.size = true;
    update();
  });

  doc.addEventListener('focusout', function (e) {
    if (e.target.closest && e.target.closest('[data-dim]')) {
      setTimeout(function () {
        if (!doc.querySelector('[data-dim]:focus')) focusDim = null;
      }, 0);
    }
  });

  /* ---- segmented controls ------------------------------------------------ */

  function segment(id, apply) {
    var group = $(id);
    if (!group) return;
    group.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-val]');
      if (!b) return;
      Array.prototype.forEach.call(group.querySelectorAll('button'), function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      state.touched[id] = true;
      apply(b.getAttribute('data-val'));
      update();
    });
  }

  segment('q-wall', function (v) { state.wallType = v; });
  segment('q-kitchen', function (v) { state.kitchen = v === 'yes'; });
  segment('q-bath', function (v) { state.bathrooms = parseInt(v, 10); });
  segment('q-soil', function (v) { state.soil = v; });

  // soil buttons come from the data, not the markup
  $('q-soil').innerHTML = TREES.SOILS.map(function (s) {
    return '<button type="button" data-val="' + s.id + '" aria-pressed="' +
      (s.id === state.soil) + '" title="' + s.note + '">' + s.name + '</button>';
  }).join('');

  /* ---- steppers ---------------------------------------------------------- */

  function stepper(downId, upId, outId, key, step, max, zeroLabel, unit) {
    function paint() {
      var v = state[key];
      $(outId).textContent = v === 0 ? zeroLabel : v.toFixed(v % 1 ? 1 : 0) + ' ' + unit;
      $(downId).disabled = v <= 0;
      $(upId).disabled = v >= max;
    }
    function nudge(d) {
      state[key] = clamp(Math.round((state[key] + d * step) * 100) / 100, 0, max);
      state.touched[key] = true;
      paint();
      update();
    }
    $(downId).addEventListener('click', function () { nudge(-1); });
    $(upId).addEventListener('click', function () { nudge(1); });
    paint();
  }

  stepper('bifold-down', 'bifold-up', 'bifold-out', 'bifoldWidth', 0.3, 6, 'None', 'm wide');
  stepper('wall-down', 'wall-up', 'wall-out', 'wallRemoval', 0.5, 12, 'None', 'm of wall');

  /* ---- trees -------------------------------------------------------------- */

  function paintTrees() {
    var list = $('tree-list');
    if (!state.trees.length) {
      list.innerHTML = '<p class="q-help" style="margin:0;">No trees within influencing distance. ' +
        'Worth checking your neighbours’ gardens too — roots do not stop at the fence.</p>';
    } else {
      list.innerHTML = state.trees.map(function (t, i) {
        var opts = TREES.SPECIES.map(function (s) {
          return '<option value="' + s.id + '"' + (s.id === t.species ? ' selected' : '') + '>' +
            s.name + ' · ' + s.demand + ' demand</option>';
        }).join('');
        return '<div class="tree-row">' +
          '<select data-tree="' + i + '" data-field="species" aria-label="Tree ' + (i + 1) + ' species">' + opts + '</select>' +
          '<input type="number" min="1" max="40" step="0.5" value="' + t.distance +
          '" data-tree="' + i + '" data-field="distance" aria-label="Tree ' + (i + 1) + ' distance in metres">' +
          '<button type="button" class="kill" data-remove="' + i + '" aria-label="Remove tree ' + (i + 1) + '">×</button>' +
          '</div>';
      }).join('');
    }
    $('tree-add').disabled = state.trees.length >= LIM.maxTrees;
  }

  $('tree-add').addEventListener('click', function () {
    if (state.trees.length >= LIM.maxTrees) return;
    state.trees.push({ species: 'oak', distance: 8 });
    state.touched.trees = true;
    paintTrees();
    update();
  });

  $('tree-list').addEventListener('change', function (e) {
    var el = e.target;
    var i = el.getAttribute && el.getAttribute('data-tree');
    if (i === null || i === undefined) return;
    i = parseInt(i, 10);
    var field = el.getAttribute('data-field');
    if (field === 'species') state.trees[i].species = el.value;
    if (field === 'distance') {
      var v = parseFloat(el.value);
      state.trees[i].distance = isNaN(v) ? 8 : clamp(v, 1, 40);
      el.value = state.trees[i].distance;
    }
    state.touched.trees = true;
    update();
  });

  $('tree-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-remove]');
    if (!b) return;
    state.trees.splice(parseInt(b.getAttribute('data-remove'), 10), 1);
    paintTrees();
    update();
  });

  /* ---- VAT toggle ---------------------------------------------------------- */

  function setVat(inc) {
    state.incVat = inc;
    $('vat-inc').setAttribute('aria-pressed', String(inc));
    $('vat-ex').setAttribute('aria-pressed', String(!inc));
    update();
  }
  $('vat-inc').addEventListener('click', function () { setVat(true); });
  $('vat-ex').addEventListener('click', function () { setVat(false); });

  /* ---- capture -------------------------------------------------------------- */

  $('capture-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('capture-email').value.trim();
    if (!email || email.indexOf('@') < 1) {
      $('capture-email').focus();
      return;
    }
    $('capture').classList.add('is-done');
  });

  /* ---- reveal on scroll + sticky total --------------------------------------- */

  var risers = Array.prototype.slice.call(doc.querySelectorAll('.band, .hero-grid'));
  risers.forEach(function (el) { el.classList.add('rise'); });

  if ('IntersectionObserver' in root && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    risers.forEach(function (el) { io.observe(el); });
  } else {
    risers.forEach(function (el) { el.classList.add('in'); });
  }

  // Safety net: content must never stay invisible because an observer did not
  // fire — a stuck reveal is worse than no reveal.
  setTimeout(function () {
    risers.forEach(function (el) { el.classList.add('in'); });
  }, 2600);

  var readoutEl = $('readout'), sticky = $('sticky');
  if ('IntersectionObserver' in root) {
    new IntersectionObserver(function (entries) {
      sticky.classList.toggle('on', !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(readoutEl);
  }

  /* ---- go -------------------------------------------------------------------- */

  paintTrees();
  update();
  requestAnimationFrame(function () {
    doc.querySelector('.hero-grid').classList.add('in');
  });
})(window, document);
