/*
 * Datum — rate book admin
 * ---------------------------------------------------------------------------
 * Lee edits a DRAFT. The rail on the right prices a worked example against that
 * draft as he types, and shows what it would do to the published price. When he
 * is happy he publishes, and only then does anything a client sees move.
 */
(function (root, doc) {
  'use strict';

  var D = root.DATUM;
  var RB = D.RATEBOOK, STORE = D.STORE, TREES = D.TREES;
  var UNITS = RB.UNITS;

  var view = { section: 'overview', typeId: 'extension', search: '', job: {} };

  /* ---- helpers ---------------------------------------------------------- */

  var $ = function (id) { return doc.getElementById(id); };

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) { return '£' + Math.round(n || 0).toLocaleString('en-GB'); }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n)); }
  function pct(n, dp) { return (n * 100).toFixed(dp === undefined ? 1 : dp) + '%'; }
  function when(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' +
           d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 3200);
  }

  function dialog(html, onMount) {
    $('dialog').innerHTML = html;
    $('scrim').classList.add('on');
    if (onMount) onMount();
    var first = $('dialog').querySelector('input, select, textarea, button');
    if (first) first.focus();
  }
  function closeDialog() { $('scrim').classList.remove('on'); }

  $('scrim').addEventListener('click', function (e) { if (e.target === $('scrim')) closeDialog(); });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDialog(); });

  /* ---- worked example --------------------------------------------------- */

  function currentType() { return RB.typeById(STORE.draft(), view.typeId); }

  function jobFor(typeId) {
    if (!view.job[typeId]) {
      var t = RB.typeById(STORE.draft(), typeId);
      var typ = (t && t.typical) || { measurements: {}, modifiers: {} };
      view.job[typeId] = {
        measurements: JSON.parse(JSON.stringify(typ.measurements || {})),
        modifiers: JSON.parse(JSON.stringify(typ.modifiers || {})),
        ground: JSON.parse(JSON.stringify(typ.ground || { soil: 'high', trees: [] })),
        answered: 6
      };
    }
    return view.job[typeId];
  }
  function resetJob(typeId) { delete view.job[typeId]; }

  /* ---- change plumbing --------------------------------------------------- */

  function edit(description, apply, meta) {
    STORE.change(description, apply, meta);
    refresh();
  }
  /** Silent mutation while someone is still typing — logged on blur. */
  function live(apply) {
    apply(STORE.draft());
    renderRail();
    renderTopbar();
  }

  /* ---- top bar ------------------------------------------------------------ */

  function renderTopbar() {
    var book = STORE.draft();
    $('version-pill').textContent = 'v' + book.version;
    var dirty = STORE.isDirty();
    var pill = $('state-pill');
    pill.textContent = dirty ? 'Unpublished draft' : 'Published';
    pill.className = 'pill ' + (dirty ? 'pill-draft' : 'pill-live');
    $('btn-discard').hidden = !dirty;
    $('btn-publish').textContent = dirty ? 'Review & publish' : 'Nothing to publish';
    $('btn-publish').disabled = !dirty;
  }

  /* ---- nav ---------------------------------------------------------------- */

  function renderNav() {
    var book = STORE.draft();
    var holds = RB.placeholders(book);
    function holdsFor(id) {
      return holds.filter(function (h) { return h.type === id; }).length;
    }
    function btn(id, label, count, holdCount) {
      var aria = label + (count !== undefined && count !== null ? ', ' + count + ' items' : '') +
        (holdCount ? ', ' + holdCount + ' still placeholders' : '');
      return '<button class="navbtn" data-section="' + id + '" aria-current="' +
        (view.section === id) + '" aria-label="' + esc(aria) + '"' +
        (holdCount ? ' title="' + holdCount + ' rates still need a real figure"' : '') + '>' +
        (holdCount ? '<span class="dot" aria-hidden="true"></span>' : '') + esc(label) +
        (count !== undefined && count !== null ? '<span class="count">' + count + '</span>' : '') +
        '</button>';
    }

    var html = '<h4>Rate book</h4>' + btn('overview', 'Overview');
    html += '<h4>Build types</h4>';
    book.buildTypes.forEach(function (t) {
      html += btn('type:' + t.id, t.name, t.lines.length, holdsFor(t.id));
    });
    html += '<h4>Shared</h4>' +
      btn('foundations', 'Foundations') +
      btn('fees', 'Fees & councils') +
      btn('regions', 'Regions') +
      btn('commercial', 'Commercial');
    html += '<h4>Tools</h4>' +
      btn('data', 'Import & export') +
      btn('history', 'History', STORE.log().length);
    $('sidenav').innerHTML = html;
  }

  /* ---- overview ------------------------------------------------------------ */

  function renderOverview() {
    var draft = STORE.draft(), pub = STORE.published();
    var holds = RB.placeholders(draft);
    var lineCount = draft.buildTypes.reduce(function (t, x) { return t + x.lines.length; }, 0);
    var live = draft.buildTypes.filter(function (t) { return t.enabled; }).length;
    var confirmed = lineCount - holds.filter(function (h) { return h.type !== 'fees' && h.type !== 'foundations'; }).length;

    var html =
      '<div class="sechead"><p class="eyebrow">Rate book</p><h2>What Datum can price.</h2>' +
      '<p>Every figure the estimator uses, in one place. Change a rate, watch what it does to a real job on the right, publish when you are happy.</p></div>';

    html += '<dl class="tiles">' +
      '<div class="tile"><dt>Build types live</dt><dd>' + live + ' <small>of ' + draft.buildTypes.length + '</small></dd></div>' +
      '<div class="tile"><dt>Priced items</dt><dd>' + lineCount + '</dd></div>' +
      '<div class="tile' + (holds.length ? ' tile-warn' : ' tile-good') + '"><dt>Still placeholders</dt><dd>' + holds.length +
        ' <small>' + (holds.length ? 'need a real rate' : 'all confirmed') + '</small></dd></div>' +
      '<div class="tile"><dt>Confirmed rates</dt><dd>' + confirmed + '</dd></div>' +
      '</dl>';

    if (holds.length) {
      html += '<div class="panel"><div class="panel-head"><span class="badge badge-hold">Placeholder</span>' +
        '<h3>' + holds.length + ' figures are still ours, not yours</h3>' +
        '<span class="spacer"></span></div>' +
        '<div class="panel-body"><p style="font-size:.86rem;color:var(--ink-2);max-width:66ch;">' +
        'These were invented so the estimator would run. Every one needs replacing with a real rate before it prices live work. ' +
        'Type over a rate anywhere in here and it stops being a placeholder.</p>' +
        '<div class="typecard-figs" style="margin-top:.8rem;">' +
        draft.buildTypes.map(function (t) {
          var n = holds.filter(function (h) { return h.type === t.id; }).length;
          return n ? '<div><dt>' + esc(t.name) + '</dt><dd style="color:var(--warn)">' + n + '</dd></div>' : '';
        }).join('') + '</div></div></div>';
    }

    html += '<div class="typegrid">';
    draft.buildTypes.forEach(function (t) {
      var after = RB.priceTypical(draft, t.id);
      var before = RB.priceTypical(pub, t.id);
      var delta = after && before ? after.incVat - before.incVat : 0;
      var n = holds.filter(function (h) { return h.type === t.id; }).length;
      html += '<div class="typecard">' +
        '<div class="typecard-top">' +
          '<div style="flex:1;min-width:0;"><h3>' + esc(t.name) + '</h3></div>' +
          '<label class="switch" title="' + (t.enabled ? 'Live' : 'Hidden from clients') + '">' +
            '<input type="checkbox" data-toggle-type="' + t.id + '"' + (t.enabled ? ' checked' : '') +
            ' aria-label="' + esc(t.name) + ' available to clients"><i></i></label>' +
        '</div>' +
        '<p>' + esc(t.blurb) + '</p>' +
        '<div class="typecard-figs">' +
          '<div><dt>Items</dt><dd>' + t.lines.length + '</dd></div>' +
          '<div><dt>Placeholders</dt><dd' + (n ? ' style="color:var(--warn)"' : '') + '>' + n + '</dd></div>' +
          '<div><dt>Typical job</dt><dd>' + (after ? money(after.incVat) : '—') + '</dd></div>' +
        '</div>' +
        (Math.abs(delta) > 0.5
          ? '<p class="delta ' + (delta > 0 ? 'delta-up' : 'delta-down') + '">' + signed(delta) + ' against the published book</p>'
          : '') +
        '<p style="font-size:.76rem;color:var(--ink-3)">' + esc((t.typical && t.typical.label) || '') + '</p>' +
        '<div class="typecard-actions">' +
          '<button class="btn btn-ghost btn-sm" data-section="type:' + t.id + '">Edit rates</button>' +
        '</div>' +
      '</div>';
    });
    html += '<div class="typecard" style="justify-content:center">' +
      '<h3 style="color:var(--ink-3)">Something else?</h3>' +
      '<p>Garage conversions, garden rooms, outbuildings, driveways on their own. ' +
      'Tell us what you price and it becomes another set of rates in here.</p></div>';
    html += '</div>';
    return html;
  }

  /* ---- build type editor ---------------------------------------------------- */

  function unitOptions(sel) {
    return Object.keys(UNITS).map(function (u) {
      return '<option value="' + u + '"' + (u === sel ? ' selected' : '') + '>' + UNITS[u].label + '</option>';
    }).join('');
  }
  function driverOptions(type, sel) {
    return type.measurements.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === sel ? ' selected' : '') + '>' +
        esc(m.label) + ' (' + m.unit + ')</option>';
    }).join('');
  }

  function renderType(typeId) {
    var type = RB.typeById(STORE.draft(), typeId);
    if (!type) return '<p class="empty">That build type is not in the book.</p>';

    var html =
      '<div class="sechead"><p class="eyebrow">Build type</p><h2>' + esc(type.name) + '</h2>' +
      '<p>' + esc(type.blurb) + '</p></div>';

    html += '<div class="secrow">' +
      '<label class="switch"><input type="checkbox" data-toggle-type="' + type.id + '"' +
        (type.enabled ? ' checked' : '') + ' aria-label="Available to clients"><i></i></label>' +
      '<span style="font-size:.85rem;color:var(--ink-2)">' + (type.enabled ? 'Live — clients can price this' : 'Hidden from clients') + '</span>' +
      '<span style="margin-left:auto"></span>' +
      '<button class="btn btn-ghost btn-sm" data-uplift="' + type.id + '">Uplift all rates…</button>' +
      '<button class="btn btn-ghost btn-sm" data-addline="' + type.id + '">+ Add an item</button>' +
      '</div>';

    // ---- rate lines
    html += '<div class="panel"><div class="panel-head"><h3>Priced items</h3>' +
      '<span class="spacer"></span><span class="eyebrow">' + type.lines.length + ' items</span></div>' +
      '<div class="tablewrap"><table class="grid-table"><thead><tr>' +
      '<th style="width:26%">Item</th><th style="width:24%">Description</th>' +
      '<th style="width:13%">Unit</th><th style="width:17%">Driven by</th>' +
      '<th class="right" style="width:11%">Rate</th><th style="width:5%">Source</th><th style="width:4%"></th>' +
      '</tr></thead><tbody>';

    type.lines.forEach(function (l) {
      html += '<tr' + (l.enabled ? '' : ' class="off"') + ' data-line="' + l.id + '">' +
        '<td><input class="cell" value="' + esc(l.label) + '" data-f="label" aria-label="Item name"></td>' +
        '<td><input class="cell" value="' + esc(l.detail) + '" data-f="detail" aria-label="Description"></td>' +
        '<td><select class="cell" data-f="unit" aria-label="Unit">' + unitOptions(l.unit) + '</select></td>' +
        '<td><select class="cell" data-f="driver" aria-label="Driven by">' + driverOptions(type, l.driver) + '</select></td>' +
        '<td class="right"><div class="money-cell"><span>£</span>' +
          '<input class="cell cell-num cell-rate" type="number" min="0" step="1" value="' + l.rate +
          '" data-f="rate" aria-label="Rate for ' + esc(l.label) + '"></div></td>' +
        '<td><span class="badge ' + (l.source === 'lee' ? 'badge-lee">Yours' : 'badge-hold">Hold') + '</span></td>' +
        '<td><button class="iconbtn" data-delline="' + l.id + '" title="Remove ' + esc(l.label) + '" aria-label="Remove ' + esc(l.label) + '">×</button></td>' +
      '</tr>';
    });
    html += '</tbody></table></div>' +
      '<p class="panel-note">Type over a rate and it stops being a placeholder. Switch an item off to keep it in the book without pricing it.</p></div>';

    // ---- modifiers
    html += '<div class="panel"><div class="panel-head"><h3>Modifiers</h3><span class="spacer"></span>' +
      '<span class="eyebrow">multiply the rates above</span></div><div class="mods">';
    (type.modifiers || []).forEach(function (m) {
      var scope = m.appliesTo === 'all' ? 'every item'
        : m.appliesTo.length + ' item' + (m.appliesTo.length === 1 ? '' : 's');
      html += '<div class="mod" data-mod="' + m.id + '">' +
        '<div class="mod-top"><h4>' + esc(m.label) + '</h4><span class="scope">applies to ' + scope + '</span></div>' +
        (m.help ? '<p>' + esc(m.help) + '</p>' : '') +
        '<div class="mod-opts">' +
        m.options.map(function (o) {
          return '<div class="mod-opt"><span>' + esc(o.label) + '</span>' +
            '<input class="cell cell-num" type="number" step="0.01" min="0" value="' + o.factor +
            '" data-modopt="' + o.id + '" aria-label="' + esc(m.label + ' — ' + o.label) + ' factor"></div>';
        }).join('') +
        '</div></div>';
    });
    html += '</div><p class="panel-note">1.00 leaves a rate alone. 1.10 adds ten per cent. Factors multiply together.</p></div>';

    // ---- measurements reference
    html += '<div class="panel"><div class="panel-head"><h3>Measurements</h3><span class="spacer"></span>' +
      '<span class="eyebrow">what the client is asked for</span></div><div class="panel-body">' +
      '<div class="typecard-figs">' +
      type.measurements.map(function (m) {
        return '<div><dt>' + esc(m.label) + '</dt><dd>' + m.unit + (m.derived ? ' <small style="color:var(--ink-3)">derived</small>' : '') + '</dd></div>';
      }).join('') + '</div></div></div>';

    return html;
  }

  /* ---- foundations ----------------------------------------------------------- */

  function renderFoundations() {
    var book = STORE.draft();
    var f = book.foundations;

    var html = '<div class="sechead"><p class="eyebrow">Shared</p><h2>Foundations.</h2>' +
      '<p>Depth comes from the species, its mature height, how far away it is, and the soil — the NHBC approach. ' +
      'The depths below are our draft and need an engineer over them before this prices live work.</p></div>';

    html += '<div class="panel"><div class="panel-head"><h3>Rates and limits</h3></div><div class="panel-body">' +
      '<div class="fields fields-3">' +
      [['nominalDepth', 'Depth already in the £/m² rate', 'm', 0.05],
       ['trenchWidth', 'Trench width', 'm', 0.05],
       ['perCubicMetre', 'Dig, cart away and concrete', '£/m³', 5],
       ['pilingThreshold', 'Switch to piles beyond', 'm', 0.05],
       ['piledPerSqm', 'Piles and ground beam', '£/m² footprint', 5],
       ['maxDepth', 'Deepest we will estimate', 'm', 0.05]].map(function (r) {
        return '<div class="field"><label for="fnd-' + r[0] + '">' + esc(r[1]) + '</label>' +
          '<input id="fnd-' + r[0] + '" type="number" step="' + r[3] + '" min="0" value="' + f[r[0]] +
          '" data-fnd="' + r[0] + '"><span class="hint">' + r[2] + '</span></div>';
      }).join('') + '</div></div></div>';

    // live check
    var check = TREES.requiredDepth([{ species: 'oak', distance: 8 }], 'high', f);
    var check2 = TREES.requiredDepth([{ species: 'birch', distance: 6 }], 'medium', f);
    html += '<div class="panel"><div class="panel-head"><h3>Check it</h3><span class="spacer"></span>' +
      '<span class="eyebrow">recalculates as you edit</span></div><div class="panel-body">' +
      '<div class="typecard-figs">' +
      '<div><dt>Oak, 8 m, heavy clay</dt><dd>' + check.depth.toFixed(2) + ' m' +
        (check.piled ? ' <small style="color:var(--warn)">piled</small>' : '') + '</dd></div>' +
      '<div><dt>Birch, 6 m, medium clay</dt><dd>' + check2.depth.toFixed(2) + ' m' +
        (check2.piled ? ' <small style="color:var(--warn)">piled</small>' : '') + '</dd></div>' +
      '<div><dt>No trees, heavy clay</dt><dd>' + TREES.requiredDepth([], 'high', f).depth.toFixed(2) + ' m</dd></div>' +
      '</div></div></div>';

    html += '<div class="panel"><div class="panel-head"><h3>Species</h3><span class="spacer"></span>' +
      '<span class="eyebrow">' + TREES.SPECIES.length + ' listed</span></div>' +
      '<div class="tablewrap"><table class="grid-table"><thead><tr>' +
      '<th>Species</th><th style="width:22%">Water demand</th><th class="right" style="width:20%">Mature height</th>' +
      '</tr></thead><tbody>';
    TREES.SPECIES.forEach(function (sp) {
      html += '<tr><td>' + esc(sp.name) + '</td>' +
        '<td><span class="badge ' + (sp.demand === 'high' ? 'badge-hold' : 'badge-lee') + '">' + sp.demand + '</span></td>' +
        '<td class="right num">' + sp.height + ' m</td></tr>';
    });
    html += '</tbody></table></div>' +
      '<p class="panel-note">Mature heights and water demand follow NHBC Chapter 4.2. Editing the species table is the next thing to build — the depth curves want an engineer’s eye first.</p></div>';

    return html;
  }

  /* ---- fees and councils ------------------------------------------------------ */

  function renderFees() {
    var book = STORE.draft(), f = book.fees;
    var html = '<div class="sechead"><p class="eyebrow">Shared</p><h2>Professional fees.</h2>' +
      '<p>Charged on every job, whatever is being built.</p></div>';

    html += '<div class="panel"><div class="panel-head"><h3>Fee scales</h3></div><div class="panel-body">' +
      '<div class="fields fields-3">' +
      '<div class="field"><label for="fee-arch">Architectural</label>' +
        '<input id="fee-arch" type="number" step="0.005" min="0" value="' + f.architectural.pct + '" data-fee="architectural.pct">' +
        '<span class="hint">Proportion of the build cost — 0.06 is six per cent</span></div>' +
      '<div class="field"><label for="fee-archmin">Architectural minimum</label>' +
        '<input id="fee-archmin" type="number" step="50" min="0" value="' + f.architectural.min + '" data-fee="architectural.min">' +
        '<span class="hint">£, whichever is greater</span></div>' +
      '<div class="field"><label for="fee-struct">Structural engineer</label>' +
        '<input id="fee-struct" type="number" step="50" min="0" value="' + f.structural.base + '" data-fee="structural.base">' +
        '<span class="hint">£, base fee</span></div>' +
      '<div class="field"><label for="fee-structo">Structural, with openings</label>' +
        '<input id="fee-structo" type="number" step="50" min="0" value="' + f.structural.withOpenings + '" data-fee="structural.withOpenings">' +
        '<span class="hint">£, added when there is steel</span></div>' +
      '<div class="field"><label for="fee-bc">Building control, default</label>' +
        '<input id="fee-bc" type="number" step="10" min="0" value="' + f.buildingControl.base + '" data-fee="buildingControl.base">' +
        '<span class="hint">£, used when no council is chosen</span></div>' +
      '<div class="field"><label for="fee-pw">Party wall, per neighbour</label>' +
        '<input id="fee-pw" type="number" step="50" min="0" value="' + f.partyWall.perNeighbour + '" data-fee="partyWall.perNeighbour">' +
        '<span class="hint">£, not yet asked for on the public estimator</span></div>' +
      '</div></div></div>';

    html += '<div class="panel"><div class="panel-head"><h3>Council building control</h3>' +
      '<span class="spacer"></span><button class="btn btn-ghost btn-sm" data-addcouncil="1">+ Add a council</button></div>' +
      '<div class="tablewrap"><table class="grid-table"><thead><tr>' +
      '<th>Authority</th><th class="right" style="width:22%">Fee</th><th style="width:6%"></th>' +
      '</tr></thead><tbody>';
    book.councils.forEach(function (c) {
      html += '<tr data-council="' + c.id + '">' +
        '<td><input class="cell" value="' + esc(c.name) + '" data-cf="name" aria-label="Council name"></td>' +
        '<td class="right"><div class="money-cell"><span>£</span>' +
        '<input class="cell cell-num cell-rate" type="number" step="10" min="0" value="' + c.fee + '" data-cf="fee" aria-label="Fee for ' + esc(c.name) + '"></div></td>' +
        '<td><button class="iconbtn" data-delcouncil="' + c.id + '" aria-label="Remove ' + esc(c.name) + '">×</button></td></tr>';
    });
    html += '</tbody></table></div><p class="panel-note">Council fees vary by authority and by the size of the work. ' +
      'These are single figures for now — banding by project value is worth adding once the real fee schedules are in.</p></div>';
    return html;
  }

  /* ---- regions ------------------------------------------------------------------ */

  function renderRegions() {
    var book = STORE.draft();
    var html = '<div class="sechead"><p class="eyebrow">Shared</p><h2>Regions.</h2>' +
      '<p>Labour and materials do not cost the same in Clavering as they do in Camden. Every trade rate is multiplied by the factor for the client’s postcode area.</p></div>';

    html += '<div class="panel"><div class="panel-head"><h3>Postcode areas</h3>' +
      '<span class="spacer"></span><button class="btn btn-ghost btn-sm" data-addregion="1">+ Add a region</button></div>' +
      '<div class="tablewrap"><table class="grid-table"><thead><tr>' +
      '<th>Area</th><th class="right" style="width:18%">Factor</th><th style="width:16%">Default</th><th style="width:6%"></th>' +
      '</tr></thead><tbody>';
    book.regions.forEach(function (r) {
      html += '<tr data-region="' + r.id + '">' +
        '<td><input class="cell" value="' + esc(r.name) + '" data-rf="name" aria-label="Region name"></td>' +
        '<td class="right"><input class="cell cell-num cell-rate" type="number" step="0.01" min="0" value="' + r.factor + '" data-rf="factor" aria-label="Factor for ' + esc(r.name) + '"></td>' +
        '<td><label class="switch"><input type="radio" name="activeregion" data-activeregion="' + r.id + '"' +
          (book.activeRegion === r.id ? ' checked' : '') + ' aria-label="Make ' + esc(r.name) + ' the default"><i></i></label></td>' +
        '<td><button class="iconbtn" data-delregion="' + r.id + '" aria-label="Remove ' + esc(r.name) + '">×</button></td></tr>';
    });
    html += '</tbody></table></div><p class="panel-note">1.00 is the base. Essex is the base because that is where the rates came from.</p></div>';
    return html;
  }

  /* ---- commercial ----------------------------------------------------------------- */

  function renderCommercial() {
    var c = STORE.draft().commercial;
    var split = c.margin.datum + c.margin.trade;
    var mismatch = Math.abs(split - c.margin.total) > 0.0001;

    var html = '<div class="sechead"><p class="eyebrow">Shared</p><h2>Commercial terms.</h2>' +
      '<p>Margin, contingency and VAT. These apply to every job in the book.</p></div>';

    html += '<div class="panel"><div class="panel-head"><h3>The big one</h3></div><div class="panel-body">' +
      '<div class="field field-wide"><label for="mir">Are your rates cost, or a selling price?</label>' +
      '<select id="mir" data-comm="marginIncludedInRates">' +
        '<option value="false"' + (!c.marginIncludedInRates ? ' selected' : '') + '>Cost — add the margin on top</option>' +
        '<option value="true"' + (c.marginIncludedInRates ? ' selected' : '') + '>Selling price — the margin is already inside</option>' +
      '</select>' +
      '<span class="hint">This moves every headline figure by about fifteen per cent. It is currently set to treat your rates as cost, ' +
      'because the brief said the software uses them "in the background". Switch it and watch the rail.</span></div>' +
      '</div></div>';

    html += '<div class="panel"><div class="panel-head"><h3>Margin, contingency and VAT</h3></div><div class="panel-body">' +
      '<div class="fields fields-3">' +
      '<div class="field"><label for="c-total">Total margin</label><input id="c-total" type="number" step="0.005" min="0" value="' + c.margin.total + '" data-comm="margin.total"><span class="hint">0.15 is fifteen per cent</span></div>' +
      '<div class="field"><label for="c-datum">Datum’s share</label><input id="c-datum" type="number" step="0.005" min="0" value="' + c.margin.datum + '" data-comm="margin.datum"><span class="hint">Percentage points of the total</span></div>' +
      '<div class="field"><label for="c-trade">Builder and consultants</label><input id="c-trade" type="number" step="0.005" min="0" value="' + c.margin.trade + '" data-comm="margin.trade"><span class="hint">Percentage points of the total</span></div>' +
      '<div class="field"><label for="c-cont">Contingency</label><input id="c-cont" type="number" step="0.005" min="0" value="' + c.contingency + '" data-comm="contingency"><span class="hint">Shown as its own line, returned if unspent</span></div>' +
      '<div class="field"><label for="c-vat">VAT</label><input id="c-vat" type="number" step="0.01" min="0" value="' + c.vatRate + '" data-comm="vatRate"><span class="hint">0.20 is the standard rate</span></div>' +
      '</div>' +
      (mismatch
        ? '<div class="flag" style="margin-top:.9rem"><span><b>The split does not add up.</b> Datum ' + pct(c.margin.datum) +
          ' plus trade ' + pct(c.margin.trade) + ' comes to ' + pct(split) + ', but the total margin is set to ' +
          pct(c.margin.total) + '. The total is what gets charged; the split is what gets reported.</span></div>'
        : '<div class="flag flag-good" style="margin-top:.9rem"><span><b>Split checks out.</b> ' +
          pct(c.margin.datum) + ' to Datum, ' + pct(c.margin.trade) + ' to the builder and consultants, ' + pct(c.margin.total) + ' in total.</span></div>') +
      '</div></div>';

    html += '<div class="panel"><div class="panel-head"><h3>Confidence range</h3></div><div class="panel-body">' +
      '<div class="fields fields-3">' +
      '<div class="field"><label for="c-start">Opening spread</label><input id="c-start" type="number" step="0.01" min="0" value="' + c.confidence.start + '" data-comm="confidence.start"><span class="hint">0.30 shows as plus or minus 30%</span></div>' +
      '<div class="field"><label for="c-floor">Tightest it goes</label><input id="c-floor" type="number" step="0.01" min="0" value="' + c.confidence.floor + '" data-comm="confidence.floor"><span class="hint">Never claim better than this without a survey</span></div>' +
      '<div class="field"><label for="c-per">Tightening per answer</label><input id="c-per" type="number" step="0.005" min="0" value="' + c.confidence.perAnswer + '" data-comm="confidence.perAnswer"><span class="hint">Taken off the spread each time a question is answered</span></div>' +
      '</div></div></div>';
    return html;
  }

  /* ---- data ------------------------------------------------------------------------ */

  function renderData() {
    var html = '<div class="sechead"><p class="eyebrow">Tools</p><h2>Import and export.</h2>' +
      '<p>Bring the quantity surveyor’s schedule in, or take the whole book out.</p></div>';

    html += '<div class="panel"><div class="panel-head"><h3>Paste in a rate schedule</h3><span class="spacer"></span>' +
      '<span class="eyebrow">CSV</span></div><div class="panel-body">' +
      '<div class="field field-wide"><label for="csv-in">Two columns: line id, rate</label>' +
      '<textarea id="csv-in" spellcheck="false" placeholder="ext.shell,3200&#10;ext.bifold,1580&#10;loft.shell,1920"></textarea>' +
      '<span class="hint">A header row is ignored. Any id that is not in the book is reported back rather than dropped quietly. ' +
      'Export below to get the ids in the right shape first.</span></div>' +
      '<div class="secrow" style="margin:.8rem 0 0"><button class="btn btn-sm" id="btn-csv-in">Import these rates</button></div>' +
      '</div></div>';

    html += '<div class="panel"><div class="panel-head"><h3>Take the book out</h3><span class="spacer"></span>' +
      '<button class="btn btn-ghost btn-sm" data-export="csv">As CSV</button>' +
      '<button class="btn btn-ghost btn-sm" data-export="json">As JSON</button></div><div class="panel-body">' +
      '<div class="field field-wide"><label for="export-out">Select all and copy</label>' +
      '<textarea id="export-out" spellcheck="false" readonly placeholder="Choose a format above."></textarea></div>' +
      '<div class="secrow" style="margin:.8rem 0 0"><button class="btn btn-ghost btn-sm" id="btn-copy">Copy to clipboard</button></div>' +
      '</div></div>';

    html += '<div class="panel"><div class="panel-head"><h3>Restore a book</h3><span class="spacer"></span>' +
      '<span class="eyebrow">JSON</span></div><div class="panel-body">' +
      '<div class="field field-wide"><label for="json-in">Paste a previously exported book</label>' +
      '<textarea id="json-in" spellcheck="false" placeholder="{ &quot;book&quot;: { … } }"></textarea></div>' +
      '<div class="secrow" style="margin:.8rem 0 0">' +
      '<button class="btn btn-sm" id="btn-json-in">Load into the draft</button>' +
      '<span style="margin-left:auto"></span>' +
      '<button class="btn btn-ghost btn-sm" id="btn-reset">Reset everything to the opening book</button></div>' +
      '</div></div>';
    return html;
  }

  /* ---- history ---------------------------------------------------------------------- */

  function renderHistory() {
    var log = STORE.log(), hist = STORE.history();
    var html = '<div class="sechead"><p class="eyebrow">Tools</p><h2>History.</h2>' +
      '<p>Every change, and every published version you can go back to.</p></div>';

    html += '<div class="panel"><div class="panel-head"><h3>Published versions</h3></div>';
    if (!hist.length) {
      html += '<p class="empty">Nothing published yet beyond the opening book.</p>';
    } else {
      html += '<div class="tablewrap"><table class="grid-table"><thead><tr>' +
        '<th style="width:18%">Version</th><th>Label</th><th style="width:22%">Published</th><th style="width:16%"></th>' +
        '</tr></thead><tbody>';
      hist.forEach(function (h, i) {
        html += '<tr><td class="num">v' + h.version + '</td><td>' + esc(h.label || '—') + '</td>' +
          '<td class="num">' + when(h.at) + '</td>' +
          '<td class="right"><button class="btn btn-ghost btn-sm" data-rollback="' + i + '">Load into draft</button></td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    html += '<div class="panel"><div class="panel-head"><h3>Change log</h3><span class="spacer"></span>' +
      '<span class="eyebrow">' + log.length + ' entries</span></div>' +
      '<div class="tablewrap"><table class="grid-table"><thead><tr>' +
      '<th style="width:20%">When</th><th style="width:12%">Who</th><th>What</th>' +
      '</tr></thead><tbody>';
    log.slice(0, 80).forEach(function (e) {
      html += '<tr><td class="num" style="white-space:nowrap">' + when(e.at) + '</td>' +
        '<td>' + esc(e.who) + '</td><td>' + esc(e.what) +
        (e.from !== undefined && e.to !== undefined
          ? ' <span style="color:var(--ink-3);font-family:var(--mono);font-size:.76rem">' + esc(e.from) + ' → ' + esc(e.to) + '</span>'
          : '') + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  /* ---- search ------------------------------------------------------------------------ */

  function renderSearch() {
    var q = view.search.toLowerCase();
    var hits = [];
    STORE.draft().buildTypes.forEach(function (t) {
      t.lines.forEach(function (l) {
        if ((l.label + ' ' + l.detail + ' ' + l.id + ' ' + t.name).toLowerCase().indexOf(q) >= 0) {
          hits.push({ type: t, line: l });
        }
      });
    });

    var html = '<div class="sechead"><p class="eyebrow">Search</p><h2>' + hits.length +
      ' item' + (hits.length === 1 ? '' : 's') + ' matching “' + esc(view.search) + '”.</h2></div>';
    if (!hits.length) return html + '<p class="empty">Nothing in the book matches that.</p>';

    html += '<div class="panel"><div class="tablewrap"><table class="grid-table"><thead><tr>' +
      '<th style="width:20%">Build type</th><th>Item</th><th class="right" style="width:14%">Rate</th>' +
      '<th style="width:10%">Unit</th><th style="width:8%">Source</th><th style="width:12%"></th>' +
      '</tr></thead><tbody>';
    hits.forEach(function (h) {
      html += '<tr data-searchline="' + h.line.id + '" data-searchtype="' + h.type.id + '">' +
        '<td>' + esc(h.type.name) + '</td><td>' + esc(h.line.label) + '</td>' +
        '<td class="right"><div class="money-cell"><span>£</span>' +
        '<input class="cell cell-num cell-rate" type="number" min="0" step="1" value="' + h.line.rate +
        '" data-searchrate="' + h.line.id + '" aria-label="Rate for ' + esc(h.line.label) + '"></div></td>' +
        '<td class="num">' + UNITS[h.line.unit].label + '</td>' +
        '<td><span class="badge ' + (h.line.source === 'lee' ? 'badge-lee">Yours' : 'badge-hold">Hold') + '</span></td>' +
        '<td class="right"><button class="btn btn-ghost btn-sm" data-section="type:' + h.type.id + '">Open</button></td></tr>';
    });
    return html + '</tbody></table></div></div>';
  }

  /* ---- the rail -------------------------------------------------------------------- */

  function renderRail() {
    var typeId = view.typeId;
    var draft = STORE.draft(), pub = STORE.published();
    var type = RB.typeById(draft, typeId);
    if (!type) { $('rail').innerHTML = ''; return; }

    var job = jobFor(typeId);
    var after = RB.priceJob(draft, typeId, job);
    var before = RB.priceJob(pub, typeId, job);
    var delta = before ? after.incVat - before.incVat : 0;
    var dcls = Math.abs(delta) < 0.5 ? 'delta-flat' : delta > 0 ? 'delta-up' : 'delta-down';

    var html = '<div class="rail-head"><p class="eyebrow">Worked example</p><h3>' + esc(type.name) + '</h3>' +
      '<p>' + esc((type.typical && type.typical.label) || '') + '</p></div>';

    html += '<div class="railtotal">' +
      '<div class="fig">' + money(after.incVat) + '</div>' +
      '<div class="sub">Including VAT · ' + pct(after.spread, 0) + ' spread</div>' +
      '<div class="delta ' + dcls + '">' +
        (Math.abs(delta) < 0.5 ? 'Same as published' : signed(delta) + ' (' + (delta > 0 ? '+' : '−') + pct(Math.abs(delta / (before.incVat || 1))) + ') against published') +
      '</div></div>';

    html += '<div class="railmeas">' +
      type.measurements.filter(function (m) { return !m.derived; }).map(function (m) {
        return '<div class="railmeas-row"><label for="rm-' + m.id + '">' + esc(m.label) + '</label>' +
          '<input id="rm-' + m.id + '" type="number" step="0.5" min="0" value="' +
          (job.measurements[m.id] || 0) + '" data-meas="' + m.id + '">' +
          '<span class="unit">' + m.unit + '</span></div>';
      }).join('') + '</div>';

    html += '<div class="railmods">' +
      (type.modifiers || []).map(function (m) {
        return '<div><label for="rmod-' + m.id + '">' + esc(m.label) + '</label>' +
          '<select id="rmod-' + m.id + '" data-modsel="' + m.id + '">' +
          m.options.map(function (o) {
            return '<option value="' + o.id + '"' + ((job.modifiers[m.id] || m.value) === o.id ? ' selected' : '') + '>' +
              esc(o.label) + ' · ×' + o.factor + '</option>';
          }).join('') + '</select></div>';
      }).join('') + '</div>';

    html += '<table class="railbreak"><tbody>';
    after.lines.filter(function (l) { return l.group === 'trade'; }).forEach(function (l) {
      html += '<tr><td>' + esc(l.label) + '</td><td>' + money(l.amount) + '</td></tr>';
    });
    html += '<tr class="sub"><td>Building work</td><td>' + money(after.trade) + '</td></tr>';
    html += '<tr><td>Drawings and fees</td><td>' + money(after.fees) + '</td></tr>';
    if (after.margin > 0) html += '<tr><td>Margin</td><td>' + money(after.margin) + '</td></tr>';
    html += '<tr><td>Contingency</td><td>' + money(after.contingency) + '</td></tr>';
    html += '<tr class="sub"><td>Excluding VAT</td><td>' + money(after.exVat) + '</td></tr>';
    html += '<tr><td>VAT</td><td>' + money(after.vat) + '</td></tr>';
    html += '<tr class="tot"><td>Total</td><td>' + money(after.incVat) + '</td></tr>';
    html += '</tbody></table>';

    if (after.ground) {
      html += '<p style="font-size:.75rem;color:var(--ink-3);line-height:1.45">Foundations to ' +
        after.ground.depth.toFixed(2) + ' m' + (after.ground.piled ? ', piled' : '') +
        '. Region factor ×' + after.regionFactor.toFixed(2) + '.</p>';
    }

    html += '<button class="btn btn-ghost btn-sm" id="rail-reset">Back to the typical job</button>';
    $('rail').innerHTML = html;
  }

  /* ---- render ------------------------------------------------------------------------ */

  function renderMain() {
    var s = view.section;
    if (view.search) { $('main').innerHTML = renderSearch(); return; }
    if (s.indexOf('type:') === 0) { $('main').innerHTML = renderType(s.slice(5)); return; }
    $('main').innerHTML =
      s === 'overview'    ? renderOverview() :
      s === 'foundations' ? renderFoundations() :
      s === 'fees'        ? renderFees() :
      s === 'regions'     ? renderRegions() :
      s === 'commercial'  ? renderCommercial() :
      s === 'data'        ? renderData() :
      s === 'history'     ? renderHistory() : '';
  }

  function refresh() {
    renderTopbar();
    renderNav();
    renderMain();
    renderRail();
  }

  function go(section) {
    view.section = section;
    view.search = '';
    $('search').value = '';
    if (section.indexOf('type:') === 0) view.typeId = section.slice(5);
    refresh();
    $('main').scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  /* =====================================================================
     Events
     ===================================================================== */

  doc.addEventListener('click', function (e) {
    var t = e.target;
    var nav = t.closest('[data-section]');
    if (nav) { go(nav.getAttribute('data-section')); return; }

    var upl = t.closest('[data-uplift]');
    if (upl) { upliftDialog(upl.getAttribute('data-uplift')); return; }

    var add = t.closest('[data-addline]');
    if (add) {
      var tid = add.getAttribute('data-addline');
      edit('Added an item to ' + tid, function (book) {
        var type = RB.typeById(book, tid);
        var n = type.lines.length + 1;
        type.lines.push({
          id: tid + '.item' + n, label: 'New item', detail: '',
          unit: 'per_m2', driver: type.measurements[0].id, rate: 0,
          group: 'trade', source: 'placeholder', enabled: true
        });
      });
      return;
    }

    var del = t.closest('[data-delline]');
    if (del) {
      var lid = del.getAttribute('data-delline');
      edit('Removed ' + lid, function (book) {
        var type = RB.typeById(book, view.typeId);
        type.lines = type.lines.filter(function (l) { return l.id !== lid; });
      });
      toast('Item removed from the draft. Discard the draft to get it back.');
      return;
    }

    if (t.closest('[data-addcouncil]')) {
      edit('Added a council', function (book) {
        book.councils.push({ id: 'c' + Date.now(), name: 'New authority', fee: 1100 });
      });
      return;
    }
    var dc = t.closest('[data-delcouncil]');
    if (dc) {
      var cid = dc.getAttribute('data-delcouncil');
      edit('Removed a council', function (book) {
        book.councils = book.councils.filter(function (c) { return c.id !== cid; });
      });
      return;
    }

    if (t.closest('[data-addregion]')) {
      edit('Added a region', function (book) {
        book.regions.push({ id: 'r' + Date.now(), name: 'New area', factor: 1.00 });
      });
      return;
    }
    var dr = t.closest('[data-delregion]');
    if (dr) {
      var rid = dr.getAttribute('data-delregion');
      edit('Removed a region', function (book) {
        book.regions = book.regions.filter(function (r) { return r.id !== rid; });
        if (book.activeRegion === rid && book.regions[0]) book.activeRegion = book.regions[0].id;
      });
      return;
    }

    var rb = t.closest('[data-rollback]');
    if (rb) {
      STORE.rollback(parseInt(rb.getAttribute('data-rollback'), 10));
      refresh();
      toast('Loaded into the draft. Review it, then publish.');
      return;
    }

    var ex = t.closest('[data-export]');
    if (ex) {
      $('export-out').value = ex.getAttribute('data-export') === 'csv' ? STORE.exportCsv() : STORE.exportJson();
      return;
    }

    if (t.id === 'btn-copy') {
      var out = $('export-out');
      if (!out.value) { toast('Choose a format first.'); return; }
      out.select();
      if (root.navigator.clipboard) {
        root.navigator.clipboard.writeText(out.value).then(function () { toast('Copied.'); },
          function () { toast('Select the text and copy it.'); });
      } else { toast('Select the text and copy it.'); }
      return;
    }

    if (t.id === 'btn-csv-in') {
      var res;
      try { res = STORE.importCsv($('csv-in').value); }
      catch (err) { toast('Could not read that. ' + err.message); return; }
      refresh();
      toast(res.applied.length + ' rates updated' +
        (res.missed.length ? '. Not in the book: ' + res.missed.slice(0, 4).join(', ') +
          (res.missed.length > 4 ? ' and ' + (res.missed.length - 4) + ' more' : '') : '.'));
      return;
    }

    if (t.id === 'btn-json-in') {
      try { STORE.importJson($('json-in').value); }
      catch (err) { toast('That is not a rate book. ' + err.message); return; }
      refresh();
      toast('Loaded into the draft.');
      return;
    }

    if (t.id === 'btn-reset') {
      dialog(
        '<div class="dialog-head"><h3 id="dialog-title">Reset the whole rate book?</h3>' +
        '<p>Every rate, every modifier and the change log go back to how they started. There is no undo.</p></div>' +
        '<div class="dialog-foot"><button class="btn btn-ghost btn-sm" data-close="1">Keep what I have</button>' +
        '<button class="btn btn-sm" id="confirm-reset">Reset everything</button></div>',
        function () {
          $('confirm-reset').addEventListener('click', function () {
            STORE.reset(); view.job = {}; closeDialog(); go('overview'); toast('Back to the opening rate book.');
          });
        });
      return;
    }

    if (t.id === 'rail-reset') { resetJob(view.typeId); renderRail(); return; }
    if (t.id === 'btn-discard') {
      STORE.discard(); refresh(); toast('Draft discarded. You are back on the published book.'); return;
    }
    if (t.id === 'btn-publish') { publishDialog(); return; }
    if (t.closest('[data-close]')) { closeDialog(); return; }
  });

  /* ---- live typing ------------------------------------------------------------------- */

  doc.addEventListener('focusin', function (e) {
    if (e.target.classList && e.target.classList.contains('cell')) {
      e.target.setAttribute('data-was', e.target.value);
    }
  });

  function lineFromRow(book, row) {
    var type = RB.typeById(book, view.typeId);
    var id = row.getAttribute('data-line');
    for (var i = 0; i < type.lines.length; i++) if (type.lines[i].id === id) return type.lines[i];
    return null;
  }

  doc.addEventListener('input', function (e) {
    var t = e.target;

    // rate book lines
    var row = t.closest ? t.closest('[data-line]') : null;
    if (row && t.hasAttribute('data-f')) {
      var f = t.getAttribute('data-f');
      live(function (book) {
        var line = lineFromRow(book, row);
        if (!line) return;
        line[f] = f === 'rate' ? (parseFloat(t.value) || 0) : t.value;
        if (f === 'rate') line.source = 'lee';
      });
      return;
    }

    var sr = t.getAttribute && t.getAttribute('data-searchrate');
    if (sr) {
      live(function (book) {
        book.buildTypes.forEach(function (ty) {
          ty.lines.forEach(function (l) {
            if (l.id === sr) { l.rate = parseFloat(t.value) || 0; l.source = 'lee'; }
          });
        });
      });
      return;
    }

    var mrow = t.closest ? t.closest('[data-mod]') : null;
    if (mrow && t.hasAttribute('data-modopt')) {
      live(function (book) {
        var type = RB.typeById(book, view.typeId);
        (type.modifiers || []).forEach(function (m) {
          if (m.id !== mrow.getAttribute('data-mod')) return;
          m.options.forEach(function (o) {
            if (o.id === t.getAttribute('data-modopt')) o.factor = parseFloat(t.value) || 0;
          });
        });
      });
      return;
    }

    if (t.hasAttribute && t.hasAttribute('data-fnd')) {
      live(function (book) { book.foundations[t.getAttribute('data-fnd')] = parseFloat(t.value) || 0; });
      return;
    }
    if (t.hasAttribute && t.hasAttribute('data-fee')) {
      live(function (book) {
        var path = t.getAttribute('data-fee').split('.');
        book.fees[path[0]][path[1]] = parseFloat(t.value) || 0;
        book.fees[path[0]].source = 'lee';
      });
      return;
    }
    if (t.hasAttribute && t.hasAttribute('data-comm')) {
      live(function (book) {
        var path = t.getAttribute('data-comm').split('.');
        var v = t.value === 'true' ? true : t.value === 'false' ? false : (parseFloat(t.value) || 0);
        if (path.length === 1) book.commercial[path[0]] = v;
        else book.commercial[path[0]][path[1]] = v;
      });
      return;
    }

    var crow = t.closest ? t.closest('[data-council]') : null;
    if (crow && t.hasAttribute('data-cf')) {
      live(function (book) {
        book.councils.forEach(function (c) {
          if (c.id !== crow.getAttribute('data-council')) return;
          var k = t.getAttribute('data-cf');
          c[k] = k === 'fee' ? (parseFloat(t.value) || 0) : t.value;
        });
      });
      return;
    }
    var rrow = t.closest ? t.closest('[data-region]') : null;
    if (rrow && t.hasAttribute('data-rf')) {
      live(function (book) {
        book.regions.forEach(function (r) {
          if (r.id !== rrow.getAttribute('data-region')) return;
          var k = t.getAttribute('data-rf');
          r[k] = k === 'factor' ? (parseFloat(t.value) || 0) : t.value;
        });
      });
      return;
    }

    // rail
    if (t.hasAttribute && t.hasAttribute('data-meas')) {
      jobFor(view.typeId).measurements[t.getAttribute('data-meas')] = parseFloat(t.value) || 0;
      var m = RB.typeById(STORE.draft(), view.typeId).measurements;
      var j = jobFor(view.typeId);
      // keep derived measurements honest
      m.forEach(function (x) {
        if (x.id === 'perimeter' && j.measurements.floorArea) {
          j.measurements.perimeter = Math.round(4 * Math.sqrt(j.measurements.floorArea) * 10) / 10;
        }
      });
      renderRail();
      return;
    }
    if (t.hasAttribute && t.hasAttribute('data-modsel')) {
      jobFor(view.typeId).modifiers[t.getAttribute('data-modsel')] = t.value;
      renderRail();
      return;
    }
  });

  // commit the change to the log once someone has finished typing
  doc.addEventListener('change', function (e) {
    var t = e.target;

    if (t.hasAttribute && t.hasAttribute('data-toggle-type')) {
      var tid = t.getAttribute('data-toggle-type');
      edit((t.checked ? 'Made ' : 'Hid ') + tid + (t.checked ? ' available to clients' : ' from clients'), function (book) {
        RB.typeById(book, tid).enabled = t.checked;
      });
      return;
    }
    if (t.hasAttribute && t.hasAttribute('data-activeregion')) {
      var rid = t.getAttribute('data-activeregion');
      edit('Default region changed', function (book) { book.activeRegion = rid; });
      return;
    }

    if (t.classList && t.classList.contains('cell')) {
      var was = t.getAttribute('data-was');
      if (was !== null && was !== t.value) {
        var label = t.getAttribute('aria-label') || 'A rate';
        STORE.change(label + ' changed', function () {}, { from: was, to: t.value });
      }
      refresh();
      return;
    }
    if (t.hasAttribute && (t.hasAttribute('data-fnd') || t.hasAttribute('data-fee') ||
        t.hasAttribute('data-comm'))) {
      STORE.change((t.previousElementSibling && t.previousElementSibling.textContent) || 'Setting changed', function () {});
      refresh();
    }
  });

  $('search').addEventListener('input', function () {
    view.search = this.value.trim();
    renderMain();
  });

  /* ---- dialogs -------------------------------------------------------------------- */

  function upliftDialog(typeId) {
    var name = typeId === 'all' ? 'every build type' : RB.typeById(STORE.draft(), typeId).name;
    dialog(
      '<div class="dialog-head"><h3 id="dialog-title">Uplift every rate in ' + esc(name) + '</h3>' +
      '<p>The annual increase, in one go. It lands in the draft, so you can look at what it does before anyone sees it.</p></div>' +
      '<div class="dialog-body"><div class="fields">' +
      '<div class="field"><label for="uplift-pct">Increase by</label>' +
      '<input id="uplift-pct" type="number" step="0.5" value="4"><span class="hint">Per cent. A negative number brings rates down.</span></div>' +
      '<div class="field"><label for="uplift-scope">Applies to</label><select id="uplift-scope">' +
      '<option value="' + typeId + '">' + esc(name) + '</option><option value="all">Every build type</option>' +
      '</select></div></div></div>' +
      '<div class="dialog-foot"><button class="btn btn-ghost btn-sm" data-close="1">Cancel</button>' +
      '<button class="btn btn-sm" id="confirm-uplift">Apply to the draft</button></div>',
      function () {
        $('confirm-uplift').addEventListener('click', function () {
          var p = parseFloat($('uplift-pct').value) / 100;
          if (isNaN(p)) { toast('Put a number in.'); return; }
          var n = STORE.bulkUplift(p, $('uplift-scope').value);
          closeDialog(); refresh();
          toast(n + ' rates moved by ' + (p * 100).toFixed(1) + '%. Nothing is live until you publish.');
        });
      });
  }

  function publishDialog() {
    var changes = STORE.impact().filter(function (c) { return Math.abs(c.delta) > 0.5; });
    var rows = changes.length
      ? '<div class="tablewrap"><table class="grid-table" style="min-width:0"><thead><tr>' +
        '<th>Build type</th><th class="right">Now</th><th class="right">After</th><th class="right">Change</th>' +
        '</tr></thead><tbody>' +
        changes.map(function (c) {
          return '<tr><td>' + esc(c.name) + '</td><td class="right num">' + money(c.before) + '</td>' +
            '<td class="right num">' + money(c.after) + '</td>' +
            '<td class="right num ' + (c.delta > 0 ? 'delta-up' : 'delta-down') + '">' +
            signed(c.delta) + ' (' + (c.delta > 0 ? '+' : '−') + pct(Math.abs(c.pct)) + ')</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p style="font-size:.86rem;color:var(--ink-2)">No worked example moves. The changes are to items or settings these examples do not touch.</p>';

    dialog(
      '<div class="dialog-head"><h3 id="dialog-title">Publish this rate book</h3>' +
      '<p>This is what happens to a typical job of each kind the moment you publish. Quotes already given keep the version they were priced on.</p></div>' +
      '<div class="dialog-body">' + rows +
      '<div class="field"><label for="pub-label">Name this version</label>' +
      '<input id="pub-label" value="Rate book v' + ((STORE.published().version || 1) + 1) + '" placeholder="What changed?"></div>' +
      '</div>' +
      '<div class="dialog-foot"><button class="btn btn-ghost btn-sm" data-close="1">Not yet</button>' +
      '<button class="btn btn-sm" id="confirm-publish">Publish</button></div>',
      function () {
        $('confirm-publish').addEventListener('click', function () {
          STORE.publish($('pub-label').value.trim());
          closeDialog(); refresh();
          toast('Published. The estimator is using these rates now.');
        });
      });
  }

  /* ---- go ---------------------------------------------------------------------------- */

  refresh();
})(window, document);
