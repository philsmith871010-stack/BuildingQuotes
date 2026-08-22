/*
 * Datum — rates, as the public estimator sees them
 * ---------------------------------------------------------------------------
 * A derived view of whatever Lee has PUBLISHED in the admin. There are no
 * figures in this file any more — they live in src/ratebook.js and are edited
 * through admin.html.
 *
 * Kept as its own module so the estimator has one obvious place to read from.
 */
(function (root) {
  'use strict';

  var RATES = {};
  function commercial() { return root.DATUM.STORE.published().commercial; }

  Object.defineProperties(RATES, {
    book:        { get: function () { return root.DATUM.STORE.published(); } },
    vatRate:     { get: function () { return commercial().vatRate; } },
    margin:      { get: function () { return commercial().margin; } },
    contingency: { get: function () { return commercial().contingency; } },
    confidence:  { get: function () { return commercial().confidence; } },
    limits:      { get: function () { return root.DATUM.STORE.published().limits; } },
    foundations: { get: function () { return root.DATUM.STORE.published().foundations; } }
  });

  root.DATUM.RATES = RATES;
})(window);
