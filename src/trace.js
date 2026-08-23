/*
 * Datum — trace a floor plan
 * ---------------------------------------------------------------------------
 * The client's own plan, measured without anyone typing a number twice and
 * without a model guessing at a picture.
 *
 *   1. the image is rasterised to a canvas
 *   2. dark pixels become a wall mask — the same shape OpenTakeoff's PDF path
 *      builds (Uint8Array, y*mw+x, bit 1 = wall)
 *   3. the client drags a line along a wall whose length is printed on the
 *      plan and types that length — which is the only scale input there is
 *   4. clicking inside a room floods it, bounded by the walls, and traces the
 *      outline; the area falls out of the shoelace formula
 *
 * Flood fill and contour tracing are OpenTakeoff's (Apache-2.0, vendored in
 * vendor/opentakeoff). Everything else here is ours.
 */
(function (root, doc) {
  'use strict';

  var GEOM = root.OpenTakeoffGeom;
  var MAX_MASK = 1100;          // working raster cap
  var DARK = 145;               // luminance below this is a wall

  var state = {
    img: null, imgW: 0, imgH: 0, imgHref: '',
    baseMask: null, maskObj: null,
    sealMetres: 1.0,     // close openings up to this wide — a doorway is ~0.85 m
    sealPx: 0, sealed: 0,
    manual: null,        // corners being clicked by hand
    calib: null,                // { a:[x,y], b:[x,y], metres }
    metresPerPx: 0,
    rooms: [],                  // { poly:[[x,y]…] image px, area m², name }
    dragging: null,
    mode: 'calibrate'
  };

  var $ = function (id) { return doc.getElementById(id); };
  function esc(s) {
    return String(s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---- raster → mask ----------------------------------------------------- */

  function buildMaskFromImage(img) {
    var scale = Math.min(1, MAX_MASK / Math.max(img.width, img.height));
    var mw = Math.max(1, Math.round(img.width * scale));
    var mh = Math.max(1, Math.round(img.height * scale));

    var cv = doc.createElement('canvas');
    cv.width = mw; cv.height = mh;
    var cx = cv.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, mw, mh);
    cx.drawImage(img, 0, 0, mw, mh);

    var px = cx.getImageData(0, 0, mw, mh).data;
    var mask = new Uint8Array(mw * mh);
    for (var i = 0, p = 0; i < mask.length; i++, p += 4) {
      // Rec. 709 luminance, alpha-aware so a transparent PNG is not all wall
      var a = px[p + 3] / 255;
      var lum = (0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2]) * a + 255 * (1 - a);
      if (lum < DARK) mask[i] = 1;
    }
    // Nothing shorter than half a metre in BOTH directions is a wall. Scale is
    // not known yet at this point, so use a fraction of the image instead —
    // a floor plan always fills most of its own sheet.
    var minExtent = Math.max(14, Math.round(Math.min(mw, mh) * 0.035));
    var dropped = dropSpecks(mask, mw, mh, minExtent);

    return { mask: mask, mw: mw, mh: mh, ws: scale, softCount: 0, dropped: dropped, minExtent: minExtent };
  }

  /*
   * Text is not a wall.
   *
   * OpenTakeoff reads glyphs as text ops and never lets them block a fill. On a
   * raster there is no such luxury — "KITCHEN / DINING" thresholds to exactly
   * the same black as a partition, and once the sealing pass dilates it, a room
   * label becomes a blob big enough to swallow the room it names.
   *
   * What separates them is shape, not darkness: a wall run is long in at least
   * one direction, a glyph is small in both. So label the connected components
   * and drop the ones that fit inside a box smaller than a wall ever is.
   */
  function dropSpecks(mask, mw, mh, minExtent) {
    var n = mw * mh;
    var seen = new Uint8Array(n);
    var stack = new Int32Array(n);
    var comp = new Int32Array(n);
    var dropped = 0;

    for (var start = 0; start < n; start++) {
      if (!(mask[start] & 1) || seen[start]) continue;
      var top = 0, count = 0;
      var minX = mw, maxX = -1, minY = mh, maxY = -1;
      stack[top++] = start; seen[start] = 1;

      while (top > 0) {
        var i = stack[--top];
        comp[count++] = i;
        var x = i % mw, y = (i / mw) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        // 8-connected, so a diagonal pen stroke stays one component
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
            var j = ny * mw + nx;
            if (seen[j] || !(mask[j] & 1)) continue;
            seen[j] = 1; stack[top++] = j;
          }
        }
      }

      if (Math.max(maxX - minX, maxY - minY) < minExtent) {
        for (var k = 0; k < count; k++) mask[comp[k]] = 0;
        dropped++;
      }
    }
    return dropped;
  }

  /* ---- sealing doorways --------------------------------------------------- */

  /*
   * Most plans draw door openings as holes, so a flood escapes through them and
   * swallows the floor.
   *
   * Morphological closing cannot fix this, which is worth stating because it is
   * the obvious first idea: for a gap in a thin wall, dilation bridges it with a
   * lens whose thickness is sqrt(r² − (w/2)²), which is always less than r, so
   * the erosion removes precisely what the dilation added. Every radius fails,
   * and it fails silently.
   *
   * What does work is bridging the gaps themselves. A doorway is a hole that is
   * PINCHED along one axis — wall close by on both sides — while being only as
   * deep as the wall is thick along the other. A corridor is pinched the same
   * way but runs for metres. So: find the pinched runs, group them, and seal
   * only the groups that are shallow. Doorways close; hallways stay open.
   */
  function bridgeGaps(base, maxGapPx, maxDeepPx) {
    var mw = base.mw, mh = base.mh, n = mw * mh;
    var src = base.mask;
    var pinch = new Uint8Array(n);      // bit 1 = pinched vertically, bit 2 = horizontally
    var x, y, i;

    // vertical pinch: short open runs down a column, walled at both ends
    for (x = 0; x < mw; x++) {
      y = 0;
      while (y < mh) {
        if (src[y * mw + x] & 1) { y++; continue; }
        var y0 = y;
        while (y < mh && !(src[y * mw + x] & 1)) y++;
        var y1 = y - 1;
        if (y0 > 0 && y1 < mh - 1 && (y1 - y0 + 1) <= maxGapPx) {
          for (var yy = y0; yy <= y1; yy++) pinch[yy * mw + x] |= 1;
        }
      }
    }
    // horizontal pinch: the same across a row
    for (y = 0; y < mh; y++) {
      x = 0;
      while (x < mw) {
        if (src[y * mw + x] & 1) { x++; continue; }
        var x0 = x;
        while (x < mw && !(src[y * mw + x] & 1)) x++;
        var x1 = x - 1;
        if (x0 > 0 && x1 < mw - 1 && (x1 - x0 + 1) <= maxGapPx) {
          for (var xx = x0; xx <= x1; xx++) pinch[y * mw + xx] |= 2;
        }
      }
    }

    var out = new Uint8Array(n);
    out.set(src);
    var sealed = 0;

    // group each kind of pinch and keep only the shallow groups
    [1, 2].forEach(function (bit) {
      var seen = new Uint8Array(n);
      var stack = new Int32Array(n);
      var cells = new Int32Array(n);
      for (var start = 0; start < n; start++) {
        if (!(pinch[start] & bit) || seen[start]) continue;
        var top = 0, count = 0;
        var minX = mw, maxX = -1, minY = mh, maxY = -1;
        stack[top++] = start; seen[start] = 1;
        while (top > 0) {
          var c = stack[--top];
          cells[count++] = c;
          var cx = c % mw, cy = (c / mw) | 0;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          var nb = [c - 1, c + 1, c - mw, c + mw];
          for (var k = 0; k < 4; k++) {
            var j = nb[k];
            if (j < 0 || j >= n) continue;
            if (k < 2 && ((j % mw) === (mw - 1)) !== ((c % mw) === 0)) { /* row wrap guarded below */ }
            if (k === 0 && cx === 0) continue;
            if (k === 1 && cx === mw - 1) continue;
            if (seen[j] || !(pinch[j] & bit)) continue;
            seen[j] = 1; stack[top++] = j;
          }
        }
        // a doorway is only as deep as the wall is thick; a corridor runs on
        var deep = bit === 1 ? (maxX - minX + 1) : (maxY - minY + 1);
        if (deep <= maxDeepPx) {
          for (var m = 0; m < count; m++) out[cells[m]] = 1;
          sealed++;
        }
      }
    });

    return { mask: out, mw: mw, mh: mh, ws: base.ws, softCount: 0, sealed: sealed };
  }

  /** Rebuild the mask the flood actually runs on, at the current seal setting. */
  function applySeal() {
    if (!state.baseMask) return;
    if (!(state.sealMetres > 0) || !state.metresPerPx) {
      state.sealPx = 0; state.sealed = 0;
      state.maskObj = state.baseMask;
      return;
    }
    var pxPerM = state.baseMask.ws / state.metresPerPx;
    var maxGap = Math.round(state.sealMetres * pxPerM);
    var maxDeep = Math.max(3, Math.round(0.4 * pxPerM));   // no wall is thicker
    state.sealPx = maxGap;
    var sealedMask = bridgeGaps(state.baseMask, maxGap, maxDeep);
    state.sealed = sealedMask.sealed;
    state.maskObj = sealedMask;
  }

  /* ---- geometry ---------------------------------------------------------- */

  function shoelace(poly) {
    var a = 0;
    for (var i = 0; i < poly.length; i++) {
      var p1 = poly[i], p2 = poly[(i + 1) % poly.length];
      a += p1[0] * p2[1] - p2[0] * p1[1];
    }
    return Math.abs(a / 2);
  }

  /** Ray casting — is the point inside this ring? */
  function inside(px, py, poly) {
    var hit = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }

  function centroid(poly) {
    var x = 0, y = 0;
    poly.forEach(function (p) { x += p[0]; y += p[1]; });
    return [x / poly.length, y / poly.length];
  }

  function totalArea() {
    return state.rooms.reduce(function (t, r) { return t + r.area; }, 0);
  }

  /* ---- picking a room ----------------------------------------------------- */

  function pickRoom(ix, iy) {
    if (!state.maskObj || !state.metresPerPx) return { ok: false, why: 'Set the scale first.' };
    var mx = Math.round(ix * state.maskObj.ws);
    var my = Math.round(iy * state.maskObj.ws);

    var r;
    try { r = GEOM.floodRegion(state.maskObj, mx, my, GEOM.SENS_BALANCED); }
    catch (e) { return { ok: false, why: 'That did not work — try nearer the middle of the room.' }; }

    if (r.status === 'boundary') return { ok: false, why: 'That is a wall. Click inside a room.' };
    if (r.status === 'leak') {
      return { ok: false, why: state.sealMetres > 0
        ? 'The fill escaped. Widen the gap sealing, or trace that room by hand.'
        : 'The fill escaped through an opening. Turn gap sealing up, or trace it by hand.' };
    }
    if (r.status === 'tiny') return { ok: false, why: 'Too small to be a room.' };

    var poly = GEOM.traceRegion(r, 1.5);
    if (!poly || poly.length < 3) return { ok: false, why: 'Could not follow the outline.' };

    var metres = poly.map(function (p) { return [p[0] * state.metresPerPx, p[1] * state.metresPerPx]; });
    var area = shoelace(metres);
    if (area < 1.5) return { ok: false, why: 'Too small to be a room.' };

    // Already got this one? Compare by containment, not by proximity: the
    // engine nudges a seed that lands on a wall into the nearest open cell, so
    // a click on a partition can come back as the room next to it.
    for (var i = 0; i < state.rooms.length; i++) {
      var c = centroid(poly);
      if (inside(ix, iy, state.rooms[i].poly) || inside(c[0], c[1], state.rooms[i].poly)) {
        return { ok: false, why: 'That room is already measured.' };
      }
    }
    return { ok: true, poly: poly, area: area, cx: ix, cy: iy };
  }

  /* ---- rendering ---------------------------------------------------------- */

  /*
   * Screen to image coordinates. This has to go through getScreenCTM: the SVG
   * is letterboxed inside its box by preserveAspectRatio, so scaling by
   * box.width alone skews every point — which silently corrupts the scale the
   * whole measurement hangs on.
   */
  function svgPoint(evt) {
    var svg = $('trace-svg');
    var ctm = svg.getScreenCTM();
    if (!ctm) return [0, 0];
    var pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    var p = pt.matrixTransform(ctm.inverse());
    return [p.x, p.y];
  }

  function paint() {
    var svg = $('trace-svg');
    if (!svg) return;
    var out = [];

    // the plan itself, underneath everything — re-emitted because this
    // function owns the SVG's whole contents
    if (state.imgHref) {
      out.push('<image href="' + state.imgHref + '" x="0" y="0" width="' + state.imgW +
        '" height="' + state.imgH + '" preserveAspectRatio="none"/>');
    }

    state.rooms.forEach(function (r, i) {
      out.push('<polygon points="' + r.poly.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') +
        '" class="trace-room"/>');
      // a plate behind the readout, so it stays legible over the plan's own labels
      var txt = r.name + '   ' + r.area.toFixed(1) + ' m²';
      var w = Math.max(96, txt.length * 8.6), h = 26;
      out.push('<rect x="' + (r.cx - w / 2) + '" y="' + (r.cy - h / 2) + '" width="' + w +
        '" height="' + h + '" rx="3" class="trace-room-plate"/>');
      out.push('<text x="' + (r.cx - w / 2 + 8) + '" y="' + (r.cy + 5) +
        '" text-anchor="start" class="trace-room-label">' + esc(r.name) + '</text>');
      out.push('<text x="' + (r.cx + w / 2 - 6) + '" y="' + (r.cy + 5) +
        '" text-anchor="end" class="trace-room-area">' + r.area.toFixed(1) + ' m²</text>');
    });

    if (state.manual && state.manual.length) {
      var mp = state.manual;
      out.push('<polyline points="' + mp.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') +
        '" class="trace-manual"/>');
      mp.forEach(function (p, i) {
        out.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (i === 0 ? 8 : 5) +
          '" class="trace-vertex' + (i === 0 ? ' first' : '') + '"/>');
      });
      if (mp.length > 2) {
        var mm = mp.map(function (p) { return [p[0] * state.metresPerPx, p[1] * state.metresPerPx]; });
        var cc = centroid(mp);
        out.push('<text x="' + cc[0] + '" y="' + cc[1] + '" text-anchor="middle" class="trace-room-area">' +
          shoelace(mm).toFixed(1) + ' m²</text>');
      }
    }

    var c = state.calib;
    if (c) {
      out.push('<line x1="' + c.a[0] + '" y1="' + c.a[1] + '" x2="' + c.b[0] + '" y2="' + c.b[1] + '" class="trace-cal"/>');
      [c.a, c.b].forEach(function (p) {
        out.push('<path d="M' + (p[0] - 9) + ' ' + p[1] + ' h18 M' + p[0] + ' ' + (p[1] - 9) + ' v18" class="trace-cal-tick"/>');
      });
      if (c.metres) {
        out.push('<text x="' + ((c.a[0] + c.b[0]) / 2) + '" y="' + ((c.a[1] + c.b[1]) / 2 - 12) +
          '" text-anchor="middle" class="trace-cal-label">' + c.metres.toFixed(2) + ' m</text>');
      }
    }
    svg.innerHTML = out.join('');
    paintPanel();
  }

  function paintPanel() {
    var list = $('trace-rooms');
    if (list) {
      list.innerHTML = state.rooms.length
        ? state.rooms.map(function (r, i) {
            return '<div class="trace-row"><input value="' + esc(r.name) + '" data-room="' + i +
              '" aria-label="Room name"><span class="num">' + r.area.toFixed(1) + ' m²</span>' +
              '<button type="button" class="kill" data-roomkill="' + i + '" aria-label="Remove">×</button></div>';
          }).join('')
        : '<p class="q-help" style="margin:0">No rooms measured yet.</p>';
    }
    var tot = $('trace-total');
    if (tot) tot.textContent = totalArea().toFixed(1) + ' m²';
    var apply = $('trace-apply');
    if (apply) apply.disabled = !state.rooms.length;

    var step = $('trace-step');
    if (step) {
      step.textContent = !state.metresPerPx
        ? 'Step 1 — drag along the wall marked 8.40 m, then type its length.'
        : state.mode === 'manual'
          ? 'Tracing by hand — click each corner, then the first one again to close it.'
          : 'Step 2 — click inside each room you are refurbishing.';
    }
    var tools = $('trace-tools');
    if (tools) tools.hidden = !state.metresPerPx;
    var mr = $('mode-rooms'), mh2 = $('mode-manual');
    if (mr) mr.setAttribute('aria-pressed', String(state.mode === 'rooms'));
    if (mh2) mh2.setAttribute('aria-pressed', String(state.mode === 'manual'));
    var sealOut = $('trace-seal-out');
    if (sealOut) {
      sealOut.textContent = state.sealMetres > 0
        ? 'closing gaps up to ' + state.sealMetres.toFixed(2) + ' m' +
          (state.sealed ? ' — ' + state.sealed + ' sealed' : '')
        : 'off — openings will leak';
    }
    var fin = $('trace-finish');
    if (fin) fin.hidden = !(state.mode === 'manual' && state.manual && state.manual.length > 2);
    var hint = $('trace-scale');
    if (hint) {
      hint.textContent = state.metresPerPx
        ? 'Scale set: 1 m = ' + (1 / state.metresPerPx).toFixed(1) + ' px'
        : 'Scale not set';
      hint.className = 'trace-scale' + (state.metresPerPx ? ' on' : '');
    }
  }

  function say(msg, bad) {
    var el = $('trace-say');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'trace-say' + (bad ? ' bad' : '');
  }

  /* ---- events -------------------------------------------------------------- */

  function onDown(e) {
    if (state.mode !== 'calibrate') return;
    var p = svgPoint(e);
    state.dragging = { a: p, b: p };
    state.calib = { a: p, b: p, metres: 0 };
    paint();
    e.preventDefault();
  }
  function onMove(e) {
    if (!state.dragging) return;
    state.dragging.b = svgPoint(e);
    state.calib.b = state.dragging.b;
    paint();
  }
  function onUp() {
    if (!state.dragging) return;
    var d = state.dragging;
    state.dragging = null;
    var len = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
    if (len < 25) { state.calib = null; paint(); return; }
    var ask = $('trace-len');
    if (ask) { ask.value = root.DATUM.SAMPLE_PLAN.knownDimension.metres; ask.focus(); ask.select(); }
    $('trace-confirm').hidden = false;
    say('How long is that line, in metres?');
  }

  function confirmScale() {
    var v = parseFloat($('trace-len').value);
    if (!v || v <= 0 || !state.calib) { say('Put a length in metres.', true); return; }
    var px = Math.hypot(state.calib.b[0] - state.calib.a[0], state.calib.b[1] - state.calib.a[1]);
    state.metresPerPx = v / px;
    state.calib.metres = v;
    applySeal();
    state.mode = 'rooms';
    $('trace-confirm').hidden = true;
    // anything already measured was measured at the wrong scale
    state.rooms = [];
    say('Scale set. Now click inside each room.');
    paint();
  }

  function finishManual() {
    var pts = state.manual;
    if (!pts || pts.length < 3) { say('A room needs at least three corners.', true); return; }
    var metres = pts.map(function (p) { return [p[0] * state.metresPerPx, p[1] * state.metresPerPx]; });
    var area = shoelace(metres);
    if (area < 0.5) { say('That shape has almost no area.', true); return; }
    var c = centroid(pts);
    state.rooms.push({ poly: pts.slice(), area: area, cx: c[0], cy: c[1],
      name: 'ROOM ' + (state.rooms.length + 1), byHand: true });
    state.manual = null;
    say(area.toFixed(1) + ' m² traced by hand.');
    paint();
  }

  function onClick(e) {
    if (state.mode === 'manual') {
      if (!state.metresPerPx) { say('Set the scale first.', true); return; }
      var q = svgPoint(e);
      if (!state.manual) state.manual = [];
      // clicking back on the first corner closes the shape
      if (state.manual.length > 2) {
        var f = state.manual[0];
        if (Math.hypot(q[0] - f[0], q[1] - f[1]) < 18) { finishManual(); return; }
      }
      state.manual.push(q);
      say(state.manual.length + ' corner' + (state.manual.length === 1 ? '' : 's') +
          ' — click the first one again to close it.');
      paint();
      return;
    }
    if (state.mode !== 'rooms') return;
    var p = svgPoint(e);
    var r = pickRoom(p[0], p[1]);
    if (!r.ok) { say(r.why, true); return; }
    state.rooms.push({
      poly: r.poly, area: r.area, cx: r.cx, cy: r.cy,
      name: 'ROOM ' + (state.rooms.length + 1)      // the client renames it
    });
    say(r.area.toFixed(1) + ' m² measured.');
    paint();
  }

  /* ---- open and close ------------------------------------------------------- */

  function open(onApply) {
    var wrap = $('trace-overlay');
    if (!wrap) return;
    state.rooms = []; state.calib = null; state.metresPerPx = 0; state.mode = 'calibrate';
    state.manual = null;
    wrap.classList.add('on');
    wrap.setAttribute('aria-hidden', 'false');
    state.onApply = onApply;
    say('');

    var img = new Image();
    img.onload = function () {
      state.img = img; state.imgW = img.width; state.imgH = img.height;
      state.imgHref = img.src;
      $('trace-svg').setAttribute('viewBox', '0 0 ' + img.width + ' ' + img.height);
      state.baseMask = buildMaskFromImage(img);
      state.maskObj = state.baseMask;
      var wallPx = state.baseMask.mask.reduce(function (t, v) { return t + (v & 1); }, 0);
      say('Plan loaded — ' + img.width + ' × ' + img.height + ' px, ' +
          Math.round(100 * wallPx / state.maskObj.mask.length) + '% of it read as wall.');
      paint();
    };
    img.onerror = function () { say('That image would not load.', true); };
    img.src = root.DATUM.SAMPLE_PLAN.dataUri();
  }

  function close() {
    var wrap = $('trace-overlay');
    if (!wrap) return;
    wrap.classList.remove('on');
    wrap.setAttribute('aria-hidden', 'true');
  }

  function wire() {
    var svg = $('trace-svg');
    if (!svg) return;
    svg.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    svg.addEventListener('click', onClick);

    $('trace-confirm-btn').addEventListener('click', confirmScale);
    $('trace-len').addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmScale(); });
    $('mode-rooms').addEventListener('click', function () {
      state.mode = 'rooms'; state.manual = null; say('Click inside a room.'); paint();
    });
    $('mode-manual').addEventListener('click', function () {
      state.mode = 'manual'; state.manual = null;
      say('Click each corner of the room, then the first one again to close it.'); paint();
    });
    $('trace-finish').addEventListener('click', finishManual);
    $('trace-seal').addEventListener('input', function () {
      state.sealMetres = parseFloat(this.value) || 0;
      applySeal();
      paintPanel();
    });
    doc.addEventListener('keydown', function (e) {
      if (!$('trace-overlay').classList.contains('on')) return;
      if (e.key === 'Enter' && state.mode === 'manual') { e.preventDefault(); finishManual(); }
      if (e.key === 'Escape' && state.manual) { state.manual = null; paint(); }
    });
    $('trace-close').addEventListener('click', close);
    $('trace-restart').addEventListener('click', function () { open(state.onApply); });
    $('trace-apply').addEventListener('click', function () {
      if (state.onApply) state.onApply(totalArea(), state.rooms.slice());
      close();
    });
    $('trace-overlay').addEventListener('click', function (e) { if (e.target === $('trace-overlay')) close(); });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('trace-overlay').classList.contains('on')) close();
    });
    $('trace-rooms').addEventListener('input', function (e) {
      var i = e.target.getAttribute && e.target.getAttribute('data-room');
      if (i !== null && i !== undefined) { state.rooms[+i].name = e.target.value; paint(); }
    });
    $('trace-rooms').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-roomkill]');
      if (!b) return;
      state.rooms.splice(+b.getAttribute('data-roomkill'), 1);
      paint();
    });
  }

  root.DATUM = root.DATUM || {};
  root.DATUM.TRACE = { open: open, close: close, wire: wire, _state: state };
})(window, document);
