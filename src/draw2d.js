/*
 * Datum — 2D drawing
 * ---------------------------------------------------------------------------
 * Plans and sections, which is what the trade actually reads. Every build type
 * contributes a plan and a section; the flow shows whichever one answers the
 * question being asked. Head height only exists in a section. A garden layout
 * only exists in a plan. Neither survives an isometric.
 *
 * Units are metres throughout. Screen coordinates come out of p() for plan
 * (x right, y down the garden) and s() for section (x right, z up).
 */
(function (root) {
  'use strict';

  var S = 40;              // px per metre before the viewBox is fitted
  var NOMINAL = 1.0;       // standard foundation depth

  /* ---- drawing context ------------------------------------------------- */

  function Ctx(view) {
    this.view = view;
    this.out = [];
    this.xs = [];
    this.ys = [];
  }
  Ctx.prototype.mark = function (pt) { this.xs.push(pt[0]); this.ys.push(pt[1]); return pt; };
  Ctx.prototype.add = function (svg) { this.out.push(svg); return this; };
  /** Emit markup verbatim — used to open and close transformed layers. */
  Ctx.prototype.raw = function (svg) { this.out.push(svg); return this; };

  /** plan: x across, y down the garden */
  Ctx.prototype.p = function (x, y) { return this.mark([x * S, y * S]); };
  /** section: x across, z up from the datum */
  Ctx.prototype.s = function (x, z) { return this.mark([x * S, -z * S]); };

  function n(v) { return v.toFixed(2); }
  function pts(a) { return a.map(function (q) { return n(q[0]) + ',' + n(q[1]); }).join(' '); }
  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---- primitives ------------------------------------------------------- */

  Ctx.prototype.poly = function (points, fill, stroke, w, dash) {
    return this.add('<polygon points="' + pts(points) + '" fill="' + (fill || 'none') + '"' +
      (stroke ? ' stroke="' + stroke + '" stroke-width="' + (w || 1.4) + '"' : '') +
      (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linejoin="round"/>');
  };
  Ctx.prototype.path = function (d, fill, stroke, w, dash) {
    return this.add('<path d="' + d + '" fill="' + (fill || 'none') + '"' +
      (stroke ? ' stroke="' + stroke + '" stroke-width="' + (w || 1.4) + '"' : '') +
      (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linejoin="round" stroke-linecap="round"/>');
  };
  Ctx.prototype.line = function (a, b, stroke, w, dash) {
    return this.add('<line x1="' + n(a[0]) + '" y1="' + n(a[1]) + '" x2="' + n(b[0]) + '" y2="' + n(b[1]) +
      '" stroke="' + stroke + '" stroke-width="' + (w || 1.4) + '"' +
      (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linecap="round"/>');
  };
  Ctx.prototype.box = function (a, b, fill, stroke, w, dash) {
    return this.poly([a, [b[0], a[1]], b, [a[0], b[1]]], fill, stroke, w, dash);
  };
  Ctx.prototype.hatch = function (a, b) {
    return this.poly([a, [b[0], a[1]], b, [a[0], b[1]]], 'url(#d2-hatch)');
  };
  Ctx.prototype.circle = function (c, r, fill, stroke, w) {
    this.mark([c[0] - r, c[1] - r]); this.mark([c[0] + r, c[1] + r]);
    return this.add('<circle cx="' + n(c[0]) + '" cy="' + n(c[1]) + '" r="' + n(r) +
      '" fill="' + (fill || 'none') + '"' +
      (stroke ? ' stroke="' + stroke + '" stroke-width="' + (w || 1.4) + '"' : '') + '/>');
  };
  Ctx.prototype.label = function (at, text, cls, anchor) {
    // reserve roughly the room the text takes, so fitting the viewBox does not clip it
    var half = String(text).length * 3.4;
    var l = anchor === 'start' ? 0 : anchor === 'end' ? half * 2 : half;
    this.mark([at[0] - l, at[1] - 9]);
    this.mark([at[0] - l + half * 2, at[1] + 5]);
    return this.add('<text x="' + n(at[0]) + '" y="' + n(at[1]) + '" text-anchor="' +
      (anchor || 'middle') + '" class="' + (cls || 'd2-note') + '">' + esc(text) + '</text>');
  };

  /* ---- annotation -------------------------------------------------------- */

  function arrow(at, dx, dy, k) {
    var len = 7 * k, w = 2.6 * k;
    return '<polygon points="' + pts([
      at, [at[0] - dx * len + -dy * w, at[1] - dy * len + dx * w],
      [at[0] - dx * len - -dy * w, at[1] - dy * len - dx * w]
    ]) + '" fill="var(--d2-dim)"/>';
  }

  Ctx.prototype.chip = function (mid, text, k, id, hint) {
    var w = Math.max(50, String(text).length * 8.4) * k, h = 21 * k;
    this.mark([mid[0] - w / 2, mid[1] - h / 2]);
    this.mark([mid[0] + w / 2, mid[1] + h / 2]);
    return this.add('<g' + (id ? ' class="dim-chip" data-dim="' + id + '" tabindex="0" role="slider" aria-label="' +
        esc(hint || text) + '" style="cursor:' + (id === 'depth' ? 'ns-resize' : 'ew-resize') + '"' : '') + '>' +
      '<rect x="' + n(mid[0] - w / 2) + '" y="' + n(mid[1] - h / 2) + '" width="' + n(w) + '" height="' + n(h) +
      '" rx="' + n(3 * k) + '" fill="var(--d2-chip)" stroke="var(--d2-dim)" stroke-width="' + n(k) + '"/>' +
      '<text x="' + n(mid[0]) + '" y="' + n(mid[1] + 4.2 * k) + '" text-anchor="middle" class="dim-text" ' +
      'style="font-size:' + n(11.5 * k) + 'px">' + esc(text) + '</text></g>');
  };

  /** Horizontal dimension string at screen y. */
  Ctx.prototype.dimH = function (x0, x1, y, text, k, id, hint) {
    var c = 'var(--d2-dim)';
    this.line([x0, y], [x1, y], c, k);
    this.add(arrow([x0, y], -1, 0, k)).add(arrow([x1, y], 1, 0, k));
    return this.chip([(x0 + x1) / 2, y], text, k, id, hint);
  };
  /** Vertical dimension string at screen x. */
  Ctx.prototype.dimV = function (y0, y1, x, text, k, id, hint) {
    var c = 'var(--d2-dim)';
    this.line([x, y0], [x, y1], c, k);
    this.add(arrow([x, y0], 0, -1, k)).add(arrow([x, y1], 0, 1, k));
    return this.chip([x, (y0 + y1) / 2], text, k, id, hint);
  };
  Ctx.prototype.tick = function (a, b, k) {
    return this.line(a, b, 'var(--d2-dim)', 0.8 * k, (2 * k).toFixed(1) + ' ' + (3 * k).toFixed(1));
  };

  /* ---- shared pieces ------------------------------------------------------ */

  function groundLine(c, x0, x1, k) {
    var a = c.s(x0, 0), b = c.s(x1, 0);
    c.line(a, b, 'var(--d2-ground)', 1.8 * k);
  }

  /** Compress a real distance so a tree 20 m away does not shrink the drawing. */
  function visual(m) { return m <= 5 ? m : Math.min(9, 5 + (m - 5) * 0.38); }

  function treeSection(c, x, height, k, label) {
    var base = c.s(x, 0), top = c.s(x, height * 0.5);
    c.line(base, top, 'var(--d2-old-line)', 3 * k);
    c.circle(c.s(x, height * 0.74), height * 0.21 * S, 'var(--d2-canopy)', 'var(--d2-canopy-line)', 1.3 * k);
    if (label) c.label(c.s(x, height * 1.05), label, 'd2-tag');
  }

  function roots(c, fromX, toX, k) {
    var a = c.s(fromX, 0);
    [[-0.9, -2.0], [-1.4, -2.8], [-0.6, -1.35]].forEach(function (r) {
      var mid = c.s(fromX + (toX - fromX) * 0.5, r[0]);
      var end = c.s(toX, r[1]);
      c.path('M' + n(a[0]) + ' ' + n(a[1]) + ' Q' + n(mid[0]) + ' ' + n(mid[1]) + ' ' + n(end[0]) + ' ' + n(end[1]),
        'none', 'var(--d2-warn)', 1.2 * k);
    });
  }

  function foundation(c, x0, x1, depth, k) {
    c.hatch(c.s(x0, 0), c.s(x1, -depth));
    c.box(c.s(x0, 0), c.s(x1, -depth), 'none', 'var(--d2-earth-line)', 1.2 * k);
  }

  /** Where a normal footing would have stopped — drawn once, across the whole plan. */
  function usualDepth(c, x0, x1, depth, k) {
    if (depth <= NOMINAL + 0.01) return;
    c.line(c.s(x0, -NOMINAL), c.s(x1, -NOMINAL), 'var(--d2-warn)', 1.4 * k,
      (4 * k).toFixed(1) + ' ' + (3 * k).toFixed(1));
    c.label(c.s(x0 + (x1 - x0) * 0.5, -NOMINAL + 0.17), 'USUAL DEPTH', 'd2-warn-tag');
  }


  /* =====================================================================
     The house — one plan, several floors, with the work marked on it
     ===================================================================== */

  // A semi-detached with a rear outrigger. Metres, origin at the front-left
  // corner, garden away from the front door.
  var HOUSE = { w: 8.4, d: 8.2, outX: 3.4, outD: 3.2, party: 0 };
  var W_EXT = 0.22, W_INT = 0.08;

  function wallRun(c, a, b, thick, k, colour) {
    c.line(c.p(a[0], a[1]), c.p(b[0], b[1]), colour || 'var(--d2-wall)', thick * S);
  }
  /** Cut a hole in a wall by overdrawing it in the floor colour. */
  function cut(c, a, b, thick) {
    c.line(c.p(a[0], a[1]), c.p(b[0], b[1]), 'var(--d2-floor)', thick * S + 0.6);
  }
  function win(c, a, b, k) {
    cut(c, a, b, W_EXT);
    c.line(c.p(a[0], a[1]), c.p(b[0], b[1]), 'var(--d2-wall)', 1.1 * k);
    c.line(c.p(a[0], a[1]), c.p(b[0], b[1]), 'var(--d2-glass)', 2.6 * k);
  }
  /** Door: the opening, the leaf and the swing, as a plan would show it. */
  function door(c, at, dx, dy, width, k, thick) {
    var to = [at[0] + dx * width, at[1] + dy * width];
    cut(c, at, to, thick === undefined ? W_INT : thick);
    var leafX = at[0] - dy * width, leafY = at[1] + dx * width;
    c.line(c.p(at[0], at[1]), c.p(leafX, leafY), 'var(--d2-wall)', 1.2 * k);
    var r = width * S;
    c.add('<path d="M' + n(c.p(to[0], to[1])[0]) + ' ' + n(c.p(to[0], to[1])[1]) +
      ' A' + n(r) + ' ' + n(r) + ' 0 0 ' + (dx * dy >= 0 ? '1' : '0') + ' ' +
      n(c.p(leafX, leafY)[0]) + ' ' + n(c.p(leafX, leafY)[1]) +
      '" fill="none" stroke="var(--d2-wall)" stroke-width="' + (0.9 * k) + '" stroke-dasharray="' +
      (2.5 * k).toFixed(1) + ' ' + (2.5 * k).toFixed(1) + '"/>');
  }
  function stair(c, x0, y0, x1, y1, k, up) {
    c.box(c.p(x0, y0), c.p(x1, y1), 'none', 'var(--d2-wall)', 1 * k);
    var n2 = 9;
    for (var i = 1; i < n2; i++) {
      var yy = y0 + i * (y1 - y0) / n2;
      c.line(c.p(x0, yy), c.p(x1, yy), 'var(--d2-wall)', 0.8 * k);
    }
    var mx = (x0 + x1) / 2;
    c.line(c.p(mx, y1 - 0.15), c.p(mx, y0 + 0.15), 'var(--d2-wall)', 1.1 * k);
    c.add(arrow(c.p(mx, y0 + 0.15), 0, -1, k));
    c.label(c.p(mx, y1 + 0.42), up || 'UP', 'd2-tag');
  }

  function room(c, r, k, tint) {
    c.box(c.p(r.x, r.y), c.p(r.x + r.w, r.y + r.h), tint || 'var(--d2-floor)', 'none');
    var ly = r.y + r.h * (r.labelY || 0.5);
    c.label(c.p(r.x + r.w / 2, ly - 0.1), r.name, 'd2-tag');
    c.label(c.p(r.x + r.w / 2, ly + 0.66), (r.w * r.h).toFixed(1) + ' m²', 'd2-room-area');
  }

  var FLOORS = {
    ground: [
      { x: 0,   y: 0,   w: 5.0, h: 4.8, name: 'LIVING ROOM' },
      { x: 5.0, y: 0,   w: 3.4, h: 4.8, name: 'HALL', labelY: 0.14 },
      { x: 0,   y: 4.8, w: 8.4, h: 3.4, name: 'KITCHEN / DINING' },
      { x: 0,   y: 8.2, w: 3.4, h: 3.2, name: 'UTILITY' }
    ],
    first: [
      { x: 0,   y: 0,   w: 5.0, h: 4.8, name: 'BEDROOM 1' },
      { x: 5.0, y: 0,   w: 3.4, h: 3.0, name: 'LANDING', labelY: 0.95 },
      { x: 5.0, y: 3.0, w: 3.4, h: 5.2, name: 'BEDROOM 2' },
      { x: 0,   y: 4.8, w: 5.0, h: 3.4, name: 'BEDROOM 3' },
      { x: 0,   y: 8.2, w: 3.4, h: 3.2, name: 'BATHROOM' }
    ],
    loft: [
      { x: 1.3, y: 1.0, w: 5.7, h: 4.2, name: 'LOFT ROOM' },
      { x: 1.3, y: 5.2, w: 2.6, h: 2.2, name: 'ENSUITE' },
      { x: 3.9, y: 5.2, w: 3.1, h: 2.2, name: 'LANDING', labelY: 0.34 }
    ]
  };

  /**
   * One house, one floor. Whatever work has been selected is drawn onto it:
   * the extension on the ground floor, the loft conversion on the loft, and
   * the refurbishment tinted across whichever rooms it touches.
   */
  function housePlan(c, floor, proj, k) {
    var H = HOUSE;
    var types = (proj && proj.types) || [];
    var jobs = (proj && proj.jobs) || {};
    var doingReno = types.indexOf('renovation') >= 0;
    var hasOut = floor !== 'loft';

    // ---- floor plate
    var plate = hasOut
      ? [[0, 0], [H.w, 0], [H.w, H.d], [H.outX, H.d], [H.outX, H.d + H.outD], [0, H.d + H.outD]]
      : [[0, 0], [H.w, 0], [H.w, H.d], [0, H.d]];
    c.poly(plate.map(function (q) { return c.p(q[0], q[1]); }), 'var(--d2-floor)', 'none');

    // ---- the extension, on the ground floor where it belongs
    var ext = jobs.extension && jobs.extension.measurements;
    var showExt = floor === 'ground' && types.indexOf('extension') >= 0 && ext;
    if (showExt) {
      var ew = Math.min(ext.width || 5, H.w), ed = ext.depth || 4;
      var ex0 = H.w - ew, ey0 = H.d;
      c.box(c.p(ex0, ey0), c.p(H.w, ey0 + ed), 'var(--d2-new-fill)', 'var(--d2-new-line)', 2.4 * k);
      c.label(c.p((ex0 + H.w) / 2, ey0 + ed / 2 - 0.1), 'NEW EXTENSION', 'd2-tag');
      c.label(c.p((ex0 + H.w) / 2, ey0 + ed / 2 + 0.66), (ew * ed).toFixed(1) + ' m²', 'd2-room-area');
      if (ext.bifoldWidth > 0) {
        var bw = Math.min(ext.bifoldWidth, ew - 0.4), bx = ex0 + (ew - bw) / 2;
        c.line(c.p(bx, ey0 + ed), c.p(bx + bw, ey0 + ed), 'var(--d2-glass)', 7 * k);
        c.label(c.p(ex0 + ew / 2, ey0 + ed - 0.45), bw.toFixed(1) + ' m OF BI-FOLD', 'd2-tag');
      }
      // dimensions the client can drag
      c.dimH(c.p(ex0, ey0 + ed + 1.5)[0], c.p(H.w, ey0 + ed + 1.5)[0], c.p(0, ey0 + ed + 1.5)[1],
        ew.toFixed(2) + ' m', k, 'width', 'Extension width, ' + ew.toFixed(2) + ' metres. Drag, or use the arrow keys.');
      c.dimV(c.p(H.w + 1.5, ey0)[1], c.p(H.w + 1.5, ey0 + ed)[1], c.p(H.w + 1.5, 0)[0],
        ed.toFixed(2) + ' m', k, 'depth', 'Projection, ' + ed.toFixed(2) + ' metres. Drag, or use the arrow keys.');
    }

    // ---- rooms
    var tint = doingReno && floor !== 'loft' ? 'var(--d2-reno)' : null;
    (FLOORS[floor] || []).forEach(function (r) { room(c, r, k, tint); });

    // ---- walls
    var outline = plate.slice();
    for (var i = 0; i < outline.length; i++) {
      var a = outline[i], b = outline[(i + 1) % outline.length];
      wallRun(c, a, b, W_EXT, k);
    }
    if (floor === 'loft') {
      c.box(c.p(1.3, 1.0), c.p(7.0, 7.4), 'none', 'var(--d2-wall)', W_INT * S);
      c.line(c.p(1.3, 5.2), c.p(7.0, 5.2), 'var(--d2-wall)', W_INT * S);
      c.line(c.p(3.9, 5.2), c.p(3.9, 7.4), 'var(--d2-wall)', W_INT * S);
      // where the roof comes down to nothing
      c.line(c.p(0.2, 0.4), c.p(8.2, 0.4), 'var(--d2-dim)', 1 * k, (4 * k).toFixed(1) + ' ' + (3 * k).toFixed(1));
      c.line(c.p(0.2, 8.0), c.p(8.2, 8.0), 'var(--d2-dim)', 1 * k, (4 * k).toFixed(1) + ' ' + (3 * k).toFixed(1));
      c.label(c.p(4.2, 0.15), 'EAVES — NO HEAD HEIGHT', 'd2-tag');
    } else if (floor === 'ground') {
      wallRun(c, [5.0, 0], [5.0, 4.8], W_INT, k);
      wallRun(c, [0, 4.8], [8.4, 4.8], W_INT, k);
      wallRun(c, [0, 8.2], [3.4, 8.2], W_INT, k);
      stair(c, 5.45, 1.9, 7.95, 4.5, k);
      door(c, [5.0, 3.6], 0, 1, 0.85, k);            // hall to living
      door(c, [3.2, 4.8], 1, 0, 0.85, k);            // hall to kitchen
      door(c, [1.4, 8.2], 1, 0, 0.85, k);            // kitchen to utility
      cut(c, [6.1, 0], [7.1, 0], W_EXT);             // front door
      c.line(c.p(6.1, 0), c.p(7.1, 0), 'var(--d2-wall)', 2 * k);
      c.label(c.p(6.6, -0.42), 'FRONT DOOR', 'd2-tag');
      win(c, [1.0, 0], [3.6, 0], k);                 // bay to the living room
      win(c, [0, 5.6], [0, 7.4], k);
      if (!showExt) win(c, [4.6, 8.2], [7.4, 8.2], k);
      win(c, [0.6, 11.4], [2.4, 11.4], k);
    } else {
      wallRun(c, [5.0, 0], [5.0, 8.2], W_INT, k);
      wallRun(c, [0, 4.8], [5.0, 4.8], W_INT, k);
      wallRun(c, [5.0, 3.0], [8.4, 3.0], W_INT, k);
      wallRun(c, [0, 8.2], [3.4, 8.2], W_INT, k);
      stair(c, 5.45, 0.35, 7.95, 2.3, k, 'DOWN');
      door(c, [5.0, 1.0], 0, 1, 0.85, k);
      door(c, [5.0, 3.9], 0, 1, 0.85, k);
      door(c, [3.2, 4.8], 1, 0, 0.85, k);
      door(c, [1.4, 8.2], 1, 0, 0.85, k);
      win(c, [1.0, 0], [3.6, 0], k);
      win(c, [6.0, 0], [7.6, 0], k);
      win(c, [0, 5.6], [0, 7.4], k);
      win(c, [4.6, 8.2], [7.4, 8.2], k);
    }

    // ---- the party wall, because this is a semi
    c.line(c.p(0, 0), c.p(0, floor === 'loft' ? H.d : H.d + H.outD), 'var(--d2-party)', W_EXT * S);
    c.label(c.p(0.34, 0.72), 'PARTY WALL', 'd2-party-tag', 'start');

    // ---- the one measurement everything else is scaled from
    c.tick(c.p(0, 0), c.p(0, -2.2), k);
    c.tick(c.p(H.w, 0), c.p(H.w, -2.2), k);
    c.line(c.p(0, -1.95), c.p(H.w, -1.95), 'var(--d2-accent)', 1.6 * k);
    c.add(arrow(c.p(0, -1.95), -1, 0, k * 1.15));
    c.add(arrow(c.p(H.w, -1.95), 1, 0, k * 1.15));
    c.chip(c.p(H.w / 2, -1.95), H.w.toFixed(2) + ' m', k * 1.15);
    c.label(c.p(H.w / 2, -2.62), 'SCALE SET FROM THIS WALL', 'd2-cal-tag');

    // ---- what floor am I looking at
    var area = (FLOORS[floor] || []).reduce(function (t, r) { return t + r.w * r.h; }, 0);
    var extBottom = showExt ? H.d + (jobs.extension.measurements.depth || 4) : 0;
    var bottom = Math.max(floor === 'loft' ? 8.0 : H.d + H.outD, extBottom);
    c.label(c.p(H.w / 2, bottom + (showExt ? 2.6 : 1.7)),
      floor.toUpperCase() + ' FLOOR · ' + area.toFixed(1) + ' m²', 'd2-area');
  }

  /** The scan the client traced over, drawn under whatever plan is on screen. */
  function scanLayer(c, floor, k) {
    var H = HOUSE;
    var mid = c.p(H.w / 2, (H.d + H.outD) / 2);
    c.raw('<g opacity="0.45" transform="rotate(-1.1 ' + n(mid[0]) + ' ' + n(mid[1]) +
          ') translate(' + n(5 * k) + ' ' + n(4 * k) + ')">');
    c.box(c.p(-0.7, -0.7), c.p(H.w + 0.7, H.d + H.outD + 0.7), 'var(--d2-scan-paper)', 'var(--d2-scan)',
      1 * k, (6 * k).toFixed(1) + ' ' + (4 * k).toFixed(1));
    (FLOORS[floor] || []).forEach(function (r) {
      c.box(c.p(r.x, r.y), c.p(r.x + r.w, r.y + r.h), 'none', 'var(--d2-scan)', 2.4 * k);
    });
    c.label(c.p(-0.6, -1.05), 'YOUR FLOOR PLAN, AS UPLOADED', 'd2-scan-tag', 'start');
    c.raw('</g>');
  }

  /* =====================================================================
     Scenes
     ===================================================================== */

  var SCENES = {

    /* ---------------------------------------------------------- extension */
    extension: {
      plan: function (c, j, g, k) {
        var floor = (j.project && j.project.floor) || 'ground';
        scanLayer(c, floor, k);
        housePlan(c, floor, j.project, k);
      },
      section: function (c, j, g, k) {
        var d = j.depth || 4, depth = g ? g.depth : NOMINAL;
        var hx = -5;
        groundLine(c, hx - 1, d + 11, k);
        c.hatch(c.s(hx - 1, 0), c.s(d + 11, -Math.max(depth, 2) - 1.2));
        // existing house
        c.path('M' + pts([c.s(hx, 0)]) + ' L' + pts([c.s(hx, 4.4)]) + ' L' + pts([c.s(hx / 2, 5.9)]) +
          ' L' + pts([c.s(0, 4.4)]) + ' L' + pts([c.s(0, 0)]), 'var(--d2-old-fill)', 'var(--d2-old-line)', 1.5 * k);
        c.line(c.s(hx, 2.6), c.s(0, 2.6), 'var(--d2-old-line)', 1.1 * k);
        c.label(c.s(hx / 2, 1.1), 'EXISTING', 'd2-tag');
        // the extension
        c.box(c.s(0, 0), c.s(d, 2.85), 'var(--d2-new-fill)', 'var(--d2-new-line)', 2 * k);
        c.line(c.s(0, 2.85), c.s(d, 2.85), 'var(--d2-new-line)', 2 * k);
        c.box(c.s(0, 2.85), c.s(d, 3.1), 'var(--d2-new-fill)', 'var(--d2-new-line)', 1.4 * k);
        if (j.bifoldWidth > 0) c.box(c.s(d - 0.06, 0.02), c.s(d, 2.2), 'var(--d2-glass)', 'var(--d2-new-line)', 1.2 * k);
        // foundations
        foundation(c, 0, 0.6, depth, k);
        foundation(c, d - 0.6, d, depth, k);
        usualDepth(c, 0, d, depth, k);
        c.dimV(c.s(0, 0)[1], c.s(0, -depth)[1], c.s(-1.4, 0)[0], depth.toFixed(2) + ' m', k);
        c.tick(c.s(0, 0), c.s(-1.65, 0), k);
        c.tick(c.s(0, -depth), c.s(-1.65, -depth), k);
        // the reason
        var gv = (j.trees || [])[0];
        if (gv) {
          var sp = root.DATUM.TREES.bySpeciesId(gv.species);
          if (sp) {
            var tx = d + visual(gv.distance);
            treeSection(c, tx, sp.height * 0.55, k, sp.name.toUpperCase());
            if (g && g.governing) roots(c, tx, d + 0.3, k);
            c.dimH(c.s(d, 0)[0], c.s(tx, 0)[0], c.s(0, 3.9)[1], gv.distance.toFixed(1) + ' m', k);
          }
        }
        c.dimH(c.s(0, 0)[0], c.s(d, 0)[0], c.s(0, -Math.max(depth, 2) - 0.9)[1], d.toFixed(2) + ' m', k, 'depth',
          'Projection, ' + d.toFixed(2) + ' metres. Drag, or use the arrow keys.');
      }
    },

    /* --------------------------------------------------------------- loft */
    loft: {
      section: function (c, j, g, k) {
        var span = 8, pitch = 42 * Math.PI / 180;
        var eaves = 5.2, rise = (span / 2) * Math.tan(pitch), ridge = eaves + rise;
        // the house below
        c.box(c.s(0, 0), c.s(span, eaves), 'var(--d2-old-fill)', 'var(--d2-old-line)', 1.4 * k);
        c.line(c.s(0, 2.6), c.s(span, 2.6), 'var(--d2-old-line)', 1.1 * k);
        groundLine(c, -1, span + 1, k);
        // roof
        c.path('M' + pts([c.s(0, eaves)]) + ' L' + pts([c.s(span / 2, ridge)]) + ' L' + pts([c.s(span, eaves)]),
          'var(--d2-new-fill)', 'var(--d2-new-line)', 2 * k);
        // usable head height: where the roof is at least 1.9 m above the new floor
        var usableHalf = Math.max(0, (span / 2) * (1 - 1.9 / rise));
        if (usableHalf > 0.1) {
          c.box(c.s(span / 2 - usableHalf, eaves), c.s(span / 2 + usableHalf, eaves + 0.1),
            'var(--d2-accentfill)', 'none');
          c.line(c.s(span / 2 - usableHalf, eaves + 1.9), c.s(span / 2 + usableHalf, eaves + 1.9),
            'var(--d2-accent)', 1.2 * k, (4 * k).toFixed(1) + ' ' + (3 * k).toFixed(1));
          c.label(c.s(span / 2 - usableHalf * 0.45, eaves + 2.1), 'HEAD HEIGHT 1.9 m', 'd2-tag');
          c.dimH(c.s(span / 2 - usableHalf, 0)[0], c.s(span / 2 + usableHalf, 0)[0], c.s(0, eaves - 0.55)[1],
            (usableHalf * 2).toFixed(2) + ' m usable', k);
        }
        // dormer, sitting on the slope where a real one would
        if (j.dormerWidth > 0) {
          var dTop = eaves + 2.0, dBot = eaves + 0.15;
          var slopeX = function (z) { return span / 2 + (ridge - z) * (span / 2) / rise; };
          c.poly([c.s(slopeX(dTop), dTop), c.s(span - 0.5, dTop),
                  c.s(span - 0.5, dBot), c.s(slopeX(dBot), dBot)],
                 'var(--d2-new-fill)', 'var(--d2-new-line)', 1.9 * k);
          c.box(c.s(span - 0.5, dBot + 0.25), c.s(span - 0.56, dTop - 0.25),
                'var(--d2-glass)', 'var(--d2-new-line)', 1.2 * k);
          c.label(c.s(span - 1.1, dTop + 0.42), j.dormerWidth.toFixed(1) + ' m DORMER', 'd2-tag');
        }

        // rooflights, set into the other slope
        var rl = Math.min(j.rooflights || 0, 4);
        for (var i = 0; i < rl; i++) {
          var t = 0.36 + i * 0.18;
          var rx = t * (span / 2), rz = eaves + t * rise;
          c.line(c.s(rx - 0.42, rz - 0.36), c.s(rx + 0.42, rz + 0.36), 'var(--d2-new-line)', 7 * k);
          c.line(c.s(rx - 0.36, rz - 0.31), c.s(rx + 0.36, rz + 0.31), 'var(--d2-glass)', 4.5 * k);
        }
        if (rl) c.label(c.s(span * 0.2, eaves + rise * 0.44), rl + ' ROOFLIGHTS', 'd2-tag');

        c.dimV(c.s(0, eaves)[1], c.s(0, ridge)[1], c.s(span + 1.2, 0)[0], rise.toFixed(2) + ' m', k);
        c.label(c.s(span / 2, eaves - 1.2), (j.floorArea || 0).toFixed(0) + ' m² OF NEW FLOOR', 'd2-area');
      },
      plan: function (c, j, g, k) {
        var floor = (j.project && j.project.floor) || 'loft';
        scanLayer(c, floor, k);
        housePlan(c, floor, j.project, k);
        if (floor === 'loft' && j.dormerWidth > 0) {
          var dw = Math.min(j.dormerWidth, 5.4);
          c.line(c.p(4.2 - dw / 2, 7.4), c.p(4.2 + dw / 2, 7.4), 'var(--d2-glass)', 7 * k);
          c.label(c.p(4.2, 7.95), dw.toFixed(1) + ' m DORMER', 'd2-tag');
        }
      }
    },

    /* --------------------------------------------------------- renovation */
    renovation: {
      plan: function (c, j, g, k) {
        var floor = (j.project && j.project.floor) || 'ground';
        scanLayer(c, floor, k);
        housePlan(c, floor, j.project, k);
        c.label(c.p(HOUSE.w / 2, -3.35),
          (j.floorArea || 0).toFixed(0) + ' m² BEING REFURBISHED', 'd2-reno-tag');
      },
      section: function (c, j, g, k) {
        var w = 9;
        groundLine(c, -1, w + 1, k);
        c.box(c.s(0, 0), c.s(w, 5.2), 'var(--d2-new-fill)', 'var(--d2-new-line)', 2 * k);
        c.line(c.s(0, 2.6), c.s(w, 2.6), 'var(--d2-new-line)', 1.4 * k);
        c.path('M' + pts([c.s(0, 5.2)]) + ' L' + pts([c.s(w / 2, 7.6)]) + ' L' + pts([c.s(w, 5.2)]),
          'var(--d2-old-fill)', 'var(--d2-old-line)', 1.5 * k);
        c.label(c.s(w / 2, 1.1), 'GROUND FLOOR', 'd2-tag');
        c.label(c.s(w / 2, 3.7), 'FIRST FLOOR', 'd2-tag');
        c.label(c.s(w / 2, 6), 'ROOF — NOT IN SCOPE', 'd2-tag');
        c.hatch(c.s(-1, 0), c.s(w + 1, -1.2));
      }
    },

    /* ----------------------------------------------------------- newbuild */
    newbuild: {
      plan: function (c, j, g, k) {
        var fa = j.footprintArea || 78;
        var w = Math.sqrt(fa * 1.4), h = fa / w;
        c.box(c.p(0, 0), c.p(w, h), 'var(--d2-new-fill)', 'var(--d2-new-line)', 2 * k);
        c.label(c.p(w / 2, h / 2), fa.toFixed(0) + ' m² FOOTPRINT', 'd2-area');
        c.label(c.p(w / 2, h / 2 + 0.75), (j.storeys || 2) + ' STOREYS · ' +
          ((j.storeys || 2) * fa).toFixed(0) + ' m² TOTAL', 'd2-tag');
        if (j.garageArea > 0) {
          var gw = Math.sqrt(j.garageArea * 1.6), gh = j.garageArea / gw;
          c.box(c.p(w + 1, 0), c.p(w + 1 + gw, gh), 'var(--d2-old-fill)', 'var(--d2-old-line)', 1.4 * k);
          c.label(c.p(w + 1 + gw / 2, gh / 2), 'GARAGE', 'd2-tag');
        }
        if (j.externalArea > 0) {
          var ew = Math.max(w + 3, Math.sqrt(j.externalArea * 1.6));
          var eh = j.externalArea / ew;
          c.box(c.p(-(ew - w) / 2, h + 1.2), c.p(w + (ew - w) / 2, h + 1.2 + eh),
            'none', 'var(--d2-old-line)', 1.2 * k, (5 * k).toFixed(1) + ' ' + (4 * k).toFixed(1));
          c.label(c.p(w / 2, h + 1.2 + eh / 2), j.externalArea.toFixed(0) + ' m² EXTERNAL WORKS', 'd2-tag');
        }
        c.dimH(c.p(0, -1.4)[0], c.p(w, -1.4)[0], c.p(0, -1.4)[1], w.toFixed(1) + ' m', k);
        c.dimV(c.p(-1.4, 0)[1], c.p(-1.4, h)[1], c.p(-1.4, 0)[0], h.toFixed(1) + ' m', k);
      },
      section: function (c, j, g, k) {
        var fa = j.footprintArea || 78, w = Math.sqrt(fa * 1.4);
        var st = j.storeys || 2, depth = g ? g.depth : NOMINAL;
        var eaves = st * 2.6;
        groundLine(c, -1.5, w + 1.5, k);
        c.hatch(c.s(-1.5, 0), c.s(w + 1.5, -Math.max(depth, 1.6) - 0.8));
        c.box(c.s(0, 0), c.s(w, eaves), 'var(--d2-new-fill)', 'var(--d2-new-line)', 2 * k);
        for (var i = 1; i < st; i++) c.line(c.s(0, i * 2.6), c.s(w, i * 2.6), 'var(--d2-new-line)', 1.3 * k);
        c.path('M' + pts([c.s(0, eaves)]) + ' L' + pts([c.s(w / 2, eaves + 2.6)]) + ' L' + pts([c.s(w, eaves)]),
          'var(--d2-new-fill)', 'var(--d2-new-line)', 2 * k);
        foundation(c, 0, 0.7, depth, k);
        foundation(c, w - 0.7, w, depth, k);
        usualDepth(c, 0, w, depth, k);
        c.dimV(c.s(0, 0)[1], c.s(0, -depth)[1], c.s(-1.6, 0)[0], depth.toFixed(2) + ' m', k);
        c.dimV(c.s(0, 0)[1], c.s(0, eaves + 2.6)[1], c.s(w + 1.5, 0)[0], (eaves + 2.6).toFixed(2) + ' m', k);
        var gv = (j.trees || [])[0];
        if (gv) {
          var sp = root.DATUM.TREES.bySpeciesId(gv.species);
          if (sp) {
            var tx = w + visual(gv.distance);
            treeSection(c, tx, sp.height * 0.5, k, sp.name.toUpperCase());
            if (g && g.governing) roots(c, tx, w - 0.2, k);
          }
        }
      }
    },

    /* ----------------------------------------------------------- external */
    external: {
      plan: function (c, j, g, k) {
        var total = (j.patioArea || 0) + (j.deckingArea || 0) + (j.drivewayArea || 0) + (j.turfArea || 0);
        var gw = Math.max(6, Math.sqrt(Math.max(total, 20) * 1.7));
        var gh = Math.max(5, Math.max(total, 20) / gw);
        // the house edge, for orientation
        c.box(c.p(0, -2.4), c.p(gw, 0), 'var(--d2-old-fill)', 'var(--d2-old-line)', 1.4 * k);
        c.label(c.p(gw / 2, -1.2), 'HOUSE', 'd2-tag');
        // garden boundary
        c.box(c.p(0, 0), c.p(gw, gh), 'none', 'var(--d2-old-line)', 1.2 * k);

        var y = 0;
        [['patioArea', 'PAVING', 'var(--d2-new-fill)', 'var(--d2-new-line)'],
         ['deckingArea', 'DECKING', 'var(--d2-deck)', 'var(--d2-old-line)'],
         ['drivewayArea', 'DRIVEWAY', 'var(--d2-drive)', 'var(--d2-old-line)'],
         ['turfArea', 'LAWN', 'var(--d2-lawn)', 'var(--d2-canopy-line)']].forEach(function (z) {
          var a = j[z[0]] || 0;
          if (!a) return;
          var zh = a / gw;
          c.box(c.p(0, y), c.p(gw, y + zh), z[2], z[3], 1.6 * k);
          c.label(c.p(gw / 2, y + zh / 2), z[1] + ' · ' + a.toFixed(0) + ' m²', 'd2-tag');
          y += zh;
        });

        if (j.fenceLength > 0) {
          c.box(c.p(-0.25, -0.25), c.p(gw + 0.25, gh + 0.25), 'none', 'var(--d2-old-line)', 2.4 * k,
            (2.5 * k).toFixed(1) + ' ' + (2.5 * k).toFixed(1));
          c.label(c.p(gw + 0.9, gh / 2), j.fenceLength.toFixed(0) + ' m FENCE', 'd2-tag', 'start');
        }
        if (j.wallLength > 0) {
          var lw = Math.min(j.wallLength, gw);
          c.line(c.p((gw - lw) / 2, y), c.p((gw - lw) / 2 + lw, y), 'var(--d2-warn)', 5 * k);
          c.label(c.p(gw / 2, y + 0.5), j.wallLength.toFixed(0) + ' m RETAINING WALL', 'd2-warn-tag');
        }
        if (j.drainageLength > 0) {
          c.line(c.p(0.2, 0.25), c.p(Math.min(gw - 0.2, j.drainageLength), 0.25), 'var(--d2-accent)', 2.4 * k,
            (3 * k).toFixed(1) + ' ' + (2 * k).toFixed(1));
        }
        c.dimH(c.p(0, gh + 1.5)[0], c.p(gw, gh + 1.5)[0], c.p(0, gh + 1.5)[1], gw.toFixed(1) + ' m', k);
      },
      section: function (c, j, g, k) {
        var w = 7;
        groundLine(c, -0.5, w + 0.5, k);
        var dig = Math.min(0.6, 0.15 + (j.excavationVol || 0) / Math.max(1, (j.patioArea || 40)) );
        c.hatch(c.s(-0.5, -dig), c.s(w + 0.5, -1.6));
        // build-up, drawn at the scale it is actually laid
        c.box(c.s(0, -dig), c.s(w, -0.09), 'var(--d2-earth-fill)', 'var(--d2-earth-line)', 1.3 * k);
        c.label(c.s(w / 2, -dig / 2 - 0.02), 'SUB-BASE, COMPACTED', 'd2-tag');
        c.box(c.s(0, -0.09), c.s(w, -0.05), 'var(--d2-old-fill)', 'var(--d2-old-line)', 1.1 * k);
        c.box(c.s(0, -0.05), c.s(w, 0.02), 'var(--d2-new-fill)', 'var(--d2-new-line)', 1.8 * k);
        c.label(c.s(w / 2, 0.2), 'PAVING', 'd2-tag');
        c.dimV(c.s(0, 0.02)[1], c.s(0, -dig)[1], c.s(-1.1, 0)[0], (dig + 0.02).toFixed(2) + ' m', k);
        c.tick(c.s(0, 0.02), c.s(-1.3, 0.02), k);
        c.tick(c.s(0, -dig), c.s(-1.3, -dig), k);
        if (j.excavationVol > 0) {
          c.label(c.s(w / 2, -dig - 0.5), (j.excavationVol).toFixed(0) + ' m³ DUG OUT AND CARTED AWAY', 'd2-warn-tag');
        }
      }
    }
  };

  /* =====================================================================
     Render
     ===================================================================== */

  function render(typeId, viewWanted, job, ground) {
    var scene = SCENES[typeId] || SCENES.extension;
    var view = scene[viewWanted] ? viewWanted : (scene.plan ? 'plan' : 'section');
    var c = new Ctx(view);

    // draw once at k=1 to learn the bounds, then again at the right annotation scale
    scene[view](c, job, ground, 1);
    var w0 = Math.max.apply(null, c.xs) - Math.min.apply(null, c.xs);
    var k = Math.max(0.85, Math.min(2.2, w0 / 640));

    c = new Ctx(view);
    scene[view](c, job, ground, k);

    var pad = 20 * k;
    var minX = Math.min.apply(null, c.xs) - pad, maxX = Math.max.apply(null, c.xs) + pad;
    var minY = Math.min.apply(null, c.ys) - pad, maxY = Math.max.apply(null, c.ys) + pad;

    return '<svg class="d2" viewBox="' + n(minX) + ' ' + n(minY) + ' ' + n(maxX - minX) + ' ' + n(maxY - minY) +
      '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
      (view === 'plan' ? 'Plan' : 'Section') + ' drawing">' +
      '<defs><pattern id="d2-hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">' +
      '<line x1="0" y1="0" x2="0" y2="8" stroke="var(--d2-hatch)" stroke-width="1"/></pattern></defs>' +
      c.out.join('') + '</svg>';
  }

  /** Screen movement per metre, so dragging a dimension feels direct. */
  function axis(view, which) {
    if (view === 'section') return which === 'depth' ? [S, 0] : [S, 0];
    return which === 'depth' ? [0, S] : [S, 0];
  }

  function views(typeId) {
    var scene = SCENES[typeId] || SCENES.extension;
    return { plan: !!scene.plan, section: !!scene.section };
  }

  root.DATUM = root.DATUM || {};
  root.DATUM.DRAW2D = { render: render, axis: axis, views: views };
})(window);
