/*
 * Datum — rate card
 * ---------------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH for every number the estimator uses.
 * Change a figure here and the whole site follows. Nothing is hard-coded
 * anywhere else.
 *
 * LEE        = a figure supplied by Lee Todd.
 * ASSUMPTION = a placeholder we invented to make the demo work. Every one of
 *              these is listed in docs/ASSUMPTIONS.md for Lee to correct.
 */
(function (root) {
  'use strict';

  var RATES = {
    // ---- Commercial model ------------------------------------------------
    vatRate: 0.20,                    // LEE  "All prices are plus vat"

    margin: {
      total: 0.15,                    // LEE  15% built into every aspect
      datum: 0.05,                    // LEE  we take 5 points of it
      trade: 0.10                     // LEE  builder / consultant keeps 10
    },

    // Are Lee's rates below TRADE COST (margin added on top) or a SELLING
    // price (margin already inside)? Open question — Q1 for Lee.
    // false = treat them as trade cost and add the 15% on top.
    marginIncludedInRates: false,     // ASSUMPTION

    contingency: 0.05,                // ASSUMPTION  a "no hidden extras"
                                      // promise needs an explicit contingency

    // ---- Build ------------------------------------------------------------
    build: {
      perSqm: 3000,                   // LEE  £3,000 per m² of extension
      wallTypeFactor: {               // ASSUMPTION  Lee quoted one rate for
        brick:  1.00,                 // all three constructions. These deltas
        render: 0.98,                 // are placeholders so the question does
        timber: 0.95                  // something visible.
      }
    },

    bifold:      { perLinearMetre: 1500 },  // LEE
    wallRemoval: { perLinearMetre: 1000 },  // LEE  incl. steel + making good
    kitchen:     { fitOnly:        4500 },  // LEE  fitting only, no units
    bathroom:    { labourOnly:     3000 },  // LEE  labour only, per bathroom

    // ---- Foundations ------------------------------------------------------
    // The bit nobody else calculates. Depth logic lives in trees.js.
    foundations: {
      nominalDepth:    1.0,   // ASSUMPTION  depth already inside the £/m² rate
      trenchWidth:     0.6,   // ASSUMPTION  strip footing width
      perCubicMetre:   340,   // ASSUMPTION  dig + cart away + concrete
      pilingThreshold: 2.5,   // ASSUMPTION  beyond this, trench fill stops
                              //             being sensible
      piledPerSqm:     450    // ASSUMPTION  piles + ground beam, per m²
                              //             of footprint, replacing the above
    },

    // ---- Professional fees ------------------------------------------------
    fees: {
      architectural:   { pct: 0.06, min: 2500 },              // ASSUMPTION
      structural:      { base: 1200, withOpenings: 400 },     // ASSUMPTION
      buildingControl: { base: 1100 }                         // ASSUMPTION
                                      // LEE: council building control only,
                                      // never private. Fee varies by authority.
    },

    // ---- How sure are we? -------------------------------------------------
    // The headline is a range, never a price. It tightens as questions
    // get answered, and it never claims to be better than +/- 10%.
    confidence: { start: 0.30, floor: 0.10, perAnswer: 0.035 },

    // ---- Limits of the v1 estimator ---------------------------------------
    limits: {
      minWidth: 2, maxWidth: 12,
      minDepth: 2, maxDepth: 8,
      step: 0.25,
      maxBathrooms: 3,
      maxTrees: 4
    }
  };

  root.DATUM = root.DATUM || {};
  root.DATUM.RATES = RATES;
})(window);
