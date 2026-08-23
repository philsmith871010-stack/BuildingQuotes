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
    maskObj: null,
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
    return { mask: mask, mw: mw, mh: mh, ws: scale, softCount: 0 };
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
    if (r.status === 'leak') return { ok: false, why: 'The fill escaped — that room is not closed on the plan. Trace it by hand instead.' };
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
        : 'Step 2 — click inside each room you are refurbishing.';
    }
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
    state.mode = 'rooms';
    $('trace-confirm').hidden = true;
    // anything already measured was measured at the wrong scale
    state.rooms = [];
    say('Scale set. Now click inside each room.');
    paint();
  }

  function onClick(e) {
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
    wrap.classList.add('on');
    wrap.setAttribute('aria-hidden', 'false');
    state.onApply = onApply;
    say('');

    var img = new Image();
    img.onload = function () {
      state.img = img; state.imgW = img.width; state.imgH = img.height;
      state.imgHref = img.src;
      $('trace-svg').setAttribute('viewBox', '0 0 ' + img.width + ' ' + img.height);
      state.maskObj = buildMaskFromImage(img);
      var wallPx = state.maskObj.mask.reduce(function (t, v) { return t + (v & 1); }, 0);
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
