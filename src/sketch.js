/*
 * Datum — draw your house
 * ---------------------------------------------------------------------------
 * The tool this whole thing rests on. A homeowner with no drawing skill and no
 * floor plan produces something we can price, in about ninety seconds, without
 * being told how.
 *
 * The one idea that makes it simple: YOU DRAW THE SHAPE, THEN MEASURE IT ONCE.
 *
 * Nothing on screen is in metres while you are drawing. You trace the outside
 * of the house on a plain grid, close it, and then type the length of a single
 * wall you happen to know. That one number scales everything else — every other
 * wall, every floor, the areas, the lot. It is how a surveyor scales off a
 * drawing and how anyone reads a map, and it means the drawing part demands no
 * arithmetic at all.
 *
 * The stages are the order a builder walks a house:
 *   1 outline      the shape, per floor. Copy the floor below or draw a new one
 *   2 inside walls two clicks each, no chains, nothing to "finish"
 *   3 doors        click a wall
 *   4 windows      click a wall
 *   5 rooms        a pin per room. Position never affects a price, only count
 *   6 extension    the proposed work, if there is any
 *
 * What it deliberately does not do: rendering, room polygons, wall types,
 * levels, north points, furniture, or anything else that would make it a
 * drawing package rather than a way to get a price.
 */
(function (root, doc) {
  'use strict';

  /* Everything is drawn in GRID UNITS until a wall is measured. One unit is
     roughly a metre, but nothing depends on that — `scale` decides. */
  var SNAP = 0.5;               // grid units a corner lands on
  var ANGLE_STEP = 15;          // degrees
  var ORTHO_PULL = 8;           // degrees — how hard 0/90 grabs you
  var CLOSE_UNITS = 1.1;        // click this near the first corner to close
  var K = 44;                   // SVG user units per grid unit

  var DEFAULTS = { window: 1.2, door: 0.9, bifold: 3.0, intDoor: 0.85 };
  var CEILING = 2.4;

  var ROOM_TYPES = [
    { id: 'kitchen',  label: 'Kitchen',  short: 'K' },
    { id: 'living',   label: 'Living',   short: 'L' },
    { id: 'bedroom',  label: 'Bedroom',  short: 'B' },
    { id: 'bathroom', label: 'Bathroom', short: 'Ba' },
    { id: 'wc',       label: 'WC',       short: 'W' },
    { id: 'hall',     label: 'Hall',     short: 'H' },
    { id: 'other',    label: 'Other',    short: '·' }
  ];

  var STAGES = [
    { id: 'outline',   n: 1, label: 'Outline',      hint: 'Click round the outside of the house.',
      done: 'Drag a corner to move it. Tap a wall to add one.' },
    { id: 'internal',  n: 2, label: 'Inside walls', hint: 'Click each end of a wall inside the house.',
      done: 'Drag either end to move a wall, or tap one to remove it.' },
    { id: 'doors',     n: 3, label: 'Doors',        hint: 'Click a wall to put a door in it.' },
    { id: 'windows',   n: 4, label: 'Windows',      hint: 'Click a wall to put a window in it.' },
    { id: 'rooms',     n: 5, label: 'Rooms',        hint: 'Tap a room type, then tap where it is.' },
    { id: 'extension', n: 6, label: 'Extension',    hint: 'Draw the new bit, if you are adding one.',
      done: 'Drag a corner to move it. Tap a wall to add one.' }
  ];

  var FLOOR_NAMES = ['Ground floor', 'First floor', 'Second floor', 'Loft'];

  function newFloor(i) {
    return { name: FLOOR_NAMES[i] || ('Floor ' + (i + 1)),
             outline: [], closed: false, internals: [], openings: [], markers: [],
             image: null };
  }

  var S = {
    started: false,      // false while the blank-or-upload choice is up
    stage: 'outline',
    scale: null,         // metres per grid unit — null until one wall is measured
    floors: [newFloor(0)],
    active: 0,
    extension: { outline: [], closed: false, storeys: 1 },
    drawing: null,
    cursor: null,
    selected: null,      // an opening id
    pick: null,          // a selected corner or inside wall, for moving or removing
    calibrating: false,
    calibIdx: 0,         // which outline segment is being measured
    kind: null,
    roomType: 'bedroom',
    onApply: null
  };

  var SEQ = 0;
  var $ = function (id) { return doc.getElementById(id); };
  function esc(t) { return String(t === undefined ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmt(n, d) { return (n || 0).toFixed(d === undefined ? 1 : d); }
  function floor() { return S.floors[S.active]; }
  function ground() { return S.floors[0]; }

  /* ---- geometry ------------------------------------------------------------ */

  function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  function mm(p) { return [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]; }

  function shoelace(poly) {
    var a = 0;
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a / 2);
  }

  function ringLength(poly) {
    var t = 0;
    for (var i = 0; i < poly.length; i++) t += dist(poly[i], poly[(i + 1) % poly.length]);
    return t;
  }

  /**
   * Angle first, then length onto the grid. Orthogonal gets a wider capture
   * window than the other increments, so a square corner takes no care at all
   * while a 45° bay is still one click away.
   */
  function snapFrom(from, to) {
    if (!from) return [Math.round(to[0] / SNAP) * SNAP, Math.round(to[1] / SNAP) * SNAP];
    var dx = to[0] - from[0], dy = to[1] - from[1];
    var len = Math.hypot(dx, dy);
    if (len < 0.05) return from.slice();
    var deg = Math.atan2(dy, dx) * 180 / Math.PI;
    var ortho = Math.round(deg / 90) * 90;
    var snapped = Math.abs(((deg - ortho + 540) % 360) - 180) > 180 - ORTHO_PULL
      ? ortho
      : Math.round(deg / ANGLE_STEP) * ANGLE_STEP;
    var L = Math.max(SNAP, Math.round(len / SNAP) * SNAP);
    var r = snapped * Math.PI / 180;
    return mm([from[0] + Math.cos(r) * L, from[1] + Math.sin(r) * L]);
  }

  function projectOnSeg(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var L2 = dx * dx + dy * dy;
    if (!L2) return { t: 0, d: dist(p, a) };
    var t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    return { t: t, d: Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)) };
  }

  /** Every wall on a floor, external and internal, as something an opening can name. */
  function wallsOf(f) {
    var out = [], i;
    if (f.closed) {
      for (i = 0; i < f.outline.length; i++) {
        out.push({ on: 'ext', idx: i, a: f.outline[i], b: f.outline[(i + 1) % f.outline.length] });
      }
    }
    for (i = 0; i < f.internals.length; i++) {
      out.push({ on: 'int', idx: i, a: f.internals[i][0], b: f.internals[i][1] });
    }
    return out;
  }

  function wallAt(p, on) {
    var best = null;
    wallsOf(floor()).forEach(function (w) {
      if (on && w.on !== on) return;
      var pr = projectOnSeg(p, w.a, w.b);
      if (pr.d < 0.7 && (!best || pr.d < best.d)) best = { w: w, t: pr.t, d: pr.d };
    });
    return best;
  }

  function openingWall(f, o) {
    var found = null;
    wallsOf(f).forEach(function (w) { if (w.on === o.on && w.idx === o.idx) found = w; });
    return found;
  }

  /* ---- what the price needs ------------------------------------------------- */

  /** Grid units → metres. Everything public is metres; nothing internal is. */
  function m(v) { return (S.scale || 0) * v; }

  function measure() {
    var areas = S.floors.map(function (f) { return f.closed ? shoelace(f.outline) : 0; });
    var footprint = m(areas[0]) * m(1);                 // area scales by the square
    var total = areas.reduce(function (t, a) { return t + m(a) * m(1); }, 0);
    var perim = ground().closed ? m(ringLength(ground().outline)) : 0;

    var intLen = 0, win = 0, winW = 0, extDoor = 0, intDoor = 0, openArea = 0, extWall = 0;
    var counts = {}, rooms = [];
    ROOM_TYPES.forEach(function (r) { counts[r.id] = 0; });

    S.floors.forEach(function (f) {
      f.internals.forEach(function (seg) { intLen += m(dist(seg[0], seg[1])); });
      if (f.closed) extWall += m(ringLength(f.outline)) * CEILING;
      f.openings.forEach(function (o) {
        if (o.kind === 'window') { win++; winW += o.width; }
        else if (o.kind === 'intDoor') intDoor++;
        else extDoor++;
        openArea += o.width * (o.kind === 'window' ? 1.3 : 2.1);
      });
      f.markers.forEach(function (mk) {
        counts[mk.type] = (counts[mk.type] || 0) + 1;
        rooms.push(mk.type);
      });
    });

    var plaster = Math.max(0, extWall - openArea) + intLen * CEILING * 2;

    var ext = null;
    if (S.extension.closed) {
      var xs = S.extension.outline.map(function (p) { return p[0]; });
      var ys = S.extension.outline.map(function (p) { return p[1]; });
      ext = {
        area: m(shoelace(S.extension.outline)) * m(1),
        width: m(Math.max.apply(null, xs) - Math.min.apply(null, xs)),
        depth: m(Math.max.apply(null, ys) - Math.min.apply(null, ys)),
        storeys: S.extension.storeys
      };
    }

    return {
      scaled: !!S.scale,
      floors: S.floors.filter(function (f) { return f.closed; }).length,
      footprint: footprint, totalArea: total, perimeter: perim,
      internalWall: intLen, plaster: plaster,
      windows: win, windowWidth: winW, extDoors: extDoor, intDoors: intDoor,
      counts: counts, rooms: rooms, extension: ext
    };
  }

  /* ---- the frame ------------------------------------------------------------ */

  var VIEW = { x0: -1, y0: -1, x1: 15, y1: 12 };
  var MIN_W = 16, MIN_H = 12, PAD = 2.4;
  var FRAME = null;

  function allPoints() {
    var f = floor();
    var pts = f.outline.slice();
    f.internals.forEach(function (s) { pts.push(s[0], s[1]); });
    f.markers.forEach(function (mk) { pts.push([mk.x, mk.y]); });
    if (S.stage === 'extension') pts = pts.concat(ground().outline, S.extension.outline);
    if (S.drawing) pts = pts.concat(S.drawing);
    if (f.image) pts.push([f.image.x, f.image.y], [f.image.x + f.image.w, f.image.y + f.image.h]);
    return pts;
  }

  function bounds() {
    var pts = allPoints();
    if (!pts.length) return null;
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    return { x0: Math.min.apply(null, xs) - PAD, x1: Math.max.apply(null, xs) + PAD,
             y0: Math.min.apply(null, ys) - PAD, y1: Math.max.apply(null, ys) + PAD };
  }

  function atLeast(v) {
    var c;
    if (v.x1 - v.x0 < MIN_W) { c = (v.x0 + v.x1) / 2; v.x0 = c - MIN_W / 2; v.x1 = c + MIN_W / 2; }
    if (v.y1 - v.y0 < MIN_H) { c = (v.y0 + v.y1) / 2; v.y0 = c - MIN_H / 2; v.y1 = c + MIN_H / 2; }
    return v;
  }

  /*
   * While you are drawing the frame only ever grows. Refitting it to the points
   * so far recentres the plan under your hand, and on a touchscreen — where
   * there is no cursor to push the edge outwards — it makes anything bigger
   * than the opening frame impossible to draw at all.
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
  function refitTight() {
    var b = bounds();
    FRAME = b ? atLeast(b) : { x0: VIEW.x0, y0: VIEW.y0, x1: VIEW.x1, y1: VIEW.y1 };
  }
  /* Room to draw in. Entering the extension stage with the frame hugging the
     house means the new bit is off the edge of the screen before you reach for
     it — and on a touchscreen there is no cursor to push the edge outwards. */
  function inflate(by) {
    if (!FRAME) refit();
    var cx = (FRAME.x0 + FRAME.x1) / 2, cy = (FRAME.y0 + FRAME.y1) / 2;
    var hw = (FRAME.x1 - FRAME.x0) / 2 * by, hh = (FRAME.y1 - FRAME.y0) / 2 * by;
    FRAME = { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
  }

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
  function changed() { refit(); render(); }
  function settled() { refitTight(); render(); }

  /* ---- drawing --------------------------------------------------------------- */

  function P(p) { return [(p[0] * K).toFixed(1), (p[1] * K).toFixed(1)]; }
  function poly(pts) { return pts.map(function (p) { return P(p).join(','); }).join(' '); }

  /*
   * Corners snap to SNAP, so the grid is drawn at SNAP. A snap point you cannot
   * see is a corner that looks like it landed in the wrong place. The fine
   * lines drop out when they would be closer together than a few pixels.
   */
  function gridSvg(v, px) {
    var out = [], step = px * SNAP >= 9 ? SNAP : 1;
    var line = function (x1, y1, x2, y2, cls) {
      out.push('<line x1="' + (x1 * K) + '" y1="' + (y1 * K) + '" x2="' + (x2 * K) + '" y2="' +
        (y2 * K) + '" class="' + cls + '"/>');
    };
    var cls = function (n) {
      return 'sk-grid' + (Math.abs(n % 5) < 1e-6 ? ' major' : Math.abs(n % 1) < 1e-6 ? '' : ' fine');
    };
    var x, y;
    for (x = Math.ceil(v.x0 / step) * step; x <= v.x1; x += step) line(x, v.y0, x, v.y1, cls(x));
    for (y = Math.ceil(v.y0 / step) * step; y <= v.y1; y += step) line(v.x0, y, v.x1, y, cls(y));
    return out.join('');
  }

  /* A dimension is only shown once there is a scale to show it in. Before that
     the numbers would be grid units, which mean nothing to anybody. */
  function lengthTag(a, b, cls, off, at) {
    if (!S.scale) return '';
    var o = off || [0, 0], fr = at === undefined ? 0.5 : at;
    var mx = (a[0] + (b[0] - a[0]) * fr + o[0]) * K, my = (a[1] + (b[1] - a[1]) * fr + o[1]) * K;
    var w = 48, h = 19;
    return '<g class="sk-tag ' + (cls || '') + '">' +
      '<rect x="' + (mx - w / 2) + '" y="' + (my - h / 2) + '" width="' + w + '" height="' + h + '" rx="3"/>' +
      '<text x="' + mx + '" y="' + (my + 4.5) + '" text-anchor="middle">' + fmt(m(dist(a, b)), 2) + '</text></g>';
  }

  function normal(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    return L ? [-dy / L, dx / L] : [0, 0];
  }
  function centroid(pts) {
    var c = pts.reduce(function (t, p) { return [t[0] + p[0], t[1] + p[1]]; }, [0, 0]);
    return [c[0] / pts.length, c[1] / pts.length];
  }
  function outward(a, b, c) {
    var n = normal(a, b), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    var away = (mid[0] - c[0]) * n[0] + (mid[1] - c[1]) * n[1] >= 0 ? 1 : -1;
    return [n[0] * away * 0.66, n[1] * away * 0.66];
  }

  function openingSvg(f, o) {
    var w = openingWall(f, o);
    if (!w) return '';
    var L = dist(w.a, w.b);
    if (!L) return '';
    var ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L;
    var half = Math.min(S.scale ? o.width / S.scale : o.width, L * 0.9) / 2;
    var c = [w.a[0] + ux * (o.t * L), w.a[1] + uy * (o.t * L)];
    var p1 = [c[0] - ux * half, c[1] - uy * half], p2 = [c[0] + ux * half, c[1] + uy * half];
    return '<line x1="' + P(p1)[0] + '" y1="' + P(p1)[1] + '" x2="' + P(p2)[0] + '" y2="' + P(p2)[1] +
      '" class="sk-open sk-' + o.kind + (S.selected === o.id ? ' sel' : '') + '" data-open="' + o.id + '"/>';
  }

  function render() {
    var wrap = $('sk-overlay');
    if (!wrap) return;
    paintChrome();
    var svg = $('sk-svg');
    if (!svg || !S.started) return;

    var v = frame();
    svg.setAttribute('viewBox', [v.x0 * K, v.y0 * K, (v.x1 - v.x0) * K, (v.y1 - v.y0) * K].join(' '));

    var px = pxPerUnit();          // screen pixels per grid unit
    var RU = K / Math.max(px, 1);   // SVG user units per screen pixel
    var f = floor(), out = [];

    if (f.image) {
      out.push('<image href="' + esc(f.image.src) + '" x="' + (f.image.x * K) + '" y="' + (f.image.y * K) +
        '" width="' + (f.image.w * K) + '" height="' + (f.image.h * K) + '" class="sk-photo"/>');
    }
    out.push(gridSvg(v, px));

    // the floor below, faint, so an upper floor can be drawn over it
    if (S.active > 0 && S.floors[S.active - 1].closed) {
      out.push('<polygon points="' + poly(S.floors[S.active - 1].outline) + '" class="sk-under"/>');
    }
    // the house, faint, while the extension is being drawn
    if (S.stage === 'extension' && ground().closed) {
      out.push('<polygon points="' + poly(ground().outline) + '" class="sk-under"/>');
    }

    if (f.closed) out.push('<polygon points="' + poly(f.outline) + '" class="sk-floor"/>');
    if (f.outline.length > 1) {
      out.push('<polyline points="' + poly(f.closed ? f.outline.concat([f.outline[0]]) : f.outline) + '" class="sk-ext"/>');
    }
    f.internals.forEach(function (seg, i) {
      var on = S.pick && S.pick.kind === 'iwall' && S.pick.i === i;
      out.push('<line x1="' + P(seg[0])[0] + '" y1="' + P(seg[0])[1] + '" x2="' + P(seg[1])[0] +
        '" y2="' + P(seg[1])[1] + '" class="sk-int' + (on ? ' on' : '') + '"/>');
      if (S.stage === 'internal') {
        [0, 1].forEach(function (e) {
          out.push('<circle cx="' + P(seg[e])[0] + '" cy="' + P(seg[e])[1] + '" r="' +
            (8 * RU).toFixed(1) + '" class="sk-node small"/>');
        });
      }
    });

    if (S.extension.outline.length > 1) {
      if (S.extension.closed) out.push('<polygon points="' + poly(S.extension.outline) + '" class="sk-extension"/>');
      out.push('<polyline points="' + poly(S.extension.closed ? S.extension.outline.concat([S.extension.outline[0]]) : S.extension.outline) +
        '" class="sk-extline"/>');
    }

    // what is being drawn right now, with a band to the cursor
    if (S.drawing && S.drawing.length) {
      out.push('<polyline points="' + poly(S.drawing) + '" class="sk-draft"/>');
      if (S.cursor) {
        var last = S.drawing[S.drawing.length - 1];
        out.push('<line x1="' + P(last)[0] + '" y1="' + P(last)[1] + '" x2="' + P(S.cursor)[0] +
          '" y2="' + P(S.cursor)[1] + '" class="sk-band"/>');
        out.push(lengthTag(last, S.cursor, 'live'));
      }
    }
    if (S.stage === 'internal' && S.drawing && S.drawing.length === 1 && S.cursor) {
      out.push('<line x1="' + P(S.drawing[0])[0] + '" y1="' + P(S.drawing[0])[1] + '" x2="' + P(S.cursor)[0] +
        '" y2="' + P(S.cursor)[1] + '" class="sk-band"/>');
    }

    out.push(openingsAndTags(f));

    // corners. The first one is fat and obvious once closing is possible, which
    // is the whole of the instruction "finish where you started".
    var live = S.drawing || [];
    var editing = editable();
    var handles = live.length ? live
      : editing === 'ext' ? S.extension.outline
      : editing === 'floor' ? f.outline
      : (f.closed ? f.outline : []);
    handles.forEach(function (p, i) {
      var isTarget = live.length > 2 && i === 0;
      var picked = !live.length && editing && S.pick && S.pick.kind === 'corner' && S.pick.i === i;
      out.push('<circle cx="' + P(p)[0] + '" cy="' + P(p)[1] + '" r="' +
        (isTarget ? 15 * RU : 9 * RU).toFixed(1) + '" class="sk-node' +
        (isTarget ? ' start' : '') + (picked ? ' on' : '') + '"/>');
    });

    // the selected corner or inside wall carries the control that removes it,
    // so a stray tap can never delete anything
    var kill = null;
    if (!live.length && S.pick) {
      if (S.pick.kind === 'corner' && editing) {
        var ring = editing === 'ext' ? S.extension.outline : f.outline;
        var c = ring[S.pick.i];
        if (c) kill = [c[0], c[1] - 26 * RU / K];
      } else if (S.pick.kind === 'iwall') {
        var seg = f.internals[S.pick.i];
        if (seg) kill = [(seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2 - 24 * RU / K];
      }
    }
    if (kill) {
      out.push('<g class="sk-kill" data-killpick="1"><circle cx="' + (kill[0] * K) + '" cy="' +
        (kill[1] * K) + '" r="' + (13 * RU).toFixed(1) + '"/><text x="' + (kill[0] * K) + '" y="' +
        (kill[1] * K + 5 * RU) + '" text-anchor="middle" font-size="' + (17 * RU).toFixed(1) +
        '">\u00d7</text></g>');
    }

    f.markers.forEach(function (mk, i) {
      var t = ROOM_TYPES.filter(function (r) { return r.id === mk.type; })[0] || ROOM_TYPES[6];
      out.push('<g class="sk-pin" data-marker="' + i + '"><circle cx="' + (mk.x * K) + '" cy="' + (mk.y * K) +
        '" r="15"/><text x="' + (mk.x * K) + '" y="' + (mk.y * K + 5) + '" text-anchor="middle">' +
        esc(t.short) + '</text></g>');
    });

    if (f.closed && S.scale) {
      out.push('<text x="' + ((v.x0 + 0.5) * K) + '" y="' + ((v.y0 + 1.4) * K) + '" class="sk-area">' +
        fmt(m(shoelace(f.outline)) * m(1)) + ' m² · ' + esc(f.name.toLowerCase()) + '</text>');
    }

    svg.innerHTML = out.join('');
  }

  function openingsAndTags(f) {
    var out = [];
    f.openings.forEach(function (o) { out.push(openingSvg(f, o)); });

    // dimensions go over the openings, never under them
    if (f.closed) {
      var c0 = centroid(f.outline);
      for (var i = 0; i < f.outline.length; i++) {
        var a = f.outline[i], b = f.outline[(i + 1) % f.outline.length];
        var cls = S.calibrating && i === S.calibIdx ? 'calib' : '';
        if (S.calibrating) {
          out.push('<line x1="' + P(a)[0] + '" y1="' + P(a)[1] + '" x2="' + P(b)[0] + '" y2="' + P(b)[1] +
            '" class="sk-pick' + (i === S.calibIdx ? ' on' : '') + '" data-wall="' + i + '"/>');
        }
        out.push(lengthTag(a, b, cls, outward(a, b, c0)));
      }
    }
    f.internals.forEach(function (seg) {
      var n = normal(seg[0], seg[1]);
      out.push(lengthTag(seg[0], seg[1], '', [n[0] * 0.55, n[1] * 0.55], 0.3));
    });
    return out.join('');
  }

  /* ---- chrome ---------------------------------------------------------------- */

  function stageDone(id) {
    var f = ground();
    if (id === 'outline') return f.closed && !!S.scale;
    var any = function (k) { return S.floors.some(k); };
    if (id === 'internal') return any(function (x) { return x.internals.length > 0; });
    if (id === 'doors') return any(function (x) { return x.openings.some(function (o) { return o.kind !== 'window'; }); });
    if (id === 'windows') return any(function (x) { return x.openings.some(function (o) { return o.kind === 'window'; }); });
    if (id === 'rooms') return any(function (x) { return x.markers.length > 0; });
    return S.extension.closed;
  }

  function ready() { return ground().closed && !!S.scale; }

  function paintChrome() {
    var chooser = $('sk-choose'), work = $('sk-work');
    if (chooser) chooser.hidden = S.started;
    if (work) work.hidden = !S.started;
    if (!S.started) return;

    var tabs = $('sk-stages');
    if (tabs) {
      tabs.innerHTML = STAGES.map(function (s) {
        var locked = s.id !== 'outline' && !ready();
        return '<button type="button" data-stage="' + s.id + '" aria-pressed="' + (s.id === S.stage) + '"' +
          (locked ? ' disabled' : '') + '><i>' + (stageDone(s.id) ? '✓' : s.n) + '</i>' + esc(s.label) + '</button>';
      }).join('');
    }

    var floors = $('sk-floors');
    if (floors) {
      floors.hidden = S.stage === 'extension';
      floors.innerHTML = S.floors.map(function (f, i) {
        return '<button type="button" data-skfloor="' + i + '" aria-pressed="' + (i === S.active) + '">' +
          esc(f.name.replace(' floor', '')) + '</button>';
      }).join('') +
      (S.floors.length < 4 && ready()
        ? '<button type="button" id="sk-addfloor" class="sk-addfloor">+ floor</button>' : '');
    }

    paintPanel();
  }

  /** The one action that is obviously next. Nothing else needs explaining. */
  function nextAction() {
    var f = floor();
    if (S.calibrating) return null;
    if (S.stage === 'outline') {
      if (S.drawing && S.drawing.length > 2) return { id: 'sk-close-shape', label: 'Finish the outline' };
      if (!f.closed && !f.outline.length && S.active > 0 && S.floors[S.active - 1].closed) {
        return { id: 'sk-copy', label: 'Copy the ' + S.floors[S.active - 1].name.toLowerCase() };
      }
      if (f.closed && ready()) return { id: 'sk-go-internal', label: 'Next — inside walls' };
      return null;
    }
    if (S.stage === 'extension' && S.drawing && S.drawing.length > 2) {
      return { id: 'sk-close-ext', label: 'Finish the extension' };
    }
    var i = STAGES.map(function (s) { return s.id; }).indexOf(S.stage);
    if (i >= 0 && i < STAGES.length - 1) {
      return { id: 'sk-go-' + STAGES[i + 1].id, label: 'Next — ' + STAGES[i + 1].label.toLowerCase() };
    }
    return null;
  }

  function paintPanel() {
    var stage = STAGES.filter(function (s) { return s.id === S.stage; })[0];
    var hint = $('sk-hint');
    var f = floor();

    if (hint) {
      var edited = (S.stage === 'outline' && f.closed) ||
                   (S.stage === 'extension' && S.extension.closed) ||
                   (S.stage === 'internal' && f.internals.length);
      hint.textContent = S.calibrating
        ? 'How long is the wall highlighted in orange?'
        : (S.stage === 'outline' && !f.closed && !f.outline.length && S.active > 0
            ? 'Copy the floor below, or draw this one.'
            : (edited && stage.done ? stage.done : stage.hint));
    }

    var cal = $('sk-calib');
    if (cal) {
      cal.hidden = !S.calibrating;
      var lenInput = $('sk-len');
      if (S.calibrating && lenInput && !lenInput.value) lenInput.value = '8.4';
    }

    var tools = $('sk-tools');
    if (tools) tools.innerHTML = S.calibrating ? '' : toolsFor(S.stage);

    var act = $('sk-next');
    if (act) {
      var n = nextAction();
      act.hidden = !n;
      if (n) { act.textContent = n.label; act.setAttribute('data-act', n.id); }
    }

    var read = $('sk-read');
    if (!read) return;
    var q = measure();
    var row = function (k, v, strong) {
      return '<div class="sk-row' + (strong ? ' strong' : '') + '"><span>' + k + '</span><b>' + v + '</b></div>';
    };
    var na = '—';
    read.innerHTML =
      row('Floors drawn', q.floors || na) +
      row('Footprint', q.scaled && q.footprint ? fmt(q.footprint) + ' m²' : na, true) +
      row('Total floor area', q.scaled && q.totalArea ? fmt(q.totalArea) + ' m²' : na, true) +
      row('Outside walls', q.perimeter ? fmt(q.perimeter) + ' m' : na) +
      row('Inside walls', q.internalWall ? fmt(q.internalWall) + ' m' : na) +
      row('Wall area to plaster', q.plaster ? fmt(q.plaster, 0) + ' m²' : na) +
      row('Windows', q.windows) +
      row('Doors', q.extDoors + ' out · ' + q.intDoors + ' in') +
      row('Rooms', q.rooms.length) +
      (q.extension ? row('Extension', fmt(q.extension.area * q.extension.storeys) + ' m²', true) : '');

    var apply = $('sk-apply');
    if (apply) apply.disabled = !ready();
  }

  function toolsFor(stage) {
    var seg = function (items, active, attr) {
      return '<div class="seg seg-wrap">' + items.map(function (it) {
        return '<button type="button" ' + attr + '="' + it[0] + '" aria-pressed="' + (active === it[0]) + '">' +
          esc(it[1]) + '</button>';
      }).join('') + '</div>';
    };

    if (stage === 'outline') {
      var f = floor();
      return (f.closed
        ? '<button type="button" class="btn btn-ghost btn-sm" id="sk-redraw">Draw this floor again</button>'
        : '<button type="button" class="btn btn-ghost btn-sm" id="sk-rect">Start from a rectangle</button>') +
        (S.scale ? '<button type="button" class="btn btn-ghost btn-sm" id="sk-recal">Change the measurement</button>' : '') +
        (S.floors.length > 1 ? '<button type="button" class="btn btn-ghost btn-sm" id="sk-dropfloor">Remove this floor</button>' : '');
    }

    var sel = null;
    floor().openings.forEach(function (o) { if (o.id === S.selected) sel = o; });
    var widths = function () {
      if (!sel) return '';
      return '<div class="sk-tool"><label>How wide is it?</label>' +
        '<div class="seg seg-wrap">' + [0.6, 0.9, 1.2, 1.8, 2.4, 3.0].map(function (w) {
          return '<button type="button" data-width="' + w + '" aria-pressed="' + (Math.abs(sel.width - w) < 0.01) +
            '">' + w.toFixed(1) + ' m</button>';
        }).join('') + '</div>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="sk-del">Remove it</button></div>';
    };

    if (stage === 'doors') {
      return '<div class="sk-tool"><label>Put in</label>' +
        seg([['door', 'Front or back door'], ['bifold', 'Bi-fold or patio'], ['intDoor', 'Inside doorway']],
            S.kind || 'door', 'data-kind') + '</div>' + widths();
    }
    if (stage === 'windows') return widths();
    if (stage === 'rooms') {
      return '<div class="sk-tool"><label>This room is a</label>' +
        seg(ROOM_TYPES.map(function (r) { return [r.id, r.label]; }), S.roomType, 'data-room') + '</div>';
    }
    if (stage === 'extension') {
      return '<div class="sk-tool"><label>How many storeys?</label>' +
        seg([[1, 'Single storey'], [2, 'Two storey']], S.extension.storeys, 'data-storeys') + '</div>' +
        (S.extension.closed ? '<button type="button" class="btn btn-ghost btn-sm" id="sk-dropext">Remove the extension</button>' : '');
    }
    return '';
  }


  /* =====================================================================
     Editing a finished shape
     =====================================================================
     Drawing it once is never enough. A closed outline is a live thing: drag a
     corner and both walls either side follow, tap a wall to put a corner in it,
     select a corner and remove it so the two walls merge. The ring never opens.

     The hard part is not the geometry. A window is stored as "sixty per cent of
     the way along wall three", so every edit that renumbers or resizes walls has
     to carry the openings with it, or somebody's front door silently moves to a
     different wall. Rather than do index arithmetic — which has a wrap-around
     case for every operation and gets one of them wrong — each opening is
     remembered as a point in the world before the edit and reassigned to the
     nearest wall afterwards. A split leaves the halves collinear so every
     opening lands exactly where it was; a merge puts them on the chord, which
     is the only honest answer available.
     ===================================================================== */

  /** Where each opening physically is, before geometry moves under it. */
  function openingPoints(f) {
    return f.openings.map(function (o) {
      var w = openingWall(f, o);
      if (!w) return null;
      return [w.a[0] + (w.b[0] - w.a[0]) * o.t, w.a[1] + (w.b[1] - w.a[1]) * o.t];
    });
  }

  /** Put them back on whichever wall now runs closest to where they were. */
  function reassignOpenings(f, pts) {
    var keep = [];
    var walls = wallsOf(f);
    f.openings.forEach(function (o, k) {
      var p = pts[k];
      if (!p) return;
      var best = null;
      walls.forEach(function (w) {
        if (w.on !== o.on) return;
        var pr = projectOnSeg(p, w.a, w.b);
        if (!best || pr.d < best.d) best = { w: w, t: pr.t, d: pr.d };
      });
      if (!best) return;
      o.idx = best.w.idx;
      o.t = best.t;
      keep.push(o);
    });
    f.openings = keep;
  }

  function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
  function straddles(a, b, c, d) {
    var d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }

  /*
   * A bow tie silently produces the wrong area — the shoelace formula cancels
   * the crossed part against itself — and a wrong area is the one thing this
   * tool must never hand anybody. So a drag that crosses the shape is refused.
   */
  function selfIntersects(poly) {
    var n = poly.length;
    if (n < 4) return false;
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        if (i === j || (i + 1) % n === j || (j + 1) % n === i) continue;
        if (straddles(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
      }
    }
    return false;
  }

  /** Corners land on the grid. Always, everywhere, no exceptions. */
  function toGrid(p) {
    return [Math.round(p[0] / SNAP) * SNAP, Math.round(p[1] / SNAP) * SNAP];
  }

  /**
   * A new corner in the middle of a wall. It goes ON the wall, at a grid
   * intersection when the wall runs through one — which every square and every
   * 45° wall does — and otherwise at the nearest point of the wall to that
   * intersection. Splitting a wall must never move the wall.
   */
  function splitPoint(a, b, t) {
    var on = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    var g = toGrid(on);
    if (dist(g, on) < SNAP * 0.35) {
      var pr = projectOnSeg(g, a, b);
      if (pr.d < 1e-6) return g;                 // the grid point is on the wall
    }
    var back = projectOnSeg(g, a, b);
    var q = [a[0] + (b[0] - a[0]) * back.t, a[1] + (b[1] - a[1]) * back.t];
    return dist(q, a) < SNAP * 0.4 || dist(q, b) < SNAP * 0.4 ? mm(on) : mm(q);
  }

  function shapeOf(which) { return which === 'ext' ? S.extension : floor(); }

  function splitWall(which, i, t) {
    var f = floor(), shape = shapeOf(which);
    var pts = which === 'ext' ? null : openingPoints(f);
    var p = splitPoint(shape.outline[i], shape.outline[(i + 1) % shape.outline.length], t);
    snapshot();
    shape.outline.splice(i + 1, 0, p);
    if (pts) reassignOpenings(f, pts);
    S.pick = { kind: 'corner', which: which, i: i + 1 };
    settled();
  }

  function removeCorner(which, i) {
    var f = floor(), shape = shapeOf(which);
    if (shape.outline.length <= 3) { say('A shape needs at least three corners.'); return; }
    var pts = which === 'ext' ? null : openingPoints(f);
    snapshot();
    shape.outline.splice(i, 1);
    if (pts) reassignOpenings(f, pts);
    S.pick = null;
    say('');
    settled();
  }

  function removeInternal(i) {
    var f = floor();
    var pts = openingPoints(f);
    snapshot();
    f.internals.splice(i, 1);
    reassignOpenings(f, pts);
    S.pick = null;
    settled();
  }

  /* ---- undo ------------------------------------------------------------------
   * Editing needs a real history, not a rule per action. Everything that
   * changes the drawing takes a snapshot first, so one button walks all of it
   * backwards in the order it happened.
   */
  var UNDO = [];

  function snapshot() {
    try {
      UNDO.push(JSON.stringify({
        floors: S.floors, extension: S.extension, scale: S.scale,
        active: S.active, drawing: S.drawing
      }));
    } catch (e) { return; }
    if (UNDO.length > 40) UNDO.shift();
  }

  function undo() {
    // a run in progress steps back a corner at a time, which is what the hand
    // expects; anything else walks the history
    if (S.drawing && S.drawing.length) {
      S.drawing.pop();
      if (!S.drawing.length) S.drawing = null;
      changed();
      return;
    }
    var prev = UNDO.pop();
    if (!prev) { say('Nothing left to undo.'); return; }
    var o = JSON.parse(prev);
    S.floors = o.floors;
    S.extension = o.extension;
    S.scale = o.scale;
    S.active = Math.min(o.active, o.floors.length - 1);
    S.drawing = o.drawing;
    S.pick = null; S.selected = null; S.cursor = null;
    say('');
    FRAME = null;
    settled();
  }

  /* ---- input ------------------------------------------------------------------ */

  function toWorld(evt) {
    var svg = $('sk-svg'), ctm = svg && svg.getScreenCTM();
    if (!ctm) return [0, 0];
    var pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    var p = pt.matrixTransform(ctm.inverse());
    return [p.x / K, p.y / K];
  }

  /** Screen pixels per grid unit, so handles and hit targets stay finger-sized. */
  function pxPerUnit() {
    var svg = $('sk-svg');
    var v = FRAME || frame();
    var w = (svg && svg.clientWidth) || 800;
    var h = (svg && svg.clientHeight) || 600;
    // preserveAspectRatio="meet" — the smaller ratio wins
    return Math.min(w / (v.x1 - v.x0), h / (v.y1 - v.y0));
  }
  function grabRadius() {
    return Math.max(0.28, Math.min(1.3, 15 / pxPerUnit()));
  }

  function drawingStage() { return S.stage === 'outline' || S.stage === 'extension' || S.stage === 'internal'; }

  /** Which shape is being edited in this stage, if any. */
  function editable() {
    if (S.stage === 'outline' && floor().closed) return 'floor';
    if (S.stage === 'extension' && S.extension.closed) return 'ext';
    return null;
  }

  /** The corner or wall end under the pointer, if there is one. */
  function handleAt(p) {
    var r = grabRadius(), best = null;
    var which = editable();
    if (which) {
      shapeOf(which === 'ext' ? 'ext' : 'floor').outline.forEach(function (q, i) {
        var d = dist(p, q);
        if (d < r && (!best || d < best.d)) best = { kind: 'corner', which: which, i: i, d: d };
      });
    }
    if (S.stage === 'internal') {
      floor().internals.forEach(function (seg, i) {
        [0, 1].forEach(function (e) {
          var d = dist(p, seg[e]);
          if (d < r && (!best || d < best.d)) best = { kind: 'iend', i: i, end: e, d: d };
        });
      });
    }
    return best;
  }

  var press = null;   // { x, y, world, handle, moved }

  function onDown(e) {
    if (!S.started || S.calibrating) return;
    var w = toWorld(e);
    press = { x: e.clientX, y: e.clientY, world: w, handle: null, moved: false };
    if (S.drawing && S.drawing.length) return;      // mid-run: taps only
    var h = handleAt(w);
    if (!h) return;
    press.handle = h;
    snapshot();
    try { $('sk-svg').setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  }

  function onMove(e) {
    if (!S.started || S.calibrating) return;

    if (press && press.handle) {
      if (Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) > 3) press.moved = true;
      if (!press.moved) return;
      var g = toGrid(toWorld(e));
      var h = press.handle;
      if (h.kind === 'corner') shapeOf(h.which === 'ext' ? 'ext' : 'floor').outline[h.i] = g;
      else floor().internals[h.i][h.end] = g;
      S.pick = h.kind === 'corner' ? { kind: 'corner', which: h.which, i: h.i } : { kind: 'iwall', i: h.i };
      render();
      return;
    }

    if (!drawingStage()) return;
    var from = S.drawing && S.drawing.length ? S.drawing[S.drawing.length - 1] : null;
    S.cursor = snapFrom(from, toWorld(e));
    if (S.drawing && S.drawing.length) render();
  }

  function onUp(e) {
    if (!S.started || S.calibrating) { press = null; return; }
    var p = press;
    press = null;
    try { $('sk-svg').releasePointerCapture(e.pointerId); } catch (err) {}
    if (!p) return;

    if (p.handle && p.moved) {
      // a drag that crosses the shape would silently corrupt the area
      var h = p.handle;
      if (h.kind === 'corner') {
        var shape = shapeOf(h.which === 'ext' ? 'ext' : 'floor');
        if (selfIntersects(shape.outline)) {
          say('That would fold the shape over itself.');
          var back = UNDO.pop();
          if (back) {
            var o = JSON.parse(back);
            S.floors = o.floors; S.extension = o.extension;
          }
          settled();
          return;
        }
      }
      say('');
      settled();
      return;
    }

    if (p.handle && !p.moved) {           // a tap on a handle selects it
      UNDO.pop();                          // nothing changed, so nothing to undo
      var hh = p.handle;
      S.pick = hh.kind === 'corner'
        ? { kind: 'corner', which: hh.which, i: hh.i }
        : { kind: 'iwall', i: hh.i };
      S.selected = null;
      render();
      return;
    }

    if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 8) return;   // a drag on nothing
    if (e.target && e.target.closest && e.target.closest('[data-killpick]')) return;
    onTap(p.world, e);
  }

  function onTap(w, e) {
    var f = floor();

    if (S.stage === 'outline' || S.stage === 'extension') {
      var which = S.stage === 'outline' ? 'floor' : 'ext';
      var shape = shapeOf(which === 'ext' ? 'ext' : 'floor');

      if (shape.closed) {
        // tapping a wall puts a corner in it; tapping nothing clears the selection
        var hit = wallOfShape(shape, w);
        if (hit) { splitWall(which, hit.i, hit.t); return; }
        if (S.pick) { S.pick = null; render(); }
        return;
      }

      var from = S.drawing && S.drawing.length ? S.drawing[S.drawing.length - 1] : null;
      var p = snapFrom(from, w);
      if (!S.drawing) { snapshot(); S.drawing = []; }
      if (S.drawing.length > 2 && dist(p, S.drawing[0]) < CLOSE_UNITS) { closeShape(); return; }
      S.drawing.push(p);
      changed();
      return;
    }

    if (S.stage === 'internal') {
      if (!S.drawing || !S.drawing.length) {
        // Anywhere is a valid start, including on top of another wall — walls
        // meet in a T far more often than they float free. Selecting a wall is
        // a tap on one of its end handles, which is a target nothing else uses.
        if (S.pick) { S.pick = null; }
        snapshot();
        S.drawing = [toGrid(w)];
        changed();
        return;
      }
      f.internals.push([S.drawing[0], snapFrom(S.drawing[0], w)]);
      S.drawing = null;
      changed();
      return;
    }

    if (S.stage === 'rooms') {
      snapshot();
      f.markers.push({ x: toGrid(w)[0], y: toGrid(w)[1], type: S.roomType });
      changed();
      return;
    }

    // doors and windows always land on a wall
    var kind = S.stage === 'windows' ? 'window' : (S.kind || 'door');
    var on = wallAt(w, kind === 'intDoor' ? 'int' : 'ext');
    if (!on) { say(kind === 'intDoor' ? 'Tap a wall inside the house.' : 'Tap an outside wall.'); return; }
    snapshot();
    var o = { id: 'o' + (++SEQ), on: on.w.on, idx: on.w.idx, t: on.t,
              width: DEFAULTS[kind], kind: kind };
    f.openings.push(o);
    S.selected = o.id;
    say('');
    changed();
  }

  /** Nearest wall of one closed shape, for splitting. */
  function wallOfShape(shape, p) {
    var best = null, r = Math.max(0.7, grabRadius() * 1.5);
    for (var i = 0; i < shape.outline.length; i++) {
      var a = shape.outline[i], b = shape.outline[(i + 1) % shape.outline.length];
      var pr = projectOnSeg(p, a, b);
      if (pr.d < r && pr.t > 0.03 && pr.t < 0.97 && (!best || pr.d < best.d)) {
        best = { i: i, t: pr.t, d: pr.d };
      }
    }
    return best;
  }

  function say(msg) { var el = $('sk-say'); if (el) el.textContent = msg || ''; }

  function closeShape() {
    if (S.stage === 'extension') {
      S.extension.outline = S.drawing.slice();
      S.extension.closed = true;
    } else {
      var f = floor();
      f.outline = S.drawing.slice();
      f.closed = true;
    }
    S.drawing = null;
    S.cursor = null;
    if (S.stage === 'outline' && !S.scale) startCalibration();
    settled();
  }

  function startCalibration() {
    var f = floor();
    if (!f.closed) return;
    // pre-pick the longest wall: it is the one somebody is most likely to know
    var best = 0, bl = 0;
    for (var i = 0; i < f.outline.length; i++) {
      var L = dist(f.outline[i], f.outline[(i + 1) % f.outline.length]);
      if (L > bl) { bl = L; best = i; }
    }
    S.calibIdx = best;
    S.calibrating = true;
    render();
    var inp = $('sk-len');
    if (inp) { inp.value = inp.value || '8.4'; try { inp.focus(); inp.select(); } catch (e) {} }
  }

  /** The single number the whole drawing is scaled by. */
  function applyCalibration() {
    var f = floor();
    var inp = $('sk-len');
    var metres = parseFloat(inp && inp.value);
    if (!metres || metres <= 0) { say('Type how long that wall is, in metres.'); return; }
    var units = dist(f.outline[S.calibIdx], f.outline[(S.calibIdx + 1) % f.outline.length]);
    if (!units) return;
    S.scale = metres / units;
    S.calibrating = false;
    say('');
    settled();
  }

  function copyFloorBelow() {
    var src = S.floors[S.active - 1];
    if (!src || !src.closed) return;
    snapshot();
    var f = floor();
    f.outline = src.outline.map(function (p) { return p.slice(); });
    f.closed = true;
    f.internals = src.internals.map(function (s) { return [s[0].slice(), s[1].slice()]; });
    // openings and rooms are NOT copied — upstairs is a different room layout,
    // and a wrong bathroom count is worse than no bathroom count
    settled();
  }

  /* ---- wiring ------------------------------------------------------------------ */

  function open(onApply, onTrace) {
    S.onApply = onApply || null;
    S.onTrace = onTrace || null;
    var wrap = $('sk-overlay');
    wrap.classList.add('on');
    wrap.setAttribute('aria-hidden', 'false');
    settled();
  }
  function close() {
    var wrap = $('sk-overlay');
    wrap.classList.remove('on');
    wrap.setAttribute('aria-hidden', 'true');
  }
  function reset() {
    UNDO.length = 0;
    S.started = false; S.stage = 'outline'; S.scale = null;
    S.floors = [newFloor(0)]; S.active = 0;
    S.extension = { outline: [], closed: false, storeys: 1 };
    S.drawing = null; S.cursor = null; S.selected = null; S.pick = null;
    S.calibrating = false; S.kind = null;
    FRAME = null; say('');
    settled();
  }

  function loadImage(file) {
    if (!file) return;
    var fr = new root.FileReader();
    fr.onload = function () {
      var img = new root.Image();
      img.onload = function () {
        var w = 22, h = 22 * (img.height / img.width);
        floor().image = { src: fr.result, x: -1, y: -1, w: w, h: h };
        S.started = true;
        FRAME = null;
        settled();
      };
      img.onerror = function () { say('That file could not be opened as an image.'); };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  function goStage(id) {
    if (id !== 'outline' && !ready()) return;
    if (S.stage === 'internal' && S.drawing) S.drawing = null;
    S.stage = id;
    S.drawing = null; S.cursor = null; S.selected = null; S.pick = null;
    S.kind = id === 'doors' ? (S.kind || 'door') : null;
    say('');
    refitTight();
    if (id === 'extension' && !S.extension.closed) inflate(1.35);
    render();
  }

  function wire() {
    var svg = $('sk-svg');
    if (!svg) return;
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', function () { press = null; });

    var file = $('sk-file');
    if (file) file.addEventListener('change', function (e) { loadImage(e.target.files[0]); });

    var len = $('sk-len');
    if (len) len.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); applyCalibration(); }
    });

    $('sk-overlay').addEventListener('click', function (e) {
      // A modal's clicks are its own. The estimator behind it binds several of
      // the same data attributes, and it was reading a button this handler had
      // already re-rendered out of the document.
      e.stopPropagation();
      var t = e.target, hit;

      hit = t.closest && t.closest('[data-wall]');
      if (hit && S.calibrating) { S.calibIdx = +hit.getAttribute('data-wall'); render(); return; }

      hit = t.closest && t.closest('[data-stage]');
      if (hit && !hit.disabled) { goStage(hit.getAttribute('data-stage')); return; }

      hit = t.closest && t.closest('[data-skfloor]');
      if (hit) {
        S.active = +hit.getAttribute('data-skfloor');
        S.drawing = null; S.selected = null; FRAME = null; settled();
        return;
      }
      hit = t.closest && t.closest('[data-kind]');
      if (hit) { S.kind = hit.getAttribute('data-kind'); S.selected = null; render(); return; }
      hit = t.closest && t.closest('[data-room]');
      if (hit) { S.roomType = hit.getAttribute('data-room'); render(); return; }
      hit = t.closest && t.closest('[data-storeys]');
      if (hit) { S.extension.storeys = +hit.getAttribute('data-storeys'); render(); return; }
      hit = t.closest && t.closest('[data-width]');
      if (hit) {
        floor().openings.forEach(function (o) { if (o.id === S.selected) o.width = +hit.getAttribute('data-width'); });
        render(); return;
      }
      hit = t.closest && t.closest('[data-open]');
      if (hit) { S.selected = hit.getAttribute('data-open'); render(); return; }
      hit = t.closest && t.closest('[data-marker]');
      if (hit && S.stage === 'rooms') { floor().markers.splice(+hit.getAttribute('data-marker'), 1); changed(); return; }

      hit = t.closest && t.closest('[data-act]');
      if (hit) {
        var act = hit.getAttribute('data-act');
        if (act === 'sk-close-shape' || act === 'sk-close-ext') { closeShape(); return; }
        if (act === 'sk-copy') { copyFloorBelow(); return; }
        if (act.indexOf('sk-go-') === 0) { goStage(act.slice(6)); return; }
        return;
      }

      // a click lands on whatever is under the finger — often a <span> inside
      // the button — so resolve to the button before matching on id
      var btn = t.closest ? t.closest('button') : null;
      hit = t.closest && t.closest('[data-killpick]');
      if (hit) {
        if (S.pick && S.pick.kind === 'corner') removeCorner(S.pick.which, S.pick.i);
        else if (S.pick && S.pick.kind === 'iwall') removeInternal(S.pick.i);
        return;
      }

      switch ((btn && btn.id) || t.id) {
        case 'sk-blank':     S.started = true; settled(); return;
        case 'sk-upload':    if ($('sk-file')) $('sk-file').click(); return;
        case 'sk-autotrace':
          // still here for anyone with a clean estate agent plan — it finds the
          // rooms itself. Kept subordinate because drawing works on any plan.
          if (!root.DATUM.TRACE) return;
          close();
          root.DATUM.TRACE.open(S.onTrace || function () {});
          return;
        case 'sk-calib-go':  applyCalibration(); return;
        case 'sk-recal':     startCalibration(); return;
        case 'sk-redraw':
          snapshot();
          var f = floor();
          f.outline = []; f.closed = false; f.openings = []; f.internals = []; f.markers = [];
          S.drawing = null; FRAME = null; settled(); return;
        case 'sk-rect':
          snapshot();
          S.drawing = null;
          floor().outline = [[0, 0], [9, 0], [9, 7], [0, 7]];
          floor().closed = true;
          if (!S.scale) { settled(); startCalibration(); } else settled();
          return;
        case 'sk-addfloor':
          snapshot();
          S.floors.push(newFloor(S.floors.length));
          S.active = S.floors.length - 1;
          S.stage = 'outline'; S.drawing = null; FRAME = null; settled(); return;
        case 'sk-dropfloor':
          if (S.floors.length > 1) {
            snapshot();
            S.floors.splice(S.active, 1);
            S.active = Math.min(S.active, S.floors.length - 1);
            FRAME = null; settled();
          }
          return;
        case 'sk-dropext':
          snapshot();
          S.extension = { outline: [], closed: false, storeys: S.extension.storeys };
          settled(); return;
        case 'sk-del':
          snapshot();
          floor().openings = floor().openings.filter(function (o) { return o.id !== S.selected; });
          S.selected = null; changed(); return;
        case 'sk-undo':      undo(); return;
        case 'sk-restart':   reset(); return;
        case 'sk-close-btn': close(); return;
        case 'sk-apply':
          if (S.onApply) S.onApply(measure(), S);
          close(); return;
      }
      if (t === $('sk-overlay')) close();
    });

    doc.addEventListener('keydown', function (e) {
      if (!$('sk-overlay').classList.contains('on')) return;
      if (e.key === 'Escape') {
        if (S.drawing) { S.drawing = null; S.cursor = null; render(); } else close();
        return;
      }
      if (e.key === 'Enter' && !S.calibrating) {
        var n = nextAction();
        if (n) { e.preventDefault(); var b = $('sk-next'); if (b) b.click(); }
        return;
      }
      if (e.key === 'Backspace' && doc.activeElement !== $('sk-len')) { e.preventDefault(); undo(); }
    });
  }

  root.DATUM = root.DATUM || {};
  root.DATUM.SKETCH = { open: open, close: close, wire: wire, reset: reset, measure: measure, _S: S };
})(window, document);
