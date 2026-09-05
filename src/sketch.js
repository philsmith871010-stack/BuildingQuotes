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
  /*
   * Before a wall is measured the grid is abstract and a point lands on a half
   * square. The moment a wall IS measured the whole drawing is converted into
   * metres and the grid becomes a real quarter-metre grid — so every dimension
   * from then on is a round 4.25 or 2.50 rather than an arbitrary 4.32, and
   * you can aim for a length by counting squares.
   */
  var SNAP = 0.5;               // grid units a point lands on
  var LOOSE = 0.5, METRIC_SNAP = 0.25;
  var CLOSE_UNITS = 1.1;        // click this near the first corner to close
  var K = 44;                   // SVG user units per grid unit

  var DEFAULTS = { window: 1.2, door: 0.9, bifold: 3.0, intDoor: 0.85 };
  var CEILING = 2.4;

  var ROOM_TYPES = [
    { id: 'kitchen',  label: 'Kitchen',  short: 'Kitchen' },
    { id: 'living',   label: 'Living',   short: 'Living' },
    { id: 'bedroom',  label: 'Bedroom',  short: 'Bed' },
    { id: 'bathroom', label: 'Bathroom', short: 'Bath' },
    { id: 'wc',       label: 'WC',       short: 'WC' },
    { id: 'hall',     label: 'Hall',     short: 'Hall' },
    { id: 'other',    label: 'Other',    short: 'Room' }
  ];

  /*
   * Five stages, in the order a builder walks a house: the shape (which they
   * can pick rather than draw), the inside walls (optional, but they are what
   * make the rooms), the doors and windows (which they can see), a pin per
   * room, and the extension (optional). Every hint is one plain sentence.
   */
  var STAGES = [
    { id: 'outline',   n: 1, label: 'Shape',
      hint: 'Pick the shape closest to your house, or tap round the corners yourself.',
      done: 'Drag any corner to make it right. Tap a wall to add a corner, or a corner then × to remove it.' },
    { id: 'internal',  n: 2, label: 'Inside walls',
      hint: 'Optional. Tap one end of a wall, then the other end.',
      done: 'Drag an end to move a wall. Tap a wall, then × to remove it.',
      picked: 'Tap × to remove this wall, or tap it again to start a new wall from it.',
      door: 'Tap an inside wall to put a doorway in it.',
      out:  'Tap any wall you are knocking out. Tap it again to put it back.' },
    { id: 'openings',  n: 3, label: 'Doors & windows',
      hint: 'Pick a window or a door, then tap the outside wall it is in.',
      done: 'Drag one to move it along the wall. Tap it to change its width.' },
    { id: 'rooms',     n: 4, label: 'Rooms',
      hint: 'Pick a room type, then tap where that room is.',
      done: 'Tap a room again to change what it is. Tap a pin to remove it.' },
    { id: 'extension', n: 5, label: 'Extension',
      hint: 'Optional. Add a rear extension and drag it to size, or draw your own against the house.',
      done: 'Drag any corner to make it right. Tap a wall to add a corner, or a corner then × to remove it.' },
    { id: 'garden',    n: 6, label: 'Garden',
      hint: 'Optional. Add a typical plot and drag its corners to your fence line, or tap round it yourself.',
      done: 'Pick what is in the garden, then tap round it. Drag any corner. Tap a thing, then × to remove it.',
      tree: 'Tap where each tree is. Tap a tree again to remove it.',
      fence: 'Drag a corner of the fence line, or tap the line to add a corner.' }
  ];

  /* The garden: the plot boundary (the fence line), the surfaces in it, and
     the trees. Surfaces are closed shapes like the extension is; trees are
     points like room pins. The whole thing is optional and sits after the
     house because every one of its edges is measured off the house. */
  var GARDEN_KINDS = [
    { id: 'patio',   label: 'Patio',   tag: 'PATIO' },
    { id: 'lawn',    label: 'Lawn',    tag: 'LAWN' },
    { id: 'drive',   label: 'Drive',   tag: 'DRIVE' },
    { id: 'decking', label: 'Decking', tag: 'DECK' }
  ];
  function newGarden() { return { plot: { outline: [], closed: false }, areas: [], trees: [] }; }

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
    garden: newGarden(),
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
   * TRUE snap: every point is a grid intersection. Not most points, not points
   * on square walls — every one.
   *
   * The previous version snapped the ANGLE to 15° and the LENGTH to half a
   * unit, which is a different thing wearing the same name. It put a 45° wall
   * at 3.889, 3.889 — nowhere near the grid it was drawn on, and visibly
   * between the lines. Only pure horizontals and verticals ever landed right.
   *
   * There is no angle snapping now and none is wanted. The grid is drawn at
   * this resolution and the point under the cursor is shown before it is
   * committed, so what you see is exactly what you get. Orthogonal comes free
   * — you are clicking intersections — and every diagonal a house actually has
   * runs between two of them.
   */
  function snapFrom(from, to) {
    return [Math.round(to[0] / SNAP) * SNAP, Math.round(to[1] / SNAP) * SNAP];
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

    var removed = 0, estimated = false;
    S.floors.forEach(function (f) {
      f.internals.forEach(function (seg) {
        // a wall that is coming out is not there to be plastered afterwards
        if (seg.out) removed += m(dist(seg[0], seg[1]));
        else intLen += m(dist(seg[0], seg[1]));
      });
      // Most people will skip the inside walls. A house still has them, and the
      // plaster is priced on them, so a floor with rooms marked but no walls
      // drawn gets a typical allowance — about 0.4 m of stud per m² of floor —
      // rather than a plaster figure that quietly assumes one open barn.
      if (f.closed && !f.internals.length && f.markers.length > 1) {
        intLen += 0.4 * m(shoelace(f.outline)) * m(1);
        estimated = true;
      }
      if (f.closed) extWall += m(ringLength(f.outline)) * CEILING;
      f.openings.forEach(function (o) {
        // a 3 m bi-fold in a 2 m wall would over-deduct the plaster, so the
        // figure that reaches the price is the one that physically fits
        var wl = openingWall(f, o);
        var fits = wl ? Math.min(o.width, m(dist(wl.a, wl.b))) : o.width;
        if (o.kind === 'window') { win++; winW += fits; }
        else if (o.kind === 'intDoor') intDoor++;
        else extDoor++;
        openArea += fits * (o.kind === 'window' ? 1.3 : 2.1);
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

    var garden = null;
    if (S.garden.plot.closed) {
      var gA = {};
      GARDEN_KINDS.forEach(function (k) { gA[k.id] = 0; });
      S.garden.areas.forEach(function (a) { gA[a.kind] = (gA[a.kind] || 0) + m(shoelace(a.outline)) * m(1); });
      var plotArea = m(shoelace(S.garden.plot.outline)) * m(1);
      // the nearest tree to whatever is being built, for the foundations
      var target = S.extension.closed ? S.extension.outline : ground().outline;
      var nearest = null;
      S.garden.trees.forEach(function (t) {
        for (var i = 0; i < target.length; i++) {
          var d = m(projectOnSeg(t, target[i], target[(i + 1) % target.length]).d);
          if (nearest === null || d < nearest) nearest = d;
        }
      });
      garden = {
        plot: plotArea,
        boundary: m(ringLength(S.garden.plot.outline)),
        garden: Math.max(0, plotArea - footprint - (ext ? ext.area : 0)),
        areas: gA,
        trees: S.garden.trees.length,
        treeNearest: nearest
      };
    }

    return {
      scaled: !!S.scale,
      floors: S.floors.filter(function (f) { return f.closed; }).length,
      footprint: footprint, totalArea: total, perimeter: perim,
      internalWall: intLen, internalEstimated: estimated, wallRemoval: removed, plaster: plaster,
      windows: win, windowWidth: winW, extDoors: extDoor, intDoors: intDoor,
      counts: counts, rooms: rooms, extension: ext, garden: garden
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
    if (S.stage === 'garden') {
      pts = pts.concat(ground().outline, S.extension.outline, S.garden.plot.outline, S.garden.trees);
      S.garden.areas.forEach(function (a) { pts = pts.concat(a.outline); });
    }
    if (S.drawing) pts = pts.concat(S.drawing);
    if (f.image) pts.push([f.image.x, f.image.y], [f.image.x + f.image.w, f.image.y + f.image.h]);
    return pts;
  }

  function bounds() {
    var pts = allPoints();
    if (!pts.length) return null;
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    // a plot fills the canvas edge to edge, and its corners sit under the
    // undo and zoom buttons unless the frame keeps clear of them
    var pad = S.stage === 'garden' ? PAD * 1.7 : PAD;
    return { x0: Math.min.apply(null, xs) - pad, x1: Math.max.apply(null, xs) + pad,
             y0: Math.min.apply(null, ys) - pad, y1: Math.max.apply(null, ys) + pad };
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
    if (MANUAL) return;
    var b = bounds();
    if (!b) return;
    if (b.x0 < FRAME.x0) FRAME.x0 = b.x0;
    if (b.x1 > FRAME.x1) FRAME.x1 = b.x1;
    if (b.y0 < FRAME.y0) FRAME.y0 = b.y0;
    if (b.y1 > FRAME.y1) FRAME.y1 = b.y1;
  }
  function refitTight() {
    if (MANUAL) return;
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

  /*
   * Auto-framing holds until the moment somebody zooms or pans, and then gets
   * out of the way — nothing is more annoying than a view that keeps deciding
   * it knows better. "Fit" hands control back.
   */
  var MANUAL = false;

  function zoomAt(p, factor) {
    var v = frame();
    var w = (v.x1 - v.x0) / factor, h = (v.y1 - v.y0) / factor;
    var minW = 4, maxW = 400;
    if (w < minW || w > maxW) return;
    var fx = (p[0] - v.x0) / (v.x1 - v.x0), fy = (p[1] - v.y0) / (v.y1 - v.y0);
    FRAME = { x0: p[0] - w * fx, x1: p[0] + w * (1 - fx),
              y0: p[1] - h * fy, y1: p[1] + h * (1 - fy) };
    MANUAL = true;
    render();
  }

  function panBy(dx, dy) {
    var v = frame();
    FRAME = { x0: v.x0 - dx, x1: v.x1 - dx, y0: v.y0 - dy, y1: v.y1 - dy };
    MANUAL = true;
    renderSoon();
  }

  function fitView() { MANUAL = false; refitTight(); render(); }
  function frameCentre() {
    var v = frame();
    return [(v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2];
  }

  /*
   * The frame used to grow to keep the cursor in shot. That made the plan
   * shrink whenever the pointer wandered near an edge — the view moving on its
   * own, without a click, which is exactly what it should never do. Committed
   * points already grow the frame by a couple of metres, and there is a pan for
   * everything else.
   */
  function frame() {
    if (!FRAME) refit();
    return FRAME;
  }
  function changed() { refit(); render(); persist(); }
  function settled() { refitTight(); render(); persist(); }

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
    if (S.stage === 'garden') out.push(gardenSvg(RU));

    if (f.closed) out.push('<polygon points="' + poly(f.outline) + '" class="sk-floor"/>');
    if (f.outline.length > 1) {
      out.push('<polyline points="' + poly(f.closed ? f.outline.concat([f.outline[0]]) : f.outline) + '" class="sk-ext"/>');
    }
    f.internals.forEach(function (seg, i) {
      var on = S.pick && S.pick.kind === 'iwall' && S.pick.i === i;
      out.push('<line x1="' + P(seg[0])[0] + '" y1="' + P(seg[0])[1] + '" x2="' + P(seg[1])[0] +
        '" y2="' + P(seg[1])[1] + '" class="sk-int' + (on ? ' on' : '') + (seg.out ? ' out' : '') + '"/>');
      if (seg.out) {
        out.push('<text x="' + ((seg[0][0] + seg[1][0]) / 2 * K) + '" y="' +
          ((seg[0][1] + seg[1][1]) / 2 * K - 8 * RU) + '" text-anchor="middle" class="sk-outlab">COMING OUT</text>');
      }
      if (S.stage === 'internal' && S.wallMode !== 'out') {
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

    // what is being drawn right now, with a band to the snap target
    if (S.drawing && S.drawing.length) {
      if (S.drawing.length > 1) out.push('<polyline points="' + poly(S.drawing) + '" class="sk-draft"/>');
      if (S.cursor) {
        var last = S.drawing[S.drawing.length - 1];
        out.push('<line x1="' + P(last)[0] + '" y1="' + P(last)[1] + '" x2="' + P(S.cursor)[0] +
          '" y2="' + P(S.cursor)[1] + '" class="sk-band"/>');
        out.push(lengthTag(last, S.cursor, 'live'));
      }
    }

    /* The snap target, drawn before it is committed. This is what makes the
       snapping legible: the point you are about to place is shown sitting on
       the intersection it will land on, not wherever the finger happens to be. */
    if (S.cursor && placingStage() && !press && !S.hoverHandle) {
      out.push('<g class="sk-snap' + (S.snapKind && S.snapKind !== 'grid' ? ' locked' : '') +
        '"><circle cx="' + (S.cursor[0] * K) + '" cy="' + (S.cursor[1] * K) +
        '" r="' + ((S.snapKind === 'corner' ? 9 : 7) * RU).toFixed(1) + '"/>' +
        '<line x1="' + ((S.cursor[0] - 0.34) * K) + '" y1="' + (S.cursor[1] * K) +
        '" x2="' + ((S.cursor[0] + 0.34) * K) + '" y2="' + (S.cursor[1] * K) + '"/>' +
        '<line x1="' + (S.cursor[0] * K) + '" y1="' + ((S.cursor[1] - 0.34) * K) +
        '" x2="' + (S.cursor[0] * K) + '" y2="' + ((S.cursor[1] + 0.34) * K) + '"/></g>');
    }

    out.push(openingsAndTags(f));

    // corners. The first one is fat and obvious once closing is possible, which
    // is the whole of the instruction "finish where you started".
    var live = S.drawing || [];
    var editing = editable();
    var handles = live.length ? live
      : editing === 'ext' ? S.extension.outline
      : editing === 'plot' ? S.garden.plot.outline
      : editing === 'floor' ? f.outline
      : (f.closed ? f.outline : []);
    handles.forEach(function (p, i) {
      var isTarget = live.length > 2 && i === 0;
      var picked = !live.length && editing && S.pick && S.pick.kind === 'corner' && S.pick.i === i &&
        (S.pick.which === editing || (editing === 'floor' && S.pick.which === 'floor'));
      out.push('<circle cx="' + P(p)[0] + '" cy="' + P(p)[1] + '" r="' +
        (isTarget ? 15 * RU : (S.touch ? 11 : 9) * RU).toFixed(1) + '" class="sk-node' +
        (isTarget ? ' start' : '') + (picked ? ' on' : '') + '"/>');
    });

    // the selected corner or inside wall carries the control that removes it,
    // so a stray tap can never delete anything
    var kill = null;
    if (!live.length && S.pick) {
      if (S.pick.kind === 'corner' && editing) {
        var ring = shapeOf(S.pick.which).outline;
        var c = ring[S.pick.i];
        if (c) kill = [c[0], c[1] - 26 * RU / K];
      } else if (S.pick.kind === 'garea') {
        var ga = S.garden.areas[S.pick.i];
        if (ga) { var gc = centroid(ga.outline); kill = [gc[0], gc[1] - 22 * RU / K]; }
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
      // a pill with the word on it — "Ba" means nothing to anybody
      var pw = (t.short.length * 7.2 + 16) * RU, ph = 20 * RU;
      out.push('<g class="sk-pin" data-marker="' + i + '"><rect x="' + (mk.x * K - pw / 2) + '" y="' +
        (mk.y * K - ph / 2) + '" width="' + pw + '" height="' + ph + '" rx="' + (ph / 2) + '"/>' +
        '<text x="' + (mk.x * K) + '" y="' + (mk.y * K + 4 * RU) + '" text-anchor="middle" font-size="' +
        (11.5 * RU).toFixed(1) + '">' + esc(t.short) + '</text></g>');
    });

    if (f.closed && S.scale) {
      // bottom left, where nothing is ever drawn — the top is where a rear
      // extension goes
      out.push('<text x="' + ((v.x0 + 0.5) * K) + '" y="' + ((v.y1 - 1.1) * K) + '" class="sk-area">' +
        fmt(m(shoelace(f.outline)) * m(1)) + ' m² · ' + esc(f.name.toLowerCase()) + '</text>');
      out.push('<text x="' + ((v.x0 + 0.5) * K) + '" y="' + ((v.y1 - 0.45) * K) +
        '" class="sk-legend">1 square = ' + SNAP.toFixed(2) + ' m</text>');
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
    if (id === 'openings') return any(function (x) { return x.openings.some(function (o) { return o.kind !== 'intDoor'; }); });
    if (id === 'rooms') return any(function (x) { return x.markers.length > 0; });
    if (id === 'garden') return S.garden.plot.closed;
    return S.extension.closed;
  }

  function ready() { return ground().closed && !!S.scale; }

  function paintChrome() {
    var chooser = $('sk-choose'), work = $('sk-work');
    if (chooser) chooser.hidden = S.started;
    if (work) work.hidden = !S.started;
    if (!S.started) return;

    /* A rail, not a row of tabs. Tabs say "go anywhere"; this is a sequence,
       and the whole point is that you always know where you are in it. */
    var tabs = $('sk-stages');
    if (tabs) {
      tabs.innerHTML = STAGES.map(function (st) {
        var locked = st.id !== 'outline' && !ready();
        var state = st.id === S.stage ? ' here' : stageDone(st.id) ? ' done' : '';
        return '<button type="button" class="sk-step' + state + '" data-stage="' + st.id +
          '" aria-current="' + (st.id === S.stage ? 'step' : 'false') + '"' + (locked ? ' disabled' : '') +
          '><i>' + (stageDone(st.id) && st.id !== S.stage ? '✓' : st.n) + '</i>' +
          '<span>' + esc(st.label) + '</span></button>';
      }).join('');
    }

    var rst = $('sk-restart');
    if (rst) {
      rst.textContent = S.confirm === 'restart' ? 'Tap again to lose it all' : 'Start again';
      rst.classList.toggle('sk-danger', S.confirm === 'restart');
    }

    var floors = $('sk-floors');
    if (floors) {
      floors.hidden = S.stage === 'extension' || S.stage === 'garden';
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
  /** A floor that still has no rooms on it, other than this one. */
  function floorWithoutRooms() {
    for (var i = 0; i < S.floors.length; i++) {
      if (i !== S.active && S.floors[i].closed && !S.floors[i].markers.length) return i;
    }
    return -1;
  }

  function nextAction() {
    var f = floor();
    if (S.calibrating || S.askUp) return null;
    if (S.stage === 'outline') {
      if (S.drawing && S.drawing.length > 2) return { id: 'sk-close-shape', label: 'Finish the outline' };
      if (!f.closed && !f.outline.length && S.active > 0 && S.floors[S.active - 1].closed) {
        return { id: 'sk-copy', label: 'Copy the ' + S.floors[S.active - 1].name.toLowerCase() };
      }
      if (f.closed && ready()) return { id: 'sk-go-internal', label: 'Next — inside walls' };
      return null;
    }
    // upstairs rooms matter most — the bedrooms and the bathroom are up there —
    // so finishing the ground floor rooms leads to the upstairs, not past it
    if (S.stage === 'rooms' && f.markers.length) {
      var up = floorWithoutRooms();
      if (up >= 0) return { id: 'sk-floor-' + up, label: 'Now the ' + S.floors[up].name.toLowerCase() };
    }
    if (S.stage === 'extension' && S.drawing && S.drawing.length > 2) {
      return { id: 'sk-close-ext', label: 'Finish the extension' };
    }
    if (S.stage === 'extension' && S.drawing && S.drawing.length === 2) {
      return { id: 'sk-hint-ext', label: 'Finish on a house wall' };
    }
    if (S.stage === 'garden' && S.drawing && S.drawing.length > 2) {
      return { id: 'sk-close-garden', label: 'Finish the ' + (S.garden.plot.closed ? gardenKind(S.gardenMode).label.toLowerCase() : 'plot') };
    }
    var i = STAGES.map(function (s) { return s.id; }).indexOf(S.stage);
    if (i >= 0 && i < STAGES.length - 1) {
      return { id: 'sk-go-' + STAGES[i + 1].id, label: 'Next — ' + STAGES[i + 1].label.toLowerCase() };
    }
    if (ready()) return { id: 'sk-finish', label: 'Done — use these figures' };
    return null;
  }

  function paintPanel() {
    var stage = STAGES.filter(function (s) { return s.id === S.stage; })[0];
    var hint = $('sk-hint');
    var f = floor();

    var of = $('sk-of'), name = $('sk-stagename');
    if (of) of.textContent = 'Step ' + stage.n + ' of ' + STAGES.length;
    if (name) name.textContent = S.calibrating ? 'How wide is it?' : S.askUp ? 'Upstairs?' : stage.label;

    var up = $('sk-upstairs');
    if (up) up.hidden = !S.askUp;

    if (hint) {
      var edited = (S.stage === 'outline' && f.closed) ||
                   (S.stage === 'extension' && S.extension.closed) ||
                   (S.stage === 'garden' && S.garden.plot.closed) ||
                   (S.stage === 'internal' && f.internals.length);
      var mid = S.drawing && S.drawing.length;
      hint.textContent =
        S.calibrating ? (S.preset
          ? 'Roughly how wide is your house across the front — the orange wall?'
          : 'How long is the wall highlighted in orange?')
        : S.askUp ? 'Does the house have an upstairs?'
        : (S.stage === 'internal' && S.wallMode === 'out') ? stage.out
        : (S.stage === 'internal' && S.wallMode === 'door') ? stage.door
        : (S.stage === 'internal' && !mid && S.pick && S.pick.kind === 'iwall') ? stage.picked
        : (S.stage === 'garden' && !mid && S.garden.plot.closed && S.gardenMode === 'tree') ? stage.tree
        : (S.stage === 'garden' && !mid && S.garden.plot.closed && S.gardenMode === 'boundary') ? stage.fence
        : mid && S.stage === 'internal' ? 'Now tap the other end of the wall.'
        : mid && S.drawing.length > 2 ? 'Keep going, or tap the first corner to finish.'
        : mid ? 'Keep tapping the corners.'
        : (S.stage === 'outline' && !f.closed && !f.outline.length && S.active > 0)
            ? 'Copy the floor below, or draw this one.'
        : (S.stage === 'rooms' && f.markers.length && floorWithoutRooms() >= 0)
            ? 'Ground floor done. Now the rooms upstairs.'
        : (edited && stage.done ? stage.done : stage.hint);
    }

    var cal = $('sk-calib');
    if (cal) {
      cal.hidden = !S.calibrating;
      var lenInput = $('sk-len'), lab = $('sk-len-label'), un = $('sk-unit');
      if (S.calibrating && lenInput && !lenInput.value) lenInput.value = S.units === 'ft' ? '26' : '8';
      if (lab) lab.textContent = S.preset ? 'Width across the front' : 'Length of the orange wall';
      if (un) un.textContent = S.units === 'ft' ? 'ft' : 'm';
      var ub = $('sk-units');
      if (ub) Array.prototype.forEach.call(ub.querySelectorAll('button'), function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-units') === (S.units || 'm')));
      });
    }

    var tools = $('sk-tools');
    if (tools) tools.innerHTML = (S.calibrating || S.askUp) ? '' : toolsFor(S.stage);

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
    var kb = (q.counts.kitchen || 0) + ' kitchen' + ((q.counts.kitchen || 0) === 1 ? '' : 's') + ' · ' +
      ((q.counts.bathroom || 0) + (q.counts.wc || 0)) + ' bath';
    read.innerHTML =
      row('Floor area', q.scaled && q.totalArea ? fmt(q.totalArea) + ' m²' : na, true) +
      row('Floors', q.floors || na) +
      row('Rooms', q.rooms.length ? q.rooms.length + ' <small>· ' + kb + '</small>' : na, q.rooms.length > 0) +
      (q.extension ? row('Extension', fmt(q.extension.area * q.extension.storeys) + ' m²', true) : '') +
      (q.wallRemoval ? row('Walls coming out', fmt(q.wallRemoval) + ' m', true) : '') +
      (q.garden ? row('Garden', fmt(q.garden.garden, 0) + ' m² <small>· ' + fmt(q.garden.boundary, 0) + ' m of fence</small>', true) +
        GARDEN_KINDS.map(function (k) {
          return q.garden.areas[k.id] ? row(k.label, fmt(q.garden.areas[k.id], 0) + ' m²') : '';
        }).join('') +
        (q.garden.trees ? row('Trees', q.garden.trees + (q.garden.treeNearest !== null
          ? ' <small>· nearest ' + fmt(q.garden.treeNearest, 1) + ' m from the ' + (S.extension.closed ? 'extension' : 'house') + '</small>' : '')) : '')
        : '') +
      '<button type="button" class="sk-more" id="sk-more" aria-expanded="' + !!S.more + '">' +
        (S.more ? 'Fewer details' : 'More details') + '</button>' +
      (S.more
        ? row('Footprint', q.scaled && q.footprint ? fmt(q.footprint) + ' m²' : na) +
          row('Outside walls', q.perimeter ? fmt(q.perimeter) + ' m' : na) +
          row('Inside walls', q.internalWall ? fmt(q.internalWall) + ' m' + (q.internalEstimated ? ' <small>est.</small>' : '') : na) +
          row('Wall area to plaster', q.plaster ? fmt(q.plaster, 0) + ' m²' : na) +
          row('Windows', q.windows) +
          row('Doors', q.extDoors + ' out · ' + q.intDoors + ' in')
        : '');

    var warn = $('sk-checks');
    if (warn) {
      var list = ready() ? checks() : [];
      warn.hidden = !list.length;
      warn.innerHTML = list.length
        ? '<p class="sk-checks-head">' + list.length + (list.length === 1 ? ' thing' : ' things') +
          ' worth a look</p><ul>' +
          list.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>'
        : '';
    }

    var apply = $('sk-apply');
    if (apply) apply.disabled = !ready();
    var u = $('sk-undo'), r = $('sk-redo');
    if (u) u.disabled = !UNDO.length && !(S.drawing && S.drawing.length);
    if (r) r.disabled = !REDO.length;
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
      // an empty floor offers shapes before it offers a blank grid: picking the
      // nearest one and dragging a corner is something anybody can do
      if (!f.closed && !(S.drawing && S.drawing.length)) {
        return '<div class="sk-tool"><label>Start with a shape</label><div class="sk-shapes">' +
          '<button type="button" data-shape="rect" aria-label="Rectangle"><svg viewBox="0 0 40 32"><rect x="4" y="4" width="32" height="24"/></svg><span>Rectangle</span></button>' +
          '<button type="button" data-shape="l" aria-label="L shape"><svg viewBox="0 0 40 32"><path d="M4 4h32v14H22v10H4z"/></svg><span>L shape</span></button>' +
          '<button type="button" data-shape="t" aria-label="T shape"><svg viewBox="0 0 40 32"><path d="M4 4h32v12h-9v12H13V16H4z"/></svg><span>T shape</span></button>' +
          '</div><p class="sk-tiny">Or tap round the corners of the house on the grid.</p></div>' +
          (S.floors.length > 1
            ? '<button type="button" class="btn btn-ghost btn-sm' + (S.confirm === 'floor' ? ' sk-danger' : '') +
              '" id="sk-dropfloor">' + (S.confirm === 'floor' ? 'Tap again to remove it' : 'Remove this floor') + '</button>'
            : '');
      }
      return (f.closed
        ? '<button type="button" class="btn btn-ghost btn-sm" id="sk-redraw">Draw this floor again</button>'
        : '') +
        (S.scale ? '<button type="button" class="btn btn-ghost btn-sm" id="sk-recal">Change the measurement</button>' : '') +
        (S.floors.length > 1
          ? '<button type="button" class="btn btn-ghost btn-sm' + (S.confirm === 'floor' ? ' sk-danger' : '') +
            '" id="sk-dropfloor">' + (S.confirm === 'floor' ? 'Tap again to remove it' : 'Remove this floor') + '</button>'
          : '');
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

    if (stage === 'internal') {
      var mode = S.wallMode || 'draw';
      return '<div class="sk-tool"><label>I want to</label>' +
        seg([['draw', 'Add a wall'], ['door', 'Add a doorway'], ['out', 'Knock a wall out']], mode, 'data-wallmode') + '</div>' +
        (mode === 'door' ? widths() : '');
    }
    if (stage === 'openings') {
      return '<div class="sk-tool"><label>Put in a</label>' +
        seg([['window', 'Window'], ['door', 'Front or back door'], ['bifold', 'Bi-fold or patio doors']],
            S.kind || 'window', 'data-kind') + '</div>' + widths();
    }
    if (stage === 'rooms') {
      return '<div class="sk-tool"><label>This room is a</label>' +
        seg(ROOM_TYPES.map(function (r) { return [r.id, r.label]; }), S.roomType, 'data-room') + '</div>';
    }
    if (stage === 'extension') {
      return (!S.extension.closed && !(S.drawing && S.drawing.length)
        ? '<button type="button" class="btn" id="sk-addext">Add a rear extension</button>' +
          '<p class="sk-tiny">It goes on the back wall. Drag its corners to the size you want.</p>'
        : '') +
        '<div class="sk-tool"><label>How many storeys?</label>' +
        seg([[1, 'Single storey'], [2, 'Two storey']], S.extension.storeys, 'data-storeys') + '</div>' +
        (S.extension.closed ? '<button type="button" class="btn btn-ghost btn-sm" id="sk-dropext">Remove the extension</button>' : '');
    }
    if (stage === 'garden') {
      var gp = S.garden.plot;
      if (!gp.closed) {
        return (!(S.drawing && S.drawing.length)
          ? '<button type="button" class="btn" id="sk-addplot">Add a typical plot</button>' +
            '<p class="sk-tiny">A fence line round the house. Drag its corners to where yours is.</p>'
          : '');
      }
      return '<div class="sk-tool"><label>Add a</label>' +
        seg(GARDEN_KINDS.map(function (k) { return [k.id, k.label]; }).concat([['tree', 'Tree'], ['boundary', 'Fence line']]),
            S.gardenMode, 'data-gmode') + '</div>' +
        '<button type="button" class="btn btn-ghost btn-sm' + (S.confirm === 'plot' ? ' sk-danger' : '') +
        '" id="sk-dropplot">' + (S.confirm === 'plot' ? 'Tap again to remove it all' : 'Remove the garden') + '</button>';
    }
    return '';
  }

  /* ---- the garden ---------------------------------------------------------- */

  function gardenKind(id) {
    return GARDEN_KINDS.filter(function (k) { return k.id === id; })[0] || GARDEN_KINDS[0];
  }

  function centroid(ring) {
    var x = 0, y = 0;
    ring.forEach(function (p) { x += p[0]; y += p[1]; });
    return ring.length ? [x / ring.length, y / ring.length] : [0, 0];
  }

  /** Which way the front of the house faces, as a unit step on the grid. */
  function frontDir() {
    var g = ground();
    if (!g.closed) return [0, 1];
    var i = S.frontIdx !== undefined ? S.frontIdx : frontWallIndex(g.outline);
    var a = g.outline[i], b = g.outline[(i + 1) % g.outline.length];
    var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], c = centroid(g.outline);
    var dx = mid[0] - c[0], dy = mid[1] - c[1];
    if (Math.abs(dx) > Math.abs(dy)) return [dx > 0 ? 1 : -1, 0];
    return [0, dy > 0 ? 1 : -1];
  }

  /** A fence line round the house: a short front garden, a long back one. */
  function addTypicalPlot() {
    var g = ground();
    if (!g.closed) return;
    var pts = g.outline.concat(S.extension.closed ? S.extension.outline : []);
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var fd = frontDir(), FRONT = 5, BACK = 10, SIDE = 1.5;
    var grow = { l: SIDE, r: SIDE, t: SIDE, b: SIDE };
    if (fd[0] === 1)       { grow.r = FRONT; grow.l = BACK; }
    else if (fd[0] === -1) { grow.l = FRONT; grow.r = BACK; }
    else if (fd[1] === -1) { grow.t = FRONT; grow.b = BACK; }
    else                   { grow.b = FRONT; grow.t = BACK; }
    var r = function (v) { return Math.round(v / SNAP) * SNAP; };
    snapshot();
    S.garden.plot = {
      outline: [[r(x0 - grow.l), r(y0 - grow.t)], [r(x1 + grow.r), r(y0 - grow.t)],
                [r(x1 + grow.r), r(y1 + grow.b)], [r(x0 - grow.l), r(y1 + grow.b)]],
      closed: true
    };
    S.gardenMode = 'patio';
    S.pick = null;
    FRAME = null; MANUAL = false;
    say('');
    settled();
  }

  function onRing(ring, p) {
    for (var i = 0; i < ring.length; i++) {
      if (projectOnSeg(p, ring[i], ring[(i + 1) % ring.length]).d < 1e-6) return true;
    }
    return false;
  }

  function areaAt(p) {
    for (var i = S.garden.areas.length - 1; i >= 0; i--) {
      if (insidePoly(S.garden.areas[i].outline, p)) return i;
    }
    return -1;
  }

  function removeArea(i) {
    snapshot();
    S.garden.areas.splice(i, 1);
    S.pick = null;
    settled();
  }

  function gardenTap(w) {
    var gd = S.garden;
    // the plot comes first: everything else is inside it
    if (!gd.plot.closed) {
      var p0 = snapTarget(w).p;
      if (!S.drawing) { snapshot(); S.drawing = []; }
      if (S.drawing.length > 2 && dist(p0, S.drawing[0]) < CLOSE_UNITS) { closeShape(); return; }
      S.drawing.push(p0);
      changed();
      return;
    }
    if (S.gardenMode === 'tree') {
      var t = snapFrom(null, w);
      if (!within(gd.plot.outline, t)) { say('Tap inside the plot.'); return; }
      if (within(ground().outline, t) || (S.extension.closed && within(S.extension.outline, t))) {
        say('That would put a tree inside the house.'); return;
      }
      snapshot();
      gd.trees.push(t);
      S.pick = null;
      say('');
      changed();
      return;
    }
    if (S.drawing && S.drawing.length) {
      var p = snapTarget(w).p;
      if (S.drawing.length > 2 && dist(p, S.drawing[0]) < CLOSE_UNITS) { closeShape(); return; }
      S.drawing.push(p);
      changed();
      return;
    }
    // The fence line is edited in its own mode, so that in every other mode
    // a tap on it means "start the lawn here", which is what it means.
    if (S.gardenMode === 'boundary') {
      var hit = wallOfShape(gd.plot, w);
      if (hit) { splitWall('plot', hit.i, hit.t); return; }
      if (S.pick) { S.pick = null; render(); }
      return;
    }
    // a tap on the edge of the picked surface adds a corner to it
    if (S.pick && S.pick.kind === 'garea' && gd.areas[S.pick.i]) {
      var h2 = wallOfShape(gd.areas[S.pick.i], w);
      if (h2 && !onRing(gd.plot.outline, w)) { splitWall('a' + S.pick.i, h2.i, h2.t); return; }
    }
    // a tap inside a surface picks it; on the picked one, lets it go. A tap on
    // its edge is not inside it — that is where the next surface starts.
    var inA = areaAt(w);
    if (inA >= 0 && !onRing(gd.areas[inA].outline, snapTarget(w).p)) {
      S.pick = (S.pick && S.pick.kind === 'garea' && S.pick.i === inA) ? null : { kind: 'garea', i: inA };
      say('');
      render();
      return;
    }
    if (S.pick) { S.pick = null; }
    if (!within(gd.plot.outline, snapFrom(null, w))) { say('Tap inside the plot.'); return; }
    snapshot();
    S.drawing = [snapTarget(w).p];
    changed();
  }

  function gardenSvg(RU) {
    var gd = S.garden, out = [];
    if (gd.plot.outline.length > 1) {
      if (gd.plot.closed) out.push('<polygon points="' + poly(gd.plot.outline) + '" class="sk-plot"/>');
      out.push('<polyline points="' + poly(gd.plot.closed ? gd.plot.outline.concat([gd.plot.outline[0]]) : gd.plot.outline) +
        '" class="sk-plotline"/>');
    }
    gd.areas.forEach(function (a, i) {
      var on = S.pick && S.pick.kind === 'garea' && S.pick.i === i;
      out.push('<polygon points="' + poly(a.outline) + '" class="sk-garea ' + a.kind + (on ? ' on' : '') + '"/>');
      var c = centroid(a.outline);
      out.push('<text x="' + (c[0] * K) + '" y="' + (c[1] * K + 4 * RU) + '" text-anchor="middle" class="sk-galab" font-size="' +
        (11 * RU).toFixed(1) + '">' + gardenKind(a.kind).tag + ' · ' + fmt(m(shoelace(a.outline)) * m(1), 0) + ' m²</text>');
      a.outline.forEach(function (p) {
        out.push('<circle cx="' + (p[0] * K) + '" cy="' + (p[1] * K) + '" r="' + (7 * RU).toFixed(1) + '" class="sk-node small"/>');
      });
    });
    gd.trees.forEach(function (t) {
      out.push('<g class="sk-tree"><circle cx="' + (t[0] * K) + '" cy="' + (t[1] * K) + '" r="' + (1.4 * K) + '"/>' +
        '<circle cx="' + (t[0] * K) + '" cy="' + (t[1] * K) + '" r="' + (5 * RU).toFixed(1) + '" class="trunk"/></g>');
    });
    return out.join('');
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
  /*
   * Touching is not crossing. An inside wall that ends exactly on an outside
   * wall — which is where most of them end — has an endpoint sitting on the
   * other segment, and a naive straddle test calls that a crossing and refuses
   * the commonest wall in the house.
   */
  function straddles(a, b, c, d) {
    var d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
    var E = 1e-9;
    if (Math.abs(d1) < E || Math.abs(d2) < E || Math.abs(d3) < E || Math.abs(d4) < E) return false;
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

  /**
   * A new corner in the middle of a wall. It goes ON the wall, at a grid
   * intersection when the wall runs through one — which every square and every
   * 45° wall does — and otherwise at the nearest point of the wall to that
   * intersection. Splitting a wall must never move the wall.
   */
  function splitPoint(a, b, t) {
    var on = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    var g = snapFrom(null, on);
    if (dist(g, on) < SNAP * 0.35) {
      var pr = projectOnSeg(g, a, b);
      if (pr.d < 1e-6) return g;                 // the grid point is on the wall
    }
    var back = projectOnSeg(g, a, b);
    var q = [a[0] + (b[0] - a[0]) * back.t, a[1] + (b[1] - a[1]) * back.t];
    return dist(q, a) < SNAP * 0.4 || dist(q, b) < SNAP * 0.4 ? mm(on) : mm(q);
  }

  function shapeOf(which) {
    if (which === 'ext') return S.extension;
    if (which === 'plot') return S.garden.plot;
    if (which && which.charAt(0) === 'a') return S.garden.areas[+which.slice(1)];
    return floor();
  }

  function splitWall(which, i, t) {
    var f = floor(), shape = shapeOf(which);
    var pts = which === 'floor' ? openingPoints(f) : null;
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
    var pts = which === 'floor' ? openingPoints(f) : null;
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


  /* =====================================================================
     Protections
     =====================================================================
     This drawing becomes a price, so the failure that matters is not an ugly
     plan — it is a PLAUSIBLE one that is wrong. Nobody checks a number that
     looks reasonable.

     The rule applied throughout: refuse only what makes the number wrong and
     cannot be interpreted; warn about everything else. A homeowner who cannot
     get past a validation message just leaves, and a warning they can overrule
     is worth more than a block they resent.
     ===================================================================== */

  function insidePoly(poly, p) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) &&
          p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  /** Inside, or sitting on a wall — a stud wall meeting an outside wall is fine. */
  function within(poly, p) {
    if (insidePoly(poly, p)) return true;
    for (var i = 0; i < poly.length; i++) {
      if (projectOnSeg(p, poly[i], poly[(i + 1) % poly.length]).d < 1e-6) return true;
    }
    return false;
  }

  /**
   * An inside wall that strays outside the house is charged for twice over —
   * studwork and plaster to both faces — for something that is not there. So
   * the endpoint simply cannot go outside: it stops at the wall, the same way
   * a corner stops on the grid. No message, no argument.
   */
  function keepInside(p) {
    var f = floor();
    if (!f.closed || within(f.outline, p)) return p;
    var c = centroid(f.outline);
    for (var t = 0.08; t <= 1; t += 0.08) {
      var q = snapFrom(null, [p[0] + (c[0] - p[0]) * t, p[1] + (c[1] - p[1]) * t]);
      if (within(f.outline, q)) return q;
    }
    return snapFrom(null, c);
  }

  /** Both ends inside is not enough: an L-shaped house has outside in the middle. */
  function crossesOutline(a, b) {
    var f = floor();
    if (!f.closed) return false;
    for (var i = 0; i < f.outline.length; i++) {
      if (straddles(a, b, f.outline[i], f.outline[(i + 1) % f.outline.length])) return true;
    }
    return false;
  }

  /** Two corners on top of each other make a wall of no length, and openings on it. */
  function hasZeroWall(poly) {
    for (var i = 0; i < poly.length; i++) {
      if (dist(poly[i], poly[(i + 1) % poly.length]) < SNAP * 0.5) return true;
    }
    return false;
  }

  /** Everything that must hold before a closed shape is accepted. */
  function badShape(poly) {
    if (poly.length < 3) return 'A shape needs at least three corners.';
    if (hasZeroWall(poly)) return 'Two corners are on top of each other.';
    if (selfIntersects(poly)) return 'That shape crosses over itself.';
    if (shoelace(poly) < SNAP * SNAP * 4) return 'That shape has almost no area in it.';
    return null;
  }

  /**
   * Two points are in the same enclosed space if you can walk between them
   * without going through a wall.
   *
   * That is the whole test, and it needs no planar subdivision — the thing this
   * tool exists by not doing. It is not perfect: in an L-shaped room the line
   * between two corners can leave and come back. But it is right for every
   * room a house actually has, and it stops the failure that costs money —
   * two bathroom pins in one bathroom is £6,000 of labour for one bathroom.
   */
  var SAME_ROOM_M = 2;   // no wall between and closer than this: the same room

  function sameSpaceAs(f, p, skip) {
    var walls = wallsOf(f);
    for (var i = 0; i < f.markers.length; i++) {
      if (i === skip) continue;
      var q = [f.markers[i].x, f.markers[i].y];
      // Somebody who skipped the inside walls — most people will — still has to
      // be able to label eight rooms in one open outline. So a pin is only the
      // same room as another when nothing is between them AND they are close.
      if (m(dist(p, q)) >= SAME_ROOM_M) continue;
      var blocked = false;
      for (var w = 0; w < walls.length && !blocked; w++) {
        if (straddles(p, q, walls[w].a, walls[w].b)) blocked = true;
      }
      if (!blocked) return i;
    }
    return -1;
  }

  /*
   * Soft checks. None of these stop anybody; they sit under the figures so a
   * number that came out of a mistake does not leave without being questioned.
   */
  function checks() {
    var out = [], q = measure(), f0 = ground();

    S.floors.forEach(function (f, i) {
      if (!f.closed) return;
      f.internals.forEach(function (sg) {
        if (!within(f.outline, sg[0]) || !within(f.outline, sg[1]) ||
            (function () {
              for (var k = 0; k < f.outline.length; k++) {
                if (straddles(sg[0], sg[1], f.outline[k], f.outline[(k + 1) % f.outline.length])) return true;
              }
              return false;
            })()) {
          out.push('An inside wall on the ' + f.name.toLowerCase() + ' runs outside the house.');
        }
      });
      if (i > 0 && f0.closed && shoelace(f.outline) > shoelace(f0.outline) * 1.15) {
        out.push('The ' + f.name.toLowerCase() + ' is bigger than the ground floor.');
      }
      f.markers.forEach(function (mk) {
        if (!within(f.outline, [mk.x, mk.y])) {
          out.push('A room pin on the ' + f.name.toLowerCase() + ' is outside the house.');
        }
      });
    });

    if (q.scaled && q.extDoors === 0) out.push('No way in yet — add a front or back door.');
    if (q.scaled && q.totalArea > 0) {
      var per = q.rooms.length ? q.totalArea / q.rooms.length : 0;
      if (q.rooms.length && per < 4) out.push('That is a lot of rooms for the floor area.');
      if (q.rooms.length && per > 45) out.push('That is very few rooms for the floor area.');
      if (!q.rooms.length) out.push('No rooms marked yet, so kitchens and bathrooms are not counted.');
    }
    if (S.extension.closed && ground().closed) {
      var touches = S.extension.outline.some(function (p) {
        for (var i = 0; i < ground().outline.length; i++) {
          if (projectOnSeg(p, ground().outline[i], ground().outline[(i + 1) % ground().outline.length]).d < SNAP * 1.5) return true;
        }
        return false;
      });
      if (!touches) out.push('The extension is not touching the house.');
    }

    if (S.garden.plot.closed) {
      var plot = S.garden.plot.outline;
      var outOfPlot = ground().outline.some(function (p) { return !within(plot, p); });
      if (outOfPlot) out.push('The house is not inside the plot.');
      S.garden.areas.forEach(function (a) {
        var k = gardenKind(a.kind).label.toLowerCase();
        if (a.outline.some(function (p) { return !within(plot, p); })) out.push('The ' + k + ' runs outside the plot.');
        // a patio laid against the back wall has corners ON the wall, which is right
        if (a.outline.some(function (p) { return insidePoly(ground().outline, p) && !onRing(ground().outline, p); })) {
          out.push('The ' + k + ' runs into the house.');
        }
      });
      if (q.garden && q.garden.treeNearest !== null && q.garden.treeNearest < 3 && S.extension.closed) {
        out.push('A tree is within 3 m of the extension — the foundations will need to go deeper.');
      }
    }

    // one of each, in the order found
    var seen = {}, uniq = [];
    out.forEach(function (t) { if (!seen[t]) { seen[t] = 1; uniq.push(t); } });
    return uniq;
  }

  /* ---- undo ------------------------------------------------------------------
   * Editing needs a real history, not a rule per action. Everything that
   * changes the drawing takes a snapshot first, so one button walks all of it
   * backwards in the order it happened.
   */
  var UNDO = [], REDO = [];

  function stateNow() {
    return JSON.stringify({
      floors: S.floors, extension: S.extension, garden: S.garden, scale: S.scale,
      active: S.active, drawing: S.drawing, snap: SNAP
    });
  }
  function restore(json) {
    var o = JSON.parse(json);
    S.floors = o.floors;
    S.extension = o.extension;
    S.garden = o.garden || newGarden();
    S.scale = o.scale;
    S.active = Math.min(o.active, o.floors.length - 1);
    S.drawing = o.drawing;
    SNAP = o.snap || LOOSE;       // undoing the measurement returns the loose grid
    S.pick = null; S.selected = null; S.cursor = null;
    FRAME = null;
  }

  function snapshot() {
    REDO.length = 0;
    try { UNDO.push(stateNow()); } catch (e) { return; }
    if (UNDO.length > 60) UNDO.shift();
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
    REDO.push(stateNow());
    restore(prev);
    say('');
    render();
  }

  function redo() {
    var next = REDO.pop();
    if (!next) return;
    UNDO.push(stateNow());
    restore(next);
    say('');
    render();
  }

  /* ---- input ------------------------------------------------------------------ */

  function toWorldXY(x, y) {
    var svg = $('sk-svg'), ctm = svg && svg.getScreenCTM();
    if (!ctm) return [0, 0];
    var pt = svg.createSVGPoint();
    pt.x = x; pt.y = y;
    var p = pt.matrixTransform(ctm.inverse());
    return [p.x / K, p.y / K];
  }
  function toWorld(evt) { return toWorldXY(evt.clientX, evt.clientY); }

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
    return Math.max(0.28, Math.min(1.3, (S.touch ? 20 : 15) / pxPerUnit()));
  }

  /*
   * Object snapping.
   *
   * The grid alone is not enough. At a quarter metre a square can be ten pixels
   * on screen, so landing exactly on a corner needs pixel accuracy — which is
   * why an inside wall would not start or finish on the corner of an outside
   * wall. Corners and walls now catch the pointer from a finger's width away,
   * the way they do in every drawing package, and they are still grid-true
   * because every corner was itself placed on the grid.
   *
   * Order of preference: an existing corner, then a wall, then the grid.
   */
  function snapCandidates() {
    var f = floor(), pts = [], lines = [], i;
    if (f.closed) {
      for (i = 0; i < f.outline.length; i++) {
        pts.push(f.outline[i]);
        lines.push([f.outline[i], f.outline[(i + 1) % f.outline.length]]);
      }
    }
    f.internals.forEach(function (sg) { pts.push(sg[0], sg[1]); lines.push(sg); });
    if (S.stage === 'extension') {
      for (i = 0; i < S.extension.outline.length; i++) pts.push(S.extension.outline[i]);
    }
    if (S.stage === 'garden') {
      // a lawn meets the patio and the patio meets the extension: every edge
      // out there is something the next shape wants to sit against
      var rings = [S.garden.plot.outline, S.extension.closed ? S.extension.outline : []]
        .concat(S.garden.areas.map(function (a) { return a.outline; }));
      rings.forEach(function (ring) {
        for (var k = 0; k < ring.length; k++) {
          pts.push(ring[k]);
          if (ring.length > 2) lines.push([ring[k], ring[(k + 1) % ring.length]]);
        }
      });
    }
    if (S.drawing) S.drawing.forEach(function (p) { pts.push(p); });
    return { pts: pts, lines: lines };
  }

  function snapTarget(w) {
    var r = Math.max(SNAP * 0.75, grabRadius());
    var c = snapCandidates(), best = null, i;

    for (i = 0; i < c.pts.length; i++) {
      var d = dist(w, c.pts[i]);
      if (d < r && (!best || d < best.d)) best = { p: c.pts[i].slice(), d: d, kind: 'corner' };
    }
    if (best) return best;

    // on a wall: take the grid point and slide it onto the wall, so an
    // orthogonal wall still lands on an intersection and a diagonal one at
    // least touches
    var g = snapFrom(null, w);
    for (i = 0; i < c.lines.length; i++) {
      var pr = projectOnSeg(w, c.lines[i][0], c.lines[i][1]);
      if (pr.d >= r) continue;
      var gp = projectOnSeg(g, c.lines[i][0], c.lines[i][1]);
      var q = mm([c.lines[i][0][0] + (c.lines[i][1][0] - c.lines[i][0][0]) * gp.t,
                  c.lines[i][0][1] + (c.lines[i][1][1] - c.lines[i][0][1]) * gp.t]);
      if (!best || pr.d < best.d) best = { p: q, d: pr.d, kind: 'wall' };
    }
    if (best) return best;

    return { p: g, kind: 'grid' };
  }

  function drawingStage() { return S.stage === 'outline' || S.stage === 'extension' || S.stage === 'internal' || S.stage === 'garden'; }
  /** Stages where the next tap puts something down at a grid point. */
  function placingStage() { return drawingStage() || S.stage === 'rooms'; }

  /** Which shape is being edited in this stage, if any. */
  function editable() {
    if (S.stage === 'outline' && floor().closed) return 'floor';
    if (S.stage === 'extension' && S.extension.closed) return 'ext';
    if (S.stage === 'garden' && S.garden.plot.closed) return 'plot';
    return null;
  }

  /** Whose corners can be dragged in this stage. The house outline stays
      draggable on every step — the dots are on screen, so they must work —
      except while an extension is being fitted against it. */
  function draggable() {
    if (S.stage === 'extension') return S.extension.closed ? 'ext' : null;
    if (S.stage === 'garden') return S.garden.plot.closed ? 'plot' : null;
    return floor().closed ? 'floor' : null;
  }

  /** The corner or wall end under the pointer, if there is one. */
  function handleAt(p) {
    var r = grabRadius(), best = null;
    var which = draggable();
    if (which) {
      shapeOf(which).outline.forEach(function (q, i) {
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
    if (S.stage === 'garden') {
      S.garden.areas.forEach(function (a, ai) {
        a.outline.forEach(function (q, i) {
          var d = dist(p, q);
          if (d < r && (!best || d < best.d)) best = { kind: 'corner', which: 'a' + ai, i: i, d: d };
        });
      });
      S.garden.trees.forEach(function (t, i) {
        var d = dist(p, t);
        if (d < r && (!best || d < best.d)) best = { kind: 'tree', i: i, d: d };
      });
    }
    // a door in the wrong place should slide, not be deleted and put back
    if (S.stage === 'openings' || S.stage === 'internal') {
      var f = floor();
      f.openings.forEach(function (o) {
        var w = openingWall(f, o);
        if (!w) return;
        var c = [w.a[0] + (w.b[0] - w.a[0]) * o.t, w.a[1] + (w.b[1] - w.a[1]) * o.t];
        var d = dist(p, c);
        if (d < r && (!best || d < best.d)) best = { kind: 'opening', id: o.id, d: d };
      });
    }
    if (S.stage === 'rooms') {
      floor().markers.forEach(function (mk, i) {
        var d = dist(p, [mk.x, mk.y]);
        if (d < r && (!best || d < best.d)) best = { kind: 'pin', i: i, d: d };
      });
    }
    return best;
  }

  var press = null;   // { x, y, world, handle, moved }

  function onDown(e) {
    if (!S.started || S.calibrating) return;
    var w = toWorld(e);
    // Pointer capture retargets pointerup to the svg, so what was under the
    // finger has to be remembered from pointerdown or the × looks like canvas.
    press = { x: e.clientX, y: e.clientY, world: w, handle: null, moved: false, target: e.target };
    if (S.drawing && S.drawing.length) return;      // mid-run: taps only
    var h = handleAt(w);
    if (!h) return;
    press.handle = h;
    snapshot();
    try { $('sk-svg').setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  }

  /* Rendering on every pointer move is fine for a plan this size, but only
     once per frame. */
  var RAF = 0;
  function renderSoon() {
    if (RAF) return;
    RAF = root.requestAnimationFrame(function () { RAF = 0; render(); });
  }

  function onMove(e) {
    if (!S.started || S.calibrating) return;

    /*
     * Putting a point down is a TAP, so a drag can never be mistaken for one —
     * which means a drag on empty canvas is free to pan, on a mouse and on one
     * finger alike. Requiring two fingers or a modifier key to move the plan is
     * a rule nobody knows and nothing on screen tells them.
     */
    if (press && !press.handle && !press.pan && !S.drawing) {
      if (Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) > 10) {
        press.pan = true;
        press.sx = press.x; press.sy = press.y;
        try { $('sk-svg').setPointerCapture(e.pointerId); } catch (err) {}
      }
    }
    if (press && press.pan) {
      var svg2 = $('sk-svg'), vv = frame();
      svg2.classList.add('grabbing');
      var sc = (vv.x1 - vv.x0) / Math.max(svg2.clientWidth, 1);
      panBy((e.clientX - press.sx) * sc, (e.clientY - press.sy) * sc);
      press.sx = e.clientX; press.sy = e.clientY;
      return;
    }

    if (press && press.handle) {
      if (Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) > 3) press.moved = true;
      if (!press.moved) return;
      $('sk-svg').classList.add('grabbing');
      var w2 = toWorld(e), g = snapFrom(null, w2);
      var h = press.handle, f2 = floor();
      if (h.kind === 'corner') {
        shapeOf(h.which).outline[h.i] = g;
        S.pick = { kind: 'corner', which: h.which, i: h.i };
      } else if (h.kind === 'tree') {
        S.garden.trees[h.i] = g;
      } else if (h.kind === 'iend') {
        var other = f2.internals[h.i][1 - h.end];
        var want = keepInside(g);
        if (!crossesOutline(want, other)) f2.internals[h.i][h.end] = want;
        S.pick = { kind: 'iwall', i: h.i };
      } else if (h.kind === 'opening') {
        // an opening slides along the wall it is in, and stays in it
        f2.openings.forEach(function (o) {
          if (o.id !== h.id) return;
          var wl = openingWall(f2, o);
          if (wl) o.t = projectOnSeg(w2, wl.a, wl.b).t;
        });
        S.selected = h.id;
      } else if (h.kind === 'pin') {
        var gp = keepInside(g);
        f2.markers[h.i].x = gp[0];
        f2.markers[h.i].y = gp[1];
      }
      renderSoon();
      return;
    }

    // the pointer says what a press would do: a hand over anything that drags,
    // which on a laptop is the only hint that the dots move at all
    var raw = toWorld(e);
    S.hoverHandle = !!handleAt(raw);
    var svgEl = $('sk-svg');
    if (svgEl) svgEl.classList.toggle('can-grab', S.hoverHandle);
    if (!placingStage()) { S.cursor = null; renderSoon(); return; }
    var tg = snapTarget(raw);
    S.snapKind = tg.kind;
    S.cursor = tg.p;
    if (S.stage === 'internal') S.cursor = keepInside(S.cursor);
    renderSoon();
  }

  function onLeave() { S.cursor = null; render(); }

  function onUp(e) {
    if (!S.started || S.calibrating) { press = null; return; }
    var p = press;
    press = null;
    $('sk-svg').classList.remove('grabbing');
    try { $('sk-svg').releasePointerCapture(e.pointerId); } catch (err) {}
    if (!p) return;

    if (p.handle && p.moved) {
      // dragging one pin into a room that already has one would put two labels
      // in a single space, so the one that was dragged goes back
      if (p.handle.kind === 'pin') {
        var fp = floor(), mk = fp.markers[p.handle.i];
        var clash = sameSpaceAs(fp, [mk.x, mk.y], p.handle.i);
        if (clash >= 0) {
          say('That room already has a label.');
          var undoTo = UNDO.pop();
          if (undoTo) restore(undoTo);
          settled();
          return;
        }
      }
      // a drag that crosses the shape would silently corrupt the area
      var h = p.handle;
      if (h.kind === 'corner') {
        var shape = shapeOf(h.which);
        var why = selfIntersects(shape.outline) ? 'That would fold the shape over itself.'
          : hasZeroWall(shape.outline) ? 'That would put two corners on top of each other.'
          : null;
        if (why) {
          say(why);
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
      var hh = p.handle;
      if (hh.kind === 'pin') { floor().markers.splice(hh.i, 1); settled(); return; }
      if (hh.kind === 'tree') { S.garden.trees.splice(hh.i, 1); settled(); return; }
      UNDO.pop();                          // nothing changed, so nothing to undo
      REDO.length = 0;
      // outside the shape steps a corner is only for dragging: a tap on it is
      // a tap on the plan, so an inside wall can start from a house corner
      if (hh.kind === 'corner' && !editable()) { onTap(p.world, e); return; }
      // in the garden a corner is a place to start the next shape from,
      // unless it belongs to the thing being edited
      if (hh.kind === 'corner' && S.stage === 'garden') {
        var mine = hh.which === 'plot' ? S.gardenMode === 'boundary'
          : !!(S.pick && ((S.pick.kind === 'garea' && 'a' + S.pick.i === hh.which) ||
                          (S.pick.kind === 'corner' && S.pick.which === hh.which)));
        if (!mine) { onTap(p.world, e); return; }
      }
      if (hh.kind === 'opening') { S.selected = hh.id; S.pick = null; }
      else {
        S.pick = hh.kind === 'corner'
          ? { kind: 'corner', which: hh.which, i: hh.i }
          : { kind: 'iwall', i: hh.i };
        S.selected = null;
      }
      render();
      return;
    }

    if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 8) return;   // a drag on nothing
    var tgt = p.target || e.target;
    if (tgt && tgt.closest && tgt.closest('[data-killpick]')) return;       // the overlay handler removes it
    onTap(p.world, e);
  }

  function onTap(w, e) {
    var f = floor();

    if (S.stage === 'outline' || S.stage === 'extension') {
      var which = S.stage === 'outline' ? 'floor' : 'ext';
      var shape = shapeOf(which);

      if (shape.closed) {
        // tapping a wall puts a corner in it; tapping nothing clears the selection
        var hit = wallOfShape(shape, w);
        if (hit) { splitWall(which, hit.i, hit.t); return; }
        if (S.pick) { S.pick = null; render(); }
        return;
      }

      var p = snapTarget(w).p;
      if (!S.drawing) { snapshot(); S.drawing = []; }
      if (S.drawing.length > 2 && dist(p, S.drawing[0]) < CLOSE_UNITS) { closeShape(); return; }
      // an extension that started on the house can finish on it too
      if (S.stage === 'extension' && S.drawing.length >= 2 && closeAgainstHouse(p)) return;
      S.drawing.push(p);
      changed();
      return;
    }

    if (S.stage === 'garden') { gardenTap(w); return; }

    if (S.stage === 'internal' && S.wallMode === 'door') {
      var iw = wallAt(w, 'int');
      if (!iw) { say('Tap one of the walls inside the house.'); return; }
      snapshot();
      var od = { id: 'o' + (++SEQ), on: 'int', idx: iw.w.idx, t: iw.t, width: DEFAULTS.intDoor, kind: 'intDoor' };
      f.openings.push(od);
      S.selected = od.id;
      say('');
      changed();
      return;
    }

    if (S.stage === 'internal' && S.wallMode === 'out') {
      // knocking a wall through is something you do TO a wall, so you point at
      // the wall — not something you total up in metres in your head
      var pick = nearestInternal(w);
      if (pick < 0) { say('Tap one of the walls inside the house.'); return; }
      snapshot();
      f.internals[pick].out = !f.internals[pick].out;
      say('');
      changed();
      return;
    }

    if (S.stage === 'internal') {
      if (!S.drawing || !S.drawing.length) {
        // A tap on a wall picks it, which is what a tap on a thing you have
        // drawn means everywhere else here. A second tap on the picked wall
        // starts a new wall from it, so a T-junction is still two taps away.
        var on = nearestInternal(w);
        if (on >= 0 && !(S.pick && S.pick.kind === 'iwall' && S.pick.i === on)) {
          S.pick = { kind: 'iwall', i: on };
          say('');
          render();
          return;
        }
        if (S.pick) { S.pick = null; }
        snapshot();
        S.drawing = [keepInside(snapTarget(w).p)];
        changed();
        return;
      }
      var end = keepInside(snapTarget(w).p);
      if (dist(end, S.drawing[0]) < SNAP * 0.5) { S.drawing = null; changed(); return; }
      if (crossesOutline(S.drawing[0], end)) { say('That wall would run outside the house.'); return; }
      f.internals.push([S.drawing[0], end]);
      S.drawing = null;
      say('');
      changed();
      return;
    }

    if (S.stage === 'rooms') {
      var g = snapFrom(null, w);
      if (!within(f.outline, g)) { say('Tap inside the house.'); return; }
      snapshot();
      // one label per enclosed space: tapping a room that already has one
      // moves and relabels it rather than adding a second
      var already = sameSpaceAs(f, g);
      if (already >= 0) {
        var wasType = f.markers[already].type;
        f.markers[already].x = g[0];
        f.markers[already].y = g[1];
        f.markers[already].type = S.roomType;
        if (wasType !== S.roomType) {
          var lab = function (id) { return (ROOM_TYPES.filter(function (r) { return r.id === id; })[0] || {}).label || id; };
          say('That ' + lab(wasType).toLowerCase() + ' is now a ' + lab(S.roomType).toLowerCase() +
              '. For a separate room, tap a bit further away.');
        }
      } else {
        f.markers.push({ x: g[0], y: g[1], type: S.roomType });
        say('');
      }
      changed();
      return;
    }

    // doors and windows always land on an outside wall
    var kind = S.kind || 'window';
    var on = wallAt(w, 'ext');
    if (!on) { say('Tap one of the outside walls.'); return; }
    snapshot();
    var o = { id: 'o' + (++SEQ), on: on.w.on, idx: on.w.idx, t: on.t,
              width: DEFAULTS[kind], kind: kind };
    f.openings.push(o);
    S.selected = o.id;
    say('');
    changed();
  }

  function nearestInternal(p) {
    var f = floor(), best = -1, bd = Math.max(0.6, grabRadius() * 1.5);
    f.internals.forEach(function (sg, i) {
      var pr = projectOnSeg(p, sg[0], sg[1]);
      if (pr.d < bd) { bd = pr.d; best = i; }
    });
    return best;
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

  /* Nothing here should throw, but "nothing happens" is the worst failure a
     drawing tool can have — so if something does, it says what, on screen,
     where a person can read it back to us. */
  function guarded(fn) {
    return function (e) {
      try { return fn(e); }
      catch (err) {
        try { say('Something went wrong: ' + (err && err.message ? err.message : err)); } catch (e2) {}
        if (root.console && console.error) console.error(err);
      }
    };
  }

  /* ---- an extension closes against the house ------------------------------
   * An extension is three walls off the back, not a free-floating box: the
   * house closes the fourth side. Making somebody return to their own first
   * corner asks them to draw a wall that is already there.
   *
   * So if it starts on a house wall and finishes on one, the shape is closed
   * along the house itself — walking the outline between the two attachment
   * points and picking up any corners in between, so an extension that wraps
   * round a corner comes out right rather than cutting it off.
   */
  function onHouse(p) {
    var g = ground();
    if (!g.closed) return null;
    var best = null;
    for (var i = 0; i < g.outline.length; i++) {
      var pr = projectOnSeg(p, g.outline[i], g.outline[(i + 1) % g.outline.length]);
      if (pr.d < SNAP * 0.8 && (!best || pr.d < best.d)) best = { i: i, t: pr.t, d: pr.d };
    }
    return best;
  }

  function ringPos(ring, i, t) {
    var s = 0;
    for (var k = 0; k < i; k++) s += dist(ring[k], ring[(k + 1) % ring.length]);
    return s + t * dist(ring[i], ring[(i + 1) % ring.length]);
  }

  /** Corners met walking forward around the ring from one position to another. */
  function cornersBetween(ring, from, to) {
    var total = ringLength(ring), cum = [], s = 0, k;
    for (k = 0; k < ring.length; k++) { cum.push(s); s += dist(ring[k], ring[(k + 1) % ring.length]); }
    var span = (to - from + total) % total, out = [];
    for (k = 0; k < ring.length; k++) {
      var rel = (cum[k] - from + total) % total;
      if (rel > 1e-6 && rel < span - 1e-6) out.push({ rel: rel, p: ring[k] });
    }
    out.sort(function (a, b) { return a.rel - b.rel; });
    return out.map(function (o) { return o.p.slice(); });
  }

  function closeAgainstHouse(endPoint) {
    var g = ground();
    if (!g.closed || !S.drawing || S.drawing.length < 2) return false;
    var a = onHouse(S.drawing[0]), bEnd = onHouse(endPoint);
    if (!a || !bEnd) return false;

    var ring = g.outline, total = ringLength(ring);
    var pA = ringPos(ring, a.i, a.t), pB = ringPos(ring, bEnd.i, bEnd.t);
    var fwd = (pA - pB + total) % total;
    // the short way round is the bit of house the extension is actually against
    var mids = fwd <= total - fwd
      ? cornersBetween(ring, pB, pA)
      : cornersBetween(ring, pA, pB).reverse();

    var ring2 = S.drawing.concat([endPoint], mids);
    var bad = badShape(ring2);
    if (bad) { say(bad); return false; }
    snapshot();
    S.extension.outline = ring2;
    S.extension.closed = true;
    S.drawing = null;
    S.cursor = null;
    say('');
    settled();
    return true;
  }

  function closeShape() {
    var bad = badShape(S.drawing || []);
    if (bad) { say(bad); return; }
    if (S.stage === 'extension') {
      S.extension.outline = S.drawing.slice();
      S.extension.closed = true;
    } else if (S.stage === 'garden') {
      if (!S.garden.plot.closed) {
        S.garden.plot = { outline: S.drawing.slice(), closed: true };
        S.gardenMode = 'patio';
      } else {
        S.garden.areas.push({ kind: S.gardenMode, outline: S.drawing.slice(), closed: true });
        S.pick = { kind: 'garea', i: S.garden.areas.length - 1 };
      }
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

  function startCalibration(keepPick) {
    var f = floor();
    if (!f.closed) return;
    if (!keepPick) {
      // pre-pick the longest wall: it is the one somebody is most likely to know
      var best = 0, bl = 0;
      for (var i = 0; i < f.outline.length; i++) {
        var L = dist(f.outline[i], f.outline[(i + 1) % f.outline.length]);
        if (L > bl) { bl = L; best = i; }
      }
      S.calibIdx = best;
      S.preset = false;
    }
    S.calibrating = true;
    render();
    var inp = $('sk-len');
    if (inp) { inp.value = inp.value || (S.units === 'ft' ? '26' : '8'); try { inp.focus(); inp.select(); } catch (e) {} }
  }

  /**
   * Redraw the whole thing in metres.
   *
   * Everything is multiplied by the factor the measured wall implies and then
   * re-snapped to a quarter metre. Corners move by at most 125 mm, which is
   * inside the tolerance of somebody remembering how long their front wall is,
   * and in exchange every dimension on the drawing becomes a figure a builder
   * would write down.
   */
  function toMetres(k) {
    var conv = function (p) {
      return [Math.round(p[0] * k / METRIC_SNAP) * METRIC_SNAP,
              Math.round(p[1] * k / METRIC_SNAP) * METRIC_SNAP];
    };
    S.floors.forEach(function (f) {
      f.outline = f.outline.map(conv);
      f.internals = f.internals.map(function (sg) { return [conv(sg[0]), conv(sg[1])]; });
      f.markers.forEach(function (mk) { var q = conv([mk.x, mk.y]); mk.x = q[0]; mk.y = q[1]; });
      if (f.image) { f.image.x *= k; f.image.y *= k; f.image.w *= k; f.image.h *= k; }
    });
    S.extension.outline = S.extension.outline.map(conv);
    S.garden.plot.outline = S.garden.plot.outline.map(conv);
    S.garden.areas.forEach(function (a) { a.outline = a.outline.map(conv); });
    S.garden.trees = S.garden.trees.map(conv);
    if (S.drawing) S.drawing = S.drawing.map(conv);
    SNAP = METRIC_SNAP;
    S.scale = 1;                 // one grid unit is one metre from here on
    FRAME = null;
    MANUAL = false;
  }

  /** The single number the whole drawing is scaled by. */
  function applyCalibration() {
    var f = floor();
    var inp = $('sk-len');
    var metres = parseFloat(inp && inp.value);
    if (S.units === 'ft' && metres) metres = metres * 0.3048;   // older houses are still in feet in people's heads
    if (!metres || metres <= 0) { say('Type roughly how long that wall is.'); return; }
    if (metres < 0.5 || metres > 60) { say('That is not the length of a wall on a house.'); return; }
    var units = dist(f.outline[S.calibIdx], f.outline[(S.calibIdx + 1) % f.outline.length]);
    if (!units) return;
    // the wall could be a short one, so judge the answer by the house it implies
    var area = shoelace(f.outline) * Math.pow(metres / units, 2);
    if (area < 4 || area > 3000) {
      say('That would make this floor ' + area.toFixed(0) + ' m². Check which wall is highlighted.');
      return;
    }
    snapshot();
    S.frontIdx = S.calibIdx;
    toMetres(metres / units);
    S.calibrating = false;
    // one clear question instead of a small "+ floor" nobody finds
    if (S.floors.length === 1 && !S.askedUp) S.askUp = true;
    say('');
    settled();
  }

  function answerUpstairs(how) {
    S.askUp = false; S.askedUp = true;
    if (how === 'same') {
      snapshot();
      S.floors.push(newFloor(S.floors.length));
      var was = S.active;
      S.active = S.floors.length - 1;
      copyFloorBelow();
      S.active = was;
      say('Upstairs added — same shape. You can change it later.');
    } else if (how === 'diff') {
      snapshot();
      S.floors.push(newFloor(S.floors.length));
      S.active = S.floors.length - 1;
      say('Draw the upstairs, or copy the floor below and change it.');
    }
    FRAME = null; MANUAL = false;
    settled();
  }

  /* ---- shapes to start from ---------------------------------------------
   * In loose grid units, since nothing is measured yet. The bottom wall is
   * the front, which is the one people can picture the width of.
   */
  /* The full-width wall is always at the bottom of the screen — that is the
     front, facing the viewer, and it is the width people can picture. The
     notch or the projection goes at the top, which is the garden. */
  var SHAPES = {
    rect: [[0, 0], [9, 0], [9, 7], [0, 7]],
    l:    [[0, 0], [6, 0], [6, 2.5], [9, 2.5], [9, 7], [0, 7]],
    t:    [[0, 3], [3, 3], [3, 0], [6, 0], [6, 3], [9, 3], [9, 8], [0, 8]]
  };

  function frontWallIndex(ring) {
    // the wall whose midpoint is lowest on screen, i.e. nearest the viewer
    var best = 0, by = -Infinity;
    for (var i = 0; i < ring.length; i++) {
      var a = ring[i], b = ring[(i + 1) % ring.length];
      var my = (a[1] + b[1]) / 2;
      if (my > by + 1e-9 || (Math.abs(my - by) < 1e-9 && dist(a, b) > dist(ring[best], ring[(best + 1) % ring.length]))) { by = my; best = i; }
    }
    return best;
  }

  function dropShape(id) {
    var pts = SHAPES[id];
    if (!pts) return;
    snapshot();
    var f = floor();
    // if there is already a scale, the shape arrives in metres
    var k = S.scale ? 1 : 1;
    f.outline = pts.map(function (p) { return [p[0] * k, p[1] * k]; });
    f.closed = true;
    f.internals = []; f.openings = []; f.markers = [];
    S.drawing = null; S.preset = true;
    FRAME = null; MANUAL = false;
    if (!S.scale) { settled(); S.calibIdx = frontWallIndex(f.outline); startCalibration(true); }
    else settled();
  }

  function addRearExtension() {
    var g = ground();
    if (!g.closed) return;
    var front = S.frontIdx !== undefined ? S.frontIdx : frontWallIndex(g.outline);
    var fa = g.outline[front], fb = g.outline[(front + 1) % g.outline.length];
    var fm = [(fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2];
    // the back is the wall farthest from the front
    var best = -1, bd = -1;
    for (var i = 0; i < g.outline.length; i++) {
      if (i === front) continue;
      var a = g.outline[i], b = g.outline[(i + 1) % g.outline.length];
      var d = dist(fm, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      if (d > bd) { bd = d; best = i; }
    }
    var a2 = g.outline[best], b2 = g.outline[(best + 1) % g.outline.length];
    var L = dist(a2, b2);
    var ux = (b2[0] - a2[0]) / L, uy = (b2[1] - a2[1]) / L;
    var n = outward(a2, b2, centroid(g.outline));
    var nl = Math.hypot(n[0], n[1]) || 1;
    n = [n[0] / nl, n[1] / nl];
    var width = Math.min(3.5 / (S.scale || 1), L * 0.8), depth = 4 / (S.scale || 1);
    var mid = [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2];
    var p1 = snapFrom(null, [mid[0] - ux * width / 2, mid[1] - uy * width / 2]);
    var p2 = snapFrom(null, [mid[0] + ux * width / 2, mid[1] + uy * width / 2]);
    var q1 = snapFrom(null, [p1[0] + n[0] * depth, p1[1] + n[1] * depth]);
    var q2 = snapFrom(null, [p2[0] + n[0] * depth, p2[1] + n[1] * depth]);
    snapshot();
    S.extension = { outline: [p1, q1, q2, p2], closed: true, storeys: S.extension.storeys || 1 };
    S.drawing = null;
    FRAME = null; MANUAL = false;
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


  /* ---- an example house ---------------------------------------------------
   * A finished drawing, instantly: two storeys, eight rooms, doors, windows
   * and a rear extension, already measured. It is here so anybody can see what
   * "done" looks like before they start, and so the whole flow downstream can
   * be shown without drawing a house first.
   *
   * Everything is in metres, because that is what a measured drawing is in.
   */
  function exampleHouse() {
    var shell = [[0, 0], [8.5, 0], [8.5, 7], [0, 7]];

    var g = newFloor(0);
    g.outline = shell.map(function (p) { return p.slice(); });
    g.closed = true;
    g.internals = [[[3.5, 0], [3.5, 7]], [[3.5, 3.5], [8.5, 3.5]], [[0, 5], [3.5, 5]]];
    g.openings = [
      { id: 'x1', on: 'ext', idx: 0, t: 0.16, width: 0.9, kind: 'door' },
      { id: 'x2', on: 'ext', idx: 0, t: 0.62, width: 1.8, kind: 'window' },
      { id: 'x3', on: 'ext', idx: 2, t: 0.30, width: 1.8, kind: 'window' },
      { id: 'x4', on: 'ext', idx: 3, t: 0.55, width: 1.2, kind: 'window' },
      { id: 'x5', on: 'int', idx: 0, t: 0.30, width: 0.85, kind: 'intDoor' },
      { id: 'x6', on: 'int', idx: 1, t: 0.35, width: 0.85, kind: 'intDoor' }
    ];
    g.markers = [
      { x: 1.75, y: 2.5, type: 'hall' },
      { x: 1.75, y: 6, type: 'wc' },
      { x: 6, y: 1.75, type: 'living' },
      { x: 6, y: 5.25, type: 'kitchen' }
    ];

    var u = newFloor(1);
    u.outline = shell.map(function (p) { return p.slice(); });
    u.closed = true;
    u.internals = [[[3.5, 0], [3.5, 7]], [[3.5, 3.5], [8.5, 3.5]], [[0, 3.5], [3.5, 3.5]]];
    u.openings = [
      { id: 'y1', on: 'ext', idx: 0, t: 0.22, width: 1.2, kind: 'window' },
      { id: 'y2', on: 'ext', idx: 0, t: 0.70, width: 1.2, kind: 'window' },
      { id: 'y3', on: 'ext', idx: 2, t: 0.28, width: 1.2, kind: 'window' },
      { id: 'y4', on: 'ext', idx: 2, t: 0.72, width: 1.2, kind: 'window' }
    ];
    u.markers = [
      { x: 1.75, y: 1.75, type: 'bedroom' },
      { x: 1.75, y: 5.25, type: 'bedroom' },
      { x: 6, y: 1.75, type: 'bedroom' },
      { x: 6, y: 5.25, type: 'bathroom' }
    ];

    UNDO.length = 0; REDO.length = 0;
    S.floors = [g, u];
    S.active = 0;
    S.extension = {
      outline: [[5.5, 7], [5.5, 10.5], [8.5, 10.5], [8.5, 7]],
      closed: true, storeys: 1
    };
    // the front is the top wall here, so the drive is above and the garden below
    S.garden = {
      plot: { outline: [[-1.5, -5], [10, -5], [10, 20], [-1.5, 20]], closed: true },
      areas: [
        { kind: 'drive',   outline: [[0, -5], [4.5, -5], [4.5, 0], [0, 0]], closed: true },
        { kind: 'patio',   outline: [[0, 7], [5.5, 7], [5.5, 10.5], [0, 10.5]], closed: true },
        { kind: 'lawn',    outline: [[0, 10.5], [8.5, 10.5], [8.5, 18.5], [0, 18.5]], closed: true }
      ],
      trees: [[8, 17], [-0.5, 14]]
    };
    S.gardenMode = 'patio';
    S.scale = 1;
    SNAP = METRIC_SNAP;
    S.started = true;
    S.stage = 'outline';
    S.drawing = null; S.cursor = null; S.pick = null; S.selected = null;
    S.calibrating = false; S.confirm = null; S.askedUp = true; S.askUp = false;
    S.frontIdx = 0;
    MANUAL = false; FRAME = null;
    say('An example house — draw over it, or start again.');
    settled();
  }

  /* ---- wiring ------------------------------------------------------------------ */

  function open(onApply, onTrace, onClose) {
    S.onApply = onApply || null;
    S.onTrace = onTrace || null;
    S.onClose = onClose || null;
    var resumed = !S.started && recall();
    var wrap = $('sk-overlay');
    wrap.classList.add('on');
    wrap.setAttribute('aria-hidden', 'false');
    settled();
    // arriving to find a house already drawn is a surprise unless it is named
    if (resumed) say('Picked up where you left off — "Start again" clears it.');
  }
  /* `going` means we are moving on deliberately — applied, or handed over to
     the automatic tracer — rather than backing out of the step. */
  function close(going) {
    var wrap = $('sk-overlay');
    wrap.classList.remove('on');
    wrap.setAttribute('aria-hidden', 'true');
    S.confirm = null;
    if (!going && S.onClose) S.onClose();
  }
  function reset() {
    UNDO.length = 0; REDO.length = 0; MANUAL = false; SNAP = LOOSE;
    forget();
    S.confirm = null;
    S.started = false; S.stage = 'outline'; S.scale = null;
    S.floors = [newFloor(0)]; S.active = 0;
    S.extension = { outline: [], closed: false, storeys: 1 };
    S.garden = newGarden(); S.gardenMode = 'boundary';
    S.drawing = null; S.cursor = null; S.selected = null; S.pick = null;
    S.calibrating = false; S.kind = null; S.wallMode = 'draw';
    S.askUp = false; S.askedUp = false; S.preset = false; S.frontIdx = undefined; S.more = false;
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
    if (id === 'extension' || id === 'garden') S.active = 0;     // both sit round the ground floor
    if (id === 'garden') S.gardenMode = S.garden.plot.closed ? (S.gardenMode || 'patio') : 'boundary';
    S.drawing = null; S.cursor = null; S.selected = null; S.pick = null;
    S.kind = id === 'openings' ? (S.kind || 'window') : null;
    if (id === 'internal') S.wallMode = S.wallMode || 'draw';
    say('');
    refitTight();
    if (id === 'extension' && !S.extension.closed) inflate(1.35);
    if (id === 'garden' && !S.garden.plot.closed) inflate(1.9);
    render();
  }

  /* ---- zoom and pan gestures ---------------------------------------------
   * A wheel zooms about the pointer, two fingers pinch and pan, and a drag on
   * empty canvas with nothing under it does nothing — panning is deliberate
   * (middle button, or two fingers) so it can never be mistaken for drawing.
   */
  var touches = {};       // live pointers, for the pinch
  var pinch = null;

  function pointerSpan() {
    var ids = Object.keys(touches);
    if (ids.length < 2) return null;
    var a = touches[ids[0]], b = touches[ids[1]];
    return { d: Math.hypot(b.sx - a.sx, b.sy - a.sy),
             mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2 };
  }

  function wire() {
    var svg = $('sk-svg');
    if (!svg) return;

    /*
     * Zoom in proportion to how much was actually scrolled. A fixed step per
     * event is fine for a mouse notch and violent on a trackpad, which fires
     * dozens of small deltas for one gesture — the plan took off the moment the
     * pointer crossed the canvas. Delta units differ by device, so they are
     * normalised to pixels first and the per-event factor is capped.
     */
    svg.addEventListener('wheel', function (e) {
      if (!S.started) return;
      e.preventDefault();
      var d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      var f = Math.exp(-Math.max(-60, Math.min(60, d)) * 0.0016);
      zoomAt(toWorld(e), f);
    }, { passive: false });

    svg.addEventListener('pointerdown', guarded(function (e) {
      if (e.pointerType === 'touch') {
        S.touch = true;
        var w = toWorld(e);
        touches[e.pointerId] = { sx: e.clientX, sy: e.clientY, wx: w[0], wy: w[1] };
        if (Object.keys(touches).length === 2) {
          press = null;                       // two fingers is never drawing
          pinch = pointerSpan();
          return;
        }
      }
      if (e.button === 1) {                                     // middle drag: pan
        press = { pan: true, sx: e.clientX, sy: e.clientY };
        try { svg.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
        return;
      }
      onDown(e);
      // No capture here. Capturing on every press retargets pointerup AND the
      // click to the svg, so a tap on the ×, on a wall during calibration, or
      // on anything else inside the drawing stops reaching its handler. A drag
      // takes capture at the moment it becomes a drag.
    }));

    svg.addEventListener('pointermove', guarded(function (e) {
      if (touches[e.pointerId]) { touches[e.pointerId].sx = e.clientX; touches[e.pointerId].sy = e.clientY; }
      if (pinch) {
        var now = pointerSpan();
        if (now && now.d > 4 && pinch.d > 4) {
          // zoom about whatever is under the middle of the two fingers, which
          // also pans when the fingers move together
          zoomAt(toWorldXY(now.mx, now.my), now.d / pinch.d);
          pinch = now;
        }
        return;
      }
      onMove(e);
    }));

    svg.addEventListener('pointerup', guarded(function (e) {
      delete touches[e.pointerId];
      if (pinch) { if (Object.keys(touches).length < 2) pinch = null; press = null; return; }
      if (press && press.pan) { press = null; svg.classList.remove('grabbing'); return; }
      onUp(e);
    }));
    svg.addEventListener('pointercancel', function (e) {
      delete touches[e.pointerId];
      press = null; pinch = null;
    });
    svg.addEventListener('pointerleave', onLeave);

    var file = $('sk-file');
    if (file) file.addEventListener('change', function (e) { loadImage(e.target.files[0]); });

    var len = $('sk-len');
    if (len) len.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); applyCalibration(); }
    });

    $('sk-overlay').addEventListener('click', guarded(function (e) {
      // A modal's clicks are its own. The estimator behind it binds several of
      // the same data attributes, and it was reading a button this handler had
      // already re-rendered out of the document.
      e.stopPropagation();
      var t = e.target, hit;
      var wasConfirm = S.confirm;
      if (wasConfirm && !(t.closest && t.closest('#sk-restart, #sk-dropfloor'))) {
        S.confirm = null; render();
      }

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
      hit = t.closest && t.closest('[data-shape]');
      if (hit) { dropShape(hit.getAttribute('data-shape')); return; }
      hit = t.closest && t.closest('[data-up]');
      if (hit) { answerUpstairs(hit.getAttribute('data-up')); return; }
      hit = t.closest && t.closest('[data-nudgelen]');
      if (hit) {
        // half a metre or a couple of feet at a time, for anyone who would
        // rather not type
        var li2 = $('sk-len'), step = S.units === 'ft' ? 2 : 0.5;
        var cur = parseFloat(li2.value) || 0;
        li2.value = String(Math.max(0.5, Math.round((cur + step * +hit.getAttribute('data-nudgelen')) * 10) / 10));
        return;
      }
      hit = t.closest && t.closest('[data-units]');
      if (hit) {
        var u0 = S.units || 'm', u1 = hit.getAttribute('data-units'), li = $('sk-len');
        if (u0 !== u1 && li && parseFloat(li.value)) {
          li.value = (u1 === 'ft' ? parseFloat(li.value) / 0.3048 : parseFloat(li.value) * 0.3048).toFixed(1);
        }
        S.units = u1; render(); return;
      }

      hit = t.closest && t.closest('[data-wallmode]');
      if (hit) { S.wallMode = hit.getAttribute('data-wallmode'); S.drawing = null; S.pick = null; render(); return; }

      hit = t.closest && t.closest('[data-kind]');
      if (hit) { S.kind = hit.getAttribute('data-kind'); S.selected = null; render(); return; }
      hit = t.closest && t.closest('[data-room]');
      if (hit) { S.roomType = hit.getAttribute('data-room'); render(); return; }
      hit = t.closest && t.closest('[data-gmode]');
      if (hit) { S.gardenMode = hit.getAttribute('data-gmode'); S.drawing = null; S.pick = null; say(''); render(); return; }
      hit = t.closest && t.closest('[data-storeys]');
      if (hit) { S.extension.storeys = +hit.getAttribute('data-storeys'); render(); return; }
      hit = t.closest && t.closest('[data-width]');
      if (hit) {
        floor().openings.forEach(function (o) { if (o.id === S.selected) o.width = +hit.getAttribute('data-width'); });
        render(); return;
      }
      hit = t.closest && t.closest('[data-open]');
      if (hit) { S.selected = hit.getAttribute('data-open'); render(); return; }
      // A pin is removed by the pointer path (a tap on its handle), never by
      // the click: on a touch screen the click arrives after the tap that
      // placed the pin has drawn it, and would remove it again at once.

      hit = t.closest && t.closest('[data-act]');
      if (hit) {
        var act = hit.getAttribute('data-act');
        if (act === 'sk-hint-ext') return;
        if (act === 'sk-finish') { var ap = $('sk-apply'); if (ap) ap.click(); return; }
        if (act.indexOf('sk-floor-') === 0) {
          S.active = +act.slice(9); S.drawing = null; S.selected = null; S.pick = null;
          FRAME = null; MANUAL = false; settled(); return;
        }
        if (act === 'sk-close-shape' || act === 'sk-close-ext' || act === 'sk-close-garden') { closeShape(); return; }
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
        else if (S.pick && S.pick.kind === 'garea') removeArea(S.pick.i);
        return;
      }

      switch ((btn && btn.id) || t.id) {
        case 'sk-blank':     S.started = true; settled(); return;
        case 'sk-addext':    addRearExtension(); return;
        case 'sk-addplot':   addTypicalPlot(); return;
        case 'sk-dropplot':
          if (S.confirm !== 'plot') { S.confirm = 'plot'; render(); return; }
          snapshot();
          S.garden = newGarden(); S.gardenMode = 'boundary'; S.pick = null; S.drawing = null; S.confirm = null;
          MANUAL = false; FRAME = null; refitTight(); inflate(1.9);
          render(); persist(); return;
        case 'sk-more':      S.more = !S.more; render(); return;
        case 'sk-example':   exampleHouse(); return;
        case 'sk-upload':    if ($('sk-file')) $('sk-file').click(); return;
        case 'sk-autotrace':
          // still here for anyone with a clean estate agent plan — it finds the
          // rooms itself. Kept subordinate because drawing works on any plan.
          if (!root.DATUM.TRACE) return;
          close(true);
          root.DATUM.TRACE.open(S.onTrace || function () {});
          return;
        case 'sk-calib-go':  applyCalibration(); return;
        case 'sk-recal':     startCalibration(); return;
        case 'sk-redraw':
          snapshot();
          var f = floor();
          f.outline = []; f.closed = false; f.openings = []; f.internals = []; f.markers = [];
          S.drawing = null; FRAME = null; settled(); return;
        case 'sk-rect':      dropShape('rect'); return;
        case 'sk-addfloor':
          snapshot();
          S.floors.push(newFloor(S.floors.length));
          S.active = S.floors.length - 1;
          S.stage = 'outline'; S.drawing = null; FRAME = null; settled(); return;
        case 'sk-dropfloor':
          if (!S.confirm) { S.confirm = 'floor'; render(); return; }
          S.confirm = null;
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
          // leave room to draw the next one, the same as entering the stage
          // does — and after the state change, or settled() undoes it
          MANUAL = false; FRAME = null; refitTight(); inflate(1.35);
          render(); persist(); return;
        case 'sk-del':
          snapshot();
          floor().openings = floor().openings.filter(function (o) { return o.id !== S.selected; });
          S.selected = null; changed(); return;
        case 'sk-undo':      undo(); return;
        case 'sk-redo':      redo(); return;
        case 'sk-fit':       fitView(); return;
        case 'sk-zoomin':    zoomAt(frameCentre(), 1.3); return;
        case 'sk-zoomout':   zoomAt(frameCentre(), 1 / 1.3); return;
        case 'sk-restart':
          // one tap can throw away ten minutes of work, so it takes two
          if (!S.confirm) { S.confirm = 'restart'; render(); return; }
          if (S.confirm === 'restart') { S.confirm = null; reset(); }
          return;
        case 'sk-close-btn': close(); return;
        case 'sk-skip':
          // there has to be a way past, or somebody whose drawing will not
          // behave is stuck on the one screen they cannot get through
          close(true);
          if (S.onApply) S.onApply(measure(), S);
          return;
        case 'sk-apply':
          if (S.onApply) S.onApply(measure(), S);
          close(true); return;
      }
      if (t === $('sk-overlay')) close();
    }));

    doc.addEventListener('keydown', function (e) {
      if (!$('sk-overlay').classList.contains('on')) return;
      if (e.key === 'Escape') {
        if (S.drawing) { S.drawing = null; S.cursor = null; render(); }
        else if (S.pick || S.selected) { S.pick = null; S.selected = null; render(); }
        else close();
        return;
      }
      if (e.key === 'Enter' && !S.calibrating) {
        var n = nextAction();
        if (n) { e.preventDefault(); var b = $('sk-next'); if (b) b.click(); }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (e.key === 'Backspace' && doc.activeElement !== $('sk-len')) { e.preventDefault(); undo(); }
    });
  }

  /* ---- keeping the work -------------------------------------------------
   * Ten minutes of drawing used to end with the tab. It is held in this
   * browser only and never sent anywhere, same as everything else here.
   */
  var SKEY = 'datum.drawing.v1';

  function persist() {
    try {
      root.localStorage.setItem(SKEY, JSON.stringify({
        v: 1, floors: S.floors, extension: S.extension, garden: S.garden, scale: S.scale,
        active: S.active, snap: SNAP, started: S.started, stage: S.stage
      }));
    } catch (e) {
      // an uploaded plan can be megabytes; the drawing matters more than the backdrop
      try {
        var lean = JSON.parse(JSON.stringify(S.floors));
        lean.forEach(function (f) { f.image = null; });
        root.localStorage.setItem(SKEY, JSON.stringify({
          v: 1, floors: lean, extension: S.extension, garden: S.garden, scale: S.scale,
          active: S.active, snap: SNAP, started: S.started, stage: S.stage
        }));
      } catch (e2) { /* private mode, or full — carry on without saving */ }
    }
  }

  function recall() {
    var raw;
    try { raw = root.localStorage.getItem(SKEY); } catch (e) { return false; }
    if (!raw) return false;
    try {
      var o = JSON.parse(raw);
      if (!o || o.v !== 1 || !o.floors || !o.floors.length) return false;
      if (!o.floors[0].closed) return false;        // nothing worth restoring
      S.floors = o.floors;
      S.extension = o.extension || { outline: [], closed: false, storeys: 1 };
      S.garden = o.garden || newGarden();
      S.gardenMode = S.garden.plot.closed ? 'patio' : 'boundary';
      S.scale = o.scale;
      S.active = Math.min(o.active || 0, o.floors.length - 1);
      SNAP = o.snap || LOOSE;
      S.started = true;
      S.stage = STAGES.some(function (st) { return st.id === o.stage; }) ? o.stage : 'outline';
      S.askedUp = true;             // a saved house has whatever floors it has
      return true;
    } catch (e) { return false; }
  }

  function forget() { try { root.localStorage.removeItem(SKEY); } catch (e) {} }

  /**
   * The drawn plan, as a finished picture for the rest of the site.
   *
   * The estimator used to sit a canned sample plan next to the client's own
   * figures — 79.8 m² of somebody else's house beside their 58 m². Once they
   * have drawn their house, that is the plan the questions are about.
   */
  function planSvg(idx) {
    var at = Math.min(idx || 0, Math.max(0, S.floors.length - 1));
    var f = S.floors[at];
    if (!f || !f.closed || !S.scale) return '';

    // the extension sits on the ground floor, and upstairs too if it is two storey
    var showExt = S.extension.closed && (at === 0 || S.extension.storeys > 1);

    var pts = f.outline.slice();
    f.internals.forEach(function (sg) { pts.push(sg[0], sg[1]); });
    if (showExt) pts = pts.concat(S.extension.outline);
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var pad = 1.6;
    var x0 = Math.min.apply(null, xs) - pad, x1 = Math.max.apply(null, xs) + pad;
    var y0 = Math.min.apply(null, ys) - pad * 1.4, y1 = Math.max.apply(null, ys) + pad;

    var out = ['<polygon points="' + poly(f.outline) + '" class="sk-floor"/>'];
    if (showExt) {
      out.push('<polygon points="' + poly(S.extension.outline) + '" class="sk-extension"/>');
      out.push('<polyline points="' + poly(S.extension.outline.concat([S.extension.outline[0]])) +
        '" class="sk-extline"/>');
    }
    out.push('<polyline points="' + poly(f.outline.concat([f.outline[0]])) + '" class="sk-ext"/>');
    f.internals.forEach(function (sg) {
      out.push('<line x1="' + P(sg[0])[0] + '" y1="' + P(sg[0])[1] + '" x2="' + P(sg[1])[0] +
        '" y2="' + P(sg[1])[1] + '" class="sk-int' + (sg.out ? ' out' : '') + '"/>');
      if (sg.out) {
        out.push('<text x="' + ((sg[0][0] + sg[1][0]) / 2 * K) + '" y="' +
          ((sg[0][1] + sg[1][1]) / 2 * K - 6) + '" text-anchor="middle" class="sk-outlab">OUT</text>');
      }
    });
    f.openings.forEach(function (o) { out.push(openingSvg(f, o)); });

    var c0 = centroid(f.outline);
    for (var i = 0; i < f.outline.length; i++) {
      var a = f.outline[i], b = f.outline[(i + 1) % f.outline.length];
      out.push(lengthTag(a, b, '', outward(a, b, c0)));
    }
    f.markers.forEach(function (mk) {
      var t = ROOM_TYPES.filter(function (r) { return r.id === mk.type; })[0] || ROOM_TYPES[6];
      out.push('<text x="' + (mk.x * K) + '" y="' + (mk.y * K) + '" text-anchor="middle" class="sk-roomlab">' +
        esc(t.label.toUpperCase()) + '</text>');
    });
    out.push('<text x="' + ((x0 + 0.4) * K) + '" y="' + ((y0 + 1.1) * K) + '" class="sk-area">' +
      fmt(m(shoelace(f.outline)) * m(1)) + ' m² · ' + esc(f.name.toLowerCase()) + '</text>');
    if (showExt) {
      var ec = centroid(S.extension.outline);
      out.push('<text x="' + (ec[0] * K) + '" y="' + (ec[1] * K) + '" text-anchor="middle" class="sk-extlab">' +
        fmt(m(shoelace(S.extension.outline)) * m(1)) + ' m²</text>');
      out.push('<text x="' + (ec[0] * K) + '" y="' + ((ec[1] + 0.55) * K) +
        '" text-anchor="middle" class="sk-roomlab">NEW</text>');
    }

    return '<svg class="sk-plan" viewBox="' + [x0 * K, y0 * K, (x1 - x0) * K, (y1 - y0) * K].join(' ') +
      '" preserveAspectRatio="xMidYMid meet" aria-label="Your plan">' + out.join('') + '</svg>';
  }

  root.DATUM = root.DATUM || {};
  root.DATUM.SKETCH = { open: open, close: close, wire: wire, reset: reset, measure: measure,
    snap: function () { return SNAP; }, planSvg: planSvg, example: exampleHouse,
    floors: function () { return S.floors.map(function (f) { return f.name; }); }, _S: S };
})(window, document);
