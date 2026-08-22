/*
 * Datum — the rate book
 * ---------------------------------------------------------------------------
 * Everything Lee can price, in one structure he can edit.
 *
 * A rate book is:
 *   commercial   VAT, margin split, contingency, confidence
 *   buildTypes   extension, renovation, loft, new build, external works
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
        { id: 'floorArea',    label: 'New floor area',      unit: 'm²' },
        { id: 'perimeter',    label: 'External perimeter',  unit: 'm', derived: true },
        { id: 'bifoldWidth',  label: 'Bi-fold width',       unit: 'm' },
        { id: 'wallRemoval',  label: 'Wall removed',        unit: 'm' },
        { id: 'kitchens',     label: 'Kitchens',            unit: 'no.' },
        { id: 'bathrooms',    label: 'Bathrooms',           unit: 'no.' },
        { id: 'rooflights',   label: 'Rooflights',          unit: 'no.' }
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
      blurb: 'Whole-house and room-by-room refurbishment. Priced from an uploaded floor plan.',
      enabled: true,
      usesFoundations: false,
      measurements: [
        { id: 'floorArea',     label: 'Floor area treated', unit: 'm²' },
        { id: 'replasterArea', label: 'Area replastered',   unit: 'm²' },
        { id: 'rewireArea',    label: 'Area rewired',       unit: 'm²' },
        { id: 'wallRemoval',   label: 'Wall removed',       unit: 'm' },
        { id: 'windows',       label: 'Windows replaced',   unit: 'no.' },
        { id: 'kitchens',      label: 'Kitchens',           unit: 'no.' },
        { id: 'bathrooms',     label: 'Bathrooms',          unit: 'no.' }
      ],
      lines: [
        L('ren.strip',      'Strip out and clear',    'Removals, skips and protection', 'per_m2', 'floorArea', 85, 'placeholder'),
        L('ren.rewire',     'Rewire',                 'New circuits, consumer unit, testing and certificate', 'per_m2', 'rewireArea', 78, 'placeholder'),
        L('ren.plumbing',   'Plumbing and heating',   'First and second fix, radiators, boiler allowance', 'per_m2', 'floorArea', 96, 'placeholder'),
        L('ren.replaster',  'Plastering',             'Overboard or hack off and re-skim', 'per_m2', 'replasterArea', 42, 'placeholder'),
        L('ren.opening',    'Structural openings',    'Steel, padstones and making good', 'per_linear_m', 'wallRemoval', 1000, 'lee'),
        L('ren.windows',    'Windows',                'Supplied and fitted, like for like', 'per_unit', 'windows', 850, 'placeholder'),
        L('ren.kitchen',    'Kitchen fitting',        'Labour only', 'per_unit', 'kitchens', 4500, 'lee'),
        L('ren.bathroom',   'Bathroom',               'Labour only', 'per_unit', 'bathrooms', 3000, 'lee'),
        L('ren.flooring',   'Floor finishes',         'Preparation and laying, materials excluded', 'per_m2', 'floorArea', 65, 'placeholder'),
        L('ren.decoration', 'Decoration',             'Two coats throughout', 'per_m2', 'floorArea', 38, 'placeholder')
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
        label: '90 m² full refurbishment, kitchen and two bathrooms',
        measurements: { floorArea: 90, replasterArea: 210, rewireArea: 90, wallRemoval: 3, windows: 8, kitchens: 1, bathrooms: 2 },
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
        { id: 'floorArea',   label: 'New floor area',  unit: 'm²' },
        { id: 'dormerWidth', label: 'Dormer width',    unit: 'm' },
        { id: 'rooflights',  label: 'Rooflights',      unit: 'no.' },
        { id: 'staircases',  label: 'Staircases',      unit: 'no.' },
        { id: 'steels',      label: 'Steel beams',     unit: 'no.' },
        { id: 'bathrooms',   label: 'Bathrooms',       unit: 'no.' },
        { id: 'fireDoors',   label: 'Fire doors',      unit: 'no.' }
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
      blurb: 'Single dwellings and small sites, from footings to handover.',
      enabled: true,
      usesFoundations: true,
      measurements: [
        { id: 'footprintArea', label: 'Ground floor footprint', unit: 'm²' },
        { id: 'floorArea',     label: 'Total internal area',    unit: 'm²' },
        { id: 'perimeter',     label: 'External perimeter',     unit: 'm', derived: true },
        { id: 'roofArea',      label: 'Roof area',              unit: 'm²' },
        { id: 'garageArea',    label: 'Garage area',            unit: 'm²' },
        { id: 'externalArea',  label: 'External works area',    unit: 'm²' },
        { id: 'plots',         label: 'Plots',                  unit: 'no.' },
        { id: 'kitchens',      label: 'Kitchens',               unit: 'no.' },
        { id: 'bathrooms',     label: 'Bathrooms',              unit: 'no.' }
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
        { id: 'patioArea',      label: 'Paved area',        unit: 'm²' },
        { id: 'deckingArea',    label: 'Decked area',       unit: 'm²' },
        { id: 'drivewayArea',   label: 'Driveway area',     unit: 'm²' },
        { id: 'turfArea',       label: 'Turfed area',       unit: 'm²' },
        { id: 'excavationVol',  label: 'Excavation',        unit: 'm³' },
        { id: 'wallLength',     label: 'Retaining wall',    unit: 'm' },
        { id: 'fenceLength',    label: 'Fencing',           unit: 'm' },
        { id: 'drainageLength', label: 'Drainage run',      unit: 'm' },
        { id: 'lightPoints',    label: 'Light fittings',    unit: 'no.' },
        { id: 'steps',          label: 'Step flights',      unit: 'no.' }
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
        step: 0.25, maxBathrooms: 3, maxTrees: 4
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
  function priceJob(book, typeId, job) {
    var type = typeById(book, typeId);
    if (!type) return null;

    var c = book.commercial;
    var m = job.measurements || {};
    var lines = [];
    var regionFactor = 1;
    (book.regions || []).forEach(function (r) {
      if (r.id === (job.region || book.activeRegion)) regionFactor = r.factor;
    });

    // ---- trade lines
    type.lines.forEach(function (line) {
      if (!line.enabled) return;
      var qty = line.unit === 'per_item' ? 1 : (m[line.driver] || 0);
      if (!qty) return;
      var amount = qty * line.rate * factorFor(type, job.modifiers, line.id) * regionFactor;
      lines.push({
        key: line.id, group: 'trade', label: line.label,
        detail: qtyLabel(line, qty), amount: amount, source: line.source
      });
    });

    // ---- foundations, where the build type has ground to dig
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
        cost *= regionFactor;
        lines.push({ key: 'foundations', group: 'trade', label: 'Deeper foundations',
                     detail: detail, amount: cost, source: 'placeholder' });
      }
    }

    var trade = lines.reduce(function (t, l) { return t + l.amount; }, 0);

    // ---- professional fees
    var fe = book.fees;
    var arch = Math.max(trade * fe.architectural.pct, fe.architectural.min);
    lines.push({ key: 'architectural', group: 'fees', label: 'Architectural drawings',
                 detail: 'Survey, plans and planning submission', amount: arch, source: fe.architectural.source });

    var struct = fe.structural.base + ((m.wallRemoval || m.steels || 0) > 0 ? fe.structural.withOpenings : 0);
    lines.push({ key: 'structural', group: 'fees', label: 'Structural engineer',
                 detail: 'Calculations and design', amount: struct, source: fe.structural.source });

    var council = null;
    (book.councils || []).forEach(function (x) { if (x.id === job.council) council = x; });
    var bc = council ? council.fee : fe.buildingControl.base;
    lines.push({ key: 'buildingControl', group: 'fees', label: 'Building control',
                 detail: council ? council.name + ' — never a private inspector' : 'Your council, never a private inspector',
                 amount: bc, source: fe.buildingControl.source });

    var fees = arch + struct + bc;

    // ---- margin, contingency, VAT
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
    var spread = Math.max(c.confidence.floor, c.confidence.start - (job.answered || 0) * c.confidence.perAnswer);

    return {
      typeId: typeId, lines: lines,
      trade: trade, fees: fees, margin: margin,
      datumShare: base * c.margin.datum, tradeShare: base * c.margin.trade,
      contingency: contingency, exVat: exVat, vat: vat, incVat: exVat + vat,
      regionFactor: regionFactor, ground: ground, spread: spread,
      low: Math.round((exVat + vat) * (1 - spread)),
      high: Math.round((exVat + vat) * (1 + spread)),
      lowExVat: Math.round(exVat * (1 - spread)),
      highExVat: Math.round(exVat * (1 + spread)),
      area: m.floorArea || m.footprintArea || m.patioArea || 0
    };
  }

  /** Price a build type's own worked example — used for impact analysis. */
  function priceTypical(book, typeId) {
    var type = typeById(book, typeId);
    if (!type || !type.typical) return null;
    var t = type.typical;
    return priceJob(book, typeId, {
      measurements: t.measurements, modifiers: t.modifiers,
      ground: t.ground, answered: 6
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
    defaultBook: defaultBook,
    typeById: typeById,
    priceJob: priceJob,
    priceTypical: priceTypical,
    placeholders: placeholders,
    factorFor: factorFor
  };
})(window);
