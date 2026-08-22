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

## Running it

No build step, no dependencies, no framework.

```
open index.html          # or serve the folder with anything
node build.mjs           # → dist/index.html, one self-contained file
```

`dist/index.html` is the whole site inlined into a single page. Drop it on any
static host.

## Layout

| File | What it is |
|---|---|
| `src/rates.js` | **Every figure the estimator uses.** One file, heavily commented, marked `LEE` or `ASSUMPTION`. |
| `src/trees.js` | Species table, soil types, and the NHBC-shaped foundation depth logic. |
| `src/engine.js` | Pure pricing functions. Spec in, itemised estimate out. No DOM — this moves to a server unchanged. |
| `src/iso.js` | The isometric drawing. Everything on screen is projected from the same metres the price uses. |
| `src/app.js` | State, dragging, and the interface. |
| `assets/styles.css` | Design tokens and layout. Light and dark. |
| `build.mjs` | Inlines the above into `dist/`. |

## Changing the numbers

Open `src/rates.js`. That is the whole job — nothing is hard-coded elsewhere.
When the QS spreadsheet arrives it becomes a data swap rather than a rewrite.

The single most consequential setting is `marginIncludedInRates`. It decides
whether Lee's rates are trade cost with 15% added on top, or a selling price with
the margin already inside. It currently reads them as cost. See section 2 of the
assumptions.

## Scope

**In:** single-storey rear extensions. Wall construction, bi-folds, wall removal,
trees and foundation depth, kitchen fitting, bathrooms.

**Next:** double storey, lofts, garage conversions, and renovations from an
uploaded floor plan the client scales themselves.

**Not modelled yet, and said so on the page:** party wall awards, site access,
drains in the footprint, roof glazing, heating and electrics, decoration, floor
finishes, planning route.
