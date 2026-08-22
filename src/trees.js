/*
 * Datum — trees, soil and foundation depth
 * ---------------------------------------------------------------------------
 * Shaped after NHBC Standards Chapter 4.2 (building near trees), which sets
 * foundation depth from three things:
 *
 *   1. the tree's water demand      (how thirsty the species is)
 *   2. D/H                          (distance to the tree / its MATURE height)
 *   3. soil shrinkability           (plasticity index of the clay)
 *
 * IMPORTANT — the depth table below is OUR DRAFT, interpolated from the shape
 * of the NHBC curves. It is close enough to be persuasive in a demo and NOT
 * good enough to dig to. Lee, or his engineer, needs to replace ANCHORS with
 * the real values before this ever prices live work. See docs/ASSUMPTIONS.md.
 */
(function (root) {
  'use strict';

  // Mature height in metres, and water demand. NHBC 4.2 Table 2.
  var SPECIES = [
    { id: 'oak',        name: 'Oak',              demand: 'high',   height: 20 },
    { id: 'willow',     name: 'Willow',           demand: 'high',   height: 24 },
    { id: 'poplar',     name: 'Poplar',           demand: 'high',   height: 28 },
    { id: 'elm',        name: 'Elm',              demand: 'high',   height: 24 },
    { id: 'eucalyptus', name: 'Eucalyptus',       demand: 'high',   height: 18 },
    { id: 'hawthorn',   name: 'Hawthorn',         demand: 'high',   height: 10 },
    { id: 'cypress',    name: 'Cypress / Leylandii', demand: 'high', height: 25 },
    { id: 'plane',      name: 'London plane',     demand: 'high',   height: 26 },
    { id: 'ash',        name: 'Ash',              demand: 'medium', height: 23 },
    { id: 'beech',      name: 'Beech',            demand: 'medium', height: 20 },
    { id: 'birch',      name: 'Birch',            demand: 'medium', height: 14 },
    { id: 'cherry',     name: 'Cherry',           demand: 'medium', height: 17 },
    { id: 'chestnut',   name: 'Horse chestnut',   demand: 'medium', height: 20 },
    { id: 'lime',       name: 'Lime',             demand: 'medium', height: 22 },
    { id: 'maple',      name: 'Maple',            demand: 'medium', height: 18 },
    { id: 'sycamore',   name: 'Sycamore',         demand: 'medium', height: 22 },
    { id: 'pine',       name: 'Pine',             demand: 'medium', height: 20 },
    { id: 'alder',      name: 'Alder',            demand: 'medium', height: 18 },
    { id: 'apple',      name: 'Apple / pear',     demand: 'low',    height: 10 },
    { id: 'hazel',      name: 'Hazel',            demand: 'low',    height: 8  },
    { id: 'holly',      name: 'Holly',            demand: 'low',    height: 12 },
    { id: 'laurel',     name: 'Laurel',           demand: 'low',    height: 8  },
    { id: 'magnolia',   name: 'Magnolia',         demand: 'low',    height: 9  },
    { id: 'rowan',      name: 'Rowan',            demand: 'low',    height: 12 },
    { id: 'elder',      name: 'Elder',            demand: 'low',    height: 10 }
  ];

  // Essex and most of the London basin is high-plasticity clay, so that is
  // the default. Getting this wrong is the single biggest error in the model.
  var SOILS = [
    { id: 'high',   name: 'Heavy clay',      note: 'Most of Essex, London and the Home Counties', factor: 1.00 },
    { id: 'medium', name: 'Medium clay',     note: 'Mixed clay and silt',                          factor: 0.85 },
    { id: 'low',    name: 'Light clay',      note: 'Sandy clay, low shrinkage',                    factor: 0.70 },
    { id: 'none',   name: 'Sand, gravel or chalk', note: 'Does not shrink — trees are not a factor', factor: 0.00 }
  ];

  // ANCHORS — [ D/H , required depth in metres ] on high-plasticity clay.
  // Linearly interpolated; beyond the last anchor the tree stops governing.
  var ANCHORS = {
    high:   [[0.20, 3.00], [0.50, 2.50], [0.75, 2.10], [1.00, 1.75], [1.25, 1.50], [1.50, 1.20], [2.00, 1.00]],
    medium: [[0.20, 2.50], [0.50, 2.00], [0.75, 1.70], [1.00, 1.40], [1.25, 1.20], [1.75, 1.00]],
    low:    [[0.20, 2.00], [0.50, 1.60], [0.75, 1.35], [1.00, 1.15], [1.50, 1.00]]
  };

  var MIN_CLAY = 1.00;   // ASSUMPTION  minimum on shrinkable clay, no trees
  var MIN_OTHER = 0.90;  // ASSUMPTION  minimum on non-shrinkable ground
  var MAX_DEPTH = 3.50;  // ASSUMPTION  beyond this, trench fill is not viable

  function bySpeciesId(id) {
    for (var i = 0; i < SPECIES.length; i++) {
      if (SPECIES[i].id === id) return SPECIES[i];
    }
    return null;
  }

  function bySoilId(id) {
    for (var i = 0; i < SOILS.length; i++) {
      if (SOILS[i].id === id) return SOILS[i];
    }
    return SOILS[0];
  }

  function interpolate(anchors, ratio) {
    if (ratio <= anchors[0][0]) return anchors[0][1];
    for (var i = 1; i < anchors.length; i++) {
      if (ratio <= anchors[i][0]) {
        var a = anchors[i - 1], b = anchors[i];
        var t = (ratio - a[0]) / (b[0] - a[0]);
        return a[1] + t * (b[1] - a[1]);
      }
    }
    return 0; // past the last anchor the tree no longer governs
  }

  /**
   * Required foundation depth for one tree.
   * @param {{species:string, distance:number}} tree
   * @param {string} soilId
   * @returns {{depth:number, ratio:number, species:object}}
   */
  function depthForTree(tree, soilId) {
    var species = bySpeciesId(tree.species);
    var soil = bySoilId(soilId);
    if (!species || soil.factor === 0) {
      return { depth: 0, ratio: Infinity, species: species };
    }
    var ratio = tree.distance / species.height;
    var raw = interpolate(ANCHORS[species.demand], ratio);
    return { depth: raw * soil.factor, ratio: ratio, species: species };
  }

  /**
   * Governing depth across every tree on the plot. The deepest one wins —
   * you dig the whole footing to the worst case.
   *
   * `settings` comes from the rate book, so Lee's admin edits reach here.
   */
  function requiredDepth(trees, soilId, settings) {
    var cfg = settings || {};
    var minClay = cfg.nominalDepth || MIN_CLAY;
    var maxDepth = cfg.maxDepth || MAX_DEPTH;
    var pileAt = cfg.pilingThreshold || 2.5;
    var soil = bySoilId(soilId);
    var floor = soil.factor === 0 ? Math.min(MIN_OTHER, minClay) : minClay;
    var governing = null;
    var depth = floor;

    (trees || []).forEach(function (tree) {
      var r = depthForTree(tree, soilId);
      if (r.depth > depth) { depth = r.depth; governing = r; }
    });

    depth = Math.min(Math.round(depth * 20) / 20, maxDepth); // to nearest 50mm
    return {
      depth: depth,
      floor: floor,
      governing: governing,
      soil: soil,
      piled: depth >= pileAt,
      capped: depth >= maxDepth
    };
  }

  root.DATUM = root.DATUM || {};
  root.DATUM.TREES = {
    SPECIES: SPECIES,
    SOILS: SOILS,
    bySpeciesId: bySpeciesId,
    bySoilId: bySoilId,
    depthForTree: depthForTree,
    requiredDepth: requiredDepth
  };
})(window);
