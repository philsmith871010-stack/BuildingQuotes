# The drawing tool

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

## The idea the whole thing rests on

**You draw the shape, then measure it once.**

Nothing on screen is in metres while you are drawing. You trace round the
outside of the house on a plain grid, close it, and then type the length of a
single wall you happen to know — usually the front. That one number sets
`scale`, and every other wall, floor, area and perimeter falls out of it.

This is how a surveyor scales off a drawing and how anyone reads a map, and it
means the drawing part demands no arithmetic at all. The earlier version made
you type each wall's length as you drew it; that is more accurate per wall and
far worse to use, because it turns a sketch into data entry.

Two consequences worth stating:

- **The grid is unitless.** Dimensions do not appear on the drawing until there
  is a scale to show them in. Before that they would be grid units, which mean
  nothing to anybody.
- **Uploading a plan and starting blank are the same tool.** An uploaded plan is
  a backdrop you trace over; it needs no scale of its own, because the wall you
  measure supplies one.

## The other decision: position never affects a price

A bathroom costs the same wherever it sits in the plan. So a room is a labelled
pin dropped anywhere inside the outline, not a computed polygon. That removes
the entire planar-subdivision problem — where every "simple" floor-plan editor
turns into a six-month project — and costs nothing we actually charge for.

Supporting choices:

- Walls are a **chain of segments**, not rectangles. A rectangle is four
  segments; a bay or a splayed corner costs nothing extra.
- Angles snap to 15°, with a wider capture window on 0/90°, so square corners
  are effortless and a 45° bay is still one click away.
- Internal walls are **single segments, two clicks each**. Chains needed a
  "finish this run" step, which is an instruction, which is a failure.
- **Floors replace the storeys question.** You draw or copy each floor, so
  nobody is asked how many there are.

## The stages

The order a builder walks a house:

1. **Outline** — the shape, per floor. Copy the floor below or draw a new one.
2. **Inside walls** — two clicks each.
3. **Doors** — click a wall. External, bi-fold, or an internal doorway.
4. **Windows** — click a wall.
5. **Rooms** — a pin per room, on every floor.
6. **Extension** — the proposed work, drawn against the existing house.

Drawing an extension is how you say you want one: it selects the extension
build type and sizes it, rather than asking you to tick a box saying you drew
it.

## The data model

```js
{
  scale,                          // metres per grid unit — null until measured
  floors: [{
    outline:   [[x, y], …],       // GRID UNITS, closed
    internals: [ [[x,y],[x,y]], … ],
    openings:  [ { on, idx, t, width, kind } ],
    markers:   [ { x, y, type } ],
    image                         // an uploaded plan, if there is one
  }],
  extension: { outline, closed, storeys }
}
```

Geometry is in grid units and only `measure()` converts to metres. Areas scale
by the square of `scale`, which is easy to get wrong and is done in exactly one
place.

Openings are stored as a **parameter along a named wall**, not as absolute
coordinates, so redrawing or rescaling a wall carries its windows with it.

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

- Copying a floor copies its outline and internal walls but **not** its
  openings or room pins — upstairs is a different room layout, and a wrong
  bathroom count is worse than no bathroom count.
- Openings are counted for the plaster deduction, not positioned for daylight,
  structure or building control.
- Each floor is a single outline. An L-shaped house is fine; a detached garage
  would be a second drawing.
- Ceiling height is assumed at 2.4 m rather than asked. It multiplies the
  plaster area and nothing else.
- Nothing is saved between sessions yet — the drawing lives in memory until it
  is applied.
