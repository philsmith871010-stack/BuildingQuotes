/*
 * Datum — the rate book
 * ---------------------------------------------------------------------------
 * Everything Lee can price, in one structure he can edit.
 *
 * A rate book is:
 *   commercial   VAT, margin split, contingency, confidence
 *   buildTypes   extension, renovation, loft, new build, external works, outbuildings
 *                each with its own MEASUREMENTS, RATE LINES and MODIFIERS
 *   foundations  the shared tree / soil depth model
 *   fees         architectural, structural, building control by council
 *   regions      postcode multipliers
 *
 * A RATE LINE is one priced item: a rate, a unit, and the measurement that
 * drives it. That is the whole abstraction, and it is the same one a quantity
 * surveyor's schedule uses.
 *
 * `source` marks where a figure came from:
 *   'lee'         supplied by Lee Todd
 *   'placeholder' invented so the demonstration works — needs a real rate
 */
(function (root) {
  'use strict';

  var UNITS = {
    per_m2:       { label: 'per m²',        suffix: '/m²',  qtyUnit: 'm²' },
    per_linear_m: { label: 'per linear m',  suffix: '/m',   qtyUnit: 'm'  },
    per_m3:       { label: 'per m³',        suffix: '/m³',  qtyUnit: 'm³' },
    per_unit:     { label: 'each',          suffix: ' each', qtyUnit: 'no.' },
    per_item:     { label: 'fixed sum',     suffix: '',     qtyUnit: 'job' }
  };

  function L(id, label, detail, unit, driver, rate, source) {
    return { id: id, label: label, detail: detail, unit: unit, driver: driver,
             rate: rate, group: 'trade', source: source, enabled: true };
  }

  var ACCESS = {
    id: 'access', label: 'Site access', help: 'Can a machine, a skip and a grab lorry reach the work?',
    appliesTo: 'all', value: 'good',
    options: [
      { id: 'good',       label: 'Clear rear access', factor: 1.00 },
      { id: 'restricted', label: 'Through the house',  factor: 1.09 },
      { id: 'none',       label: 'Hand dig and barrow', factor: 1.20 }
    ]
  };

  function spec(hi, top) {
    return {
      id: 'spec', label: 'Specification', help: 'The level of finish the client is buying.',
      appliesTo: 'all', value: 'standard',
      options: [
        { id: 'standard', label: 'Standard', factor: 1.00 },
        { id: 'high',     label: 'High',     factor: hi },
        { id: 'premium',  label: 'Premium',  factor: top }
      ]
    };
  }


  /* =====================================================================
     Rooms — the granularity a renovation actually has
     =====================================================================
     A renovation is not one intensity spread over a whole house. The kitchen
     goes back to brick, the bedrooms get a skim and a coat, the hall gets
     painted. Pricing all of it off a single "floor area treated" figure is
     wrong for almost every real job.

     The unit that matches how people think about it is the room — and the
     sketch tool already produces the room list, so it costs the client nothing
     to ask.

     ONE question per room, four answers. Not "does this room need electrics,
     floors, ceilings, plaster": that is four questions times eight rooms, and
     nobody finishes it.

     Room areas are not asked for either. The total is measured accurately from
     the sketch; each room takes a share of it weighted by what kind of room it
     is. Individual rooms will be out; across a house the errors cancel.
     ===================================================================== */

  var ROOM_TYPES = [
    { id: 'kitchen',  label: 'Kitchen',        weight: 12 },
    { id: 'living',   label: 'Living room',    weight: 16 },
    { id: 'bedroom',  label: 'Bedroom',        weight: 11 },
    { id: 'bathroom', label: 'Bathroom',       weight: 5 },
    { id: 'wc',       label: 'WC',             weight: 2 },
    { id: 'hall',     label: 'Hall / landing', weight: 10 },
    { id: 'other',    label: 'Other room',     weight: 9 }
  ];

  /* `short` is what fits on a row next to eight other rooms; `label` is what
     the client reads when they are deciding what the four words mean. */
  var ROOM_LEVELS = [
    { id: 'none',     label: 'Leave it',  short: 'Leave',    blurb: 'Not touched.' },
    { id: 'decorate', label: 'Decorate',  short: 'Decorate', blurb: 'Prep, two coats and a new floor covering.' },
    { id: 'refit',    label: 'Refit',     short: 'Refit',    blurb: 'Plus a skim, lighting and sockets, a new door and a radiator — and the kitchen, bathroom or WC itself.' },
    { id: 'strip',    label: 'Strip out', short: 'Strip',    blurb: 'Plus back to brick and joists, rewire and re-pipe, a new ceiling and insulation.' }
  ];

  var RANK = { none: 0, decorate: 1, refit: 2, strip: 3 };

  /* The jobs a room can have done. A level is a preset that ticks a set of
     these; the client can then tick and untick per room, and the ticks are
     what the rates are driven by. `types` limits a job to the rooms it makes
     sense in; `from` is the first level that includes it; `per` says whether
     the job is priced on the room's area or once per room. */
  var WET = ['kitchen', 'bathroom', 'wc'];
  var ROOM_JOBS = [
    { id: 'decorate',   label: 'Decorate',              from: 'decorate', per: 'area',  drive: 'decorArea',      blurb: 'Prep and two coats to walls, ceiling and woodwork' },
    { id: 'flooring',   label: 'New floor',             from: 'decorate', per: 'area',  drive: 'floorFinishArea', blurb: 'Preparation and laying; the covering itself is yours to choose' },
    { id: 'plaster',    label: 'Skim walls & ceiling',  from: 'refit',    per: 'area',  drive: 'plasterArea',    blurb: 'Overboarded or hacked off and re-skimmed' },
    { id: 'electrics',  label: 'Sockets & lights',      from: 'refit',    per: 'area',  drive: 'secondFixArea',  blurb: 'Second fix: sockets, switches, lighting and testing' },
    { id: 'door',       label: 'New door',              from: 'refit',    per: 'count', drive: 'doorsReplaced',  blurb: 'Door, frame, ironmongery and hanging' },
    { id: 'radiator',   label: 'New radiator',          from: 'refit',    per: 'count', drive: 'radiators',      blurb: 'Radiator or towel rail, valves and connection' },
    { id: 'kitchen',    label: 'New kitchen',           from: 'refit',    per: 'count', drive: 'kitchens',       types: ['kitchen'],  blurb: 'Fitting only. You buy the units and appliances' },
    { id: 'bathroom',   label: 'New bathroom suite',    from: 'refit',    per: 'count', drive: 'bathrooms',      types: ['bathroom'], blurb: 'Fitting only. You buy the suite' },
    { id: 'wc',         label: 'New WC & basin',        from: 'refit',    per: 'count', drive: 'wcs',            types: ['wc'],       blurb: 'Fitting only' },
    { id: 'tiling',     label: 'Wall tiling',           from: 'refit',    per: 'tiled', drive: 'tiledArea',      types: WET,          blurb: 'Laying and grouting; tiles are yours to choose' },
    { id: 'strip',      label: 'Strip to brick',        from: 'strip',    per: 'area',  drive: 'stripArea',      blurb: 'Finishes off, back to brick and joists, skips and protection' },
    { id: 'firstfix',   label: 'Rewire & re-pipe',      from: 'strip',    per: 'area',  drive: 'firstFixArea',   blurb: 'Circuits and pipework back to the board and the boiler' },
    { id: 'ceiling',    label: 'New ceiling',           from: 'strip',    per: 'area',  drive: 'ceilingArea',    blurb: 'Down, re-boarded and skimmed' },
    { id: 'insulation', label: 'Insulate outside walls', from: 'strip',   per: 'area',  drive: 'insulationArea', blurb: 'Insulating the external walls while they are open' }
  ];
  /* tiled wall area from floor area: a bathroom is tiled most of the way
     round, a kitchen gets a splashback */
  var TILE_FACTOR = { bathroom: 2.5, wc: 1.8, kitchen: 0.6 };

  function jobsFor(type) {
    return ROOM_JOBS.filter(function (jb) { return !jb.types || jb.types.indexOf(type) >= 0; });
  }
  /** What a preset ticks for this room type. */
  function presetJobs(type, level) {
    var lv = RANK[level] || 0, out = {};
    jobsFor(type).forEach(function (jb) { out[jb.id] = RANK[jb.from] <= lv; });
    return out;
  }
  /** The room's effective ticks: its own if it has any, else its preset's. */
  function roomJobs(r) {
    var base = presetJobs(r.type, r.level || 'refit');
    if (!r.jobs) return base;
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = !!r.jobs[k]; });
    return out;
  }
  /** Which preset, if any, the room's ticks match. */
  function matchLevel(r) {
    var have = roomJobs(r), ids = Object.keys(have);
    for (var i = 0; i < ROOM_LEVELS.length; i++) {
      var want = presetJobs(r.type, ROOM_LEVELS[i].id), same = true;
      ids.forEach(function (k) { if (!!want[k] !== !!have[k]) same = false; });
      if (same) return ROOM_LEVELS[i].id;
    }
    return null;
  }

  function roomType(id) {
    var found = ROOM_TYPES[6];
    ROOM_TYPES.forEach(function (t) { if (t.id === id) found = t; });
    return found;
  }

  /** Each room's share of the measured floor area, by type weight. */
  function roomAreas(rooms, floorArea) {
    // a room whose area was measured off the drawing keeps it; the rest share
    // whatever floor is left, by type weight
    var known = 0, total = 0;
    rooms.forEach(function (r) {
      if (r.area > 0) known += r.area; else total += roomType(r.type).weight;
    });
    var left = Math.max(0, (floorArea || 0) - known);
    return rooms.map(function (r) {
      if (r.area > 0) return Math.round(r.area * 10) / 10;
      if (!total) return 0;
      return Math.round(left * roomType(r.type).weight / total * 10) / 10;
    });
  }

  /** The quantities the rate lines are driven by, worked out from the ticks. */
  function roomMeasurements(rooms, areas) {
    var m = {};
    ROOM_JOBS.forEach(function (jb) { m[jb.drive] = 0; });
    rooms.forEach(function (r, i) {
      var on = roomJobs(r), a = areas[i] || 0;
      ROOM_JOBS.forEach(function (jb) {
        if (!on[jb.id]) return;
        if (jb.per === 'count') m[jb.drive] += 1;
        else if (jb.per === 'tiled') m[jb.drive] += a * (TILE_FACTOR[r.type] || 0);
        else m[jb.drive] += a;
      });
    });
    Object.keys(m).forEach(function (k) { m[k] = Math.round(m[k] * 10) / 10; });
    return m;
  }

  /** A three-bed semi being done properly — the shape most jobs start from. */
  function defaultRooms() {
    return [
      { type: 'kitchen',  level: 'strip' },
      { type: 'living',   level: 'refit' },
      { type: 'living',   level: 'refit' },
      { type: 'bedroom',  level: 'refit' },
      { type: 'bedroom',  level: 'refit' },
      { type: 'bedroom',  level: 'refit' },
      { type: 'bathroom', level: 'strip' },
      { type: 'wc',       level: 'refit' },
      { type: 'hall',     level: 'decorate' }
    ];
  }

  var ROOMS = {
    types: ROOM_TYPES, levels: ROOM_LEVELS, rank: RANK, jobs: ROOM_JOBS,
    typeOf: roomType, areas: roomAreas, measurements: roomMeasurements,
    jobsFor: jobsFor, presetJobs: presetJobs, roomJobs: roomJobs, matchLevel: matchLevel,
    defaults: defaultRooms
  };

  /* =====================================================================
     Build types
     ===================================================================== */

  var BUILD_TYPES = [

    /* ---- Extensions — the only type with Lee's own figures ------------ */
    {
      id: 'extension',
      name: 'Extensions',
      blurb: 'Single storey rear, side return and wrap-around extensions.',
      enabled: true,
      usesFoundations: true,
      measurements: [
        { id: 'floorArea', label: 'New floor area', unit: 'm²', derived: true },
        { id: 'perimeter', label: 'External perimeter', unit: 'm', derived: true },
        { id: 'width', label: 'Width', unit: 'm',
          ask: { step: 'size', q: 'Width', help: 'Across the back of the house.', input: 'dim', min: 2, max: 12, by: 0.25, value: 5 } },
        { id: 'depth', label: 'Projection', unit: 'm',
          ask: { step: 'size', q: 'Projection', help: 'How far it comes out into the garden.', input: 'dim', min: 2, max: 8, by: 0.25, value: 4 } },
        { id: 'bifoldWidth', label: 'Bi-fold width', unit: 'm',
          ask: { step: 'build', q: 'Bi-fold doors', help: 'Total width across the opening. Leave at none for a window instead.', input: 'length', min: 0, max: 6, by: 0.3, value: 3, zero: 'None' } },
        { id: 'rooflights', label: 'Rooflights', unit: 'no.',
          ask: { step: 'build', q: 'Rooflights in the new flat roof', help: 'Lantern or flat rooflights over the new space.', input: 'count', max: 6, value: 0 } },
        { id: 'wallRemoval', label: 'Wall removed', unit: 'm',
          ask: { step: 'inside', q: 'Opening into the house', help: 'How wide the hole in the existing back wall is, so the new space opens into the house. Steel, padstones and making good included.', input: 'length', min: 0, max: 12, by: 0.5, value: 3, zero: 'None' } },
        { id: 'kitchens', label: 'Kitchens', unit: 'no.',
          ask: { step: 'inside', q: 'A new kitchen?', help: 'Fitting only. You buy the units and appliances you want.', input: 'yesno', value: 1 } },
        { id: 'bathrooms', label: 'Bathrooms', unit: 'no.',
          ask: { step: 'inside', q: 'Bathrooms in the extension', help: 'Labour only, same principle as the kitchen.', input: 'count', max: 3, value: 0 } }
      ],
      steps: [
        { id: 'size',   view: 'plan',    short: 'Size', title: 'How big is it going to be?', lede: 'Drag either dimension on the drawing. Everything else on this site is measured from these two numbers.' },
        { id: 'build',  view: 'plan',    short: 'Build', title: 'How is it built?', lede: 'The construction of the external walls, and how much of the garden wall is glass.', modifiers: ['wallType'] },
        { id: 'ground', view: 'section', short: 'Ground', title: 'What is underneath?', lede: 'The question that catches people out. On shrinkable clay a thirsty tree decides how deep you dig, and depth is expensive.', ground: true },
        { id: 'inside', view: 'plan',    short: 'Inside', title: 'What is going inside?', lede: 'Opening the new space into the house, and the two rooms that carry real labour.', modifiers: ['access', 'spec'] }
      ],
      lines: [
        L('ext.shell',     'Extension shell',      'Foundations to standard depth, walls, flat roof, windows, plaster, first and second fix', 'per_m2', 'floorArea', 3000, 'lee'),
        L('ext.bifold',    'Bi-fold doors',        'Supplied and fitted, aluminium', 'per_linear_m', 'bifoldWidth', 1500, 'lee'),
        L('ext.wallRemove','Structural openings',  'Steel, padstones and making good', 'per_linear_m', 'wallRemoval', 1000, 'lee'),
        L('ext.kitchen',   'Kitchen fitting',      'Labour only — units and appliances are the client’s', 'per_unit', 'kitchens', 4500, 'lee'),
        L('ext.bathroom',  'Bathroom',             'Labour only', 'per_unit', 'bathrooms', 3000, 'lee'),
        L('ext.rooflight', 'Rooflights',           'Supplied and fitted, kerb included', 'per_unit', 'rooflights', 1800, 'placeholder')
      ],
      modifiers: [
        {
          id: 'wallType', label: 'Wall construction', help: 'Lee quoted one rate for all three — these deltas are placeholders.',
          appliesTo: ['ext.shell'], value: 'brick',
          options: [
            { id: 'brick',  label: 'Brickwork',            factor: 1.00 },
            { id: 'render', label: 'Render',               factor: 0.98 },
            { id: 'timber', label: 'Timber frame and clad', factor: 0.95 }
          ]
        },
        ACCESS, spec(1.22, 1.50)
      ],
      typical: {
        label: '5 × 4 m rear extension, bi-folds, kitchen, one oak at 8 m',
        measurements: { floorArea: 20, perimeter: 18, bifoldWidth: 3, wallRemoval: 3, kitchens: 1, bathrooms: 0, rooflights: 2 },
        modifiers: { wallType: 'brick', access: 'good', spec: 'standard' },
        ground: { soil: 'high', trees: [{ species: 'oak', distance: 8 }] }
      }
    },

    /* ---- Renovations -------------------------------------------------- */
    {
      id: 'renovation',
      name: 'Renovations',
      blurb: 'Whole-house and room-by-room refurbishment, priced a room at a time.',
      enabled: true,
      usesFoundations: false,
      measurements: [
        { id: 'floorArea', label: 'Floor area', unit: 'm²',
          ask: { step: 'size', q: 'Total floor area', help: 'Every storey added together. Sketch the house and this is measured rather than guessed. A three-bed semi is usually 85 to 100 m².', input: 'area', min: 10, max: 500, by: 5, value: 90 } },

        /* worked out from the room ticks — never asked directly */
        { id: 'decorArea',       label: 'Area decorated',        unit: 'm²' },
        { id: 'floorFinishArea', label: 'Area re-floored',       unit: 'm²' },
        { id: 'plasterArea',     label: 'Area skimmed',          unit: 'm²' },
        { id: 'secondFixArea',   label: 'Area second-fixed',     unit: 'm²' },
        { id: 'stripArea',       label: 'Area stripped out',     unit: 'm²' },
        { id: 'firstFixArea',    label: 'Area first-fixed',      unit: 'm²' },
        { id: 'ceilingArea',     label: 'New ceilings',          unit: 'm²' },
        { id: 'insulationArea',  label: 'Walls insulated',       unit: 'm²' },
        { id: 'tiledArea',       label: 'Wall tiling',           unit: 'm²' },
        { id: 'doorsReplaced',   label: 'Internal doors',        unit: 'no.' },
        { id: 'radiators',       label: 'Radiators',             unit: 'no.' },
        { id: 'kitchens',        label: 'Kitchens',              unit: 'no.' },
        { id: 'bathrooms',       label: 'Bathrooms',             unit: 'no.' },
        { id: 'wcs',             label: 'WCs',                   unit: 'no.' },

        /* the things that are not room by room */
        { id: 'wallRemoval', label: 'Wall removed', unit: 'm',
          ask: { step: 'house', q: 'Walls coming out', help: 'Knocking rooms together. Steel, padstones and making good included.', input: 'length', min: 0, max: 20, by: 0.5, value: 3, zero: 'None' } },
        { id: 'windows', label: 'Windows replaced', unit: 'no.',
          ask: { step: 'house', q: 'Windows replaced', help: 'Like for like, supplied and fitted. Scaffolding is in the rate.', input: 'count', max: 24, value: 8 } },
        { id: 'extDoors', label: 'External doors', unit: 'no.',
          ask: { step: 'house', q: 'External doors', help: 'Front, back or French doors, supplied and fitted.', input: 'count', max: 6, value: 1 } },
        { id: 'consumerUnit', label: 'Consumer unit and mains', unit: 'no.',
          ask: { step: 'house', q: 'New consumer unit?', help: 'The board, the mains work and the electrical certificate. Needed once, however many rooms are rewired.', input: 'yesno', value: 1 } },
        { id: 'newBoiler', label: 'Boiler and heating plant', unit: 'no.',
          ask: { step: 'house', q: 'New boiler?', help: 'Boiler, controls, flue and cylinder. The radiators themselves are counted room by room.', input: 'yesno', value: 1 } },
        { id: 'roofArea', label: 'Roof recovered', unit: 'm²',
          ask: { step: 'house', q: 'Roof recovered', help: 'Strip and re-tile, including battens, felt and scaffolding. Leave at none if the roof is sound.', input: 'area', min: 0, max: 300, by: 5, value: 0, zero: 'Not this time' } }
      ],
      steps: [
        { id: 'size',      view: 'plan',    short: 'Size',  title: 'How big is the house?', lede: 'One number drives everything else. Sketch the house or trace your floor plan and it is measured rather than estimated.' },
        { id: 'work',      view: 'plan',    short: 'Rooms', title: 'What is being done, room by room?', lede: 'Pick a preset for each room, then tick or untick what is actually happening in it. A kitchen has more to choose from than a hall. Each room shows its own price.', rooms: true },
        { id: 'house',     view: 'section', short: 'House', title: 'The things that are not room by room', lede: 'Six questions covering the work you buy once for the whole house, however many rooms are involved.' },
        { id: 'condition', view: 'section', short: 'Condition', title: 'What are we working with?', lede: 'Older fabric costs more to work into, and a family living upstairs costs time.', modifiers: ['age', 'occupied', 'access', 'spec'] }
      ],
      lines: [
        /* room by room — driven by how far each room is being taken */
        L('ren.strip',      'Strip out and clear',    'Finishes off, back to brick and joists. Removals, skips and protection', 'per_m2', 'stripArea', 85, 'placeholder'),
        L('ren.firstfix',   'First fix',              'Electrical circuits and pipework back to the board and the boiler', 'per_m2', 'firstFixArea', 95, 'placeholder'),
        L('ren.ceilings',   'New ceilings',           'Down, re-boarded and skimmed', 'per_m2', 'ceilingArea', 48, 'placeholder'),
        L('ren.insulation', 'Insulation',             'Insulating the external walls while they are open', 'per_m2', 'insulationArea', 26, 'placeholder'),
        L('ren.plaster',    'Plastering',             'Walls and ceiling, overboarded or hacked off and re-skimmed', 'per_m2', 'plasterArea', 62, 'placeholder'),
        L('ren.secondfix',  'Second fix electrics',   'Sockets, switches, lighting and testing', 'per_m2', 'secondFixArea', 58, 'placeholder'),
        L('ren.doors',      'Internal doors',         'Door, frame, ironmongery and hanging', 'per_unit', 'doorsReplaced', 220, 'placeholder'),
        L('ren.radiators',  'Radiators',              'Radiator or towel rail, valves and connection', 'per_unit', 'radiators', 420, 'placeholder'),
        L('ren.flooring',   'Floor finishes',         'Preparation and laying, materials excluded', 'per_m2', 'floorFinishArea', 65, 'placeholder'),
        L('ren.decoration', 'Decoration',             'Preparation and two coats', 'per_m2', 'decorArea', 38, 'placeholder'),
        L('ren.tiling',     'Wall tiling',            'Laying and grouting, per m² of wall; tiles excluded', 'per_m2', 'tiledArea', 75, 'placeholder'),
        L('ren.kitchen',    'Kitchen fitting',        'Labour only', 'per_unit', 'kitchens', 4500, 'lee'),
        L('ren.bathroom',   'Bathroom',               'Labour only', 'per_unit', 'bathrooms', 3000, 'lee'),
        L('ren.wc',         'Cloakroom WC',           'Labour only', 'per_unit', 'wcs', 1200, 'placeholder'),

        /* bought once for the whole house */
        L('ren.opening',    'Structural openings',    'Steel, padstones and making good', 'per_linear_m', 'wallRemoval', 1000, 'lee'),
        L('ren.windows',    'Windows',                'Supplied and fitted, like for like, including scaffolding', 'per_unit', 'windows', 850, 'placeholder'),
        L('ren.extdoors',   'External doors',         'Supplied and fitted', 'per_unit', 'extDoors', 1100, 'placeholder'),
        L('ren.consumer',   'Consumer unit and mains','Board, mains work, earthing and certificate', 'per_unit', 'consumerUnit', 1450, 'placeholder'),
        L('ren.heating',    'Boiler and heating plant','Boiler, cylinder, controls, flue and commissioning', 'per_unit', 'newBoiler', 3200, 'placeholder'),
        L('ren.roof',       'Roof recovering',        'Strip, batten, felt, re-tile and scaffolding', 'per_m2', 'roofArea', 185, 'placeholder')
      ],
      modifiers: [
        {
          id: 'age', label: 'Property age', help: 'Older fabric costs more to work into.',
          appliesTo: 'all', value: 'postwar',
          options: [
            { id: 'modern',   label: 'Post 1980',   factor: 0.94 },
            { id: 'postwar',  label: '1945 to 1980', factor: 1.00 },
            { id: 'prewar',   label: 'Pre 1945',    factor: 1.12 },
            { id: 'listed',   label: 'Listed or conservation area', factor: 1.35 }
          ]
        },
        {
          id: 'occupied', label: 'Occupied during works', help: 'Working around a family costs time.',
          appliesTo: 'all', value: 'empty',
          options: [
            { id: 'empty',    label: 'Empty property', factor: 1.00 },
            { id: 'occupied', label: 'Client living in', factor: 1.11 }
          ]
        },
        ACCESS, spec(1.25, 1.60)
      ],
      typical: {
        label: '90 m² three-bed refurbishment, kitchen and bathroom back to brick',
        measurements: { floorArea: 90, wallRemoval: 3, windows: 8, extDoors: 1,
                        consumerUnit: 1, newBoiler: 1, roofArea: 0 },
        rooms: defaultRooms(),
        modifiers: { age: 'postwar', occupied: 'empty', access: 'good', spec: 'standard' }
      }
    },

    /* ---- Loft conversions --------------------------------------------- */
    {
      id: 'loft',
      name: 'Loft conversions',
      blurb: 'Rooflight, dormer and hip-to-gable conversions.',
      enabled: true,
      usesFoundations: false,
      measurements: [
        { id: 'floorArea', label: 'New floor area', unit: 'm²',
          ask: { step: 'size', q: 'Usable floor area', help: 'Only the part with head height counts. Draw the house and this follows from the footprint and the head height below.', input: 'area', min: 8, max: 120, by: 1, value: 28 } },
        { id: 'dormerWidth', label: 'Dormer width', unit: 'm',
          ask: { step: 'roof', q: 'Dormer width', help: 'A dormer buys you standing room across its width. None means rooflights only.', input: 'length', min: 0, max: 8, by: 0.3, value: 3.6, zero: 'None' } },
        { id: 'rooflights', label: 'Rooflights', unit: 'no.',
          ask: { step: 'roof', q: 'Rooflights in the roof slope', help: 'Velux-style lights set into the pitch of the existing roof.', input: 'count', max: 8, value: 2 } },
        { id: 'staircases', label: 'Staircases', unit: 'no.',
          ask: { step: 'inside', q: 'A new staircase?', help: 'Almost always yes — a loft needs a proper fixed stair to be habitable.', input: 'yesno', value: 1 } },
        { id: 'steels', label: 'Steel beams', unit: 'no.',
          ask: { step: 'inside', q: 'Steel beams', help: 'The new floor has to span onto steel. Three is typical; the engineer confirms it.', input: 'count', max: 8, value: 3 } },
        { id: 'bathrooms', label: 'Bathrooms', unit: 'no.',
          ask: { step: 'inside', q: 'An ensuite?', help: 'Labour only.', input: 'count', max: 2, value: 1 } },
        { id: 'fireDoors', label: 'Fire doors', unit: 'no.',
          ask: { step: 'inside', q: 'Fire doors', help: 'Building control requires a protected escape route. Usually every door off the stairwell.', input: 'count', max: 10, value: 4 } }
      ],
      steps: [
        { id: 'size',   view: 'section', short: 'Space', title: 'How much can you stand up in?', lede: 'Head height decides everything up here. Below 2.2 m the ridge has to come up or the ceilings below go down — and the usable floor area follows from your answer.', modifiers: ['headroom'] },
        { id: 'roof',   view: 'section', short: 'Roof', title: 'Dormer, or rooflights?', lede: 'A dormer adds standing room and costs real money. Rooflights are cheaper and give you light rather than space.', modifiers: ['roofStructure'] },
        { id: 'inside', view: 'plan',    short: 'Inside', title: 'What is going in?', lede: 'Stairs, steel and the things building control will insist on.', modifiers: ['access', 'spec'] }
      ],
      lines: [
        L('loft.shell',     'Conversion shell',    'Floor strengthening, insulation, plasterboard, electrics and heating', 'per_m2', 'floorArea', 1850, 'placeholder'),
        L('loft.dormer',    'Dormer construction', 'Structure, roof, cladding and window', 'per_linear_m', 'dormerWidth', 2400, 'placeholder'),
        L('loft.rooflight', 'Rooflights',          'Supplied and fitted, flashing included', 'per_unit', 'rooflights', 1650, 'placeholder'),
        L('loft.steel',     'Steel beams',         'Supply, craneage and installation', 'per_unit', 'steels', 1400, 'placeholder'),
        L('loft.stair',     'Staircase',           'Made, fitted and finished', 'per_unit', 'staircases', 3800, 'placeholder'),
        L('loft.bathroom',  'Bathroom',            'Labour only', 'per_unit', 'bathrooms', 3000, 'lee'),
        L('loft.fireDoor',  'Fire doors',          'FD30 doors and closers to the protected route', 'per_unit', 'fireDoors', 420, 'placeholder')
      ],
      modifiers: [
        {
          id: 'roofStructure', label: 'Existing roof structure', help: 'A trussed roof has to be re-engineered before anything else happens.',
          appliesTo: ['loft.shell'], value: 'cut',
          options: [
            { id: 'cut',    label: 'Traditional cut roof', factor: 1.00 },
            { id: 'truss',  label: 'Trussed roof',         factor: 1.28 }
          ]
        },
        {
          id: 'headroom', label: 'Head height', help: 'Below 2.2 m the ridge has to be raised or the ceilings dropped.',
          appliesTo: 'all', value: 'ok',
          options: [
            { id: 'ok',      label: 'Over 2.4 m',   factor: 1.00 },
            { id: 'tight',   label: '2.2 to 2.4 m', factor: 1.10 },
            { id: 'short',   label: 'Under 2.2 m',  factor: 1.34 }
          ]
        },
        ACCESS, spec(1.20, 1.45)
      ],
      typical: {
        label: '28 m² dormer conversion with a bathroom',
        measurements: { floorArea: 28, dormerWidth: 3.6, rooflights: 2, staircases: 1, steels: 3, bathrooms: 1, fireDoors: 4 },
        modifiers: { roofStructure: 'cut', headroom: 'ok', access: 'good', spec: 'standard' }
      }
    },

    /* ---- New build ------------------------------------------------------ */
    {
      id: 'newbuild',
      name: 'New builds',
      blurb: 'Single dwellings and small sites, from footings to handover. Priced on its own, not with an extension, loft or renovation.',
      enabled: true,
      usesFoundations: true,
      measurements: [
        { id: 'perimeter', label: 'External perimeter', unit: 'm', derived: true },
        { id: 'floorArea', label: 'Total internal area', unit: 'm²', derived: true },
        { id: 'footprintArea', label: 'Ground floor footprint', unit: 'm²',
          ask: { step: 'size', q: 'Ground floor footprint', help: 'The area the house covers on the ground.', input: 'area', min: 30, max: 400, by: 5, value: 78 } },
        { id: 'storeys', label: 'Storeys', unit: 'no.',
          ask: { step: 'size', q: 'How many storeys?', help: 'Total internal area is the footprint multiplied by this.', input: 'count', min: 1, max: 3, value: 2 } },
        { id: 'roofArea', label: 'Roof area', unit: 'm²',
          ask: { step: 'form', q: 'Roof area', help: 'On the slope, so larger than the footprint. Roughly one and a quarter times for a normal pitch.', input: 'area', min: 20, max: 500, by: 5, value: 96 } },
        { id: 'garageArea', label: 'Garage area', unit: 'm²',
          ask: { step: 'form', q: 'Garage', help: 'A single garage is about 18 m². Leave at none if there isn’t one.', input: 'area', min: 0, max: 120, by: 2, value: 18, zero: 'None' } },
        { id: 'plots', label: 'Plots', unit: 'no.',
          ask: { step: 'inside', q: 'How many plots?', help: 'One for a single house. Service connections are charged per plot.', input: 'count', min: 1, max: 12, value: 1 } },
        { id: 'kitchens', label: 'Kitchens', unit: 'no.',
          ask: { step: 'inside', q: 'Kitchens', help: 'Labour only.', input: 'count', min: 0, max: 12, value: 1 } },
        { id: 'bathrooms', label: 'Bathrooms', unit: 'no.',
          ask: { step: 'inside', q: 'Bathrooms', help: 'Labour only, including ensuites and the cloakroom.', input: 'count', max: 8, value: 3 } },
        { id: 'externalArea', label: 'External works area', unit: 'm²',
          ask: { step: 'inside', q: 'Drives, paths and garden', help: 'Everything outside the walls that still has to be built.', input: 'area', min: 0, max: 1500, by: 10, value: 120, zero: 'None' } }
      ],
      steps: [
        { id: 'size',   view: 'plan',    short: 'Size', title: 'How big is the house?', lede: 'Footprint and storeys. Draw the house and both are measured for you.' },
        { id: 'form',   view: 'section', short: 'Form', title: 'Roof and garage', lede: 'The roof is priced on its slope area, which is always more than the footprint.' },
        { id: 'ground', view: 'section', short: 'Ground', title: 'What are you building on?', lede: 'Substructure is the biggest single unknown on a new build, and trees on clay decide it.', ground: true },
        { id: 'inside', view: 'plan',    short: 'Fit-out', title: 'Inside and out', lede: 'Rooms that carry labour, and everything beyond the walls.', modifiers: ['method', 'efficiency', 'access', 'spec'] }
      ],
      lines: [
        L('nb.substructure', 'Substructure',        'Dig, footings, oversite and drainage below slab', 'per_m2', 'footprintArea', 480, 'placeholder'),
        L('nb.superstructure','Superstructure',     'Frame, external walls, floors, windows and doors', 'per_m2', 'floorArea', 1450, 'placeholder'),
        L('nb.roof',         'Roof',                'Structure, covering, insulation and rainwater goods', 'per_m2', 'roofArea', 220, 'placeholder'),
        L('nb.mep',          'Mechanical and electrical', 'Heating, plumbing, electrics, ventilation and renewables', 'per_m2', 'floorArea', 260, 'placeholder'),
        L('nb.finishes',     'Internal finishes',   'Plaster, joinery, decoration and floor finishes', 'per_m2', 'floorArea', 340, 'placeholder'),
        L('nb.kitchen',      'Kitchen fitting',     'Labour only', 'per_unit', 'kitchens', 4500, 'lee'),
        L('nb.bathroom',     'Bathroom',            'Labour only', 'per_unit', 'bathrooms', 3000, 'lee'),
        L('nb.garage',       'Garage',              'Detached or integral, shell and door', 'per_m2', 'garageArea', 850, 'placeholder'),
        L('nb.external',     'External works',      'Drives, paths, turf and boundary treatment', 'per_m2', 'externalArea', 95, 'placeholder'),
        L('nb.services',     'Service connections', 'Water, power, gas, drainage and telecoms per plot', 'per_unit', 'plots', 6500, 'placeholder')
      ],
      modifiers: [
        {
          id: 'method', label: 'Construction method', appliesTo: ['nb.superstructure'], value: 'masonry',
          help: 'Timber frame and SIPs cost more up front and less in programme.',
          options: [
            { id: 'masonry', label: 'Traditional masonry', factor: 1.00 },
            { id: 'timber',  label: 'Timber frame',        factor: 1.06 },
            { id: 'sips',    label: 'SIPs',                factor: 1.14 }
          ]
        },
        {
          id: 'efficiency', label: 'Energy standard', appliesTo: 'all', value: 'partL',
          help: 'Anything beyond current Building Regulations costs real money.',
          options: [
            { id: 'partL',    label: 'Building Regulations', factor: 1.00 },
            { id: 'enhanced', label: 'Enhanced fabric',      factor: 1.08 },
            { id: 'passive',  label: 'Passivhaus',           factor: 1.26 }
          ]
        },
        ACCESS, spec(1.24, 1.55)
      ],
      typical: {
        label: '140 m² detached house with a garage',
        measurements: { footprintArea: 78, floorArea: 140, perimeter: 36, roofArea: 96, garageArea: 18, externalArea: 120, plots: 1, kitchens: 1, bathrooms: 3 },
        modifiers: { method: 'masonry', efficiency: 'partL', access: 'good', spec: 'standard' },
        ground: { soil: 'high', trees: [] }
      }
    },

    /* ---- External works ------------------------------------------------- */
    {
      id: 'external',
      name: 'Patios and outdoor work',
      blurb: 'Paving, decking, driveways, retaining walls, fencing and drainage.',
      enabled: true,
      usesFoundations: false,
      measurements: [
        { id: 'patioArea', label: 'Paved area', unit: 'm²',
          ask: { step: 'area', q: 'Paving', help: 'Porcelain or natural stone. A generous patio is 30 to 50 m².', input: 'area', min: 0, max: 400, by: 2, value: 40, zero: 'None' } },
        { id: 'deckingArea', label: 'Decked area', unit: 'm²',
          ask: { step: 'area', q: 'Decking', help: 'Framed and boarded, balustrade included.', input: 'area', min: 0, max: 300, by: 2, value: 0, zero: 'None' } },
        { id: 'drivewayArea', label: 'Driveway area', unit: 'm²',
          ask: { step: 'area', q: 'Driveway', help: 'Block paving or resin bound, edgings included.', input: 'area', min: 0, max: 400, by: 5, value: 0, zero: 'None' } },
        { id: 'turfArea', label: 'Turfed area', unit: 'm²',
          ask: { step: 'area', q: 'Lawn', help: 'Topsoil, preparation and turf.', input: 'area', min: 0, max: 800, by: 5, value: 30, zero: 'None' } },
        { id: 'excavationVol', label: 'Excavation', unit: 'm³',
          ask: { step: 'ground', q: 'Muck to shift', help: 'Everything dug out and carted away. About 0.3 m³ per m² of paving on level ground, far more on a slope.', input: 'volume', min: 0, max: 300, by: 1, value: 12, zero: 'None' } },
        { id: 'wallLength', label: 'Retaining wall', unit: 'm',
          ask: { step: 'edges', q: 'Retaining wall', help: 'Holding back a level change. Foundation, blockwork, facing and coping.', input: 'length', min: 0, max: 60, by: 0.5, value: 12, zero: 'None' } },
        { id: 'fenceLength', label: 'Fencing', unit: 'm',
          ask: { step: 'edges', q: 'Fencing', help: 'Posts, panels and gravel boards.', input: 'length', min: 0, max: 150, by: 1, value: 20, zero: 'None' } },
        { id: 'drainageLength', label: 'Drainage run', unit: 'm',
          ask: { step: 'edges', q: 'Drainage', help: 'Channel drain, soakaway and connection. Any paving next to the house needs it.', input: 'length', min: 0, max: 100, by: 1, value: 8, zero: 'None' } },
        { id: 'steps', label: 'Step flights', unit: 'no.',
          ask: { step: 'edges', q: 'Flights of steps', help: 'Each formed and finished to match.', input: 'count', max: 6, value: 1 } },
        { id: 'lightPoints', label: 'Light fittings', unit: 'no.',
          ask: { step: 'edges', q: 'External lighting', help: 'Fitting, cable and controls.', input: 'count', max: 20, value: 4 } }
      ],
      steps: [
        { id: 'area',   view: 'plan',    short: 'Areas', title: 'What are you laying?', lede: 'Set the areas roughly. You can pace a garden out surprisingly accurately.' },
        { id: 'ground', view: 'section', short: 'Ground', title: 'What is it going on?', lede: 'Wet clay, made ground and a slope all cost more than the paving does.', modifiers: ['groundConditions', 'levels'] },
        { id: 'edges',  view: 'plan',    short: 'Edges', title: 'Edges and extras', lede: 'Walls, fences, drainage and steps. Usually more than half the bill on a garden.', modifiers: ['access', 'spec'] }
      ],
      lines: [
        L('ex.dig',      'Excavation and cart away', 'Dig, load and dispose', 'per_m3', 'excavationVol', 95, 'placeholder'),
        L('ex.subbase',  'Sub-base',                 'Type 1 compacted in layers', 'per_m2', 'patioArea', 42, 'placeholder'),
        L('ex.paving',   'Paving',                   'Porcelain or natural stone, laid and pointed', 'per_m2', 'patioArea', 135, 'placeholder'),
        L('ex.decking',  'Decking',                  'Frame, boards and balustrade', 'per_m2', 'deckingArea', 165, 'placeholder'),
        L('ex.driveway', 'Driveway',                 'Block paving or resin bound, edgings included', 'per_m2', 'drivewayArea', 110, 'placeholder'),
        L('ex.wall',     'Retaining wall',           'Foundation, blockwork, facing and coping', 'per_linear_m', 'wallLength', 420, 'placeholder'),
        L('ex.fence',    'Fencing',                  'Posts, panels and gravel boards', 'per_linear_m', 'fenceLength', 95, 'placeholder'),
        L('ex.drainage', 'Drainage',                 'Channel, soakaway and connection', 'per_linear_m', 'drainageLength', 85, 'placeholder'),
        L('ex.steps',    'Steps',                    'Per flight, formed and finished', 'per_unit', 'steps', 780, 'placeholder'),
        L('ex.lighting', 'External lighting',        'Fitting, cable and controls', 'per_unit', 'lightPoints', 180, 'placeholder'),
        L('ex.turf',     'Turfing',                  'Topsoil, preparation and turf', 'per_m2', 'turfArea', 28, 'placeholder')
      ],
      modifiers: [
        {
          id: 'groundConditions', label: 'Ground conditions', appliesTo: 'all', value: 'normal',
          help: 'Wet clay and made ground both slow everything down.',
          options: [
            { id: 'good',   label: 'Free draining',  factor: 0.95 },
            { id: 'normal', label: 'Normal',         factor: 1.00 },
            { id: 'clay',   label: 'Heavy wet clay', factor: 1.12 },
            { id: 'made',   label: 'Made ground or obstructions', factor: 1.25 }
          ]
        },
        {
          id: 'levels', label: 'Levels', appliesTo: 'all', value: 'flat',
          help: 'A sloping garden means retaining and steps, not just more paving.',
          options: [
            { id: 'flat',    label: 'Broadly level', factor: 1.00 },
            { id: 'sloping', label: 'Sloping',       factor: 1.14 },
            { id: 'steep',   label: 'Steep or terraced', factor: 1.32 }
          ]
        },
        ACCESS, spec(1.28, 1.70)
      ],
      typical: {
        label: '40 m² patio, 12 m of walling and 20 m of fencing',
        measurements: { patioArea: 40, deckingArea: 0, drivewayArea: 0, turfArea: 30, excavationVol: 12, wallLength: 12, fenceLength: 20, drainageLength: 8, lightPoints: 4, steps: 1 },
        modifiers: { groundConditions: 'clay', levels: 'flat', access: 'restricted', spec: 'standard' }
      }
    },

    /* ---- Garages and garden rooms --------------------------------------
       A detached building on its own base. Drawn in the garden step, so the
       floor area is measured; the rest is what is inside it. */
    {
      id: 'outbuilding',
      name: 'Garages and garden rooms',
      blurb: 'A detached garage, a garden office or a summer house on its own base.',
      enabled: true,
      usesFoundations: false,
      measurements: [
        { id: 'floorArea', label: 'Floor area', unit: 'm²',
          ask: { step: 'size', q: 'Floor area', help: 'A single garage is about 18 m². A garden office is usually 10 to 15.', input: 'area', min: 4, max: 120, by: 1, value: 15 } },
        { id: 'garageDoors', label: 'Garage doors', unit: 'no.',
          ask: { step: 'fit', q: 'Garage doors', help: 'Up-and-over or sectional, supplied and fitted.', input: 'count', max: 2, value: 0 } },
        { id: 'electrics', label: 'Power and lighting', unit: 'no.',
          ask: { step: 'fit', q: 'Power and lighting?', help: 'An armoured supply from the house, a small consumer unit, lights and sockets.', input: 'yesno', value: 1 } },
        { id: 'plumbing', label: 'Water and waste', unit: 'no.',
          ask: { step: 'fit', q: 'A sink or a WC?', help: 'A water supply and a drain run back to the house.', input: 'yesno', value: 0 } }
      ],
      steps: [
        { id: 'size', view: 'plan', short: 'Size', title: 'How big is it?', lede: 'The floor area of the building. Everything else is priced from it.' },
        { id: 'build', view: 'section', short: 'Build', title: 'What kind of building?', lede: 'A garage is a shell. A garden room is insulated, lined and heated, which is most of the difference in price.', modifiers: ['use', 'walls'] },
        { id: 'fit', view: 'plan', short: 'Fit out', title: 'What goes in it?', lede: 'Doors, power and water are the items that move the figure.', modifiers: ['access', 'spec'] }
      ],
      lines: [
        L('ob.base',      'Base',                   'Dig, hardcore, damp-proof membrane and a reinforced slab', 'per_m2', 'floorArea', 120, 'placeholder'),
        L('ob.shell',     'Walls, roof and windows', 'Insulated timber frame, cladding, membrane roof, doors and windows', 'per_m2', 'floorArea', 950, 'placeholder'),
        L('ob.garagedoor','Garage door',            'Supplied and fitted', 'per_unit', 'garageDoors', 1400, 'placeholder'),
        L('ob.electrics', 'Power and lighting',     'Armoured supply, consumer unit, lights and sockets', 'per_unit', 'electrics', 1500, 'placeholder'),
        L('ob.plumbing',  'Water and waste',        'Supply and drain run back to the house', 'per_unit', 'plumbing', 2200, 'placeholder')
      ],
      modifiers: [
        {
          id: 'use', label: 'What is it for?', appliesTo: ['ob.shell'], value: 'gardenroom',
          help: 'The lining, insulation and heating are what a garden room has and a garage does not.',
          options: [
            { id: 'gardenroom',  label: 'Garden room or office', factor: 1.00 },
            { id: 'garage',      label: 'Garage',                factor: 0.70 },
            { id: 'summerhouse', label: 'Summer house',          factor: 0.55 }
          ]
        },
        {
          id: 'walls', label: 'Walls', appliesTo: ['ob.shell'], value: 'timber',
          help: 'Brick or block to match the house costs more than a clad timber frame.',
          options: [
            { id: 'timber', label: 'Timber frame, clad', factor: 1.00 },
            { id: 'brick',  label: 'Brick or block',     factor: 1.25 }
          ]
        },
        ACCESS, spec(1.20, 1.50)
      ],
      typical: {
        label: '15 m² garden office with power',
        measurements: { floorArea: 15, garageDoors: 0, electrics: 1, plumbing: 0 },
        modifiers: { use: 'gardenroom', walls: 'timber', access: 'good', spec: 'standard' }
      }
    }
  ];

  /* =====================================================================
     The book
     ===================================================================== */

  function defaultBook() {
    return {
      version: 1,
      label: 'Opening rate book',
      commercial: {
        vatRate: 0.20,
        margin: { total: 0.15, datum: 0.05, trade: 0.10 },
        marginIncludedInRates: false,
        contingency: 0.05,
        confidence: { start: 0.30, floor: 0.10, perAnswer: 0.035 }
      },
      fees: {
        architectural:   { pct: 0.06, min: 2500, source: 'placeholder' },
        structural:      { base: 1200, withOpenings: 400, source: 'placeholder' },
        buildingControl: { base: 1100, source: 'placeholder' },
        partyWall:       { perNeighbour: 1400, source: 'placeholder', enabled: false }
      },
      councils: [
        { id: 'uttlesford',    name: 'Uttlesford',              fee: 1050 },
        { id: 'braintree',     name: 'Braintree',               fee: 1120 },
        { id: 'chelmsford',    name: 'Chelmsford',              fee: 1180 },
        { id: 'epping',        name: 'Epping Forest',           fee: 1240 },
        { id: 'harlow',        name: 'Harlow',                  fee: 1090 },
        { id: 'colchester',    name: 'Colchester',              fee: 1140 },
        { id: 'eastherts',     name: 'East Hertfordshire',      fee: 1210 },
        { id: 'southcambs',    name: 'South Cambridgeshire',    fee: 1160 }
      ],
      regions: [
        { id: 'cm', name: 'Essex — CM, CO, SS', factor: 1.00 },
        { id: 'ig', name: 'Outer London — IG, RM', factor: 1.14 },
        { id: 'ldn', name: 'Inner London', factor: 1.32 },
        { id: 'herts', name: 'Hertfordshire — SG, AL', factor: 1.07 },
        { id: 'cb', name: 'Cambridgeshire — CB', factor: 0.98 },
        { id: 'suffolk', name: 'Suffolk and Norfolk', factor: 0.94 }
      ],
      activeRegion: 'cm',
      foundations: {
        nominalDepth: 1.0,
        trenchWidth: 0.6,
        perCubicMetre: 340,
        pilingThreshold: 2.5,
        piledPerSqm: 450,
        maxDepth: 3.5,
        source: 'placeholder'
      },
      limits: {
        minWidth: 2, maxWidth: 12, minDepth: 2, maxDepth: 8,
        by: 0.25, maxBathrooms: 3, maxTrees: 4
      },
      buildTypes: JSON.parse(JSON.stringify(BUILD_TYPES))
    };
  }

  /* =====================================================================
     Pricing — one generic function for every build type
     ===================================================================== */

  function typeById(book, id) {
    for (var i = 0; i < book.buildTypes.length; i++) {
      if (book.buildTypes[i].id === id) return book.buildTypes[i];
    }
    return null;
  }

  /*
   * A worked example has to be complete: the admin shows it as a set of
   * editable figures and prices the rate book against them. A room-by-room
   * type computes most of its quantities from the room list, so they are
   * resolved here, once, and from then on it looks like every other type.
   */
  BUILD_TYPES.forEach(function (t) {
    if (!t.typical || !t.typical.rooms) return;
    var m = t.typical.measurements;
    var derived = roomMeasurements(t.typical.rooms, roomAreas(t.typical.rooms, m.floorArea || 0));
    Object.keys(derived).forEach(function (k) { if (m[k] === undefined) m[k] = derived[k]; });
  });

  function factorFor(type, selections, lineId) {
    var f = 1;
    (type.modifiers || []).forEach(function (m) {
      var applies = m.appliesTo === 'all' ||
        (Array.isArray(m.appliesTo) && m.appliesTo.indexOf(lineId) >= 0);
      if (!applies) return;
      var chosen = (selections && selections[m.id]) || m.value;
      for (var i = 0; i < m.options.length; i++) {
        if (m.options[i].id === chosen) { f *= m.options[i].factor; return; }
      }
    });
    return f;
  }

  function qtyLabel(line, qty) {
    var u = UNITS[line.unit];
    if (line.unit === 'per_item') return 'Fixed sum';
    var n = qty % 1 ? qty.toFixed(2) : String(qty);
    return n + ' ' + u.qtyUnit + ' at £' + line.rate.toLocaleString('en-GB') + u.suffix;
  }

  /**
   * Price any job in the book.
   * @param book
   * @param typeId       which build type
   * @param job          { measurements, modifiers, ground, region, council, answered }
   */
  /** Just the building work for one build type. No fees, no margin, no VAT. */
  function tradeLines(book, typeId, job) {
    var type = typeById(book, typeId);
    if (!type) return { lines: [], trade: 0, ground: null };

    var m = job.measurements || {};
    var lines = [];
    var regionFactor = 1;
    (book.regions || []).forEach(function (r) {
      if (r.id === (job.region || book.activeRegion)) regionFactor = r.factor;
    });

    type.lines.forEach(function (line) {
      if (!line.enabled) return;
      var qty = line.unit === 'per_item' ? 1 : (m[line.driver] || 0);
      if (!qty) return;
      lines.push({
        key: line.id, group: 'trade', type: typeId, typeName: type.name,
        label: line.label, detail: qtyLabel(line, qty), source: line.source,
        amount: qty * line.rate * factorFor(type, job.modifiers, line.id) * regionFactor
      });
    });

    // foundations, where the build type has ground to dig
    var ground = null;
    if (type.usesFoundations && root.DATUM.TREES) {
      var g = job.ground || { soil: 'high', trees: [] };
      ground = root.DATUM.TREES.requiredDepth(g.trees, g.soil, book.foundations);
      var f = book.foundations;
      var cost = 0, detail = '';
      var area = m.floorArea || m.footprintArea || 0;
      var perim = m.perimeter || 0;

      if (ground.piled) {
        cost = area * f.piledPerSqm;
        detail = 'Piles and ground beam — ' + ground.depth.toFixed(2) + ' m influence depth';
      } else if (ground.depth > f.nominalDepth) {
        var extra = ground.depth - f.nominalDepth;
        var vol = perim * f.trenchWidth * extra;
        cost = vol * f.perCubicMetre;
        detail = 'Dig to ' + ground.depth.toFixed(2) + ' m, ' + extra.toFixed(2) +
                 ' m deeper than standard — ' + vol.toFixed(1) + ' m³';
      }
      if (cost > 0) {
        lines.push({ key: typeId + '.foundations', group: 'trade', type: typeId, typeName: type.name,
          label: 'Deeper foundations', detail: detail, amount: cost * regionFactor, source: 'placeholder' });
      }
    }

    return {
      lines: lines,
      trade: lines.reduce(function (t, l) { return t + l.amount; }, 0),
      ground: ground, regionFactor: regionFactor,
      hasOpenings: (m.wallRemoval || m.steels || 0) > 0,
      area: m.floorArea || m.footprintArea || m.patioArea || 0
    };
  }

  /** Fees, margin, contingency and VAT — charged once, over whatever trade total. */
  function wrapUp(book, trade, lines, opts) {
    var c = book.commercial, fe = book.fees;
    var arch = Math.max(trade * fe.architectural.pct, fe.architectural.min);
    lines.push({ key: 'architectural', group: 'fees', label: 'Architectural drawings',
      detail: opts.multi ? 'One survey and one set of drawings for the whole project'
                         : 'Survey, plans and planning submission', amount: arch });

    var struct = fe.structural.base + (opts.hasOpenings ? fe.structural.withOpenings : 0);
    lines.push({ key: 'structural', group: 'fees', label: 'Structural engineer',
      detail: opts.multi ? 'One engineer across every part of the job' : 'Calculations and design',
      amount: struct });

    var council = null;
    (book.councils || []).forEach(function (x) { if (x.id === opts.council) council = x; });
    var bc = council ? council.fee : fe.buildingControl.base;
    lines.push({ key: 'buildingControl', group: 'fees', label: 'Building control',
      detail: (council ? council.name + ' — ' : 'Your council — ') +
        (opts.multi ? 'one application, not one per job' : 'never a private inspector'), amount: bc });

    var fees = arch + struct + bc;
    var base = trade + fees;
    var margin = c.marginIncludedInRates ? 0 : base * c.margin.total;
    if (margin > 0) {
      lines.push({ key: 'margin', group: 'margin', label: 'Margin, in the open',
        detail: 'Datum ' + (c.margin.datum * 100) + '% · your builder and consultants ' + (c.margin.trade * 100) + '%',
        amount: margin });
    }
    var contingency = (base + margin) * c.contingency;
    lines.push({ key: 'contingency', group: 'contingency', label: 'Contingency',
      detail: (c.contingency * 100) + '% held back for the unforeseen — unspent, it comes back to you',
      amount: contingency });

    var exVat = base + margin + contingency;
    var vat = exVat * c.vatRate;
    var spread = Math.max(c.confidence.floor, c.confidence.start - (opts.answered || 0) * c.confidence.perAnswer);

    return {
      lines: lines, trade: trade, fees: fees, feeParts: { arch: arch, struct: struct, bc: bc },
      margin: margin, datumShare: base * c.margin.datum, tradeShare: base * c.margin.trade,
      contingency: contingency, exVat: exVat, vat: vat, incVat: exVat + vat, spread: spread,
      low: Math.round((exVat + vat) * (1 - spread)), high: Math.round((exVat + vat) * (1 + spread)),
      lowExVat: Math.round(exVat * (1 - spread)), highExVat: Math.round(exVat * (1 + spread))
    };
  }

  /** One build type on its own. */
  function priceJob(book, typeId, job) {
    var t = tradeLines(book, typeId, job);
    var r = wrapUp(book, t.trade, t.lines.slice(), {
      hasOpenings: t.hasOpenings, council: job.council, answered: job.answered, multi: false
    });
    r.typeId = typeId;
    r.ground = t.ground;
    r.regionFactor = t.regionFactor;
    r.area = t.area;
    return r;
  }

  /**
   * Several build types as ONE project. This is the honest way to price an
   * extension plus a loft plus a refurbishment: the building work adds up, but
   * you only pay for one set of drawings, one engineer and one building control
   * application — because that is all the job actually needs.
   */
  /* A second piece of the same kind of work, drawn separately — a second
     extension on another side of the house. It is priced as its own job of
     that type from its own size, with the first job's build choices and
     ground; nothing asked about the first one (its kitchen, its opening into
     the house) is assumed for it. */
  function extraJob(jb, x) {
    var m = {};
    Object.keys(jb.measurements || {}).forEach(function (k) { m[k] = 0; });
    m.width = x.width || 0;
    m.depth = x.depth || 0;
    m.floorArea = m.width * m.depth;
    m.perimeter = 2 * (m.width + m.depth);
    m.bifoldWidth = x.bifoldWidth || 0;
    return { measurements: m, modifiers: jb.modifiers, ground: jb.ground, region: jb.region };
  }
  function singular(name) { return /s$/.test(name || '') ? name.slice(0, -1) : (name || ''); }

  function priceProject(book, typeIds, jobs) {
    var lines = [], trade = 0, openings = false, answered = 0;
    var ground = null, area = 0, byType = [];

    typeIds.forEach(function (id) {
      var jb = jobs[id] || {};
      var extras = jb.extras || [];
      var name = (typeById(book, id) || {}).name;
      var t = tradeLines(book, id, jb);
      if (extras.length) {
        // "Extension 1", "Extension 2" rather than one heading for both
        name = singular(name) + ' 1';
        t.lines.forEach(function (l) { l.typeName = name; });
      }
      lines = lines.concat(t.lines);
      trade += t.trade;
      openings = openings || t.hasOpenings;
      // questions put to the client, plus anything they actively changed
      answered += Object.keys(jb.seen || {}).length + Object.keys(jb.touched || {}).length;
      if (t.ground && (!ground || t.ground.depth > ground.depth)) ground = t.ground;
      area += t.area;
      byType.push({ id: id, name: name, trade: t.trade });

      extras.forEach(function (x, k) {
        var xid = id + '#' + (k + 2), xname = singular((typeById(book, id) || {}).name) + ' ' + (k + 2);
        var tx = tradeLines(book, id, extraJob(jb, x));
        tx.lines.forEach(function (l) { l.type = xid; l.typeName = xname; });
        lines = lines.concat(tx.lines);
        trade += tx.trade;
        openings = openings || tx.hasOpenings;
        if (tx.ground && (!ground || tx.ground.depth > ground.depth)) ground = tx.ground;
        area += tx.area;
        byType.push({ id: xid, name: xname, trade: tx.trade });
      });
    });

    var r = wrapUp(book, trade, lines, {
      hasOpenings: openings, council: (jobs.council || null), answered: answered,
      multi: typeIds.length > 1
    });
    r.typeIds = typeIds;
    r.byType = byType;
    r.ground = ground;
    r.area = area;

    // what the same work would cost bought as separate jobs, fees and all
    var separate = 0;
    typeIds.forEach(function (id) {
      var jb = jobs[id] || {};
      separate += priceJob(book, id, jb).incVat;
      (jb.extras || []).forEach(function (x) { separate += priceJob(book, id, extraJob(jb, x)).incVat; });
    });
    r.separately = separate;
    r.saving = Math.max(0, separate - r.incVat);
    return r;
  }

  /** Price a build type's own worked example — used for impact analysis. */
  function priceTypical(book, typeId) {
    var type = typeById(book, typeId);
    if (!type || !type.typical) return null;
    var t = type.typical;
    var m = JSON.parse(JSON.stringify(t.measurements));
    if (t.rooms) {
      var rm = roomMeasurements(t.rooms, roomAreas(t.rooms, m.floorArea));
      Object.keys(rm).forEach(function (k) { m[k] = rm[k]; });
    }
    return priceJob(book, typeId, {
      measurements: m, modifiers: t.modifiers, ground: t.ground, answered: 6
    });
  }

  /** Every figure still waiting on a real rate. */
  function placeholders(book) {
    var out = [];
    book.buildTypes.forEach(function (t) {
      t.lines.forEach(function (l) {
        if (l.source === 'placeholder') out.push({ type: t.id, typeName: t.name, id: l.id, label: l.label });
      });
    });
    ['architectural', 'structural', 'buildingControl'].forEach(function (k) {
      if (book.fees[k].source === 'placeholder') out.push({ type: 'fees', typeName: 'Fees', id: k, label: k });
    });
    if (book.foundations.source === 'placeholder') out.push({ type: 'foundations', typeName: 'Foundations', id: 'foundations', label: 'Foundation rates' });
    return out;
  }

  root.DATUM = root.DATUM || {};
  root.DATUM.RATEBOOK = {
    UNITS: UNITS,
    tradeLines: tradeLines,
    priceProject: priceProject,
    defaultBook: defaultBook,
    typeById: typeById,
    priceJob: priceJob,
    priceTypical: priceTypical,
    placeholders: placeholders,
    factorFor: factorFor,
    ROOMS: ROOMS
  };
})(window);
