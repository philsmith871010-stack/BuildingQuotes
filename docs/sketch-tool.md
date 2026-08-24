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

**You draw the shape, then measure it once — and the grid becomes real metres.**

Nothing on screen is in metres while you are drawing. You trace round the
outside of the house on a plain grid, close it, and then type the length of a
single wall you happen to know — usually the front. That one number sets
`scale`, and every other wall, floor, area and perimeter falls out of it.

This is how a surveyor scales off a drawing and how anyone reads a map, and it
means the drawing part demands no arithmetic at all. The earlier version made
you type each wall's length as you drew it; that is more accurate per wall and
far worse to use, because it turns a sketch into data entry.

Two consequences worth stating:

- **The grid is unitless until it isn't.** Dimensions do not appear on the
  drawing until there is a scale to show them in — before that they would be
  grid units, which mean nothing to anybody. The moment a wall *is* measured the
  whole drawing is converted into metres and re-snapped to a quarter-metre grid.
  Corners move by at most 125 mm, which is well inside the tolerance of somebody
  remembering their front wall, and in exchange every dimension from then on is
  a figure a builder would write down: 9.00, 4.50, 2.00 — never 4.32 or 4.71.
  You can also aim for a length by counting squares.

- **Snapping is true.** Every point is a grid intersection: not most points, not
  points on square walls, every one. An earlier version snapped the *angle* to
  15° and the *length* to half a unit, which is a different thing wearing the
  same name — it put a 45° wall at 3.889, 3.889, visibly between the lines.
  There is no angle snapping now and none is wanted. Orthogonal comes free from
  clicking intersections, and the point about to be placed is drawn on the
  intersection it will land on before you commit it.
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

## A closed shape is a live thing

Drawing it once is never enough, so a finished outline stays editable:

- **Drag a corner** — both walls either side follow, the ring never opens.
- **Tap a wall** — a corner appears in it and the wall becomes two. Splitting
  never moves the wall: the new corner lands on it, at a grid intersection
  where the wall passes through one, which every square and 45° wall does.
- **Tap a corner, then the ×** — the two walls either side merge. A bare tap
  never deletes anything.

Corners always land on the grid, and the grid is drawn at the snap resolution —
a snap point you cannot see is a corner that looks misplaced.

The hard part is not the geometry. A window is stored as *"sixty per cent of the
way along wall three"*, so every edit that renumbers or resizes walls has to
carry the openings with it, or somebody's front door silently moves to a
different wall. Rather than do index arithmetic — which has a wrap-around case
for every operation and gets one of them wrong — each opening is remembered as a
point in the world before the edit and reassigned to the nearest wall
afterwards. A split leaves the halves collinear, so every opening lands exactly
where it was; a merge puts them on the chord, which is the only honest answer
available. Split a wall and remove the corner again and every opening is back at
its original address.

Two rules protect the number:

- **A drag that folds the shape over itself is refused.** The shoelace formula
  cancels the crossed part against itself, so a bow tie silently produces the
  wrong area, and a wrong area is the one thing this tool must never hand
  anybody.
- **Dragging never rescales the house.** The scale belongs to the drawing, not
  to the wall you happened to measure. Drag the corner of the wall you called
  7.5 m and that wall becomes 8.1 m; nothing else moves. Re-measure any wall at
  any time.

Every edit takes a snapshot first, so Undo and Redo walk all of it backwards
and forwards in the order it happened — including the measurement itself, which
puts the loose grid back.

Everything on the drawing can be moved or removed by the same two gestures:
drag it, or tap it and use the ×. Corners, inside wall ends, doors and windows
(which slide along the wall they are in and stay in it), and room pins.

The view zooms on a wheel or a pinch, pans on two fingers or a shift-drag, and
**Fit** hands control back to the automatic framing.

## The stages

Six of them, shown as a numbered rail with a line through it rather than a row
of tabs — tabs invite random access, and this is a sequence. The side panel
says "Step 3 of 6" and names the stage, and one primary button always says what
comes next. The hint changes as you go: *"Keep tapping the corners"* becomes
*"Keep going, or tap the first corner to finish"* becomes *"Now tap the other
end of the wall"*.

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
