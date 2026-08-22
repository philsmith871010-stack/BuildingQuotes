/*
 * Datum — router
 * ---------------------------------------------------------------------------
 * Hash routing, so the estimator is a sequence of real pages with real URLs
 * you can go back through, while the whole thing still runs from a single
 * file on any static host.
 */
(function (root, doc) {
  'use strict';

  var ROUTES = {
    '/':         { view: 'view-landing' },
    '/size':     { view: 'view-flow',     step: 'size' },
    '/build':    { view: 'view-flow',     step: 'build' },
    '/ground':   { view: 'view-flow',     step: 'ground' },
    '/inside':   { view: 'view-flow',     step: 'inside' },
    '/estimate': { view: 'view-estimate', step: 'estimate' }
  };

  var listeners = [];
  var current = null;

  function path() {
    var h = root.location.hash.replace(/^#/, '');
    if (!h || h.charAt(0) !== '/') return '/';
    return ROUTES[h] ? h : '/';
  }

  function apply() {
    var p = path();
    var route = ROUTES[p];
    if (current === p) return;
    current = p;

    Object.keys(ROUTES).forEach(function (k) {
      var el = doc.getElementById(ROUTES[k].view);
      if (el) el.classList.toggle('on', ROUTES[k].view === route.view);
    });

    // An in-page anchor on the landing page keeps its own scroll position.
    if (!root.location.hash || root.location.hash.charAt(1) === '/') {
      root.scrollTo(0, 0);
    }

    listeners.forEach(function (fn) { fn(p, route); });
  }

  function go(p) {
    if (root.location.hash === '#' + p) apply();
    else root.location.hash = p;
  }

  root.addEventListener('hashchange', function () {
    // section anchors like #how are not routes; leave them alone
    var h = root.location.hash.replace(/^#/, '');
    if (h && h.charAt(0) !== '/') return;
    apply();
  });

  root.DATUM = root.DATUM || {};
  root.DATUM.ROUTER = {
    on: function (fn) { listeners.push(fn); },
    go: go,
    start: apply,
    path: path,
    routes: ROUTES
  };
})(window, document);
