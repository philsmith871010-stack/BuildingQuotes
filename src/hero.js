/*
 * Datum — hero
 * ---------------------------------------------------------------------------
 * The hero is a section through the ground. One datum line holds still and
 * everything else is measured against it, so the drawing plots itself in
 * from that line outwards: ground, then the house, then the new work, then
 * how far down it actually has to go, then the reason why.
 */
(function (root, doc) {
  'use strict';

  var gsap = root.gsap;
  var reduced = root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Prepare an SVG shape to be drawn on, and return its length. */
  function dash(el) {
    var len;
    try { len = el.getTotalLength(); } catch (e) { len = 0; }
    if (!len) return 0;
    el.style.strokeDasharray = len;
    el.style.strokeDashoffset = len;
    return len;
  }

  function drawables(sel) {
    return Array.prototype.slice.call(doc.querySelectorAll(sel))
      .filter(function (el) { return dash(el) > 0; });
  }

  function intro() {
    var datum = doc.getElementById('h-datum');
    var ground = doc.getElementById('h-ground');
    var house = drawables('#h-house path, #h-found-old path');
    var ext = drawables('#h-ext path');
    var found = drawables('#h-found-new path');
    var tree = drawables('#h-tree path, #h-tree circle');
    var roots = drawables('#h-roots path');
    var ticks = drawables('#h-levels line');
    var labels = Array.prototype.slice.call(doc.querySelectorAll('#h-levels text'));
    var lines = Array.prototype.slice.call(doc.querySelectorAll('.hero-title .ln > span'));
    var chrome = ['#hero-eyebrow', '#hero-sub', '#hero-cta', '#hero-foot']
      .map(function (s) { return doc.querySelector(s); }).filter(Boolean);

    if (reduced || !gsap) {
      [].concat(house, ext, found, tree, roots, ticks).forEach(function (el) {
        el.style.strokeDashoffset = 0;
      });
      if (datum) { dash(datum); datum.style.strokeDashoffset = 0; }
      if (ground) ground.style.opacity = 1;
      labels.forEach(function (l) { l.style.opacity = 1; });
      lines.forEach(function (l) { l.style.transform = 'none'; });
      chrome.forEach(function (c) { c.style.opacity = 1; });
      return;
    }

    dash(datum);
    labels.forEach(function (l) { l.style.opacity = 0; });
    gsap.set(lines, { yPercent: 108 });
    gsap.set(chrome, { opacity: 0, y: 14 });

    var tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    // 1. the datum, before anything else exists
    tl.to(datum, { strokeDashoffset: 0, duration: .8, ease: 'power2.inOut' })
      // 2. the headline arrives across it
      .to(lines, { yPercent: 0, duration: .8, stagger: .07, ease: 'expo.out' }, '-=0.45')
      // 3. ground, and the levels it is measured against
      .to(ground, { opacity: 1, duration: .7 }, '-=0.7')
      .to(ticks, { strokeDashoffset: 0, duration: .35, stagger: .05 }, '-=0.55')
      .to(labels, { opacity: 1, duration: .3, stagger: .05 }, '-=0.45')
      // 4. what is already there
      .to(house, { strokeDashoffset: 0, duration: .6, stagger: .035 }, '-=0.7')
      // 5. what is being added
      .to(ext, { strokeDashoffset: 0, duration: .5, stagger: .04 }, '-=0.3')
      // 6. how far down it has to go
      .to(found, { strokeDashoffset: 0, duration: .6, stagger: .07, ease: 'power3.inOut' }, '-=0.15')
      // 7. and the reason
      .to(tree, { strokeDashoffset: 0, duration: .55, stagger: .05 }, '-=0.45')
      .to(roots, { strokeDashoffset: 0, duration: .8, stagger: .07, ease: 'power1.inOut' }, '-=0.35')
      .to(chrome, { opacity: 1, y: 0, duration: .5, stagger: .07 }, '-=1.0');

    return tl;
  }

  /* ---- the descent ------------------------------------------------------ */

  function descent() {
    var strata = Array.prototype.slice.call(doc.querySelectorAll('.stratum'));
    var rail = doc.getElementById('gauge-rail');
    if (!strata.length) return;

    if (rail) {
      rail.innerHTML = strata.map(function (s) {
        return '<span data-level="' + s.getAttribute('data-level') + '">' +
          s.getAttribute('data-level') + '</span>';
      }).join('');
    }

    if (reduced || !gsap || !root.ScrollTrigger) {
      strata.forEach(function (s) { s.style.opacity = 1; });
      return;
    }

    gsap.registerPlugin(root.ScrollTrigger);

    strata.forEach(function (s, i) {
      gsap.from(s.children, {
        opacity: 0, y: 26, duration: .8, stagger: .12, ease: 'power2.out',
        scrollTrigger: { trigger: s, start: 'top 78%', once: true }
      });
      root.ScrollTrigger.create({
        trigger: s, start: 'top 60%', end: 'bottom 40%',
        onToggle: function (self) {
          if (!rail) return;
          var mark = rail.children[i];
          if (mark) mark.classList.toggle('hit', self.isActive);
        }
      });
    });

    // the gauge only makes sense while you are inside the descent
    root.ScrollTrigger.create({
      trigger: '#descent', start: 'top 60%', end: 'bottom 40%',
      onToggle: function (self) { if (rail) rail.classList.toggle('on', self.isActive); }
    });

    // the datum line holds while the ground moves past it
    var svg = doc.getElementById('hero-svg');
    if (svg) {
      gsap.to('#h-ground', {
        yPercent: 6, ease: 'none',
        scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: .6 }
      });
      gsap.to('#h-tree, #h-roots', {
        yPercent: 3, ease: 'none',
        scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: .9 }
      });
    }
  }

  /* ---- live figures in the hero footer ----------------------------------- */

  function readout() {
    var D = root.DATUM;
    if (!D || !D.estimate) return;
    var r = D.estimate({
      width: 5, depth: 4, wallType: 'brick', bifoldWidth: 3, wallRemoval: 3,
      kitchen: true, bathrooms: 0, soil: 'high',
      trees: [{ species: 'oak', distance: 8 }], answered: 0
    });
    var set = function (id, v) { var el = doc.getElementById(id); if (el) el.textContent = v; };
    set('hf-area', r.area.toFixed(1) + ' m²');
    set('hf-depth', '−' + r.ground.depth.toFixed(3) + ' m');
    set('hf-price', '£' + Math.round(r.low / 500) * 500 / 1000 + 'k—£' +
      Math.round(r.high / 500) * 500 / 1000 + 'k');
  }

  /* The full section is a wide drawing. On a narrow screen, frame the half
     that carries the argument — new work, foundations, tree — so the level
     annotations stay readable instead of shrinking to nothing. */
  function frame() {
    var svg = doc.getElementById('hero-svg');
    if (!svg) return;
    var narrow = root.matchMedia('(max-width: 900px)').matches;
    svg.setAttribute('viewBox', narrow ? '900 40 700 760' : '0 0 1600 900');
  }

  function start() {
    frame();
    root.addEventListener('resize', frame);
    readout();
    intro();
    descent();
  }

  root.DATUM = root.DATUM || {};
  root.DATUM.HERO = { start: start };
})(window, document);
