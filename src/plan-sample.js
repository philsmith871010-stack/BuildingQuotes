/*
 * Datum — a sample floor plan to trace
 * ---------------------------------------------------------------------------
 * Stands in for the plan a client would upload. It is authored as SVG and then
 * RASTERISED in the browser before anything touches it, so the tracing path is
 * the real one — pixels in, polygons out — not a shortcut through geometry we
 * already had.
 *
 * Drawn the way an estate agent's plan actually is: solid walls, door openings
 * shown closed with a leaf and a swing, windows as breaks with a glazing line,
 * room labels, and a printed overall dimension for the client to calibrate from.
 */
(function (root) {
  'use strict';

  var S = 70;                 // px per metre in the sample image
  var OX = 60, OY = 92;       // where the house sits on the sheet
  var W_EXT = 0.22, W_INT = 0.09;

  function x(m) { return OX + m * S; }
  function y(m) { return OY + m * S; }

  function line(a, b, t) {
    return '<line x1="' + x(a[0]) + '" y1="' + y(a[1]) + '" x2="' + x(b[0]) + '" y2="' + y(b[1]) +
      '" stroke="#1a1a1a" stroke-width="' + (t * S) + '" stroke-linecap="square"/>';
  }
  function thin(a, b, w) {
    return '<line x1="' + x(a[0]) + '" y1="' + y(a[1]) + '" x2="' + x(b[0]) + '" y2="' + y(b[1]) +
      '" stroke="#1a1a1a" stroke-width="' + (w || 1.6) + '" stroke-linecap="butt"/>';
  }
  function label(m, t, size) {
    return '<text x="' + x(m[0]) + '" y="' + y(m[1]) + '" text-anchor="middle" font-family="Helvetica,Arial" ' +
      'font-size="' + (size || 15) + '" fill="#2b2b2b" letter-spacing="1">' + t + '</text>';
  }

  /** A door drawn closed: the leaf spans the opening, so the room stays sealed. */
  function doorV(px, py, w) {
    return thin([px, py], [px, py + w], 2.2) +
      '<path d="M' + x(px) + ' ' + y(py + w) + ' A' + (w * S) + ' ' + (w * S) + ' 0 0 1 ' +
      x(px + w) + ' ' + y(py) + '" fill="none" stroke="#8a8a8a" stroke-width="1.2"/>';
  }
  function doorH(px, py, w) {
    return thin([px, py], [px + w, py], 2.2) +
      '<path d="M' + x(px + w) + ' ' + y(py) + ' A' + (w * S) + ' ' + (w * S) + ' 0 0 1 ' +
      x(px) + ' ' + y(py - w) + '" fill="none" stroke="#8a8a8a" stroke-width="1.2"/>';
  }
  function windowH(x0, x1, py) {
    return '<line x1="' + x(x0) + '" y1="' + y(py) + '" x2="' + x(x1) + '" y2="' + y(py) +
      '" stroke="#ffffff" stroke-width="' + (W_EXT * S + 2) + '"/>' + thin([x0, py], [x1, py], 2.2);
  }
  function windowV(px, y0, y1) {
    return '<line x1="' + x(px) + '" y1="' + y(y0) + '" x2="' + x(px) + '" y2="' + y(y1) +
      '" stroke="#ffffff" stroke-width="' + (W_EXT * S + 2) + '"/>' + thin([px, y0], [px, y1], 2.2);
  }

  function svg() {
    var p = [];
    // sheet
    p.push('<rect width="700" height="960" fill="#f7f6f2"/>');

    // external envelope, drawn as one continuous run so a flood stays inside it
    p.push(line([0, 0], [8.4, 0], W_EXT));
    p.push(line([8.4, 0], [8.4, 8.2], W_EXT));
    p.push(line([8.4, 8.2], [3.4, 8.2], W_EXT));
    p.push(line([3.4, 8.2], [3.4, 11.4], W_EXT));
    p.push(line([3.4, 11.4], [0, 11.4], W_EXT));
    p.push(line([0, 11.4], [0, 0], W_EXT));

    // partitions
    p.push(line([5.0, 0], [5.0, 4.8], W_INT));
    p.push(line([0, 4.8], [8.4, 4.8], W_INT));
    p.push(line([0, 8.2], [3.4, 8.2], W_INT));

    // openings, shown closed
    p.push(doorV(5.0, 3.55, 0.85));
    p.push(doorH(2.35, 4.8, 0.85));
    p.push(doorH(0.55, 8.2, 0.85));

    // windows
    p.push(windowH(1.0, 3.6, 0));
    p.push(windowH(6.0, 7.6, 0));
    p.push(windowV(0, 5.6, 7.4));
    p.push(windowH(4.6, 7.4, 8.2));
    p.push(windowH(0.6, 2.4, 11.4));

    // stairs
    for (var i = 0; i < 9; i++) {
      p.push(thin([5.45, 1.9 + i * 0.29], [7.95, 1.9 + i * 0.29], 1.3));
    }
    p.push(thin([5.45, 1.9], [5.45, 4.5], 1.3));
    p.push(thin([7.95, 1.9], [7.95, 4.5], 1.3));

    // what an agent writes on it
    p.push(label([2.5, 2.6], 'LIVING ROOM', 15));
    p.push(label([2.5, 2.95], "4.98m x 4.58m", 12));
    p.push(label([6.7, 0.75], 'HALL', 14));
    p.push(label([4.2, 6.3], 'KITCHEN / DINING', 15));
    p.push(label([4.2, 6.65], "8.18m x 3.31m", 12));
    p.push(label([1.7, 9.9], 'UTILITY', 14));

    // the printed overall dimension the client calibrates from
    p.push('<line x1="' + x(0) + '" y1="' + (y(0) - 44) + '" x2="' + x(8.4) + '" y2="' + (y(0) - 44) +
      '" stroke="#2b2b2b" stroke-width="1.4"/>');
    p.push('<line x1="' + x(0) + '" y1="' + (y(0) - 52) + '" x2="' + x(0) + '" y2="' + (y(0) - 36) + '" stroke="#2b2b2b" stroke-width="1.4"/>');
    p.push('<line x1="' + x(8.4) + '" y1="' + (y(0) - 52) + '" x2="' + x(8.4) + '" y2="' + (y(0) - 36) + '" stroke="#2b2b2b" stroke-width="1.4"/>');
    p.push('<text x="' + x(4.2) + '" y="' + (y(0) - 52) + '" text-anchor="middle" font-family="Helvetica,Arial" font-size="16" fill="#2b2b2b">8.40 m</text>');

    p.push('<text x="60" y="936" font-family="Helvetica,Arial" font-size="13" fill="#6b6b6b">GROUND FLOOR — APPROXIMATE. NOT TO SCALE. FOR ILLUSTRATION ONLY.</text>');

    return '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="960" viewBox="0 0 700 960">' +
      p.join('') + '</svg>';
  }

  root.DATUM = root.DATUM || {};
  root.DATUM.SAMPLE_PLAN = {
    svg: svg,
    dataUri: function () { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg()); },
    /** What the printed dimension on the sheet actually is. */
    knownDimension: { metres: 8.4, label: '8.40 m' },
    trueFloorArea: 79.8
  };
})(window);
