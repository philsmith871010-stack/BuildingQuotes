/*
 * Datum — rate book store
 * ---------------------------------------------------------------------------
 * Draft and published, with a change log.
 *
 * A quote is priced against a PUBLISHED book. Lee edits a DRAFT, sees what it
 * would do to a typical job, and publishes when he is happy. Live jobs keep the
 * version they were priced on, so nobody's quote moves under them.
 *
 * Persistence is localStorage — this is a demonstration. Swapping it for an API
 * means replacing read() and write().
 */
(function (root) {
  'use strict';

  var RB = root.DATUM.RATEBOOK;
  var KEY = 'datum.ratebook.v1';

  /* Bumped whenever the SHAPE of the book changes — new build types, new steps,
     new question wording. A stored book from an older shape is rebuilt from the
     current defaults with the rates carried across, so nobody is left on a
     structure the app no longer understands. */
  var SCHEMA = 2;

  function now() { return new Date().toISOString(); }

  function blank() {
    var book = RB.defaultBook();
    return {
      schema: SCHEMA,
      published: JSON.parse(JSON.stringify(book)),
      draft: JSON.parse(JSON.stringify(book)),
      dirty: false,
      log: [{ at: now(), who: 'Datum', what: 'Opening rate book created', kind: 'publish' }],
      history: []
    };
  }

  /** Rebuild on the current structure, keeping every rate that still exists. */
  function migrate(old) {
    var fresh = blank();
    try {
      var kept = {};
      ((old.published && old.published.buildTypes) || []).forEach(function (t) {
        (t.lines || []).forEach(function (l) { kept[l.id] = l; });
      });
      ['published', 'draft'].forEach(function (k) {
        fresh[k].buildTypes.forEach(function (t) {
          t.lines.forEach(function (l) {
            var was = kept[l.id];
            if (!was) return;
            l.rate = was.rate;
            l.source = was.source;
            l.enabled = was.enabled !== false;
          });
        });
        if (old.published && old.published.commercial) fresh[k].commercial = old.published.commercial;
        if (old.published && old.published.fees) fresh[k].fees = old.published.fees;
        if (old.published && old.published.foundations) fresh[k].foundations = old.published.foundations;
      });
      fresh.log = (old.log || []).slice(0, 200);
      fresh.log.unshift({ at: now(), who: 'Datum', kind: 'edit',
        what: 'Rate book structure updated. Your rates were carried across.' });
    } catch (e) { /* a fresh book is better than a broken one */ }
    return write(fresh);
  }

  function read() {
    try {
      var raw = root.localStorage.getItem(KEY);
      if (!raw) return blank();
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.draft || !parsed.published) return blank();
      if (parsed.schema !== SCHEMA) return migrate(parsed);
      return parsed;
    } catch (e) {
      return blank();
    }
  }

  function write(state) {
    try { root.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    return state;
  }

  var state = read();

  /* ---- reading -------------------------------------------------------- */

  function draft() { return state.draft; }
  function published() { return state.published; }
  function isDirty() { return !!state.dirty; }
  function log() { return state.log; }
  function history() { return state.history; }

  /* ---- editing --------------------------------------------------------- */

  /**
   * Record a change against the draft. `apply` mutates the draft; everything
   * else is bookkeeping so the change log stays truthful.
   */
  function change(description, apply, meta) {
    apply(state.draft);
    state.dirty = true;
    state.log.unshift({
      at: now(), who: 'Lee', what: description, kind: 'edit',
      from: meta && meta.from, to: meta && meta.to
    });
    if (state.log.length > 300) state.log.length = 300;
    write(state);
  }

  function discard() {
    state.draft = JSON.parse(JSON.stringify(state.published));
    state.dirty = false;
    state.log.unshift({ at: now(), who: 'Lee', what: 'Draft discarded, back to the published book', kind: 'discard' });
    write(state);
  }

  /** What publishing the draft would do to each build type's worked example. */
  function impact() {
    var out = [];
    state.published.buildTypes.forEach(function (t) {
      var before = RB.priceTypical(state.published, t.id);
      var after = RB.priceTypical(state.draft, t.id);
      if (!before || !after) return;
      out.push({
        id: t.id, name: t.name, label: t.typical && t.typical.label,
        before: before.incVat, after: after.incVat,
        delta: after.incVat - before.incVat,
        pct: before.incVat ? (after.incVat - before.incVat) / before.incVat : 0
      });
    });
    return out;
  }

  function publish(label) {
    var changes = impact();
    state.history.unshift({
      at: now(), version: state.published.version,
      label: state.published.label,
      book: JSON.parse(JSON.stringify(state.published))
    });
    if (state.history.length > 20) state.history.length = 20;

    state.draft.version = (state.published.version || 1) + 1;
    state.draft.label = label || ('Rate book v' + state.draft.version);
    state.published = JSON.parse(JSON.stringify(state.draft));
    state.dirty = false;
    state.log.unshift({
      at: now(), who: 'Lee', kind: 'publish',
      what: 'Published ' + state.draft.label,
      impact: changes.filter(function (c) { return Math.abs(c.pct) > 0.0005; })
    });
    write(state);
    return changes;
  }

  function rollback(index) {
    var entry = state.history[index];
    if (!entry) return false;
    state.draft = JSON.parse(JSON.stringify(entry.book));
    state.dirty = true;
    state.log.unshift({ at: now(), who: 'Lee', kind: 'edit',
      what: 'Draft reset to ' + (entry.label || ('v' + entry.version)) });
    write(state);
    return true;
  }

  function reset() {
    state = blank();
    write(state);
  }

  /* ---- moving the whole book at once ------------------------------------ */

  /** Annual uplift. Every builder wants this and nobody builds it. */
  function bulkUplift(pct, scope) {
    var n = 0;
    change('Uplifted ' + (scope === 'all' ? 'every rate' : scope) + ' by ' + (pct * 100).toFixed(1) + '%', function (book) {
      book.buildTypes.forEach(function (t) {
        if (scope !== 'all' && scope !== t.id) return;
        t.lines.forEach(function (l) {
          l.rate = Math.round(l.rate * (1 + pct));
          n++;
        });
      });
    });
    return n;
  }

  function exportJson() {
    return JSON.stringify({ exported: now(), book: state.draft }, null, 2);
  }

  function importJson(text) {
    var parsed = JSON.parse(text);
    var book = parsed.book || parsed;
    if (!book.buildTypes || !book.commercial) throw new Error('That file is not a Datum rate book.');
    change('Imported a rate book', function () {});
    state.draft = book;
    write(state);
    return true;
  }

  /**
   * Import rates from a QS spreadsheet saved as CSV.
   * Expected columns: line id, rate. Anything else is ignored, and any id that
   * is not in the book is reported back rather than silently dropped.
   */
  function importCsv(text) {
    var rows = text.split(/\r?\n/).filter(function (r) { return r.trim(); });
    var applied = [], missed = [];
    var index = {};
    state.draft.buildTypes.forEach(function (t) {
      t.lines.forEach(function (l) { index[l.id.toLowerCase()] = l; });
    });

    rows.forEach(function (row, i) {
      var cells = row.split(',').map(function (c) { return c.trim().replace(/^"|"$/g, ''); });
      if (i === 0 && isNaN(parseFloat(cells[1]))) return;   // header
      var id = (cells[0] || '').toLowerCase();
      var rate = parseFloat((cells[1] || '').replace(/[£,]/g, ''));
      if (!id || isNaN(rate)) return;
      if (index[id]) {
        index[id].rate = rate;
        index[id].source = 'lee';
        applied.push(id);
      } else {
        missed.push(cells[0]);
      }
    });

    if (applied.length) {
      state.dirty = true;
      state.log.unshift({ at: now(), who: 'Lee', kind: 'edit',
        what: 'Imported ' + applied.length + ' rates from a spreadsheet' });
      write(state);
    }
    return { applied: applied, missed: missed };
  }

  function exportCsv() {
    var rows = ['line id,rate,build type,item,unit,source'];
    state.draft.buildTypes.forEach(function (t) {
      t.lines.forEach(function (l) {
        rows.push([l.id, l.rate, '"' + t.name + '"', '"' + l.label + '"',
                   RB.UNITS[l.unit].label, l.source].join(','));
      });
    });
    return rows.join('\n');
  }

  root.DATUM.STORE = {
    draft: draft, published: published, isDirty: isDirty,
    log: log, history: history,
    change: change, discard: discard, publish: publish, rollback: rollback,
    impact: impact, bulkUplift: bulkUplift, reset: reset,
    exportJson: exportJson, importJson: importJson,
    importCsv: importCsv, exportCsv: exportCsv
  };
})(window);
