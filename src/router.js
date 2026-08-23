/*
 * Datum — router
 * ---------------------------------------------------------------------------
 * Real URLs for every question, so the back button works and a half-finished
 * estimate can be linked to. Hash-based, so the whole thing still runs from a
 * single file on any static host.
 *
 *   #/                    the landing page
 *   #/start               choosing what you are building
 *   #/<type>/<step>       one question page
 *   #/<type>/estimate     the result
 */
(function (root, doc) {
  'use strict';

  var VIEWS = ['view-landing', 'view-start', 'view-flow', 'view-estimate'];
  var listeners = [];
  var current = '';

  function book() { return root.DATUM.STORE.published(); }

  function typeOf(id) {
    var t = root.DATUM.RATEBOOK.typeById(book(), id);
    return t && t.enabled ? t : null;
  }

  function parse() {
    var h = root.location.hash.replace(/^#/, '');
    if (!h || h.charAt(0) !== '/') return { name: 'landing', path: '/' };

    var parts = h.split('/').filter(Boolean);
    if (!parts.length) return { name: 'landing', path: '/' };
    if (parts[0] === 'start') return { name: 'start', path: '/start' };
    if (parts[0] === 'estimate') return { name: 'estimate', path: '/estimate' };

    var type = typeOf(parts[0]);
    if (!type) return { name: 'start', path: '/start' };

    var step = parts[1];
    if (step === 'estimate') return { name: 'estimate', path: '/estimate' };
    var found = null;
    (type.steps || []).forEach(function (s) { if (s.id === step) found = s; });
    if (!found) found = (type.steps || [])[0];
    if (!found) return { name: 'start', path: '/start' };

    return { name: 'step', typeId: type.id, type: type, step: found,
             path: '/' + type.id + '/' + found.id };
  }

  function viewFor(name) {
    return name === 'landing' ? 'view-landing'
         : name === 'start' ? 'view-start'
         : name === 'estimate' ? 'view-estimate' : 'view-flow';
  }

  function apply() {
    var r = parse();
    if (current === r.path) return;
    current = r.path;

    var target = viewFor(r.name);
    VIEWS.forEach(function (id) {
      var el = doc.getElementById(id);
      if (el) el.classList.toggle('on', id === target);
    });

    if (!root.location.hash || root.location.hash.charAt(1) === '/') root.scrollTo(0, 0);
    listeners.forEach(function (fn) { fn(r); });
  }

  root.addEventListener('hashchange', function () {
    var h = root.location.hash.replace(/^#/, '');
    if (h && h.charAt(0) !== '/') return;   // in-page anchors are not routes
    apply();
  });

  root.DATUM = root.DATUM || {};
  root.DATUM.ROUTER = {
    on: function (fn) { listeners.push(fn); },
    go: function (p) { if (root.location.hash === '#' + p) apply(); else root.location.hash = p; },
    start: apply,
    parse: parse
  };
})(window, document);
