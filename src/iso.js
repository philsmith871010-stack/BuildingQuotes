/*
 * Datum — isometric drawing
 * ---------------------------------------------------------------------------
 * Renders the extension as a measured drawing rather than an illustration.
 * Everything on screen is derived from the same metres the price is.
 *
 * Projection:  screen_x = (x - y) * cos30 * s
 *              screen_y = (x + y) * sin30 * s - z * s
 * so +x runs down-right, +y runs down-left (toward the viewer), +z is up.
 */
(function (root) {
  'use strict';

  var K = Math.cos(Math.PI / 6);   // 0.8660
  var M = Math.sin(Math.PI / 6);   // 0.5
  var S = 26;                      // pixels per metre before the viewBox fits

  var WALL_H  = 2.85;   // extension eaves
  var PARAPET = 0.25;
  var HOUSE_D = 5.4;    // how far the existing house runs back
  var HOUSE_H = 4.4;
  var RIDGE_H = 5.9;
  var NOMINAL = 1.0;    // standard foundation depth, for the reference line

  function pt(x, y, z) {
    return [(x - y) * K * S, (x + y) * M * S - z * S];
  }
  function p(a) { return a[0].toFixed(2) + ',' + a[1].toFixed(2); }
  function poly(pts) { return pts.map(p).join(' '); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // A face, as a closed polygon in screen space.
  function face(pts, fill, stroke, extra) {
    return '<polygon points="' + poly(pts) + '" fill="' + fill + '"' +
      (stroke ? ' stroke="' + stroke + '" stroke-width="1" stroke-linejoin="round"' : '') +
      (extra || '') + '/>';
  }
  function line(a, b, stroke, width, dash) {
    return '<line x1="' + a[0].toFixed(2) + '" y1="' + a[1].toFixed(2) +
      '" x2="' + b[0].toFixed(2) + '" y2="' + b[1].toFixed(2) +
      '" stroke="' + stroke + '" stroke-width="' + (width || 1) + '"' +
      (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linecap="round"/>';
  }

  /* ---- ground -------------------------------------------------------- */

  function ground(w, d, bounds) {
    var out = [];
    var x0 = Math.floor(bounds.x0), x1 = Math.ceil(bounds.x1),
        y0 = Math.floor(bounds.y0), y1 = Math.ceil(bounds.y1);
    for (var x = Math.ceil(x0); x <= x1; x++) {
      out.push(line(pt(x, y0, 0), pt(x, y1, 0), 'var(--dr-grid)', 1));
    }
    for (var y = Math.ceil(y0); y <= y1; y++) {
      out.push(line(pt(x0, y, 0), pt(x1, y, 0), 'var(--dr-grid)', 1));
    }
    return '<g class="iso-ground">' + out.join('') + '</g>';
  }

  /* ---- the house that is already there -------------------------------- */

  function house(w) {
    var x0 = -1.0, x1 = w + 1.0, y0 = -HOUSE_D, y1 = 0;
    var mid = (x0 + x1) / 2;
    var out = [];

    // right gable wall
    out.push(face([pt(x1, y0, 0), pt(x1, y1, 0), pt(x1, y1, HOUSE_H), pt(x1, y0, HOUSE_H)],
      'var(--dr-old-right)', 'var(--dr-old-stroke)'));
    // front wall, the one the extension joins
    out.push(face([pt(x0, y1, 0), pt(x1, y1, 0), pt(x1, y1, HOUSE_H), pt(x0, y1, HOUSE_H)],
      'var(--dr-old-left)', 'var(--dr-old-stroke)'));
    // gable triangle over the front wall
    out.push(face([pt(x0, y1, HOUSE_H), pt(x1, y1, HOUSE_H), pt(mid, y1, RIDGE_H)],
      'var(--dr-old-left)', 'var(--dr-old-stroke)'));
    // roof planes
    out.push(face([pt(mid, y1, RIDGE_H), pt(x1, y1, HOUSE_H), pt(x1, y0, HOUSE_H), pt(mid, y0, RIDGE_H)],
      'var(--dr-old-top)', 'var(--dr-old-stroke)'));
    out.push(face([pt(mid, y1, RIDGE_H), pt(x0, y1, HOUSE_H), pt(x0, y0, HOUSE_H), pt(mid, y0, RIDGE_H)],
      'var(--dr-old-roof2)', 'var(--dr-old-stroke)'));

    // a couple of windows so it reads as a home, not a box
    [[x1 - 1.2, 1.1, 1.3], [x1 - 3.4, 1.1, 1.3]].forEach(function (win) {
      var wx = win[0], ww = win[1], wh = win[2];
      out.push(face([pt(wx, y1, 1.0), pt(wx + ww, y1, 1.0), pt(wx + ww, y1, 1.0 + wh), pt(wx, y1, 1.0 + wh)],
        'var(--dr-glass)', 'var(--dr-old-stroke)'));
    });

    return '<g class="iso-house">' + out.join('') + '</g>';
  }

  /* ---- the new work ---------------------------------------------------- */

  function courses(x0, x1, yPlane, top, kind) {
    // Horizontal brick courses or vertical cladding boards, drawn on the
    // y = yPlane face so the construction reads at a glance.
    var out = [];
    var i;
    if (kind === 'brick') {
      for (i = 0.375; i < top; i += 0.375) {
        out.push(line(pt(x0, yPlane, i), pt(x1, yPlane, i), 'var(--dr-course)', 0.7));
      }
    } else if (kind === 'timber') {
      for (i = x0 + 0.3; i < x1; i += 0.3) {
        out.push(line(pt(i, yPlane, 0), pt(i, yPlane, top), 'var(--dr-course)', 0.7));
      }
    }
    return out.join('');
  }

  function coursesSide(y0, y1, xPlane, top, kind) {
    var out = [];
    var i;
    if (kind === 'brick') {
      for (i = 0.375; i < top; i += 0.375) {
        out.push(line(pt(xPlane, y0, i), pt(xPlane, y1, i), 'var(--dr-course)', 0.7));
      }
    } else if (kind === 'timber') {
      for (i = y0 + 0.3; i < y1; i += 0.3) {
        out.push(line(pt(xPlane, i, 0), pt(xPlane, i, top), 'var(--dr-course)', 0.7));
      }
    }
    return out.join('');
  }

  function extension(w, d, wallType, bifold) {
    var out = [];
    var top = WALL_H;
    var kind = wallType === 'render' ? 'render' : wallType === 'timber' ? 'timber' : 'brick';

    // garden face (y = d) and side face (x = w)
    out.push(face([pt(0, d, 0), pt(w, d, 0), pt(w, d, top), pt(0, d, top)],
      'var(--dr-new-left)', 'var(--dr-new-stroke)'));
    out.push(courses(0, w, d, top, kind));

    out.push(face([pt(w, 0, 0), pt(w, d, 0), pt(w, d, top), pt(w, 0, top)],
      'var(--dr-new-right)', 'var(--dr-new-stroke)'));
    out.push(coursesSide(0, d, w, top, kind));

    // flat roof and its upstand
    out.push(face([pt(0, 0, top), pt(w, 0, top), pt(w, d, top), pt(0, d, top)],
      'var(--dr-new-top)', 'var(--dr-new-stroke)'));
    out.push(face([pt(0, d, top), pt(w, d, top), pt(w, d, top + PARAPET), pt(0, d, top + PARAPET)],
      'var(--dr-new-left)', 'var(--dr-new-stroke)'));
    out.push(face([pt(w, 0, top), pt(w, d, top), pt(w, d, top + PARAPET), pt(w, 0, top + PARAPET)],
      'var(--dr-new-right)', 'var(--dr-new-stroke)'));
    out.push(face([pt(0, 0, top + PARAPET), pt(w, 0, top + PARAPET), pt(w, d, top + PARAPET), pt(0, d, top + PARAPET)],
      'var(--dr-new-top)', 'var(--dr-new-stroke)'));

    // bi-folds, centred on the garden face
    if (bifold > 0) {
      var bw = Math.min(bifold, w - 0.6);
      if (bw > 0.4) {
        var bx = (w - bw) / 2;
        var bh = 2.2;
        out.push(face([pt(bx, d, 0.02), pt(bx + bw, d, 0.02), pt(bx + bw, d, bh), pt(bx, d, bh)],
          'var(--dr-glass)', 'var(--dr-new-stroke)'));
        var panels = Math.max(2, Math.round(bw / 0.9));
        for (var i = 1; i < panels; i++) {
          var px = bx + (bw / panels) * i;
          out.push(line(pt(px, d, 0.02), pt(px, d, bh), 'var(--dr-new-stroke)', 0.8));
        }
      }
    }

    return '<g class="iso-new">' + out.join('') + '</g>';
  }

  /* ---- what happens underground ---------------------------------------- */

  function foundations(w, d, depth, k) {
    var out = [];
    var deep = depth > NOMINAL + 0.01;

    out.push(face([pt(0, d, 0), pt(w, d, 0), pt(w, d, -depth), pt(0, d, -depth)],
      'var(--dr-earth-left)', 'var(--dr-earth-stroke)', ' fill-opacity="1"'));
    out.push('<polygon points="' + poly([pt(0, d, 0), pt(w, d, 0), pt(w, d, -depth), pt(0, d, -depth)]) +
      '" fill="url(#hatch)"/>');

    out.push(face([pt(w, 0, 0), pt(w, d, 0), pt(w, d, -depth), pt(w, 0, -depth)],
      'var(--dr-earth-right)', 'var(--dr-earth-stroke)'));
    out.push('<polygon points="' + poly([pt(w, 0, 0), pt(w, d, 0), pt(w, d, -depth), pt(w, 0, -depth)]) +
      '" fill="url(#hatch)"/>');

    // the line a standard footing would have stopped at
    if (deep) {
      out.push(line(pt(0, d, -NOMINAL), pt(w, d, -NOMINAL), 'var(--dr-warn)', 1.4 * k, (4 * k).toFixed(1) + ' ' + (3 * k).toFixed(1)));
      out.push(line(pt(w, d, -NOMINAL), pt(w, 0, -NOMINAL), 'var(--dr-warn)', 1.4 * k, (4 * k).toFixed(1) + ' ' + (3 * k).toFixed(1)));
      out.push('<text x="' + (pt(w * 0.5, d, -NOMINAL)[0]).toFixed(2) + '" y="' +
        (pt(w * 0.5, d, -NOMINAL)[1] - 4 * k).toFixed(2) +
        '" text-anchor="middle" class="tree-label" style="font-size:' + (8.6 * k).toFixed(2) +
        'px; fill: var(--dr-warn)">USUAL DEPTH</text>');
    }

    // ground level, drawn firmly so the cut reads as a cut
    out.push(line(pt(0, d, 0), pt(w, d, 0), 'var(--dr-ground-line)', 1.6 * k));
    out.push(line(pt(w, d, 0), pt(w, 0, 0), 'var(--dr-ground-line)', 1.6 * k));

    return '<g class="iso-earth">' + out.join('') + '</g>';
  }

  /* ---- annotation ------------------------------------------------------ */

  function arrow(at, dir, colour, k) {
    // dir is a unit vector in screen space
    var len = 7 * k, wide = 2.6 * k;
    var nx = -dir[1], ny = dir[0];
    var tip = at;
    var b1 = [at[0] - dir[0] * len + nx * wide, at[1] - dir[1] * len + ny * wide];
    var b2 = [at[0] - dir[0] * len - nx * wide, at[1] - dir[1] * len - ny * wide];
    return '<polygon points="' + poly([tip, b1, b2]) + '" fill="' + colour + '"/>';
  }

  function unit(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  }

  function chip(mid, label, k, cls, attrs) {
    var wpx = Math.max(52, label.length * 8.4) * k;
    var hpx = 22 * k;
    return '<g' + (cls ? ' class="' + cls + '"' : '') + (attrs || '') + '>' +
      '<rect x="' + (mid[0] - wpx / 2).toFixed(2) + '" y="' + (mid[1] - hpx / 2).toFixed(2) +
      '" width="' + wpx.toFixed(2) + '" height="' + hpx.toFixed(2) +
      '" rx="' + (3 * k).toFixed(2) + '" fill="var(--dr-chip)" stroke="var(--dr-dim)" stroke-width="' + k.toFixed(2) + '"/>' +
      '<text x="' + mid[0].toFixed(2) + '" y="' + (mid[1] + 4.3 * k).toFixed(2) +
      '" text-anchor="middle" class="dim-text" style="font-size:' + (11.5 * k).toFixed(2) + 'px">' +
      esc(label) + '</text></g>';
  }

  function dimension(a, b, label, id, hint, k) {
    var u = unit(a, b);
    var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    var c = 'var(--dr-dim)';
    var out = [];
    out.push(line(a, b, c, k));
    out.push(arrow(a, [-u[0], -u[1]], c, k));
    out.push(arrow(b, u, c, k));
    out.push(chip(mid, label, k, 'dim-chip',
      ' data-dim="' + id + '" tabindex="0" role="slider" aria-label="' + esc(hint) +
      '" style="cursor:ew-resize"'));
    return out.join('');
  }

  function extensionLine(from, to, k) {
    return line(from, to, 'var(--dr-dim)', 0.8 * k, (2 * k).toFixed(1) + ' ' + (3 * k).toFixed(1));
  }

  function annotations(w, d, depth, k) {
    var out = [];
    var z = WALL_H + PARAPET + 1.15;   // dimension strings sit above the roof

    // width, over the garden edge
    var wa = pt(0, d, z), wb = pt(w, d, z);
    out.push(extensionLine(pt(0, d, WALL_H + PARAPET), pt(0, d, z + 0.35), k));
    out.push(extensionLine(pt(w, d, WALL_H + PARAPET), pt(w, d, z + 0.35), k));
    out.push(dimension(wa, wb, w.toFixed(2) + ' m', 'width', 'Extension width, ' + w.toFixed(2) + ' metres. Drag, or use the arrow keys.', k));

    // projection, over the side
    var da = pt(w, 0, z), db = pt(w, d, z);
    out.push(extensionLine(pt(w, 0, WALL_H + PARAPET), pt(w, 0, z + 0.35), k));
    out.push(extensionLine(pt(w, d, WALL_H + PARAPET), pt(w, d, z + 0.35), k));
    out.push(dimension(da, db, d.toFixed(2) + ' m', 'depth', 'How far it projects, ' + d.toFixed(2) + ' metres. Drag, or use the arrow keys.', k));

    // foundation depth, hanging off the front-left corner
    {
      var fa = pt(-1.7, d, 0), fb = pt(-1.7, d, -depth);
      out.push(extensionLine(pt(0, d, 0), pt(-1.95, d, 0), k));
      out.push(extensionLine(pt(0, d, -depth), pt(-1.95, d, -depth), k));
      var u = unit(fa, fb);
      out.push(line(fa, fb, 'var(--dr-dim)', k));
      out.push(arrow(fa, [-u[0], -u[1]], 'var(--dr-dim)', k));
      out.push(arrow(fb, u, 'var(--dr-dim)', k));
      var fmid = [(fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2];
      out.push(chip(fmid, depth.toFixed(2) + ' m', k));
    }

    return '<g class="iso-dims">' + out.join('') + '</g>';
  }

  /* ---- trees ------------------------------------------------------------ */

  // Drawn distance is compressed so a tree 20 m away does not shrink the
  // building to nothing. The label always carries the true figure.
  function visualRadius(metres) {
    return metres <= 4 ? metres : Math.min(7.5, 4 + (metres - 4) * 0.36);
  }

  var TREE_SLOTS = [
    function (w, d, r) { return [-r * 0.62, d + r * 0.62]; },
    function (w, d, r) { return [w + r * 0.72, d + r * 0.72]; },
    function (w, d, r) { return [w + r * 0.98, d * 0.3]; },
    function (w, d, r) { return [-r * 0.95, d * 0.3]; }
  ];

  function trees(w, d, list, k) {
    if (!list || !list.length) return '';
    var out = [];
    list.forEach(function (t, i) {
      var sp = root.DATUM.TREES.bySpeciesId(t.species);
      if (!sp) return;
      var slot = TREE_SLOTS[i % TREE_SLOTS.length](w, d, visualRadius(t.distance));
      var tx = slot[0], ty = slot[1];
      var h = sp.height * 0.48;              // drawn at today's size, not mature
      var canopy = Math.max(1.0, h * 0.36);
      var base = pt(tx, ty, 0);
      var crown = pt(tx, ty, h * 0.46);

      // leader back to the nearest corner of the new work
      var cx = tx > w / 2 ? w : 0;
      var corner = pt(cx, d, 0);
      out.push(line(corner, base, 'var(--dr-dim)', 0.9 * k, (3 * k).toFixed(1) + ' ' + (4 * k).toFixed(1)));
      var lm = [corner[0] + (base[0] - corner[0]) * 0.72, corner[1] + (base[1] - corner[1]) * 0.72];
      out.push(chip(lm, t.distance.toFixed(1) + ' m', k));

      out.push(line(base, crown, 'var(--dr-trunk)', 3 * k));
      out.push('<ellipse cx="' + crown[0].toFixed(2) + '" cy="' + (crown[1] - canopy * S * 0.42).toFixed(2) +
        '" rx="' + (canopy * S * 0.95).toFixed(2) + '" ry="' + (canopy * S * 0.78).toFixed(2) +
        '" fill="var(--dr-canopy)" stroke="var(--dr-canopy-stroke)" stroke-width="' + (1.2 * k).toFixed(2) + '"/>');
      out.push('<text x="' + crown[0].toFixed(2) + '" y="' + (crown[1] - canopy * S * 1.35).toFixed(2) +
        '" text-anchor="middle" class="tree-label" style="font-size:' + (9 * k).toFixed(2) + 'px">' +
        esc(sp.name.toUpperCase()) + '</text>');
    });
    return '<g class="iso-trees">' + out.join('') + '</g>';
  }

  /* ---- assembly --------------------------------------------------------- */

  function render(spec, ground_) {
    var w = spec.width, d = spec.depth;
    var depth = ground_ ? ground_.depth : NOMINAL;

    var maxTree = 0;
    (spec.trees || []).forEach(function (t) { maxTree = Math.max(maxTree, visualRadius(t.distance)); });

    var b = {
      x0: -2.2 - maxTree * 0.75,
      x1: w + 2.7 + maxTree,
      y0: -HOUSE_D - 0.5,
      y1: d + 2.4 + maxTree
    };

    // Fit the viewBox to the geometry we actually draw — not to the grid —
    // so the building fills the frame. Then scale the annotation so dimension
    // text stays the same size on screen however big the scene got.
    var hx0 = -1.0, hx1 = w + 1.0;
    var corners = [
      // existing house
      pt(hx0, -HOUSE_D, 0), pt(hx1, -HOUSE_D, 0), pt(hx0, 0, 0), pt(hx1, 0, 0),
      pt(hx0, -HOUSE_D, RIDGE_H), pt(hx1, -HOUSE_D, RIDGE_H), pt(hx0, 0, RIDGE_H), pt(hx1, 0, RIDGE_H),
      // new work, from the bottom of the footing to the top of the parapet
      pt(0, 0, -depth), pt(w, 0, -depth), pt(0, d, -depth), pt(w, d, -depth),
      pt(0, 0, WALL_H + PARAPET), pt(w, 0, WALL_H + PARAPET),
      pt(0, d, WALL_H + PARAPET), pt(w, d, WALL_H + PARAPET),
      // room for the dimension strings above the roof and beside the cut
      pt(0, d, WALL_H + PARAPET + 1.7), pt(w, d, WALL_H + PARAPET + 1.7),
      pt(w, 0, WALL_H + PARAPET + 1.7),
      pt(-2.1, d, 0), pt(-2.1, d, -depth), pt(0, d + 0.8, -depth)
    ];
    (spec.trees || []).forEach(function (t, i) {
      var sp = root.DATUM.TREES.bySpeciesId(t.species);
      if (!sp) return;
      var slot = TREE_SLOTS[i % TREE_SLOTS.length](w, d, visualRadius(t.distance));
      var th = sp.height * 0.48, cr = Math.max(1.0, th * 0.36);
      corners.push(pt(slot[0] - cr, slot[1], 0), pt(slot[0] + cr, slot[1], 0),
        pt(slot[0], slot[1], 0), pt(slot[0], slot[1], th * 1.15));
    });
    var xs = corners.map(function (c) { return c[0]; });
    var ys = corners.map(function (c) { return c[1]; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var k = Math.max(0.85, (maxX - minX) / 780);
    var pad = 16 * k;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;

    var body =
      '<defs>' +
        '<pattern id="hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">' +
          '<line x1="0" y1="0" x2="0" y2="7" stroke="var(--dr-hatch)" stroke-width="1"/>' +
        '</pattern>' +
      '</defs>' +
      ground(w, d, b) +
      foundations(w, d, depth, k) +
      house(w) +
      extension(w, d, spec.wallType, spec.bifoldWidth) +
      annotations(w, d, depth, k) +
      trees(w, d, spec.trees, k);

    return '<svg class="iso" viewBox="' + minX.toFixed(1) + ' ' + minY.toFixed(1) + ' ' +
      (maxX - minX).toFixed(1) + ' ' + (maxY - minY).toFixed(1) +
      '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Isometric drawing of the extension, ' +
      w.toFixed(2) + ' by ' + d.toFixed(2) + ' metres">' + body + '</svg>';
  }

  // screen-space direction of one metre along each plan axis, for dragging
  function axis(which) {
    return which === 'width' ? [K * S, M * S] : [-K * S, M * S];
  }

  root.DATUM.ISO = { render: render, axis: axis };
})(window);
