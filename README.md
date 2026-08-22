# Datum

Concept front end for an extension pricing and delivery platform, built for
L Todd Construction.

A homeowner drags out the extension they want, answers six questions, and gets an
itemised range — foundations, drawings, fees, contingency, margin and VAT all on
the face of it. That price then goes to vetted builders who accept it or pass,
rather than bidding each other down.

**This is a demonstration.** Every rate is a placeholder pending a quantity
surveyor's schedule, and the foundation table is a draft. See
[`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md) — it is also the list of open
questions.

Two screens:

- **`index.html`** — the landing page and the estimator. The hero is a section
  through the ground with one datum line that never moves; the estimator is
  four questions on four routed pages, then the result.
- **`admin.html`** — Lee's rate book. Every figure the estimator uses, for all
  five build types, editable with a live worked example and a
  draft-then-publish flow.

Routes (hash-based, so it runs from a single file anywhere):

| Route | What it is |
|---|---|
| `#/` | Landing — hero section, the descent, how it works, builders |
| `#/size` `#/build` `#/ground` `#/inside` | One question per page, drawing persists |
| `#/estimate` | The range, the cost stack and the itemised breakdown |

## Running it

No build step, no dependencies, no framework.

```
open index.html          # the client estimator
open admin.html          # the rate book
node build.mjs           # → dist/, self-contained single files
```

`node build.mjs` emits three targets, each inlined into one file with no
external assets:

| Output | What it is |
|---|---|
| `dist/index.html` | The client estimator on its own |
| `dist/admin.html` | The rate book on its own |
| `dist/demo.html` | Both in one document with a view switcher, so a rate edited in the book visibly moves the client's price |

Deployed properly these are two pages on one domain and share storage anyway.
`demo.html` exists so the whole story works from a single link.

## Layout

| File | What it is |
|---|---|
| `src/ratebook.js` | **The rate book.** All five build types, their priced items, modifiers and worked examples, plus the generic pricer both screens use. |
| `src/store.js` | Draft and published books, change log, version history, CSV and JSON import and export. Persists to localStorage. |
| `src/admin.js` | The rate book interface. |
| `src/rates.js` | A thin live view of the published book, for the estimator. |
| `src/trees.js` | Species table, soil types, and the NHBC-shaped foundation depth logic. |
| `src/engine.js` | Pure pricing functions. Spec in, itemised estimate out. No DOM — this moves to a server unchanged. |
| `src/iso.js` | The isometric drawing. Everything on screen is projected from the same metres the price uses. |
| `src/router.js` | Hash routing between the landing, the four steps and the result. |
| `src/hero.js` | The hero section drawing plots itself in from the datum outwards, then the scroll descent. GSAP. |
| `src/flow.js` | The steps, the persistent drawing and its camera, and the result. |
| `vendor/` | GSAP 3.15 and ScrollTrigger, inlined at build time. Standard no-charge licence. |
| `assets/styles.css` | Design tokens and layout. Light and dark. |
| `build.mjs` | Inlines the above into `dist/`. |

## Changing the numbers

Open `admin.html`. Everything is editable there — rates, modifiers, foundation
settings, fees, councils, regions and commercial terms — with a worked example
recalculating beside you and an impact summary before anything goes live.

Defaults live in `src/ratebook.js` if you would rather edit code. Nothing is
hard-coded anywhere else. When the QS spreadsheet arrives, paste it into the
CSV importer.

The single most consequential setting is `marginIncludedInRates`. It decides
whether Lee's rates are trade cost with 15% added on top, or a selling price with
the margin already inside. It currently reads them as cost. See section 2 of the
assumptions.

## Scope

**The rate book covers all five build types:** extensions, renovations, loft
conversions, new builds, and patios and outdoor work. 44 priced items in total,
of which 37 are still placeholders waiting on real rates — the admin counts
them for you and stops calling a figure a placeholder the moment Lee types over
it.

**The client estimator covers extensions only.** Single storey, with wall
construction, bi-folds, wall removal, trees and foundation depth, kitchen
fitting and bathrooms. The other four build types are priced and configurable
but do not yet have a public question flow.

**Not modelled yet, and said so on the page:** party wall awards, site access,
drains in the footprint, roof glazing, heating and electrics, decoration, floor
finishes, planning route.
