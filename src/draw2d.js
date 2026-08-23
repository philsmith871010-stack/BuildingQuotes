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
     Scenes
     ===================================================================== */

  var SCENES = {

    /* ---------------------------------------------------------- extension */
    extension: {
      plan: function (c, j, g, k) {
        var w = j.width || 5, d = j.depth || 4;
        var hw = Math.max(w + 2, 7), hd = 6;
        // the house that is already there
        c.box(c.p(-(hw - w) / 2, -hd), c.p(w + (hw - w) / 2, 0), 'var(--d2-old-fill)', 'var(--d2-old-line)', 1.4 * k);
        c.label(c.p(w / 2, -hd / 2), 'EXISTING HOUSE', 'd2-tag');
        // the new work
        c.box(c.p(0, 0), c.p(w, d), 'var(--d2-new-fill)', 'var(--d2-new-line)', 2 * k);
        c.label(c.p(w / 2, d / 2), (w * d).toFixed(1) + ' m²', 'd2-area');
        // bi-folds on the garden edge
        if (j.bifoldWidth > 0) {
          var bw = Math.min(j.bifoldWidth, w - 0.4), bx = (w - bw) / 2;
          c.line(c.p(bx, d), c.p(bx + bw, d), 'var(--d2-glass)', 6 * k);
          c.label(c.p(w / 2, d + 0.55), bw.toFixed(2) + ' m OF GLASS', 'd2-tag');
        }
        // wall coming out, on the line between old and new
        if (j.wallRemoval > 0) {
          var rw = Math.min(j.wallRemoval, w), rx = (w - rw) / 2;
          c.line(c.p(rx, 0), c.p(rx + rw, 0), 'var(--d2-warn)', 3 * k, (5 * k).toFixed(1) + ' ' + (4 * k).toFixed(1));
        }
        // trees, in the garden
        (j.trees || []).forEach(function (t, i) {
          var sp = root.DATUM.TREES.bySpeciesId(t.species);
          if (!sp) return;
          var r = visual(t.distance);
          var tx = i % 2 ? w + r * 0.72 : -r * 0.72;
          var ty = d + r * 0.62;
          var at = c.p(tx, ty);
          c.circle(at, Math.max(0.9, sp.height * 0.16) * S, 'var(--d2-canopy)', 'var(--d2-canopy-line)', 1.3 * k);
          var corner = c.p(tx > w / 2 ? w : 0, d);
          c.tick(corner, at, k);
          c.chip([(corner[0] + at[0]) / 2, (corner[1] + at[1]) / 2], t.distance.toFixed(1) + ' m', k);
          c.label([at[0], at[1] + Math.max(0.9, sp.height * 0.16) * S + 13 * k], sp.name.toUpperCase(), 'd2-tag');
        });
        // dimensions
        c.dimH(c.p(0, d + 1.5)[0], c.p(w, d + 1.5)[0], c.p(0, d + 1.5)[1],
          w.toFixed(2) + ' m', k, 'width', 'Width, ' + w.toFixed(2) + ' metres. Drag, or use the arrow keys.');
        c.dimV(c.p(w + 1.5, 0)[1], c.p(w + 1.5, d)[1], c.p(w + 1.5, 0)[0],
          d.toFixed(2) + ' m', k, 'depth', 'Projection, ' + d.toFixed(2) + ' metres. Drag, or use the arrow keys.');
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
        var span = 8, len = Math.max(4, (j.floorArea || 28) / 4);
        c.box(c.p(0, 0), c.p(span, len), 'var(--d2-old-fill)', 'var(--d2-old-line)', 1.4 * k);
        var uw = Math.min(span - 1.4, 3.6);
        c.box(c.p((span - uw) / 2, 0.5), c.p((span + uw) / 2, len - 0.5), 'var(--d2-new-fill)', 'var(--d2-new-line)', 2 * k);
        c.label(c.p(span / 2, len / 2), (j.floorArea || 0).toFixed(0) + ' m²', 'd2-area');
        if (j.dormerWidth > 0) {
          var dw = Math.min(j.dormerWidth, span - 1);
          c.line(c.p((span - dw) / 2, len), c.p((span + dw) / 2, len), 'var(--d2-glass)', 6 * k);
          c.label(c.p(span / 2, len + 0.55), 'DORMER', 'd2-tag');
        }
        if (j.staircases > 0) {
          c.box(c.p(span / 2 - 0.5, 0.7), c.p(span / 2 + 0.5, 3.2), 'none', 'var(--d2-new-line)', 1.2 * k);
          for (var i = 1; i < 8; i++) c.line(c.p(span / 2 - 0.5, 0.7 + i * 0.31), c.p(span / 2 + 0.5, 0.7 + i * 0.31), 'var(--d2-new-line)', 0.8 * k);
          c.label(c.p(span / 2, 3.65), 'STAIR', 'd2-tag');
        }
        c.dimH(c.p(0, len + 1.4)[0], c.p(span, len + 1.4)[0], c.p(0, len + 1.4)[1], span.toFixed(1) + ' m', k);
      }
    },

    /* --------------------------------------------------------- renovation */
    renovation: {
      /*
       * A floor plan as it looks AFTER the client has uploaded theirs and
       * traced it: the scan sits underneath, slightly out of square the way a
       * photographed plan always is, with the crisp trace over the top. One
       * wall carries the dimension they typed in, and that single number sets
       * the scale for every other measurement on the drawing.
       */
      plan: function (c, j, g, k) {
        // Proportional layout of an ordinary semi, scaled to whatever floor
        // area the client gave us, so the drawing never contradicts the number.
        var UNITS = 72;
        var f = Math.sqrt(Math.max(j.floorArea || 90, 10) / UNITS);
        var W = 8 * f, H = 9 * f;
        var rooms = [
          { x: 0,       y: 0,       w: 5.2 * f, h: 4.5 * f, name: 'LIVING ROOM' },
          { x: 5.2 * f, y: 0,       w: 2.8 * f, h: 4.5 * f, name: 'HALL & STAIR', labelY: 0.8 },
          { x: 0,       y: 4.5 * f, w: W,       h: 4.5 * f, name: 'KITCHEN / DINER' }
        ];

        // ---- the uploaded scan, underneath and very slightly out of square
        var mid = c.p(W / 2, H / 2);
        c.raw('<g opacity="0.5" transform="rotate(-1.15 ' + n(mid[0]) + ' ' + n(mid[1]) +
              ') translate(' + n(5 * k) + ' ' + n(4 * k) + ')">');
        c.box(c.p(-0.5, -0.5), c.p(W + 0.5, H + 0.5), 'var(--d2-scan-paper)', 'var(--d2-scan)', 1 * k,
          (6 * k).toFixed(1) + ' ' + (4 * k).toFixed(1));
        rooms.forEach(function (r) {
          c.box(c.p(r.x, r.y), c.p(r.x + r.w, r.y + r.h), 'none', 'var(--d2-scan)', 2.6 * k);
        });
        c.label(c.p(0.15, H + 0.55), 'YOUR FLOOR PLAN, AS UPLOADED', 'd2-scan-tag', 'start');
        c.raw('</g>');

        // ---- the trace
        c.box(c.p(0, 0), c.p(W, H), 'var(--d2-new-fill)', 'var(--d2-new-line)', 2.4 * k);
        rooms.forEach(function (r) {
          c.box(c.p(r.x, r.y), c.p(r.x + r.w, r.y + r.h), 'none', 'var(--d2-new-line)', 1.6 * k);
          var ly = r.y + r.h * (r.labelY || 0.5);
          c.label(c.p(r.x + r.w / 2, ly - 0.12), r.name, 'd2-tag');
          c.label(c.p(r.x + r.w / 2, ly + 0.62), (r.w * r.h).toFixed(1) + ' m²', 'd2-room-area');
        });

        // stair treads, so the hall reads as a hall
        var hall = rooms[1];
        var stairTop = hall.y + hall.h * 0.08, stairBot = hall.y + hall.h * 0.55;
        c.box(c.p(hall.x + 0.3 * f, stairTop), c.p(hall.x + hall.w - 0.3 * f, stairBot),
          'none', 'var(--d2-new-line)', 1 * k);
        for (var t = 1; t < 7; t++) {
          var ty = stairTop + t * (stairBot - stairTop) / 7;
          c.line(c.p(hall.x + 0.3 * f, ty), c.p(hall.x + hall.w - 0.3 * f, ty), 'var(--d2-new-line)', 0.9 * k);
        }

        // windows on the front and rear walls
        [[0, 0.22], [0, 0.62], [H, 0.3], [H, 0.72]].forEach(function (win) {
          c.line(c.p(W * win[1] - 0.45 * f, win[0]), c.p(W * win[1] + 0.45 * f, win[0]), 'var(--d2-glass)', 5.5 * k);
        });

        // ---- the one measurement everything else is scaled from
        var cy = c.p(0, -1.9)[1];
        c.tick(c.p(0, 0), c.p(0, -2.15), k);
        c.tick(c.p(W, 0), c.p(W, -2.15), k);
        c.line(c.p(0, -1.9), c.p(W, -1.9), 'var(--d2-accent)', 1.6 * k);
        c.add(arrow(c.p(0, -1.9), -1, 0, k * 1.15));
        c.add(arrow(c.p(W, -1.9), 1, 0, k * 1.15));
        c.chip([mid[0], cy], W.toFixed(2) + ' m', k * 1.15);
        c.label(c.p(W / 2, -2.55), 'SCALE SET FROM THIS WALL', 'd2-cal-tag');

        // ---- wall coming out
        if (j.wallRemoval > 0) {
          var rw = Math.min(j.wallRemoval, 5.2 * f);
          c.line(c.p(0, 4.5 * f), c.p(rw, 4.5 * f), 'var(--d2-warn)', 4 * k,
            (5 * k).toFixed(1) + ' ' + (4 * k).toFixed(1));
          c.label(c.p(0.25, 4.5 * f - 0.42), rw.toFixed(1) + ' m OF WALL OUT', 'd2-warn-tag', 'start');
        }

        c.label(c.p(W / 2, H + 1.95), (j.floorArea || 0).toFixed(0) + ' m² TRACED', 'd2-area');
        c.dimV(c.p(W + 1.6, 0)[1], c.p(W + 1.6, H)[1], c.p(W + 1.6, 0)[0], H.toFixed(2) + ' m', k);
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
