# The sketch tool

`src/sketch.js` — the part of Datum that is worth owning.

Everything else here is assembly: a rate book is a spreadsheet with opinions, a
hero page is a hero page. The sketch tool is the only component that turns
something a homeowner *has* — a house they can picture — into something a
builder can price, in about ninety seconds and with no drawing skill.

## What it is for

A quote needs quantities. Quantities normally come from a measured survey, a
Rightmove floor plan, or a client guessing. The first costs money, the second
doesn't exist for most jobs, and the third is why estimates move by 40% on the
first site visit.

The tool is the fourth option: the client draws the house badly and the tool
measures it accurately.

## What it captures, and how accurate each thing has to be

| Quantity | Target | Why |
|---|---|---|
| Floor area | ±3% | Drives most `per_m2` lines |
| Perimeter | ±3% | External walls, foundations, scaffold |
| Storeys, ceiling height | exact | Both multiply everything above |
| Internal wall length | ±10% | Studwork and plaster to two faces |
| Kitchens, bathrooms | **exact count** | £4,500 and £3,000 a time, `per_unit` |
| Windows, external doors | ±1 | Modest money, but they come off the plaster area |

Anything not in that table is not captured. There is no room naming, no
furniture, no north point, no wall types, no levels, no rendering.

## The two decisions that make it fast

**Position never affects a price.** A bathroom costs the same wherever it sits
in the plan. So stage 5 is a labelled pin dropped anywhere inside the outline,
not a computed room polygon. That removes the entire planar-subdivision problem
— which is where every "simple" floor-plan editor turns into a six-month
project — and costs nothing we actually charge for.

**Typing beats dragging.** Drawing a wall roughly and typing `4.2` is faster
*and* more accurate than trying to drag to exactly 4.2 m. The pointer sets the
direction; the keyboard sets the length.

Two supporting choices follow from those:

- Walls are a **chain of segments**, not rectangles. A rectangle is four
  segments; a bay window or a splayed corner costs nothing extra.
- Angles snap to 15°, with a wider capture window on 0/90°, so square corners
  are effortless and a 45° bay is still one click away. Lengths snap to 250 mm.

## The data model

```js
{
  outline:   [[x, y], …],        // metres, closed
  internals: [ [[x, y], …], … ], // open chains
  openings:  [ { on, seg: [chain, i], t, width, kind } ],
  markers:   [ { x, y, type } ], // pins, never polygons
  storeys, ceiling
}
```

Openings are stored as a **parameter along a named wall**, not as absolute
coordinates, so moving or re-typing a wall carries its windows with it.

`measure()` is the only thing the rest of the app sees. It returns the table
above and nothing else. `src/flow.js` maps that onto rate-book measurements in
one function, `applySketch()` — deliberately explicit, so adding a build type
is a five-line change rather than an abstraction.

The pins do more work than their size suggests: they come back from `measure()`
as an ordered list of room types, and that list **becomes the renovation's room
list** — the thing the client then answers one question about per room. Sketching
the house is therefore not just a way to get a floor area; it is what makes the
room-by-room pricing possible without asking anyone to type a list of rooms.

## Licensing position

The sketch tool has **no dependencies**. It is plain ES5-era JavaScript against
the DOM and SVG, written for this project.

The only third-party code in the repository is `vendor/opentakeoff/` (Apache
2.0), used by the *tracing* tool for flood fill and contour extraction. It is
isolated in its own directory with its own `LICENSE` and `NOTICE`, and the
sketch tool does not call into it. Nothing here is copyleft, and nothing in
`src/` derives from third-party source.

If this becomes IP that matters commercially, that separation is what keeps the
answer to "what do you actually own?" a short one.

## Known limits

- Internal wall length and room counts are assumed to repeat on each storey.
  True enough for a semi, wrong for a bungalow with a converted loft.
- Openings are counted for the plaster deduction, not positioned for daylight,
  structure or building control.
- The plan is a single outline. An L-shaped house is fine; a detached garage is
  a second sketch.
- Nothing is saved between sessions yet — the sketch lives in memory until it
  is applied.
