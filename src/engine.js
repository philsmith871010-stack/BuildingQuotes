/*
 * Datum — estimator adapter
 * ---------------------------------------------------------------------------
 * Turns the public page's extension spec into a rate book job and prices it
 * with the same function the admin uses. One pricer, two screens — so the
 * impact preview Lee sees can never drift from what a client is quoted.
 */
(function (root) {
  'use strict';

  var RB = root.DATUM.RATEBOOK;

  function estimate(spec) {
    // read fresh, so publishing in the admin reaches the estimator immediately
    var book = root.DATUM.STORE.published();
    var result = RB.priceJob(book, 'extension', {
      measurements: {
        floorArea:   spec.width * spec.depth,
        perimeter:   2 * (spec.width + spec.depth),
        bifoldWidth: spec.bifoldWidth,
        wallRemoval: spec.wallRemoval,
        kitchens:    spec.kitchen ? 1 : 0,
        bathrooms:   spec.bathrooms,
        rooflights:  0
      },
      modifiers: { wallType: spec.wallType, access: 'good', spec: 'standard' },
      ground: { soil: spec.soil, trees: spec.trees },
      answered: spec.answered
    });

    result.perimeter = 2 * (spec.width + spec.depth);
    return result;
  }

  root.DATUM.estimate = estimate;
})(window);
