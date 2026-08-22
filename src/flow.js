/*
 * Datum — the estimator flow
 * ---------------------------------------------------------------------------
 * Four questions, one per page, then the estimate. The drawing persists across
 * all of them and the camera moves to whatever is being asked about, so the
 * answer and its consequence are never on separate screens.
 */
(function (root, doc) {
  'use strict';

  var D = root.DATUM;
  var RATES = D.RATES, TREES = D.TREES, ISO = D.ISO, ROUTER = D.ROUTER;
  var gsap = root.gsap;
  var reduced = root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = {
    width: 5.0, depth: 4.0,
    wallType: 'brick', bifoldWidth: 3.0,
    soil: 'high', trees: [],
    wallRemoval: 3.0, kitchen: true, bathrooms: 0,
    incVat: true, touched: {}
  };

  var $ = function (id) { return doc.getElementById(id); };
  var focusDim = null;
  var currentStep = null;

  function esc(s) {
    return String(s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) { return '£' + Math.round(n || 0).toLocaleString('en-GB'); }
  function rounded(n, dir) {
    var v = dir === 'down' ? Math.floor(n / 500) * 500 : Math.ceil(n / 500) * 500;
    return '£' + v.toLocaleString('en-GB');
  }
  function metres(n) { return n.toFixed(2) + ' m'; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function snap(v) { return Math.round(v / RATES.limits.step) * RATES.limits.step; }

  /* =====================================================================
     Steps
     ===================================================================== */

  function seg(id, label, options, current) {
    return '<div class="flow-field"><p class="q-title">' + esc(label.title) + '</p>' +
      (label.help ? '<p class="q-help">' + esc(label.help) + '</p>' : '') +
      '<div class="seg" role="group" aria-label="' + esc(label.title) + '" id="' + id + '">' +
      options.map(function (o) {
        return '<button type="button" data-val="' + o.v + '" aria-pressed="' +
          (String(o.v) === String(current)) + '">' + esc(o.label) + '</button>';
      }).join('') + '</div></div>';
  }

  function stepper(id, label, key, unit, zero) {
    var v = state[key];
    return '<div class="flow-field"><p class="q-title">' + esc(label.title) + '</p>' +
      (label.help ? '<p class="q-help">' + esc(label.help) + '</p>' : '') +
      '<div class="stepper">' +
      '<button type="button" data-nudge="' + key + '" data-dir="-1" aria-label="Less ' + esc(label.title) + '">−</button>' +
      '<output id="' + id + '" aria-live="polite">' +
        (v === 0 ? zero : (v % 1 ? v.toFixed(1) : v) + ' ' + unit) + '</output>' +
      '<button type="button" data-nudge="' + key + '" data-dir="1" aria-label="More ' + esc(label.title) + '">+</button>' +
      '</div></div>';
  }

  var STEPS = [
    {
      id: 'size', n: 1, short: 'Size',
      title: 'How big is it going to be?',
      lede: 'Drag either dimension on the drawing, or use the steppers. Everything else on this site is measured from these two numbers.',
      focus: { scale: 1, xPercent: 0, yPercent: 0 },
      note: 'Drag a dimension to resize',
      body: function () {
        return '<div class="flow-fields">' +
          stepper('out-width', { title: 'Width', help: 'Across the back of the house.' }, 'width', 'm wide', '—') +
          stepper('out-depth', { title: 'Projection', help: 'How far it comes out into the garden.' }, 'depth', 'm out', '—') +
          '<div class="flag flag-good"><span><b>' + (state.width * state.depth).toFixed(1) + ' m² of new floor.</b> ' +
          'Single storey for now — double storey, lofts and garage conversions are next.</span></div>' +
          '</div>';
      }
    },
    {
      id: 'build', n: 2, short: 'Build',
      title: 'How is it built?',
      lede: 'The construction of the external walls, and how much of the garden wall is glass.',
      focus: { scale: 1.26, xPercent: -4, yPercent: 7 },
      note: 'The garden elevation',
      body: function () {
        return '<div class="flow-fields">' +
          seg('q-wall', { title: 'Wall construction' }, [
            { v: 'brick', label: 'Brickwork' },
            { v: 'render', label: 'Render' },
            { v: 'timber', label: 'Timber frame & clad' }
          ], state.wallType) +
          stepper('out-bifold', {
            title: 'Bi-fold doors',
            help: 'Total width across the opening. Leave at none if you would rather have a window.'
          }, 'bifoldWidth', 'm wide', 'None') +
          '</div>';
      }
    },
    {
      id: 'ground', n: 3, short: 'Ground',
      title: 'What is underneath?',
      lede: 'The question that catches people out. On shrinkable clay a thirsty tree decides how deep you dig, and depth is expensive.',
      focus: { scale: 1.2, xPercent: 2, yPercent: -9 },
      note: 'Below ground',
      body: function () {
        return '<div class="flow-fields">' +
          '<div class="flow-field"><p class="q-title">What is the ground?</p>' +
          '<p class="q-help">Most of Essex and the London basin is heavy clay, so that is where we start.</p>' +
          '<div class="seg" role="group" aria-label="Ground conditions" id="q-soil">' +
          TREES.SOILS.map(function (s) {
            return '<button type="button" data-val="' + s.id + '" aria-pressed="' +
              (s.id === state.soil) + '" title="' + esc(s.note) + '">' + esc(s.name) + '</button>';
          }).join('') + '</div></div>' +
          '<div class="flow-field"><p class="q-title">Trees near the extension</p>' +
          '<p class="q-help">Species, and how far away. Worth checking your neighbours’ gardens too — roots do not stop at the fence.</p>' +
          '<div class="tree-list" id="tree-list"></div>' +
          '<div style="margin-top:.55rem"><button type="button" class="btn btn-ghost btn-sm" id="tree-add">+ Add a tree</button></div>' +
          '</div><div id="ground-flag"></div></div>';
      }
    },
    {
      id: 'inside', n: 4, short: 'Inside',
      title: 'What is going inside?',
      lede: 'Opening the new space into the house, and the two rooms that carry real labour.',
      focus: { scale: 1.14, xPercent: 6, yPercent: 3 },
      note: 'Rear extension · single storey',
      body: function () {
        return '<div class="flow-fields">' +
          stepper('out-wall', {
            title: 'Walls coming out',
            help: 'Existing wall removed so the new space opens into the house. Steel and making good included.'
          }, 'wallRemoval', 'm of wall', 'None') +
          seg('q-kitchen', {
            title: 'A new kitchen?',
            help: 'Fitting only. You buy the units and appliances you want, at whatever you want to spend.'
          }, [{ v: 'no', label: 'No' }, { v: 'yes', label: 'Yes' }], state.kitchen ? 'yes' : 'no') +
          seg('q-bath', {
            title: 'Bathrooms in the extension',
            help: 'Labour only, same principle as the kitchen.'
          }, [{ v: 0, label: 'None' }, { v: 1, label: 'One' }, { v: 2, label: 'Two' }, { v: 3, label: 'Three' }],
            state.bathrooms) +
          '</div>';
      }
    }
  ];

  function stepById(id) {
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return STEPS[i];
    return null;
  }
  function stepIndex(id) {
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return i;
    return -1;
  }

  /* =====================================================================
     Estimating
     ===================================================================== */

  function spec() {
    return {
      width: state.width, depth: state.depth,
      wallType: state.wallType, bifoldWidth: state.bifoldWidth,
      soil: state.soil, trees: state.trees,
      wallRemoval: state.wallRemoval, kitchen: state.kitchen,
      bathrooms: state.bathrooms,
      answered: Object.keys(state.touched).length
    };
  }

  var counters = {};
  function countTo(el, target, dir) {
    if (!el) return;
    var from = counters[el.id] === undefined ? 0 : counters[el.id];
    counters[el.id] = target;
    if (reduced || !gsap || from === target) { el.textContent = rounded(target, dir); return; }
    var proxy = { v: from };
    gsap.to(proxy, {
      v: target, duration: .55, ease: 'power2.out',
      onUpdate: function () { el.textContent = rounded(proxy.v, dir); }
    });
  }

  /* =====================================================================
     Drawing
     ===================================================================== */

  function draw(result) {
    $('iso-wrap').innerHTML = ISO.render(state, result.ground);
    if (focusDim) {
      var el = doc.querySelector('[data-dim="' + focusDim + '"]');
      if (el) el.focus();
    }
  }

  function moveCamera(step) {
    var wrap = $('iso-wrap');
    if (!wrap || !step) return;
    var f = step.focus;
    if (reduced || !gsap) {
      wrap.style.transform = 'scale(' + f.scale + ') translate(' + f.xPercent + '%,' + f.yPercent + '%)';
      return;
    }
    gsap.to(wrap, {
      scale: f.scale, xPercent: f.xPercent, yPercent: f.yPercent,
      duration: .85, ease: 'power3.inOut'
    });
  }

  /* =====================================================================
     Painting
     ===================================================================== */

  function paintRail() {
    var here = currentStep || 'size';
    var hereIdx = here === 'estimate' ? STEPS.length : stepIndex(here);
    var html = STEPS.map(function (s, i) {
      var cls = s.id === here ? 'here' : (i < hereIdx ? 'done' : '');
      return '<a href="#/' + s.id + '" class="' + cls + '"><i>' +
        (i < hereIdx ? '✓' : s.n) + '</i><span>' + esc(s.short) + '</span></a>';
    }).join('') +
    '<a href="#/estimate" class="' + (here === 'estimate' ? 'here' : '') + '"><i>' +
    (here === 'estimate' ? '5' : '5') + '</i><span>Estimate</span></a>';
    ['steps-rail', 'steps-rail-2'].forEach(function (id) {
      var el = $(id); if (el) el.innerHTML = html;
    });
  }

  function paintGroundFlag(r, targetId) {
    var el = $(targetId);
    if (!el) return;
    var g = r.ground;
    if (!g) { el.innerHTML = ''; return; }
    if (g.soil.factor === 0) {
      el.innerHTML = '<div class="flag flag-good"><span><b>Nothing to worry about.</b> ' +
        'Sand, gravel and chalk do not shrink, so trees make no difference to your foundations.</span></div>';
      return;
    }
    if (!g.governing) {
      el.innerHTML = '<div class="flag flag-good"><span><b>Standard foundations.</b> ' +
        'One metre deep, which is what the rate already allows for.</span></div>';
      return;
    }
    var sp = g.governing.species;
    var msg = '<b>' + esc(sp.name) + ' at ' + g.governing.ratio.toFixed(2) + ' × its mature height.</b> ' +
      'Foundations need to go to ' + metres(g.depth) + ' rather than the usual metre. ';
    msg += g.piled
      ? 'At that depth a trench footing stops being sensible, so we have allowed for piles and a ground beam — and a builder who quotes you without mentioning this has not looked.'
      : 'That extra digging, carting away and concrete is a line you can see in the breakdown.';
    if (g.capped) msg += ' This is at the limit of what we can estimate remotely — the engineer will need to design it.';
    el.innerHTML = '<div class="flag"><span>' + msg + '</span></div>';
  }

  function paintTotals(r) {
    var fig = $('flow-total-fig');
    if (fig) {
      fig.textContent = rounded(state.incVat ? r.low : r.lowExVat, 'down') + '–' +
        rounded(state.incVat ? r.high : r.highExVat, 'up');
    }
    var lvl = $('draw-level');
    if (lvl) lvl.textContent = r.ground ? '−' + r.ground.depth.toFixed(3) : '±0.000';
  }

  function row(cls, label, detail, amount) {
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td><span class="lbl">' + esc(label) + '</span>' +
      (detail ? '<div class="det">' + esc(detail) + '</div>' : '') +
      '</td><td class="amt">' + money(amount) + '</td></tr>';
  }

  function paintResult(r) {
    var inc = state.incVat;
    countTo($('fig-low'), inc ? r.low : r.lowExVat, 'down');
    countTo($('fig-high'), inc ? r.high : r.highExVat, 'up');
    $('readout-label').textContent = inc ? 'Estimated total, including VAT' : 'Estimated total, excluding VAT';

    var pctSpread = Math.round(r.spread * 100);
    var c = RATES.confidence;
    var tight = (c.start - r.spread) / (c.start - c.floor);
    $('gauge').style.width = Math.max(6, Math.round(tight * 100)) + '%';
    $('gauge-label').textContent = r.spread <= c.floor + 0.001
      ? 'Plus or minus ' + pctSpread + '% — as tight as it gets without a survey'
      : 'Plus or minus ' + pctSpread + '%, and it narrows once an architect has measured up';
    $('readout-note').textContent = r.area.toFixed(1) + ' m² of new floor · ' +
      metres(r.ground.depth) + ' foundations · ' + (inc ? 'VAT included' : 'VAT not included');

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

    var group = function (g) { return r.lines.filter(function (l) { return l.group === g; }); };
    var html = '';
    group('trade').forEach(function (l) { html += row('', l.label, l.detail, l.amount); });
    html += row('sub', 'Building work', '', r.trade);
    group('fees').forEach(function (l) { html += row('', l.label, l.detail, l.amount); });
    html += row('sub', 'Drawings, fees and permissions', '', r.fees);
    group('margin').forEach(function (l) { html += row('', l.label, l.detail, l.amount); });
    group('contingency').forEach(function (l) { html += row('', l.label, l.detail, l.amount); });
    if (inc) {
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

    paintGroundFlag(r, 'result-flag');
  }

  /* =====================================================================
     The loop
     ===================================================================== */

  function update(redraw) {
    var r = D.estimate(spec());
    if (redraw !== false && currentStep && currentStep !== 'estimate') draw(r);
    paintTotals(r);
    if (currentStep === 'estimate') paintResult(r);
    if (currentStep === 'ground') paintGroundFlag(r, 'ground-flag');
    if (currentStep === 'size') {
      var f = doc.querySelector('#flow-ask .flag-good span b');
      if (f) f.textContent = (state.width * state.depth).toFixed(1) + ' m² of new floor.';
      var ow = $('out-width'), od = $('out-depth');
      if (ow) ow.textContent = (state.width % 1 ? state.width.toFixed(2) : state.width) + ' m wide';
      if (od) od.textContent = (state.depth % 1 ? state.depth.toFixed(2) : state.depth) + ' m out';
    }
    return r;
  }

  function paintTrees() {
    var list = $('tree-list');
    if (!list) return;
    if (!state.trees.length) {
      list.innerHTML = '<p class="q-help" style="margin:0">No trees within influencing distance.</p>';
    } else {
      list.innerHTML = state.trees.map(function (t, i) {
        var opts = TREES.SPECIES.map(function (s) {
          return '<option value="' + s.id + '"' + (s.id === t.species ? ' selected' : '') + '>' +
            esc(s.name) + ' · ' + s.demand + ' demand</option>';
        }).join('');
        return '<div class="tree-row">' +
          '<select data-tree="' + i + '" data-field="species" aria-label="Tree ' + (i + 1) + ' species">' + opts + '</select>' +
          '<input type="number" min="1" max="40" step="0.5" value="' + t.distance +
          '" data-tree="' + i + '" data-field="distance" aria-label="Tree ' + (i + 1) + ' distance in metres">' +
          '<button type="button" class="kill" data-remove="' + i + '" aria-label="Remove tree ' + (i + 1) + '">×</button>' +
          '</div>';
      }).join('');
    }
    var add = $('tree-add');
    if (add) add.disabled = state.trees.length >= RATES.limits.maxTrees;
  }

  function renderStep(id) {
    var step = stepById(id);
    if (!step) return;
    var i = stepIndex(id);
    var prev = i > 0 ? STEPS[i - 1].id : null;
    var next = i < STEPS.length - 1 ? STEPS[i + 1].id : 'estimate';

    var html =
      '<p class="flow-step-of">Step ' + step.n + ' of ' + (STEPS.length + 1) + '</p>' +
      '<h1>' + esc(step.title) + '</h1>' +
      '<p class="lede">' + esc(step.lede) + '</p>' +
      step.body() +
      '<div class="flow-nav">' +
        (prev ? '<a class="btn btn-ghost" href="#/' + prev + '">← Back</a>' : '<a class="btn btn-ghost" href="#/">← Home</a>') +
        '<a class="btn" href="#/' + next + '">' + (next === 'estimate' ? 'See the estimate' : 'Next') + ' →</a>' +
      '</div>';

    var ask = $('flow-ask');
    ask.innerHTML = html;
    $('draw-note').textContent = step.note;

    if (id === 'ground') paintTrees();

    if (!reduced && gsap) {
      gsap.fromTo(ask.children,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: .5, stagger: .055, ease: 'power2.out' });
    }
    moveCamera(step);
  }

  /* =====================================================================
     Events
     ===================================================================== */

  // dimension dragging
  var drag = null;

  doc.addEventListener('pointerdown', function (e) {
    var chip = e.target.closest ? e.target.closest('[data-dim]') : null;
    if (!chip) return;
    var svg = chip.ownerSVGElement;
    var vb = svg.viewBox.baseVal;
    var rect = svg.getBoundingClientRect();
    // the drawing is scaled by the camera as well as by the viewBox
    var scale = rect.width / vb.width;
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
    var L = RATES.limits;
    var lo = drag.which === 'width' ? L.minWidth : L.minDepth;
    var hi = drag.which === 'width' ? L.maxWidth : L.maxDepth;
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
    var dir = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 1
            : (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    var which = chip.getAttribute('data-dim');
    var L = RATES.limits;
    var lo = which === 'width' ? L.minWidth : L.minDepth;
    var hi = which === 'width' ? L.maxWidth : L.maxDepth;
    focusDim = which;
    state[which] = clamp(snap(state[which] + dir * L.step), lo, hi);
    state.touched.size = true;
    update();
  });

  // everything else
  doc.addEventListener('click', function (e) {
    var t = e.target;

    var nudge = t.closest ? t.closest('[data-nudge]') : null;
    if (nudge) {
      var key = nudge.getAttribute('data-nudge');
      var dir = parseInt(nudge.getAttribute('data-dir'), 10);
      var L = RATES.limits;
      var conf = {
        width:       { step: L.step, lo: L.minWidth, hi: L.maxWidth },
        depth:       { step: L.step, lo: L.minDepth, hi: L.maxDepth },
        bifoldWidth: { step: 0.3,    lo: 0,          hi: 6 },
        wallRemoval: { step: 0.5,    lo: 0,          hi: 12 }
      }[key];
      state[key] = clamp(Math.round((state[key] + dir * conf.step) * 100) / 100, conf.lo, conf.hi);
      state.touched[key] = true;
      var out = nudge.parentNode.querySelector('output');
      if (out && key !== 'width' && key !== 'depth') {
        var v = state[key];
        out.textContent = v === 0
          ? (key === 'bifoldWidth' ? 'None' : 'None')
          : (v % 1 ? v.toFixed(1) : v) + (key === 'bifoldWidth' ? ' m wide' : ' m of wall');
      }
      update();
      return;
    }

    var segBtn = t.closest ? t.closest('.seg button[data-val]') : null;
    if (segBtn) {
      var group = segBtn.parentNode;
      Array.prototype.forEach.call(group.querySelectorAll('button'), function (b) {
        b.setAttribute('aria-pressed', String(b === segBtn));
      });
      var v = segBtn.getAttribute('data-val');
      if (group.id === 'q-wall') { state.wallType = v; state.touched.wall = true; }
      if (group.id === 'q-soil') { state.soil = v; state.touched.soil = true; }
      if (group.id === 'q-kitchen') { state.kitchen = v === 'yes'; state.touched.kitchen = true; }
      if (group.id === 'q-bath') { state.bathrooms = parseInt(v, 10); state.touched.bath = true; }
      update();
      return;
    }

    if (t.id === 'tree-add') {
      if (state.trees.length >= RATES.limits.maxTrees) return;
      state.trees.push({ species: 'oak', distance: 8 });
      state.touched.trees = true;
      paintTrees();
      update();
      return;
    }
    var rm = t.closest ? t.closest('[data-remove]') : null;
    if (rm) {
      state.trees.splice(parseInt(rm.getAttribute('data-remove'), 10), 1);
      paintTrees();
      update();
      return;
    }

    if (t.id === 'vat-inc' || t.id === 'vat-ex') {
      state.incVat = t.id === 'vat-inc';
      $('vat-inc').setAttribute('aria-pressed', String(state.incVat));
      $('vat-ex').setAttribute('aria-pressed', String(!state.incVat));
      update(false);
      return;
    }
  });

  doc.addEventListener('change', function (e) {
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

  var captureForm = $('capture-form');
  if (captureForm) {
    captureForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('capture-email').value.trim();
      if (!email || email.indexOf('@') < 1) { $('capture-email').focus(); return; }
      $('capture').classList.add('is-done');
    });
  }

  /* =====================================================================
     Routing
     ===================================================================== */

  ROUTER.on(function (path, route) {
    currentStep = route.step || null;
    if (!currentStep) { paintRail(); return; }
    paintRail();
    if (currentStep === 'estimate') {
      update(false);
    } else {
      renderStep(currentStep);
      update();
    }
  });

  ROUTER.start();
  if (D.HERO) D.HERO.start();
})(window, document);
