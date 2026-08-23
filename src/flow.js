/*
 * Datum — the estimator flow
 * ---------------------------------------------------------------------------
 * Every question on this screen comes out of the rate book. Add a build type in
 * the admin, give its measurements homeowner wording, and its public flow
 * appears here without anyone writing code.
 *
 * The drawing shows a plan or a section depending on what is being asked:
 * setting out is a plan, consequences are a section.
 */
(function (root, doc) {
  'use strict';

  var D = root.DATUM;
  var RB = D.RATEBOOK, TREES = D.TREES, DRAW = D.DRAW2D, ROUTER = D.ROUTER;
  var gsap = root.gsap;
  var reduced = root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var jobs = {};        // per build type, so switching does not lose answers
  var incVat = true;

  /* A project can be several build types at once — an extension AND a loft AND
     a refurbishment is one job, not three, and gets priced that way. */
  var PKEY = 'datum.project.v1';
  var project = { types: [], floor: 'ground' };
  try {
    var saved = JSON.parse(root.localStorage.getItem(PKEY) || 'null');
    if (saved && Array.isArray(saved.types)) project = saved;
  } catch (e) { /* private mode */ }
  function saveProject() {
    try { root.localStorage.setItem(PKEY, JSON.stringify(project)); } catch (e) {}
  }
  /** Selected types, in the order the rate book lists them. */
  function selected() {
    return book().buildTypes
      .filter(function (t) { return t.enabled && (t.steps || []).length && project.types.indexOf(t.id) >= 0; });
  }
  var HOUSE_TYPES = ['extension', 'renovation', 'loft'];
  function floorsAvailable() {
    var f = ['ground', 'first'];
    if (project.types.indexOf('loft') >= 0) f.push('loft');
    return f;
  }
  var route = null;
  var focusDim = null;

  var $ = function (id) { return doc.getElementById(id); };
  function book() { return D.STORE.published(); }
  function esc(s) {
    return String(s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(v) { return '£' + Math.round(v || 0).toLocaleString('en-GB'); }
  function rounded(v, dir) {
    var n = dir === 'down' ? Math.floor(v / 500) * 500 : Math.ceil(v / 500) * 500;
    return '£' + n.toLocaleString('en-GB');
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---- job state ---------------------------------------------------------- */

  function asks(type) {
    return type.measurements.filter(function (m) { return m.ask; });
  }

  function job(typeId) {
    if (!jobs[typeId]) {
      var type = RB.typeById(book(), typeId);
      var m = {}, mods = {};
      asks(type).forEach(function (x) { m[x.id] = x.ask.value === undefined ? 0 : x.ask.value; });
      (type.modifiers || []).forEach(function (x) { mods[x.id] = x.value; });
      jobs[typeId] = {
        measurements: m, modifiers: mods,
        ground: { soil: 'high', trees: [] },
        touched: {}, seen: {}
      };
    }
    return jobs[typeId];
  }

  /** Measurements the client never types — we work them out. */
  function derive(typeId, j) {
    var m = j.measurements;
    if (typeId === 'extension') {
      m.floorArea = (m.width || 0) * (m.depth || 0);
      m.perimeter = 2 * ((m.width || 0) + (m.depth || 0));
    }
    if (typeId === 'newbuild') {
      m.floorArea = (m.footprintArea || 0) * (m.storeys || 1);
      m.perimeter = 4 * Math.sqrt(Math.max(m.footprintArea || 0, 1));
    }
    if (typeId === 'loft') m.perimeter = 4 * Math.sqrt(Math.max(m.floorArea || 0, 1));
    return j;
  }

  /** Every selected build type, priced as one job. */
  function priceNow() {
    var sel = selected();
    var map = {};
    sel.forEach(function (t) { map[t.id] = derive(t.id, job(t.id)); });
    return RB.priceProject(book(), sel.map(function (t) { return t.id; }), map);
  }
  /** Just this build type's trade work — what the drawing needs. */
  function tradeNow(typeId) {
    return RB.tradeLines(book(), typeId, derive(typeId, job(typeId)));
  }

  /* ---- inputs ------------------------------------------------------------- */

  function fmt(m, v) {
    var a = m.ask;
    if (!v && a.zero) return a.zero;
    var s = v % 1 ? v.toFixed(a.by && a.by < 0.5 ? 2 : 1) : String(v);
    if (a.input === 'count' || a.input === 'yesno') return s;
    return s + ' ' + m.unit;
  }

  function inputHtml(m, j) {
    var a = m.ask, v = j.measurements[m.id] || 0;
    var head = '<p class="q-title">' + esc(a.q) + '</p>' +
      (a.help ? '<p class="q-help">' + esc(a.help) + '</p>' : '');

    if (a.input === 'yesno') {
      return '<div class="flow-field">' + head +
        '<div class="seg" role="group" data-meas="' + m.id + '" aria-label="' + esc(a.q) + '">' +
        '<button type="button" data-val="0" aria-pressed="' + (!v) + '">No</button>' +
        '<button type="button" data-val="1" aria-pressed="' + (!!v) + '">Yes</button>' +
        '</div></div>';
    }
    if (a.input === 'count' && (a.max || 6) <= 4) {
      var opts = [];
      for (var i = (a.min || 0); i <= (a.max || 3); i++) opts.push(i);
      return '<div class="flow-field">' + head +
        '<div class="seg" role="group" data-meas="' + m.id + '" aria-label="' + esc(a.q) + '">' +
        opts.map(function (o) {
          return '<button type="button" data-val="' + o + '" aria-pressed="' + (o === v) + '">' +
            (o === 0 ? (a.zero || 'None') : o) + '</button>';
        }).join('') + '</div></div>';
    }
    return '<div class="flow-field">' + head +
      '<div class="stepper">' +
      '<button type="button" data-nudge="' + m.id + '" data-dir="-1" aria-label="Less ' + esc(a.q) + '">−</button>' +
      '<output id="out-' + m.id + '" aria-live="polite">' + esc(fmt(m, v)) + '</output>' +
      '<button type="button" data-nudge="' + m.id + '" data-dir="1" aria-label="More ' + esc(a.q) + '">+</button>' +
      '</div></div>';
  }

  function modifierHtml(mod, j) {
    return '<div class="flow-field"><p class="q-title">' + esc(mod.label) + '</p>' +
      (mod.help ? '<p class="q-help">' + esc(mod.help) + '</p>' : '') +
      '<div class="seg" role="group" data-mod="' + mod.id + '" aria-label="' + esc(mod.label) + '">' +
      mod.options.map(function (o) {
        return '<button type="button" data-val="' + o.id + '" aria-pressed="' +
          ((j.modifiers[mod.id] || mod.value) === o.id) + '">' + esc(o.label) + '</button>';
      }).join('') + '</div></div>';
  }

  function groundHtml(j) {
    return '<div class="flow-field"><p class="q-title">What is the ground?</p>' +
      '<p class="q-help">Most of Essex and the London basin is heavy clay, so that is where we start.</p>' +
      '<div class="seg" role="group" data-soil="1" aria-label="Ground conditions">' +
      TREES.SOILS.map(function (s) {
        return '<button type="button" data-val="' + s.id + '" aria-pressed="' +
          (s.id === j.ground.soil) + '" title="' + esc(s.note) + '">' + esc(s.name) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="flow-field"><p class="q-title">Trees nearby</p>' +
      '<p class="q-help">Species, and how far away. Worth checking your neighbours’ gardens too — roots do not stop at the fence.</p>' +
      '<div class="tree-list" id="tree-list"></div>' +
      '<div style="margin-top:.55rem"><button type="button" class="btn btn-ghost btn-sm" id="tree-add">+ Add a tree</button></div>' +
      '</div><div id="ground-flag"></div>';
  }

  function paintTrees() {
    var list = $('tree-list');
    if (!list || !route || !route.typeId) return;
    var j = job(route.typeId);
    if (!j.ground.trees.length) {
      list.innerHTML = '<p class="q-help" style="margin:0">No trees within influencing distance.</p>';
    } else {
      list.innerHTML = j.ground.trees.map(function (t, i) {
        return '<div class="tree-row">' +
          '<select data-tree="' + i + '" data-field="species" aria-label="Tree ' + (i + 1) + ' species">' +
          TREES.SPECIES.map(function (s) {
            return '<option value="' + s.id + '"' + (s.id === t.species ? ' selected' : '') + '>' +
              esc(s.name) + ' · ' + s.demand + ' demand</option>';
          }).join('') + '</select>' +
          '<input type="number" min="1" max="40" step="0.5" value="' + t.distance +
          '" data-tree="' + i + '" data-field="distance" aria-label="Tree ' + (i + 1) + ' distance in metres">' +
          '<button type="button" class="kill" data-remove="' + i + '" aria-label="Remove tree ' + (i + 1) + '">×</button>' +
          '</div>';
      }).join('');
    }
    var add = $('tree-add');
    if (add) add.disabled = j.ground.trees.length >= (book().limits.maxTrees || 4);
  }

  /* ---- chooser -------------------------------------------------------------- */

  function paintChooser() {
    var b = book();
    var host = $('start-grid');
    if (!host) return;
    var avail = b.buildTypes.filter(function (t) { return t.enabled && (t.steps || []).length; });
    host.innerHTML = avail.map(function (t) {
      var r = RB.priceTypical(b, t.id);
      var on = project.types.indexOf(t.id) >= 0;
      return '<button type="button" class="pick' + (on ? ' on' : '') + '" data-pick="' + t.id +
        '" aria-pressed="' + on + '">' +
        '<span class="pick-tick" aria-hidden="true">' + (on ? '✓' : '') + '</span>' +
        '<span class="pick-name">' + esc(t.name) + '</span>' +
        '<span class="pick-blurb">' + esc(t.blurb) + '</span>' +
        '<span class="pick-foot"><span class="pick-typ">' + (r ? 'Typical ' + money(r.incVat) : '') +
        '</span></span></button>';
    }).join('');

    var sel = selected();
    var go = $('start-go'), note = $('start-note');
    if (go) {
      go.hidden = !sel.length;
      if (sel.length) go.href = '#/' + sel[0].id + '/' + sel[0].steps[0].id;
      go.textContent = sel.length > 1
        ? 'Price all ' + sel.length + ' together →'
        : 'Start →';
    }
    if (note) {
      if (sel.length > 1) {
        var combined = RB.priceProject(b, sel.map(function (t) { return t.id; }), typicalJobs(sel));
        note.innerHTML = '<div class="flag flag-good"><span><b>One project, not ' + sel.length +
          '.</b> You pay for one survey, one set of drawings, one engineer and one building control ' +
          'application — not ' + sel.length + ' of each. On a typical job of this shape that is about ' +
          money(combined.saving) + ' you do not spend.</span></div>';
      } else {
        note.innerHTML = sel.length
          ? '<p class="q-help">Doing more than one? Tick them all — it is cheaper as a single project.</p>'
          : '<p class="q-help">Tick everything you are thinking about. You can change your mind later.</p>';
      }
    }
  }

  function typicalJobs(sel) {
    var out = {};
    sel.forEach(function (t) {
      out[t.id] = { measurements: (t.typical || {}).measurements || {},
                    modifiers: (t.typical || {}).modifiers || {},
                    ground: (t.typical || {}).ground, touched: {} };
    });
    return out;
  }

  /* ---- the step page -------------------------------------------------------- */

  /*
   * A sketch onto a job.
   *
   * The tool measures a house; the rate book prices named quantities. This is
   * the only place the two meet, and it is deliberately explicit rather than
   * clever — each build type takes what it charges for and ignores the rest.
   * Roof area is the footprint over a 35° pitch, which is where 1.22 comes from.
   */
  var SKETCH_TYPES = ['renovation', 'newbuild'];

  function applySketch(typeId, m) {
    var j = job(typeId);
    // whole units — a stepper offering 186.77 m² of plaster reads like false
    // precision on a figure that is a sketch of a house
    var set = function (k, v) {
      if (v === null || v === undefined || !isFinite(v)) return;
      j.measurements[k] = Math.round(v);
      j.touched[k] = true;
    };
    var baths = (m.counts.bathroom || 0) + (m.counts.wc || 0);

    if (typeId === 'renovation') {
      set('floorArea', m.totalArea);
      set('replasterArea', m.plaster);
      set('rewireArea', m.totalArea);
      set('windows', m.windows);
    } else if (typeId === 'newbuild') {
      set('footprintArea', m.area);
      set('floorArea', m.totalArea);
      set('perimeter', m.perimeter);
      set('roofArea', m.area * 1.22);
    }
    if (m.counts.kitchen) set('kitchens', m.counts.kitchen);
    if (baths) set('bathrooms', baths);

    j.touched.sketched = true;
    refreshOutputs();
    update();

    var note = doc.querySelector('#flow-ask .trace-cta');
    if (note) {
      note.innerHTML = '<div><p class="q-title">Measured from your sketch.</p>' +
        '<p class="q-help">' + m.totalArea.toFixed(1) + ' m² over ' +
        (m.counts.kitchen || 0) + ' kitchen' + ((m.counts.kitchen || 0) === 1 ? '' : 's') +
        ' and ' + baths + ' bathroom' + (baths === 1 ? '' : 's') +
        '. The figures below have been set from it.</p></div>' +
        '<div class="sk-cta"><button type="button" class="btn btn-ghost" id="do-sketch">Change the sketch</button></div>';
    }
  }

  function renderStep(r) {
    var type = r.type, step = r.step;
    var j = job(type.id);
    var steps = type.steps;
    var i = steps.indexOf(step);
    var sel = selected();
    var ti = sel.map(function (t) { return t.id; }).indexOf(type.id);

    var prev = i > 0 ? '#/' + type.id + '/' + steps[i - 1].id
      : (ti > 0 ? '#/' + sel[ti - 1].id + '/' + sel[ti - 1].steps[sel[ti - 1].steps.length - 1].id : '#/start');

    var nextType = ti >= 0 && ti < sel.length - 1 ? sel[ti + 1] : null;
    var next = i < steps.length - 1 ? '#/' + type.id + '/' + steps[i + 1].id
      : (nextType ? '#/' + nextType.id + '/' + nextType.steps[0].id : '#/estimate');
    var nextLabel = i < steps.length - 1 ? 'Next'
      : (nextType ? 'On to ' + nextType.name.toLowerCase() : 'See the estimate');

    var fields = asks(type).filter(function (m) { return m.ask.step === step.id; })
      .map(function (m) { return inputHtml(m, j); }).join('');

    var mods = (step.modifiers || []).map(function (id) {
      var found = null;
      (type.modifiers || []).forEach(function (m) { if (m.id === id) found = m; });
      return found ? modifierHtml(found, j) : '';
    }).join('');

    // the two steps where the client's own house can do the measuring: trace an
    // existing plan, or sketch one in a couple of minutes if they haven't got one
    var traceable = type.id === 'renovation' && step.id === 'size' && root.DATUM.TRACE;
    var sketchable = SKETCH_TYPES.indexOf(type.id) >= 0 && step.id === 'size' && root.DATUM.SKETCH;

    var html =
      '<p class="flow-step-of">' + esc(type.name) + ' · step ' + (i + 1) + ' of ' + (steps.length + 1) + '</p>' +
      '<h1>' + esc(step.title) + '</h1>' +
      '<p class="lede">' + esc(step.lede) + '</p>' +
      (traceable || sketchable
        ? '<div class="trace-cta"><div>' +
          '<p class="q-title">' + (traceable ? 'Have you got the floor plan?' : 'Rather draw it than guess it?') + '</p>' +
          '<p class="q-help">' +
          (traceable ? 'Upload it and measure the rooms off it instead of guessing. ' : 'Sketch the outline, drop in the windows, doors and rooms, and every figure below is measured rather than estimated. ') +
          'Nothing is sent anywhere — it is measured in your browser.</p></div>' +
          '<div class="sk-cta">' +
          (traceable ? '<button type="button" class="btn" id="do-trace">Trace my plan</button>' : '') +
          (sketchable ? '<button type="button" class="btn' + (traceable ? ' btn-ghost' : '') +
             '" id="do-sketch">Sketch my house</button>' : '') +
          '</div></div>'
        : '') +
      '<div class="flow-fields">' + fields + (step.ground ? groundHtml(j) : '') + mods + '</div>' +
      '<div class="flow-nav">' +
        '<a class="btn btn-ghost" href="' + prev + '">← Back</a>' +
        '<a class="btn" href="' + next + '">' + esc(nextLabel) + ' →</a>' +
      '</div>';

    // Reaching a step means its questions have been put to the client. Accepting
    // a sensible default is still an answer, so it counts towards how tight the
    // estimate can honestly be — otherwise someone who agrees with everything we
    // suggest is told we know nothing about their job.
    j.seen = j.seen || {};
    j.seen[step.id] = true;

    var ask = $('flow-ask');
    ask.innerHTML = html;
    if (step.ground) paintTrees();

    var tabs = $('floor-tabs');
    if (tabs) {
      var housey = HOUSE_TYPES.indexOf(type.id) >= 0 && step.view === 'plan';
      tabs.hidden = !housey;
      if (housey) {
        var fl = floorsAvailable();
        // show the floor the question is actually about
        var want = type.id === 'loft' ? 'loft' : type.id === 'extension' ? 'ground' : project.floor;
        if (fl.indexOf(want) < 0) want = 'ground';
        project.floor = want;
        tabs.innerHTML = fl.map(function (f) {
          return '<button type="button" data-floor="' + f + '" aria-pressed="' +
            (f === project.floor) + '">' + f.charAt(0).toUpperCase() + f.slice(1) + '</button>';
        }).join('');
      }
    }

    $('draw-title').textContent = type.name + ' · ' + (step.view === 'plan' ? 'plan' : 'section');
    $('draw-note').textContent = type.id === 'renovation' && step.view === 'plan'
      ? 'Your uploaded plan, traced'
      : (step.view === 'plan' ? 'Plan — looking down' : 'Section — cut through');

    if (!reduced && gsap) {
      gsap.fromTo(ask.children, { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: .5, stagger: .05, ease: 'power2.out' });
    }
  }

  function paintRail(r) {
    var sel = selected();
    if (!sel.length) return;
    var hereId = r.name === 'estimate' ? null : r.typeId;
    var hereIdx = hereId ? sel.map(function (t) { return t.id; }).indexOf(hereId) : sel.length;
    var html = sel.map(function (t, i) {
      return '<a href="#/' + t.id + '/' + t.steps[0].id + '" class="' +
        (t.id === hereId ? 'here' : i < hereIdx ? 'done' : '') + '"><i>' +
        (i < hereIdx ? '✓' : i + 1) + '</i><span>' + esc(t.name) + '</span></a>';
    }).join('') +
      '<a href="#/estimate" class="' + (r.name === 'estimate' ? 'here' : '') + '"><i>' +
      (sel.length + 1) + '</i><span>Estimate</span></a>';
    ['steps-rail', 'steps-rail-2'].forEach(function (id) {
      var el = $(id); if (el) el.innerHTML = html;
    });
  }

  /* ---- drawing --------------------------------------------------------------- */

  function drawNow(r, result) {
    var view = r.name === 'estimate' ? 'section' : r.step.view;
    var host = $('iso-wrap');
    if (!host) return;
    var j = job(r.typeId);
    host.innerHTML = DRAW.render(r.typeId, view, mergeJob(j), result.ground);
    if (focusDim) {
      var el = doc.querySelector('[data-dim="' + focusDim + '"]');
      if (el) el.focus();
    }
  }

  /** The drawing wants one flat object of numbers plus the trees. */
  function mergeJob(j) {
    var out = {};
    Object.keys(j.measurements).forEach(function (k) { out[k] = j.measurements[k]; });
    out.trees = j.ground.trees;
    out.soil = j.ground.soil;
    // the plan draws the whole house, so it needs every part of the project
    var all = {};
    selected().forEach(function (t) { all[t.id] = derive(t.id, job(t.id)); });
    out.project = { types: project.types.slice(), jobs: all, floor: project.floor };
    return out;
  }

  /* ---- result ---------------------------------------------------------------- */

  var counters = {};
  function countTo(el, target, dir) {
    if (!el) return;
    var from = counters[el.id] === undefined ? 0 : counters[el.id];
    counters[el.id] = target;
    if (reduced || !gsap || from === target) { el.textContent = rounded(target, dir); return; }
    var proxy = { v: from };
    gsap.to(proxy, { v: target, duration: .55, ease: 'power2.out',
      onUpdate: function () { el.textContent = rounded(proxy.v, dir); } });
  }

  function groundFlag(result, targetId) {
    var el = $(targetId);
    if (!el) return;
    var g = result.ground;
    if (!g) { el.innerHTML = ''; return; }
    if (g.soil.factor === 0) {
      el.innerHTML = '<div class="flag flag-good"><span><b>Nothing to worry about.</b> Sand, gravel and chalk do not shrink, so trees make no difference to your foundations.</span></div>';
      return;
    }
    if (!g.governing) {
      el.innerHTML = '<div class="flag flag-good"><span><b>Standard foundations.</b> One metre deep, which is what the rate already allows for.</span></div>';
      return;
    }
    var sp = g.governing.species;
    var msg = '<b>' + esc(sp.name) + ' at ' + g.governing.ratio.toFixed(2) + ' × its mature height.</b> ' +
      'Foundations need to go to ' + g.depth.toFixed(2) + ' m rather than the usual metre. ' +
      (g.piled
        ? 'At that depth a trench footing stops being sensible, so we have allowed for piles and a ground beam — and a builder who quotes you without mentioning this has not looked.'
        : 'That extra digging, carting away and concrete is a line you can see in the breakdown.');
    el.innerHTML = '<div class="flag"><span>' + msg + '</span></div>';
  }

  function row(cls, label, detail, amount) {
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td><span class="lbl">' + esc(label) + '</span>' +
      (detail ? '<div class="det">' + esc(detail) + '</div>' : '') +
      '</td><td class="amt">' + money(amount) + '</td></tr>';
  }

  function paintResult(result) {
    var b = book(), vat = b.commercial.vatRate, conf = b.commercial.confidence;
    var sel = selected();

    countTo($('fig-low'), incVat ? result.low : result.lowExVat, 'down');
    countTo($('fig-high'), incVat ? result.high : result.highExVat, 'up');
    $('readout-label').textContent = 'Estimated total, ' + (incVat ? 'including' : 'excluding') + ' VAT';
    $('result-type').textContent = sel.map(function (t) { return t.name.toLowerCase(); }).join(' + ');

    var spread = Math.round(result.spread * 100);
    var tight = (conf.start - result.spread) / (conf.start - conf.floor);
    $('gauge').style.width = Math.max(6, Math.round(tight * 100)) + '%';
    $('gauge-label').textContent = result.spread <= conf.floor + 0.001
      ? 'Plus or minus ' + spread + '% — as tight as it gets without a survey'
      : 'Plus or minus ' + spread + '%, and it narrows once an architect has measured up';
    $('readout-note').textContent = (result.area ? result.area.toFixed(0) + ' m² of work · ' : '') +
      (result.ground ? result.ground.depth.toFixed(2) + ' m foundations · ' : '') +
      (incVat ? 'VAT included' : 'VAT not included');

    // what buying these separately would have cost
    var saveEl = $('result-saving');
    if (saveEl) {
      if (sel.length > 1 && result.saving > 0) {
        saveEl.innerHTML = '<div class="flag flag-good"><span><b>One project, not ' + sel.length +
          '.</b> Priced as separate jobs this would be ' + money(result.separately) +
          ', because you would pay for ' + sel.length + ' surveys, ' + sel.length +
          ' sets of drawings and ' + sel.length + ' building control applications. ' +
          'Doing it as one job saves ' + money(result.saving) + '.</span></div>';
      } else { saveEl.innerHTML = ''; }
    }

    var segs = [
      { cls: 's-trade', v: result.trade, name: 'Building work' },
      { cls: 's-fees', v: result.fees, name: 'Drawings and fees' },
      { cls: 's-margin', v: result.margin, name: 'Margin' },
      { cls: 's-contingency', v: result.contingency, name: 'Contingency' }
    ];
    if (incVat) segs.push({ cls: 's-vat', v: result.vat, name: 'VAT' });
    var total = segs.reduce(function (t, x) { return t + x.v; }, 0) || 1;
    $('stack-bar').innerHTML = segs.map(function (x) {
      return '<span class="' + x.cls + '" style="width:' + ((x.v / total) * 100).toFixed(2) +
        '%" title="' + x.name + ' — ' + money(x.v) + '"></span>';
    }).join('');

    // building work, grouped by what it is
    var html = '';
    (result.byType || []).forEach(function (bt) {
      if (sel.length > 1) html += '<tr class="grp"><td colspan="2">' + esc(bt.name) + '</td></tr>';
      result.lines.filter(function (l) { return l.group === 'trade' && l.type === bt.id; })
        .forEach(function (l) { html += row('', l.label, l.detail, l.amount); });
      if (sel.length > 1) html += row('sub', bt.name + ' subtotal', '', bt.trade);
    });
    html += row('sub', 'Building work', '', result.trade);
    result.lines.filter(function (l) { return l.group === 'fees'; })
      .forEach(function (l) { html += row('', l.label, l.detail, l.amount); });
    html += row('sub', 'Drawings, fees and permissions', '', result.fees);
    result.lines.filter(function (l) { return l.group === 'margin' || l.group === 'contingency'; })
      .forEach(function (l) { html += row('', l.label, l.detail, l.amount); });
    if (incVat) {
      html += row('sub', 'Total, excluding VAT', '', result.exVat);
      html += row('', 'VAT at ' + (vat * 100) + '%', '', result.vat);
      html += row('tot', 'Total, including VAT', '', result.incVat);
    } else {
      html += row('tot', 'Total, excluding VAT', '', result.exVat);
    }
    $('items').innerHTML = html;

    $('margin-note').textContent = 'On this job the fifteen per cent comes to ' + money(result.margin) +
      '. ' + money(result.datumShare) + ' of that is ours and ' + money(result.tradeShare) +
      ' goes to the builder and the consultants. It sits on the invoice rather than behind it.';

    var back = $('result-back');
    if (back && sel.length) {
      var last = sel[sel.length - 1];
      back.href = '#/' + last.id + '/' + last.steps[last.steps.length - 1].id;
    }
    groundFlag(result, 'result-flag');
  }

  /* ---- the loop ---------------------------------------------------------------- */

  function update(redraw) {
    if (!route) return;
    if (!selected().length) return;
    var proj = priceNow();

    if (route.name === 'step') {
      var t = tradeNow(route.typeId);
      if (redraw !== false) drawNow(route, t);
      if (route.step.ground) groundFlag({ ground: t.ground }, 'ground-flag');
      var lvl = $('draw-level');
      if (lvl) lvl.textContent = t.ground ? '−' + t.ground.depth.toFixed(3) : '±0.000';
    }

    var fig = $('flow-total-fig');
    if (fig) fig.textContent = rounded(incVat ? proj.low : proj.lowExVat, 'down') + '–' +
      rounded(incVat ? proj.high : proj.highExVat, 'up');
    var lab = $('flow-total-lab');
    if (lab) lab.textContent = selected().length > 1 ? 'Whole project' : 'Running estimate';

    if (route.name === 'estimate') paintResult(proj);
    return proj;
  }

  function refreshOutputs() {
    if (!route || !route.typeId) return;
    var type = route.type, j = job(route.typeId);
    asks(type).forEach(function (m) {
      var out = $('out-' + m.id);
      if (out) out.textContent = fmt(m, j.measurements[m.id] || 0);
    });
  }

  /* =====================================================================
     Events
     ===================================================================== */

  function askFor(id) {
    if (!route || !route.type) return null;
    var found = null;
    route.type.measurements.forEach(function (m) { if (m.id === id) found = m; });
    return found;
  }

  doc.addEventListener('click', function (e) {
    var t = e.target;

    var nudge = t.closest ? t.closest('[data-nudge]') : null;
    if (nudge) {
      var m = askFor(nudge.getAttribute('data-nudge'));
      if (!m) return;
      var a = m.ask, j = job(route.typeId);
      var dir = parseInt(nudge.getAttribute('data-dir'), 10);
      var stepBy = a.by || 1;
      j.measurements[m.id] = clamp(
        Math.round((( j.measurements[m.id] || 0) + dir * stepBy) * 100) / 100,
        a.min === undefined ? 0 : a.min, a.max === undefined ? 999 : a.max);
      j.touched[m.id] = true;
      refreshOutputs();
      update();
      return;
    }

    var seg = t.closest ? t.closest('.seg button[data-val]') : null;
    if (seg) {
      var group = seg.parentNode;
      Array.prototype.forEach.call(group.querySelectorAll('button'), function (b) {
        b.setAttribute('aria-pressed', String(b === seg));
      });
      var v = seg.getAttribute('data-val');
      var j2 = job(route.typeId);
      if (group.hasAttribute('data-meas')) {
        j2.measurements[group.getAttribute('data-meas')] = parseFloat(v) || 0;
        j2.touched[group.getAttribute('data-meas')] = true;
      } else if (group.hasAttribute('data-mod')) {
        j2.modifiers[group.getAttribute('data-mod')] = v;
        j2.touched['mod-' + group.getAttribute('data-mod')] = true;
      } else if (group.hasAttribute('data-soil')) {
        j2.ground.soil = v;
        j2.touched.soil = true;
      }
      update();
      return;
    }

    var pick = t.closest ? t.closest('[data-pick]') : null;
    if (pick) {
      var id = pick.getAttribute('data-pick');
      var at = project.types.indexOf(id);
      if (at >= 0) project.types.splice(at, 1); else project.types.push(id);
      saveProject();
      paintChooser();
      return;
    }

    var fl = t.closest ? t.closest('[data-floor]') : null;
    if (fl) {
      project.floor = fl.getAttribute('data-floor');
      saveProject();
      Array.prototype.forEach.call(fl.parentNode.querySelectorAll('button'), function (x) {
        x.setAttribute('aria-pressed', String(x === fl));
      });
      update();
      return;
    }

    if (t.id === 'do-trace') {
      root.DATUM.TRACE.open(function (area, rooms) {
        var j2 = job('renovation');
        j2.measurements.floorArea = Math.round(area);
        // walls and ceilings, roughly two and a half times the floor area
        j2.measurements.replasterArea = Math.round(area * 2.35);
        j2.measurements.rewireArea = Math.round(area);
        j2.touched.floorArea = true;
        j2.touched.traced = true;
        refreshOutputs();
        update();
        var note = doc.querySelector('#flow-ask .trace-cta');
        if (note) {
          note.innerHTML = '<div><p class="q-title">Measured from your plan.</p>' +
            '<p class="q-help">' + rooms.length + ' room' + (rooms.length === 1 ? '' : 's') +
            ' traced, ' + area.toFixed(1) + ' m² in total. The figures below have been set from it.</p></div>' +
            '<button type="button" class="btn btn-ghost" id="do-trace">Trace again</button>';
        }
      });
      return;
    }

    if (t.id === 'do-sketch') {
      root.DATUM.SKETCH.open(function (m) { applySketch(route.typeId, m); });
      return;
    }

    if (t.id === 'tree-add') {
      var j3 = job(route.typeId);
      if (j3.ground.trees.length >= (book().limits.maxTrees || 4)) return;
      j3.ground.trees.push({ species: 'oak', distance: 8 });
      j3.touched.trees = true;
      paintTrees(); update();
      return;
    }
    var rm = t.closest ? t.closest('[data-remove]') : null;
    if (rm) {
      job(route.typeId).ground.trees.splice(parseInt(rm.getAttribute('data-remove'), 10), 1);
      paintTrees(); update();
      return;
    }

    if (t.id === 'vat-inc' || t.id === 'vat-ex') {
      incVat = t.id === 'vat-inc';
      $('vat-inc').setAttribute('aria-pressed', String(incVat));
      $('vat-ex').setAttribute('aria-pressed', String(!incVat));
      update(false);
    }
  });

  doc.addEventListener('change', function (e) {
    var el = e.target;
    var i = el.getAttribute && el.getAttribute('data-tree');
    if (i === null || i === undefined) return;
    var j = job(route.typeId);
    i = parseInt(i, 10);
    if (el.getAttribute('data-field') === 'species') j.ground.trees[i].species = el.value;
    else {
      var v = parseFloat(el.value);
      j.ground.trees[i].distance = isNaN(v) ? 8 : clamp(v, 1, 40);
      el.value = j.ground.trees[i].distance;
    }
    j.touched.trees = true;
    update();
  });

  /* ---- dragging a dimension ---------------------------------------------------- */

  var drag = null;

  doc.addEventListener('pointerdown', function (e) {
    var chip = e.target.closest ? e.target.closest('[data-dim]') : null;
    if (!chip || !route || !route.typeId) return;
    var svg = chip.ownerSVGElement;
    var scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    var which = chip.getAttribute('data-dim');
    var view = route.name === 'estimate' ? 'section' : route.step.view;
    var a = DRAW.axis(view, which);
    drag = { which: which, x: e.clientX, y: e.clientY,
             start: job(route.typeId).measurements[which] || 0,
             ax: a[0] * scale, ay: a[1] * scale };
    focusDim = which;
    chip.focus();
    e.preventDefault();
  });

  root.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var m = askFor(drag.which);
    if (!m) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    var denom = drag.ax * drag.ax + drag.ay * drag.ay;
    var delta = (dx * drag.ax + dy * drag.ay) / denom;
    var a = m.ask, st = a.by || 0.25;
    var next = clamp(Math.round((drag.start + delta) / st) * st, a.min, a.max);
    var j = job(route.typeId);
    if (next !== j.measurements[drag.which]) {
      j.measurements[drag.which] = next;
      j.touched[drag.which] = true;
      refreshOutputs();
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
    var m = askFor(which);
    if (!m) return;
    var j = job(route.typeId), a = m.ask;
    focusDim = which;
    j.measurements[which] = clamp(
      Math.round((j.measurements[which] + dir * (a.by || 0.25)) * 100) / 100, a.min, a.max);
    j.touched[which] = true;
    refreshOutputs();
    update();
  });

  var cap = $('capture-form');
  if (cap) {
    cap.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('capture-email').value.trim();
      if (!v || v.indexOf('@') < 1) { $('capture-email').focus(); return; }
      $('capture').classList.add('is-done');
    });
  }

  /* ---- routing -------------------------------------------------------------------- */

  ROUTER.on(function (r) {
    route = r;
    if (r.name === 'landing') return;
    if (r.name === 'start') { paintChooser(); return; }

    // arriving straight at a build type adds it to the project
    if (r.typeId && project.types.indexOf(r.typeId) < 0) {
      project.types.push(r.typeId);
      saveProject();
    }
    if (r.name === 'estimate' && !selected().length) { ROUTER.go('/start'); return; }

    paintRail(r);
    if (r.name === 'step') renderStep(r);
    update();
  });

  if (D.TRACE) D.TRACE.wire();
  if (D.SKETCH) D.SKETCH.wire();
  ROUTER.start();
  if (D.HERO) D.HERO.start();
})(window, document);
