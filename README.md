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
| `#/start` | Choosing what you are building |
| `#/<type>/<step>` | One question per page, drawing alongside |
| `#/<type>/estimate` | The range, the cost stack and the itemised breakdown |

**A project can be several build types at once.** An extension *and* a loft *and*
a refurbishment is one job, not three: the building work adds up, but you pay
for one survey, one set of drawings, one engineer and one building control
application. `priceProject()` does that, and the estimate shows what the same
work would have cost bought separately — about £7,800 more on a typical
three-part job.

**The plan is one house across several floors.** Ground, first and loft, drawn
with real plan conventions — wall thickness, door swings, stairs, windows,
party wall — with the work marked on whichever floor it belongs to. The
extension appears on the ground floor, the loft conversion on the loft, the
refurbishment tinted across the rooms it touches.

**The questions come out of the rate book.** Each measurement carries homeowner
wording (`ask`) and each build type groups them into steps. Add a build type in
the admin, give its measurements wording, and its public flow appears with no
code written. The wording itself is editable in the admin too.

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
| `src/draw2d.js` | Plans and sections. Each build type contributes both; the flow shows whichever answers the question being asked. |
| `src/router.js` | Hash routing between the landing, the four steps and the result. |
| `src/hero.js` | The hero section drawing plots itself in from the datum outwards, then the scroll descent. GSAP. |
| `src/flow.js` | The steps, the persistent drawing and its camera, and the result. |
| `src/trace.js` | Trace a floor plan: raster to wall mask, calibration, room picking, areas. |
| `src/plan-sample.js` | The sample plan, authored as SVG and rasterised in the browser so the trace path is the real one. |
| `vendor/gsap*` | GSAP 3.15 and ScrollTrigger, inlined at build time. Standard no-charge licence. |
| `vendor/opentakeoff/` | Flood fill and contour tracing from [OpenTakeoff](https://github.com/Kentucky-ai/opentakeoff), Apache-2.0. LICENSE, NOTICE and a statement of changes are alongside it. |
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

**All five build types have a public flow.** Extensions, renovations, loft
conversions, new builds, and patios and outdoor work — 18 question pages
between them, all generated from the rate book.

**Drawings are plans and sections, not isometric.** Only an extension suits an
isometric; a loft conversion is entirely about head height under a pitched
roof, a renovation starts from a floor plan, and a garden is a layout. Setting
out is a plan, consequences are a section, and the drawing switches to whichever
answers the current question.

The renovation plan shows what the drawing looks like **after** a client has
uploaded their floor plan and traced it: the scan sits underneath, slightly out
of square the way a photographed plan always is, with the trace over the top.
One wall carries the dimension they typed in, and that single number scales
every other measurement on the drawing. Change the floor area and the plan
rescales, so the drawing can never contradict the figure being priced.

**The trace tool is built.** On the renovation step, "Trace my plan" opens the
client's floor plan, they drag a line along a wall whose length is printed on
it and type that length, then click inside each room. Every room is flooded,
outlined and measured, and the total is written back into the estimate.

It needs no AI and nothing leaves the browser. The image is rasterised to a
canvas, dark pixels become a wall mask, and OpenTakeoff's flood fill and
contour tracing (Apache-2.0, vendored in `vendor/opentakeoff` with its LICENSE
and NOTICE) turn a click into a polygon. Areas come out of the shoelace
formula.

Measured against the sample plan, calibration recovers the true scale exactly
(1 m = 70.0 px) and the four rooms come to 74.5 m² against an 79.8 m² external
footprint — the difference being wall thickness, since rooms are correctly
measured to internal faces.

**Not modelled yet, and said so on the page:** party wall awards, site access,
drains in the footprint, roof glazing, heating and electrics, decoration, floor
finishes, planning route.

**Not modelled yet, and said so on the page:** party wall awards, site access,
drains in the footprint, roof glazing, heating and electrics, decoration, floor
finishes, planning route.
