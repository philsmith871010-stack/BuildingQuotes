/*
 * Datum — sketch your house
 * ---------------------------------------------------------------------------
 * Enough of a plan to price a job. Not a drawing, not a model, not a render.
 *
 * What it captures, in the order it matters to the price:
 *   floor area and perimeter   the two biggest numbers on any job
 *   storeys and ceiling height two fields that multiply both
 *   internal wall length       studwork and plaster to both faces
 *   kitchens and bathrooms     £4,500 and £3,000 a time — the COUNT is what
 *                              matters, never the position
 *   windows and doors          modest money, but they come off the plaster area
 *
 * Because position never affects a price, rooms are dropped pins rather than
 * computed polygons. That removes the whole planar-subdivision problem and
 * costs us nothing we actually charge for.
 *
 * Walls are a chain of segments, so a rectangle is four clicks and a bay window
 * or a splayed corner costs nothing extra.
 */
(function (root, doc) {
  'use strict';

  var GRID = 0.25;              // metres — fine enough for a house, coarse enough to snap
  var ANGLE_STEP = 15;          // degrees
  var ORTHO_PULL = 7;           // degrees — how hard 0/90 grabs you
  var CLOSE_DIST = 0.6;         // metres — click this near the start to close

  var DEFAULTS = {
    window: 1.2, door: 0.9, bifold: 3.0, intDoor: 0.85
  };
  var ROOM_TYPES = [
    { id: 'kitchen',  label: 'Kitchen',  short: 'K' },
    { id: 'bathroom', label: 'Bathroom', short: 'B' },
    { id: 'wc',       label: 'WC',       short: 'W' },
    { id: 'bedroom',  label: 'Bedroom',  short: 'Bd' },
    { id: 'living',   label: 'Living',   short: 'L' },
    { id: 'hall',     label: 'Hall',     short: 'H' },
    { id: 'other',    label: 'Other',    short: '·' }
  ];

  var STAGES = [
    { id: 'walls',    n: 1, label: 'Walls',    hint: 'Click each corner of the outside of your house. Click the first corner again to close it.' },
    { id: 'windows',  n: 2, label: 'Windows',  hint: 'Click a wall to put a window in it. Click a window to change its width.' },
    { id: 'doors',    n: 3, label: 'Doors',    hint: 'Click a wall to put an external door or bi-fold in it.' },
    { id: 'internal', n: 4, label: 'Inside',   hint: 'Draw the internal walls. Click along a wall, then press Enter to finish that run.' },
    { id: 'rooms',    n: 5, label: 'Rooms',    hint: 'Drop a pin for every room in the house — upstairs too. Where you put it does not matter, only how many there are, because that is what the price is built from.' }
  ];

  var S = {
    stage: 'walls',
    outline: [],          // [[x,y], …] metres, closed when `closed` is true
    closed: false,
    internals: [],        // [ [[x,y],[x,y], …], … ] open chains
    drawing: null,        // the chain being drawn right now
    openings: [],         // { on:'ext'|'int', seg:[chainIdx, segIdx], t, width, kind }
    markers: [],          // { x, y, type }
    storeys: 2,
    ceiling: 2.4,
    cursor: null,
    typed: '',
    selected: null,
    onApply: null
  };

  var SEQ = 0;
  var $ = function (id) { return doc.getElementById(id); };
  function say(msg) { var el = $('sk-say'); if (el) el.textContent = msg || ''; }
  function esc(t) { return String(t === undefined ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmt(n, d) { return n.toFixed(d === undefined ? 2 : d); }

  /* ---- geometry ---------------------------------------------------------- */

  function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

  /* Committed points are rounded to the millimetre. cos(90°) is 6.1e-17, not
     zero, and without this a square house has a 5.999999999999999 m wall. */
  function mm(p) { return [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]; }

  function shoelace(poly) {
    var a = 0;
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a / 2);
  }

  function chainLength(chain, close) {
    var t = 0;
    for (var i = 0; i < chain.length - 1; i++) t += dist(chain[i], chain[i + 1]);
    if (close && chain.length > 2) t += dist(chain[chain.length - 1], chain[0]);
    return t;
  }

  /**
   * Snap the point being drawn: angle first, then length onto the grid.
   * Orthogonal gets a wider capture window than the other increments, so square
   * corners are effortless while a 45° bay is still one click away.
   */
  function snapFrom(from, to) {
    if (!from) return [Math.round(to[0] / GRID) * GRID, Math.round(to[1] / GRID) * GRID];
    var dx = to[0] - from[0], dy = to[1] - from[1];
    var len = Math.hypot(dx, dy);
    if (len < 0.01) return from.slice();
    var deg = Math.atan2(dy, dx) * 180 / Math.PI;

    var ortho = Math.round(deg / 90) * 90;
    var snapped = Math.abs(((deg - ortho + 540) % 360) - 180) > 180 - ORTHO_PULL
      ? ortho
      : Math.round(deg / ANGLE_STEP) * ANGLE_STEP;

    var L = Math.max(GRID, Math.round(len / GRID) * GRID);
    var r = snapped * Math.PI / 180;
    return mm([from[0] + Math.cos(r) * L, from[1] + Math.sin(r) * L]);
  }

  /** Nearest point on segment ab to p, as a parameter 0..1 and a distance. */
  function projectOnSeg(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var L2 = dx * dx + dy * dy;
    if (!L2) return { t: 0, d: dist(p, a) };
    var t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    return { t: t, d: Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)) };
  }

  /** Every wall, as {on, chain, i, a, b} so openings can name one. */
  function walls() {
    var out = [];
    if (S.closed) {
      for (var i = 0; i < S.outline.length; i++) {
        out.push({ on: 'ext', chain: 0, i: i,
                   a: S.outline[i], b: S.outline[(i + 1) % S.outline.length] });
      }
    }
    S.internals.forEach(function (ch, c) {
      for (var j = 0; j < ch.length - 1; j++) {
        out.push({ on: 'int', chain: c, i: j, a: ch[j], b: ch[j + 1] });
      }
    });
    return out;
  }

  /* Each stage opens with the thing you most likely want to place. */
  function defaultKind(stage) {
    return stage === 'windows' ? 'window'
      : stage === 'doors' ? 'door'
      : stage === 'internal' ? 'wall' : null;
  }

  function wallAt(p, on) {
    var best = null;
    walls().forEach(function (w) {
      if (on && w.on !== on) return;
      var pr = projectOnSeg(p, w.a, w.b);
      if (pr.d < 0.5 && (!best || pr.d < best.d)) best = { w: w, t: pr.t, d: pr.d };
    });
    return best;
  }

  /* ---- what the price actually needs -------------------------------------- */

  function measure() {
    var area = S.closed ? shoelace(S.outline) : 0;
    var perim = S.closed ? chainLength(S.outline, true) : 0;
    var intLen = S.internals.reduce(function (t, ch) { return t + chainLength(ch, false); }, 0);

    var win = S.openings.filter(function (o) { return o.kind === 'window'; });
    var extDoor = S.openings.filter(function (o) { return o.kind === 'door' || o.kind === 'bifold'; });
    var intDoor = S.openings.filter(function (o) { return o.kind === 'intDoor'; });
    var openArea = S.openings.reduce(function (t, o) {
      return t + o.width * (o.kind === 'window' ? 1.3 : 2.1);
    }, 0);

    var extWall = perim * S.ceiling * S.storeys;
    var intWall = intLen * S.ceiling * S.storeys * 2;      // plastered both faces
    var plaster = Math.max(0, extWall - openArea) + intWall;

    var counts = {};
    ROOM_TYPES.forEach(function (r) { counts[r.id] = 0; });
    S.markers.forEach(function (m) { counts[m.type] = (counts[m.type] || 0) + 1; });

    return {
      area: area, totalArea: area * S.storeys, perimeter: perim,
      internalWall: intLen * S.storeys,
      plaster: plaster,
      windows: win.length, windowWidth: win.reduce(function (t, o) { return t + o.width; }, 0),
      extDoors: extDoor.length, intDoors: intDoor.length,
      counts: counts,
      // the pins in the order they were dropped — this becomes the room list
      // the renovation flow prices, one question at a time
      rooms: S.markers.map(function (m2) { return m2.type; })
    };
  }

  /* ---- drawing ------------------------------------------------------------ */

  var VIEW = { x0: -1, y0: -1, x1: 13, y1: 11 };

  /*
   * Never tighter than a decent-sized house. Fitting hard to the geometry means
   * that after the first corner the frame collapses to a few metres across and
   * the second corner is off the edge of the screen before you reach for it.
   */
  var MIN_W = 15, MIN_H = 12;
  var PAD = 2.2;

  function points() {
    var pts = S.outline.concat.apply(S.outline, S.internals)
      .concat(S.markers.map(function (m) { return [m.x, m.y]; }));
    return S.drawing ? pts.concat(S.drawing) : pts;
  }

  /** Padded bounding box of everything committed so far, or null. */
  function bounds() {
    var pts = points();
    if (!pts.length) return null;
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    return { x0: Math.min.apply(null, xs) - PAD, x1: Math.max.apply(null, xs) + PAD,
             y0: Math.min.apply(null, ys) - PAD, y1: Math.max.apply(null, ys) + PAD };
  }

  function atLeast(v) {
    var cx, cy;
    if (v.x1 - v.x0 < MIN_W) { cx = (v.x0 + v.x1) / 2; v.x0 = cx - MIN_W / 2; v.x1 = cx + MIN_W / 2; }
    if (v.y1 - v.y0 < MIN_H) { cy = (v.y0 + v.y1) / 2; v.y0 = cy - MIN_H / 2; v.y1 = cy + MIN_H / 2; }
    return v;
  }

  /** Zoom to the plan — used once the outline closes, and on a reset. */
  function fit() {
    var b = bounds();
    return b ? atLeast(b) : { x0: VIEW.x0, y0: VIEW.y0, x1: VIEW.x1, y1: VIEW.y1 };
  }

  var K = 46;   // px per metre in the SVG's own units

  /*
   * The frame is recomputed when the geometry changes, never on a mouse move.
   * A viewBox that refits every frame makes the plan swim under your hand as
   * you draw. It grows to keep the cursor in shot, but it never shrinks back
   * mid-run, so the scale only ever changes when you push past the edge.
   */
  var FRAME = null;

  /*
   * While you are drawing, the frame only ever grows. Refitting it to the
   * points so far recentres the plan under your hand, and on a touchscreen —
   * where there is no cursor to push the edge outwards — it makes anything
   * taller than the opening frame impossible to draw at all: the next corner
   * is off the element before you can tap it.
   */
  function refit() {
    if (!FRAME) FRAME = { x0: VIEW.x0, y0: VIEW.y0, x1: VIEW.x1, y1: VIEW.y1 };
    var b = bounds();
    if (!b) return;
    if (b.x0 < FRAME.x0) FRAME.x0 = b.x0;
    if (b.x1 > FRAME.x1) FRAME.x1 = b.x1;
    if (b.y0 < FRAME.y0) FRAME.y0 = b.y0;
    if (b.y1 > FRAME.y1) FRAME.y1 = b.y1;
  }

  /** The one moment zooming in is welcome: the shape is finished. */
  function refitTight() { FRAME = fit(); }

  function changed() { refit(); render(); }
  function settled() { refitTight(); render(); }

  function frame() {
    if (!FRAME) refit();
    var v = FRAME, p = S.cursor;
    if (p) {
      if (p[0] - 1 < v.x0) v.x0 = p[0] - 1;
      if (p[0] + 1 > v.x1) v.x1 = p[0] + 1;
      if (p[1] - 1 < v.y0) v.y0 = p[1] - 1;
      if (p[1] + 1 > v.y1) v.y1 = p[1] + 1;
    }
    return v;
  }

  function P(p) { return [(p[0] * K).toFixed(1), (p[1] * K).toFixed(1)]; }
  function poly(pts) { return pts.map(function (p) { return P(p).join(','); }).join(' '); }

  function gridSvg(v) {
    var out = [];
    var x, y;
    for (x = Math.ceil(v.x0); x <= v.x1; x++) {
      out.push('<line x1="' + (x * K) + '" y1="' + (v.y0 * K) + '" x2="' + (x * K) + '" y2="' + (v.y1 * K) +
        '" class="sk-grid' + (x % 5 === 0 ? ' major' : '') + '"/>');
    }
    for (y = Math.ceil(v.y0); y <= v.y1; y++) {
      out.push('<line x1="' + (v.x0 * K) + '" y1="' + (y * K) + '" x2="' + (v.x1 * K) + '" y2="' + (y * K) +
        '" class="sk-grid' + (y % 5 === 0 ? ' major' : '') + '"/>');
    }
    return out.join('');
  }

  /* Perpendicular to ab, unit length, rotated so it points to the left of ab. */
  function normal(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    return L ? [-dy / L, dx / L] : [0, 0];
  }

  /*
   * Dimensions sit clear of the wall rather than on it. On the wall they get
   * painted over by the first window you add, and the number is the whole point.
   */
  function lengthTag(a, b, cls, off, at) {
    var o = off || [0, 0], f = at === undefined ? 0.5 : at;
    var mx = (a[0] + (b[0] - a[0]) * f + o[0]) * K, my = (a[1] + (b[1] - a[1]) * f + o[1]) * K;
    var L = dist(a, b);
    var w = 46, h = 19;
    return '<g class="sk-tag ' + (cls || '') + '">' +
      '<rect x="' + (mx - w / 2) + '" y="' + (my - h / 2) + '" width="' + w + '" height="' + h + '" rx="3"/>' +
      '<text x="' + mx + '" y="' + (my + 4.5) + '" text-anchor="middle">' + fmt(L) + '</text></g>';
  }

  function openingSvg(o) {
    var w = walls().filter(function (x) { return x.on === o.on && x.chain === o.seg[0] && x.i === o.seg[1]; })[0];
    if (!w) return '';
    var L = dist(w.a, w.b);
    if (!L) return '';
    var ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L;
    var half = Math.min(o.width, L) / 2;
    var c = [w.a[0] + ux * (o.t * L), w.a[1] + uy * (o.t * L)];
    var p1 = [c[0] - ux * half, c[1] - uy * half];
    var p2 = [c[0] + ux * half, c[1] + uy * half];
    var cls = 'sk-open sk-' + o.kind + (S.selected === o.id ? ' sel' : '');
    return '<line x1="' + P(p1)[0] + '" y1="' + P(p1)[1] + '" x2="' + P(p2)[0] + '" y2="' + P(p2)[1] +
      '" class="' + cls + '" data-open="' + o.id + '"/>';
  }

  /* Outward from the middle of the plan, so external dimensions sit outside it. */
  function outward(a, b, c) {
    var n = normal(a, b);
    var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    var away = (mid[0] - c[0]) * n[0] + (mid[1] - c[1]) * n[1] >= 0 ? 1 : -1;
    return [n[0] * away * 0.62, n[1] * away * 0.62];
  }

  function centroid(pts) {
    var c = pts.reduce(function (t, p) { return [t[0] + p[0], t[1] + p[1]]; }, [0, 0]);
    return [c[0] / pts.length, c[1] / pts.length];
  }

  function render() {
    var svg = $('sk-svg');
    if (!svg) return;
    var v = frame();
    svg.setAttribute('viewBox', [v.x0 * K, v.y0 * K, (v.x1 - v.x0) * K, (v.y1 - v.y0) * K].join(' '));

    var out = [gridSvg(v)];

    // the floor plate, once there is one
    if (S.closed) out.push('<polygon points="' + poly(S.outline) + '" class="sk-floor"/>');

    // external walls
    if (S.outline.length > 1) {
      var pts = S.closed ? S.outline.concat([S.outline[0]]) : S.outline;
      out.push('<polyline points="' + poly(pts) + '" class="sk-ext"/>');
    }
    // internal walls
    S.internals.forEach(function (ch) {
      if (ch.length > 1) out.push('<polyline points="' + poly(ch) + '" class="sk-int"/>');
    });

    // the run being drawn, plus a rubber band to the cursor
    if (S.drawing && S.drawing.length) {
      out.push('<polyline points="' + poly(S.drawing) + '" class="sk-draft"/>');
      if (S.cursor) {
        var last = S.drawing[S.drawing.length - 1];
        out.push('<line x1="' + P(last)[0] + '" y1="' + P(last)[1] + '" x2="' + P(S.cursor)[0] +
          '" y2="' + P(S.cursor)[1] + '" class="sk-band"/>');
        out.push(lengthTag(last, S.cursor, 'live'));
      }
    }

    // openings go under the dimensions, never over them
    S.openings.forEach(function (o) { out.push(openingSvg(o)); });

    // dimensions on every finished wall
    if (S.closed) {
      var c0 = centroid(S.outline);
      for (var i = 0; i < S.outline.length; i++) {
        var a = S.outline[i], b = S.outline[(i + 1) % S.outline.length];
        out.push(lengthTag(a, b, '', outward(a, b, c0)));
      }
    } else if (S.drawing) {
      for (var j = 0; j < S.drawing.length - 1; j++) out.push(lengthTag(S.drawing[j], S.drawing[j + 1]));
    }
    S.internals.forEach(function (ch) {
      for (var k = 0; k < ch.length - 1; k++) {
        // a third of the way along, because the middle is where the doorway goes
        var n = normal(ch[k], ch[k + 1]);
        out.push(lengthTag(ch[k], ch[k + 1], '', [n[0] * 0.5, n[1] * 0.5], 0.3));
      }
    });

    // corner handles
    var handles = S.closed ? S.outline : (S.drawing || []);
    handles.forEach(function (p, i) {
      out.push('<circle cx="' + P(p)[0] + '" cy="' + P(p)[1] + '" r="7" class="sk-node' +
        (!S.closed && i === 0 && S.drawing && S.drawing.length > 2 ? ' start' : '') +
        '" data-node="' + i + '"/>');
    });

    // room pins
    S.markers.forEach(function (m, i) {
      var t = ROOM_TYPES.filter(function (r) { return r.id === m.type; })[0] || ROOM_TYPES[ROOM_TYPES.length - 1];
      out.push('<g class="sk-pin" data-marker="' + i + '"><circle cx="' + (m.x * K) + '" cy="' + (m.y * K) +
        '" r="15"/><text x="' + (m.x * K) + '" y="' + (m.y * K + 5) + '" text-anchor="middle">' +
        esc(t.short) + '</text></g>');
    });

    // the area, as a caption in the corner of the frame rather than a label on
    // the plan — in the middle it lands on whichever internal wall you drew last
    if (S.closed) {
      out.push('<text x="' + ((v.x0 + 0.5) * K) + '" y="' + ((v.y0 + 1.5) * K) + '" class="sk-area">' +
        fmt(shoelace(S.outline), 1) + ' m² footprint</text>');
    }

    svg.innerHTML = out.join('');
    paintPanel();
  }

  /* ---- panel --------------------------------------------------------------- */

  function paintPanel() {
    var m = measure();
    var stage = STAGES.filter(function (s) { return s.id === S.stage; })[0];

    var tabs = $('sk-stages');
    if (tabs) {
      tabs.innerHTML = STAGES.map(function (s) {
        var done = s.id === 'walls' ? S.closed
          : s.id === 'windows' ? m.windows > 0
          : s.id === 'doors' ? m.extDoors > 0
          : s.id === 'internal' ? S.internals.length > 0
          : S.markers.length > 0;
        var locked = s.id !== 'walls' && !S.closed;
        return '<button type="button" data-stage="' + s.id + '" aria-pressed="' + (s.id === S.stage) +
          '"' + (locked ? ' disabled' : '') + '><i>' + (done ? '✓' : s.n) + '</i>' + esc(s.label) + '</button>';
      }).join('');
    }
    var hint = $('sk-hint');
    if (hint) hint.textContent = stage ? stage.hint : '';

    var tools = $('sk-tools');
    if (tools) tools.innerHTML = toolsFor(S.stage);

    var read = $('sk-read');
    if (!read) return;
    var row = function (k, v, strong) {
      return '<div class="sk-row' + (strong ? ' strong' : '') + '"><span>' + k + '</span><b>' + v + '</b></div>';
    };
    read.innerHTML =
      row('Footprint', S.closed ? fmt(m.area, 1) + ' m²' : '—', true) +
      row('Storeys', S.storeys) +
      row('Total floor area', S.closed ? fmt(m.totalArea, 1) + ' m²' : '—', true) +
      row('External walls', S.closed ? fmt(m.perimeter, 1) + ' m' : '—') +
      row('Internal walls', fmt(m.internalWall, 1) + ' m') +
      row('Wall area to plaster', S.closed ? fmt(m.plaster, 0) + ' m²' : '—', true) +
      row('Windows', m.windows + (m.windowWidth ? ' · ' + fmt(m.windowWidth, 1) + ' m' : '')) +
      row('External doors', m.extDoors) +
      row('Internal doors', m.intDoors) +
      row('Kitchens', m.counts.kitchen || 0, (m.counts.kitchen || 0) > 0) +
      row('Bathrooms', (m.counts.bathroom || 0) + (m.counts.wc ? ' + ' + m.counts.wc + ' WC' : ''),
          (m.counts.bathroom || 0) > 0);

    var apply = $('sk-apply');
    if (apply) apply.disabled = !S.closed;
  }

  function toolsFor(stage) {
    if (stage === 'walls') {
      return '<div class="sk-tool"><label>Storeys</label><div class="seg" data-storeys="1">' +
        [1, 2, 3].map(function (n) {
          return '<button type="button" data-storey="' + n + '" aria-pressed="' + (S.storeys === n) + '">' + n + '</button>';
        }).join('') + '</div></div>' +
        '<div class="sk-tool"><label>Ceiling height</label><div class="seg">' +
        [2.3, 2.4, 2.7, 3.0].map(function (h) {
          return '<button type="button" data-ceiling="' + h + '" aria-pressed="' + (S.ceiling === h) + '">' + h.toFixed(1) + ' m</button>';
        }).join('') + '</div></div>' +
        (S.closed ? '<button type="button" class="btn btn-ghost btn-sm" id="sk-redraw">Draw it again</button>'
                  : '<button type="button" class="btn btn-ghost btn-sm" id="sk-rect">Start from a rectangle</button>');
    }
    if (stage === 'windows' || stage === 'doors' || stage === 'internal') {
      var kinds = stage === 'windows'
        ? [['window', 'Window', DEFAULTS.window]]
        : stage === 'doors'
          ? [['door', 'Door', DEFAULTS.door], ['bifold', 'Bi-fold', DEFAULTS.bifold]]
          : [['wall', 'Wall'], ['intDoor', 'Doorway']];
      var sel = S.openings.filter(function (o) { return o.id === S.selected; })[0];
      var kind = S.kind || defaultKind(stage);
      return '<div class="sk-tool"><label>Add</label><div class="seg">' +
        kinds.map(function (k) {
          return '<button type="button" data-kind="' + k[0] + '" aria-pressed="' + (kind === k[0]) + '">' + k[1] + '</button>';
        }).join('') + '</div></div>' +
        (stage === 'internal' && kind === 'wall'
          ? '<button type="button" class="btn btn-ghost btn-sm" id="sk-done">Finish this run</button>' : '') +
        (sel ? '<div class="sk-tool"><label>Width of the one you picked</label><div class="seg">' +
          [0.6, 0.9, 1.2, 1.8, 2.4, 3.0].map(function (w) {
            return '<button type="button" data-width="' + w + '" aria-pressed="' + (Math.abs(sel.width - w) < 0.01) + '">' + w.toFixed(1) + '</button>';
          }).join('') + '</div>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="sk-del">Remove it</button></div>' : '');
    }
    return '<div class="sk-tool"><label>Drop a pin for</label><div class="seg seg-wrap">' +
      ROOM_TYPES.map(function (r) {
        return '<button type="button" data-room="' + r.id + '" aria-pressed="' + (S.roomType === r.id) + '">' + esc(r.label) + '</button>';
      }).join('') + '</div></div>';
  }

  /* ---- input --------------------------------------------------------------- */

  function toWorld(evt) {
    var svg = $('sk-svg');
    var ctm = svg.getScreenCTM();
    if (!ctm) return [0, 0];
    var pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    var p = pt.matrixTransform(ctm.inverse());
    return [p.x / K, p.y / K];
  }

  function onMove(e) {
    if (S.stage !== 'walls' && S.stage !== 'internal') return;
    var w = toWorld(e);
    var from = S.drawing && S.drawing.length ? S.drawing[S.drawing.length - 1] : null;
    S.cursor = snapFrom(from, w);
    if (S.drawing && S.drawing.length) render();
  }

  function onClick(e) {
    var w = toWorld(e);

    if (S.stage === 'walls') {
      if (S.closed) return;
      var from = S.drawing && S.drawing.length ? S.drawing[S.drawing.length - 1] : null;
      var p = snapFrom(from, w);
      if (!S.drawing) S.drawing = [];
      if (S.drawing.length > 2 && dist(p, S.drawing[0]) < CLOSE_DIST) { closeOutline(); return; }
      S.drawing.push(p);
      changed();
      return;
    }

    var kind = S.kind || defaultKind(S.stage);

    if (S.stage === 'internal' && kind === 'wall') {
      var f2 = S.drawing && S.drawing.length ? S.drawing[S.drawing.length - 1] : null;
      var q = snapFrom(f2, w);
      if (!S.drawing) S.drawing = [];
      S.drawing.push(q);
      changed();
      return;
    }

    if (S.stage === 'rooms') {
      S.markers.push({ x: Math.round(w[0] / GRID) * GRID, y: Math.round(w[1] / GRID) * GRID,
                       type: S.roomType || 'bedroom' });
      changed();
      return;
    }

    // an opening always lands on a wall, so a miss is a miss rather than a
    // stray sash floating in the middle of the lounge
    var hit = wallAt(w, S.stage === 'internal' ? 'int' : 'ext');
    if (!hit) { say(S.stage === 'internal' ? 'Click on an internal wall.' : 'Click on an outside wall.'); return; }
    var o = { id: 'o' + (++SEQ),
              on: hit.w.on, seg: [hit.w.chain, hit.w.i], t: hit.t,
              width: DEFAULTS[kind], kind: kind };
    S.openings.push(o);
    S.selected = o.id;
    say('');
    changed();
  }

  function closeOutline() {
    S.outline = S.drawing.slice();
    S.closed = true;
    S.drawing = null;
    S.cursor = null;
    S.stage = 'windows';
    S.kind = defaultKind('windows');
    settled();
  }

  function finishRun() {
    if (S.stage === 'internal' && S.drawing && S.drawing.length > 1) S.internals.push(S.drawing.slice());
    S.drawing = null;
    S.cursor = null;
    changed();
  }

  function undo() {
    if (S.drawing && S.drawing.length) { S.drawing.pop(); changed(); return; }
    if (S.stage === 'rooms' && S.markers.length) { S.markers.pop(); changed(); return; }
    if (S.stage === 'internal' && S.internals.length) { S.internals.pop(); changed(); return; }
    if (S.openings.length && S.stage !== 'walls') { S.openings.pop(); S.selected = null; changed(); return; }
    if (S.closed) {
      S.drawing = S.outline.slice(); S.outline = []; S.closed = false;
      S.stage = 'walls'; S.kind = null; changed();
    }
  }

  /** Typing a number while drawing sets that wall's length exactly. */
  function commitTyped() {
    var v = parseFloat(S.typed);
    S.typed = '';
    showTyped();
    if (!v || !S.cursor || !S.drawing || !S.drawing.length) { render(); return; }
    var from = S.drawing[S.drawing.length - 1];
    var d = dist(from, S.cursor);
    if (!d) return;
    var ux = (S.cursor[0] - from[0]) / d, uy = (S.cursor[1] - from[1]) / d;
    var p = mm([from[0] + ux * v, from[1] + uy * v]);
    if (S.stage === 'walls' && S.drawing.length > 2 && dist(p, S.drawing[0]) < CLOSE_DIST) { closeOutline(); return; }
    S.drawing.push(p);
    S.cursor = p;
    changed();
  }

  /* ---- wiring --------------------------------------------------------------- */

  function open(onApply) {
    S.onApply = onApply || null;
    var wrap = $('sk-overlay');
    wrap.classList.add('on');
    wrap.setAttribute('aria-hidden', 'false');
    changed();
  }
  function close() {
    var wrap = $('sk-overlay');
    wrap.classList.remove('on');
    wrap.setAttribute('aria-hidden', 'true');
  }
  function reset() {
    S.outline = []; S.closed = false; S.internals = []; S.drawing = null;
    S.openings = []; S.markers = []; S.selected = null; S.stage = 'walls';
    S.kind = null; S.cursor = null; S.typed = ''; showTyped(); say('');
    FRAME = null; settled();
  }

  function wire() {
    var svg = $('sk-svg');
    if (!svg) return;
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('click', onClick);

    $('sk-overlay').addEventListener('click', function (e) {
      var t = e.target;

      var st = t.closest ? t.closest('[data-stage]') : null;
      if (st && !st.disabled) {
        if (S.stage === 'internal') finishRun();
        S.stage = st.getAttribute('data-stage');
        S.kind = defaultKind(S.stage);
        S.drawing = null; S.cursor = null; S.selected = null; say('');
        changed(); return;
      }

      var sy = t.closest ? t.closest('[data-storey]') : null;
      if (sy) { S.storeys = +sy.getAttribute('data-storey'); render(); return; }
      var ch = t.closest ? t.closest('[data-ceiling]') : null;
      if (ch) { S.ceiling = +ch.getAttribute('data-ceiling'); render(); return; }
      var kd = t.closest ? t.closest('[data-kind]') : null;
      if (kd) { S.kind = kd.getAttribute('data-kind'); render(); return; }
      var rm = t.closest ? t.closest('[data-room]') : null;
      if (rm) { S.roomType = rm.getAttribute('data-room'); render(); return; }
      var wd = t.closest ? t.closest('[data-width]') : null;
      if (wd) {
        var sel = S.openings.filter(function (o) { return o.id === S.selected; })[0];
        if (sel) sel.width = +wd.getAttribute('data-width');
        changed(); return;
      }
      var op = t.closest ? t.closest('[data-open]') : null;
      if (op) { S.selected = op.getAttribute('data-open'); render(); return; }
      var mk = t.closest ? t.closest('[data-marker]') : null;
      if (mk && S.stage === 'rooms') { S.markers.splice(+mk.getAttribute('data-marker'), 1); changed(); return; }

      if (t.id === 'sk-del') {
        S.openings = S.openings.filter(function (o) { return o.id !== S.selected; });
        S.selected = null; changed(); return;
      }
      if (t.id === 'sk-redraw') { reset(); return; }
      if (t.id === 'sk-rect') {
        S.drawing = null;
        S.outline = [[0, 0], [8, 0], [8, 9], [0, 9]];
        S.closed = true; S.stage = 'windows'; S.kind = defaultKind('windows');
        settled(); return;
      }
      if (t.id === 'sk-undo') { undo(); return; }
      if (t.id === 'sk-done') { finishRun(); return; }
      if (t.id === 'sk-close-btn') { close(); return; }
      if (t.id === 'sk-apply') {
        if (S.onApply) S.onApply(measure(), S);
        close(); return;
      }
      if (t === $('sk-overlay')) close();
    });

    doc.addEventListener('keydown', function (e) {
      if (!$('sk-overlay').classList.contains('on')) return;
      if (e.key === 'Escape') { if (S.drawing) { S.drawing = null; render(); } else close(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (S.stage === 'internal') finishRun(); else commitTyped(); return; }
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (S.typed) { S.typed = S.typed.slice(0, -1); showTyped(); } else undo();
        return;
      }
      if (/^[0-9.]$/.test(e.key)) { S.typed += e.key; showTyped(); }
    });
  }

  function showTyped() {
    var el = $('sk-typed');
    if (!el) return;
    el.hidden = !S.typed;
    el.textContent = S.typed ? S.typed + ' m — press Enter' : '';
  }

  root.DATUM = root.DATUM || {};
  root.DATUM.SKETCH = { open: open, close: close, wire: wire, reset: reset, measure: measure, _S: S };
})(window, document);
