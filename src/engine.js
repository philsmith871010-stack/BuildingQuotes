/*
 * Datum — pricing engine
 * ---------------------------------------------------------------------------
 * Pure functions. Take a spec, return a fully itemised estimate. No DOM, no
 * side effects, so this drops straight into a server or a test harness later.
 */
(function (root) {
  'use strict';

  var RATES = root.DATUM.RATES;
  var TREES = root.DATUM.TREES;

  function round(n) { return Math.round(n); }

  /**
   * @param {object} spec
   *   width, depth        metres of the new footprint
   *   wallType            'brick' | 'render' | 'timber'
   *   bifoldWidth         linear metres of bi-fold, 0 for none
   *   soil                soil id
   *   trees               [{ species, distance }]
   *   wallRemoval         linear metres of existing wall coming out
   *   kitchen             boolean
   *   bathrooms           integer
   *   answered            how many questions the user has actually touched
   */
  function estimate(spec) {
    var area = spec.width * spec.depth;
    var perimeter = 2 * (spec.width + spec.depth);
    var lines = [];

    // ---- Trade cost ------------------------------------------------------
    var wallFactor = RATES.build.wallTypeFactor[spec.wallType] || 1;
    var shell = area * RATES.build.perSqm * wallFactor;
    lines.push({
      key: 'shell',
      group: 'trade',
      label: 'Extension shell',
      detail: area.toFixed(1) + ' m² at £' + RATES.build.perSqm.toLocaleString('en-GB') + '/m²',
      amount: shell
    });

    if (spec.bifoldWidth > 0) {
      lines.push({
        key: 'bifold',
        group: 'trade',
        label: 'Bi-fold doors',
        detail: spec.bifoldWidth.toFixed(2) + ' m at £' + RATES.bifold.perLinearMetre.toLocaleString('en-GB') + '/m',
        amount: spec.bifoldWidth * RATES.bifold.perLinearMetre
      });
    }

    // Foundations — only the EXTRA over what the £/m² rate already allows.
    var ground = TREES.requiredDepth(spec.trees, spec.soil);
    var f = RATES.foundations;
    var foundationCost = 0;
    var foundationDetail = '';

    if (ground.piled) {
      foundationCost = area * f.piledPerSqm;
      foundationDetail = 'Piles and ground beam — ' + ground.depth.toFixed(2) + ' m influence depth';
    } else if (ground.depth > f.nominalDepth) {
      var extra = ground.depth - f.nominalDepth;
      var volume = perimeter * f.trenchWidth * extra;
      foundationCost = volume * f.perCubicMetre;
      foundationDetail = 'Dig to ' + ground.depth.toFixed(2) + ' m, ' +
        extra.toFixed(2) + ' m deeper than standard — ' + volume.toFixed(1) + ' m³';
    }

    if (foundationCost > 0) {
      lines.push({
        key: 'foundations',
        group: 'trade',
        label: 'Deeper foundations',
        detail: foundationDetail,
        amount: foundationCost
      });
    }

    if (spec.wallRemoval > 0) {
      lines.push({
        key: 'openings',
        group: 'trade',
        label: 'Structural openings',
        detail: spec.wallRemoval.toFixed(1) + ' m of wall out at £' +
          RATES.wallRemoval.perLinearMetre.toLocaleString('en-GB') + '/m',
        amount: spec.wallRemoval * RATES.wallRemoval.perLinearMetre
      });
    }

    if (spec.kitchen) {
      lines.push({
        key: 'kitchen',
        group: 'trade',
        label: 'Kitchen fitting',
        detail: 'Labour only — units and appliances are yours to choose',
        amount: RATES.kitchen.fitOnly
      });
    }

    if (spec.bathrooms > 0) {
      lines.push({
        key: 'bathrooms',
        group: 'trade',
        label: spec.bathrooms > 1 ? 'Bathrooms' : 'Bathroom',
        detail: spec.bathrooms + ' at £' + RATES.bathroom.labourOnly.toLocaleString('en-GB') + ' labour only',
        amount: spec.bathrooms * RATES.bathroom.labourOnly
      });
    }

    var trade = lines.reduce(function (t, l) { return t + l.amount; }, 0);

    // ---- Professional fees ----------------------------------------------
    var arch = Math.max(trade * RATES.fees.architectural.pct, RATES.fees.architectural.min);
    lines.push({
      key: 'architectural',
      group: 'fees',
      label: 'Architectural drawings',
      detail: 'Survey, plans and planning submission',
      amount: arch
    });

    var struct = RATES.fees.structural.base + (spec.wallRemoval > 0 ? RATES.fees.structural.withOpenings : 0);
    lines.push({
      key: 'structural',
      group: 'fees',
      label: 'Structural engineer',
      detail: spec.wallRemoval > 0 ? 'Calculations including steel to the new openings' : 'Calculations and foundation design',
      amount: struct
    });

    lines.push({
      key: 'buildingControl',
      group: 'fees',
      label: 'Building control',
      detail: 'Your council, never a private inspector',
      amount: RATES.fees.buildingControl.base
    });

    var fees = arch + struct + RATES.fees.buildingControl.base;

    // ---- Margin, contingency, VAT ---------------------------------------
    var base = trade + fees;
    var margin = RATES.marginIncludedInRates ? 0 : base * RATES.margin.total;
    var datumShare = base * RATES.margin.datum;
    var tradeShare = base * RATES.margin.trade;

    if (margin > 0) {
      lines.push({
        key: 'margin',
        group: 'margin',
        label: 'Margin, in the open',
        detail: 'Datum ' + (RATES.margin.datum * 100) + '% · your builder and consultants ' + (RATES.margin.trade * 100) + '%',
        amount: margin
      });
    }

    var contingency = (base + margin) * RATES.contingency;
    lines.push({
      key: 'contingency',
      group: 'contingency',
      label: 'Contingency',
      detail: (RATES.contingency * 100) + '% held back for the unforeseen — unspent, it comes back to you',
      amount: contingency
    });

    var exVat = base + margin + contingency;
    var vat = exVat * RATES.vatRate;
    var incVat = exVat + vat;

    // ---- Confidence -------------------------------------------------------
    var c = RATES.confidence;
    var spread = Math.max(c.floor, c.start - (spec.answered || 0) * c.perAnswer);

    return {
      area: area,
      perimeter: perimeter,
      lines: lines,
      trade: trade,
      fees: fees,
      margin: margin,
      datumShare: datumShare,
      tradeShare: tradeShare,
      contingency: contingency,
      exVat: exVat,
      vat: vat,
      incVat: incVat,
      spread: spread,
      low: round(incVat * (1 - spread)),
      high: round(incVat * (1 + spread)),
      lowExVat: round(exVat * (1 - spread)),
      highExVat: round(exVat * (1 + spread)),
      ground: ground
    };
  }

  root.DATUM.estimate = estimate;
})(window);
