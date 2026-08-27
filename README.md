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
conversions, new builds, and patios and outdoor work. 53 priced items in total,
of which 46 are still placeholders waiting on real rates — the admin counts
them for you and stops calling a figure a placeholder the moment Lee types over
it.

**All five build types have a public flow.** Extensions, renovations, loft
conversions, new builds, and patios and outdoor work — 18 question pages
between them, all generated from the rate book.

**Renovations are priced a room at a time.** A refurbishment is never one
intensity spread over a whole house — the kitchen goes back to brick, the
bedrooms get a skim and a coat, the hall gets painted. Pricing that off a single
"floor area treated" figure is wrong for almost every real job.

So the renovation flow asks **one question per room**, with four answers: leave
it, decorate, refit, or strip out. Each level switches a bundle of trade lines
on for that room, and every row carries its own price, because a figure per room
is what makes a client believe the total.

Room areas are never asked for. The total is measured from the sketch or the
trace; each room takes a share of it weighted by what kind of room it is. An
individual room will be out; across a house the errors cancel.

Everything that is genuinely bought once for the whole house — the consumer
unit, the boiler, structural openings, windows, external doors, the roof — sits
on its own page, six questions long. The whole flow is **fewer** questions than
the version it replaced, and produces a room-by-room breakdown instead of one
number.

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

**Drawing the house is step one of the flow**, not a box on a later page. The
chooser's primary action is "Next — draw your house", it has its own URL at
`#/draw` and its own place on the step rail, and finishing it moves you on with
every figure it can set already set. There is a quiet way past for anyone who
would rather type the measurements.

**The drawing tool is the part of this worth owning.** One idea: **you draw the shape, then measure it
once.** Nothing on screen is in metres while you draw. You trace round the
outside on a plain grid — blank, or over your own uploaded floor plan — close
it, and type the length of one wall you happen to know. That single number
scales every other wall, floor and area on the drawing.

Six stages in the order a builder walks a house: outline (per floor, copy the
one below or draw a new one) → inside walls → doors → windows → a pin per room →
the extension. Drawing an extension is how you say you want one: it selects the
extension build type and sizes it.

It writes floor area, perimeter, internal wall runs, the plaster area net of
openings, and the room list into the estimate. See `docs/sketch-tool.md`.

**Automatic tracing is still there** as a subordinate option, for anyone with a
clean estate agent plan. On the renovation step, the link under the two cards opens the
client's floor plan, they drag a line along a wall whose length is printed on
it and type that length, then click inside each room. Every room is flooded,
outlined and measured, and the total is written back into the estimate.

It needs no AI and nothing leaves the browser. The image is rasterised to a
canvas, dark pixels become a wall mask, and OpenTakeoff's flood fill and
contour tracing (Apache-2.0, vendored in `vendor/opentakeoff` with its LICENSE
and NOTICE) turn a click into a polygon. Areas come out of the shoelace
formula.

Measured against the sample plan, calibration recovers the true scale exactly
(1 m = 70.0 px), and rooms come out to internal faces — 22.6 m² for a living
room whose gross size is 5.0 × 4.8 m, the difference being wall thickness,
which is the figure a refurbishment is priced on.

**Doorways.** Most plans draw openings as holes, so a flood escapes through them
and swallows the floor. Morphological closing cannot fix this — for a gap in a
thin wall the erosion removes exactly what the dilation bridged — so
`bridgeGaps()` seals the gaps directly: find the open runs that are pinched
between nearby walls, group them, and close only the groups shallow enough to be
a doorway rather than a corridor. A 0.85 m opening closes; a 1 m hallway does
not. The threshold is a slider, and turning it off shows the leak it prevents.

**When it fails**, and it will on a plan we do not control, "trace by hand" takes
corner clicks instead and closes on the first one.

**Not modelled yet, and said so on the page:** party wall awards, site access,
drains in the footprint, roof glazing, heating and electrics, decoration, floor
finishes, planning route.

**Not modelled yet, and said so on the page:** party wall awards, site access,
drains in the footprint, roof glazing, heating and electrics, decoration, floor
finishes, planning route.
