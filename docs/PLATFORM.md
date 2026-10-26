# Datum (becoming HAMR) — what this is, why, and where it is going

Read this first. It is the one document that explains the platform end to end:
what it does today, the thinking behind each decision, what is real and what is
placeholder, and what comes next. The other documents go deeper on one part
each and are linked where they apply.

- `README.md` — how to run it, the file layout, how to change the numbers.
- `docs/sketch-tool.md` — the drawing tool in detail (the centre of the product).
- `docs/ASSUMPTIONS.md` — every number we invented and every question Lee has to settle.
- `docs/rates/newbuild-rates-lee.md` — Lee's bill-of-quantities rate schedule, transcribed.

---

## 1. The idea in one paragraph

A homeowner draws their house in about a minute, says what they want done, and
gets an itemised, builder-backed price with the margin printed on it. The price
is measured from the drawing, not guessed from a rate per square metre, and it
is priced from a real builder's rate book, not a national average. Vetted
builders accept the job at that price or pass; nobody bids anybody down. Money
is released against work done. The business takes its margin on the invoice,
in the open, rather than hidden inside the quote.

The working name is **Datum** (the fixed line everything is measured from).
The rebrand under discussion is **HAMR**, from "hammer price", the real final
figure a thing sells for. See section 9 before using it.

## 2. The aims, in order of importance

1. **The best quote, not a pretty picture.** Everything on the site exists to
   get a client to a number they can trust. We decided not to build 3D views or
   AI renders; plenty of companies do that and we can partner with them.
2. **Measured, not estimated.** The client draws the house, extension, rooms
   and garden. Every figure the quote uses comes off that drawing. No question
   asks for a size the drawing already gave.
3. **A real builder's rates.** The rate book is Lee's (L Todd Construction,
   Essex). He edits every rate in the admin screen; the site never prices from
   averages. The long-term shape is a bill of quantities priced from the
   drawing (section 8).
4. **Trust through transparency.** The margin is a line on the quote. The
   itemised breakdown is on the page. Nothing is sent anywhere unless the
   client chooses to.
5. **Simple enough for anyone.** A grandparent with no plan and a phone should
   get to a price without instructions. Every hint is one sentence; every step
   has one obvious button.
6. **One project, not three.** An extension, a loft and a refurbishment are one
   job with one set of drawings, one engineer and one building control
   application, and the site prices them that way.

## 3. Who it is for

- **The homeowner**, who has three quotes they cannot compare, or none, and
  no way to know what a fair price is.
- **Lee**, who is the first builder on the platform and whose rate book is the
  price source. Later, other vetted builders who accept priced jobs.
- **Us**, taking a margin on the invoice for pricing the job, vetting the
  builder and signing off the valuations that release the builder's money.

## 4. How the product works today

The site is a static, dependency-free web app: `index.html` for clients and
`admin.html` for the rate book, with hash routing so it runs from a single
file anywhere. GitHub Pages serves it straight from the branch.

### The client journey

1. **What are you building?** Tick any of six build types: extensions,
   renovations, loft conversions, new builds, patios and outdoor work, garages
   and garden rooms. A new build cannot combine with an extension, loft or
   renovation; everything else combines.
2. **Draw your house.** The drawing tool opens. Its steps depend on the
   project: an extension project goes Shape, Extension, Garden; a renovation
   goes Shape, Inside walls, Doors and windows, Rooms, Extension, Garden; an
   outdoor job goes Shape, Garden, Extension. Steps a project has no use for
   are left out, and the thing being priced is never marked optional.
3. **The questions.** One page per step per build type, generated from the
   rate book. Anything the drawing measured is shown as a read-only "measured
   from your drawing" row with a way to override it. Pages with nothing left
   to ask are skipped. Questions shared between build types (access,
   specification, ground) are asked once.
4. **The estimate.** A range (plus or minus ten per cent until a survey), the
   cost stack (building work, drawings and fees, margin, contingency, VAT), the
   saving from doing it as one project, and the itemised lines. The margin is
   stated plainly. A "send the PDF" box is a demonstration only; nothing is sent.

### The drawing tool (the moat)

`src/sketch.js`, documented fully in `docs/sketch-tool.md`. The short version:

- Start with a shape (rectangle, L, T) and drag it to fit, tap round the
  corners yourself, or draw over an uploaded floor plan photo. Type one wall's
  length and the whole drawing is in metres. Or type every wall length and
  the measuring question never comes.
- True quarter-metre grid snap, snapping to existing corners and walls,
  alignment guides, undo and redo, pinch and wheel zoom, drag to pan.
- Inside walls: "Add a wall" (tap or drag, nothing moves) and "Move or
  remove" are separate modes, because a tap that should start a wall was
  being taken as a drag. Doorways, knock-outs, T-junctions that stay attached
  when a wall slides.
- Doors, windows and bi-folds are placed on walls with a ghost preview, slide
  along the wall, and are removed with a × or the Delete key.
- Rooms are found from the walls: each enclosed space shows "Tap to name" with
  its real area; a named room carries that area into the price.
- The extension is drawn against the house (one-tap rear extension or your
  own shape) and counts as part of the floor it sits on. The garden is a plot
  with patio, lawn, drive, decking, garage or garden room, and trees.
- The pointer says what a click will do: a pen, a hand, a "+", a door, a
  hammer, a pin, a pick ring, or "not here".
- A running "Estimate so far" updates as you draw.
- Everything stays in the browser (localStorage). Nothing is uploaded.

### The rate book and the pricing engine

`src/ratebook.js` holds every build type, each with measurements, steps,
rate lines and modifiers. A rate line is a label, a unit, a driver (which
measurement it multiplies) and a rate. A measurement can carry `ask`
metadata, which is what generates the public question pages. Modifiers
(access, specification, wall type, property age, ground conditions) scale
groups of lines. `priceProject()` prices several build types as one project
and charges fees once.

Renovations are priced room by room. Each named room has ticks for the jobs
it can have (decorate, new floor, skim, sockets and lights, door, radiator,
strip to brick, rewire and re-pipe, new ceiling, insulation, and in wet rooms
the kitchen, bathroom or WC fitting and wall tiling). Four presets (leave,
decorate, refit, strip out) tick the usual set. Every tick drives one rate
line by that room's measured area or once per room.

The admin (`admin.html`) edits all of it with a live worked example, a
draft-then-publish flow and a change log. Rates are stored in the browser
(`src/store.js`) with a schema version and a migration that carries edited
rates across structural changes.

### Foundations and trees

`src/trees.js` works out foundation depth from soil shrinkability and nearby
tree species and distance, which is the thing that catches extension clients
out. The extension flow asks it once for the whole project.

## 5. What is real and what is placeholder

- **Real:** Lee's five original figures (extension shell per m², bi-folds per
  metre, wall removal per metre, kitchen fitting, bathroom), the 15% margin
  split 5 Datum and 10 trade, VAT at 20%.
- **Placeholder:** almost every other rate (the admin counts them). The
  foundation table is a draft. The per-room tick rates and the tiling factor
  are ours. Garages and garden rooms are five placeholder rates.
- **Transcribed but not wired:** Lee's new build bill-of-quantities schedule
  (225 items). Using it needs a quantity take-off from the drawing (section 8).
- **Demonstration only:** the PDF email box. There is no backend, no accounts,
  no saving beyond the browser, no payments.
- **Decisions not taken:** listed in `docs/ASSUMPTIONS.md`. The biggest is
  whether Lee's rates are trade cost with margin on top, or a selling price.

## 6. Repository map

| Path | What it is |
|---|---|
| `index.html` | Landing page, start page, the drawing tool's markup, the estimator |
| `admin.html` | Lee's rate book |
| `src/sketch.js` | The drawing tool |
| `src/flow.js` | The estimator: routes, questions, measured rows, rooms page, estimate, live total |
| `src/ratebook.js` | Build types, rate lines, modifiers, room jobs, the pricer |
| `src/store.js` | Rate book persistence, schema version and migration |
| `src/trees.js` | Foundation depth from soil and trees |
| `src/router.js` | Hash routing |
| `src/draw2d.js`, `src/plan-sample.js` | The estimator's plan and section drawings |
| `src/trace.js` | The older pixel-based plan tracer (kept, not offered) |
| `src/admin.js` | The rate book screen |
| `assets/` | Styles |
| `build.mjs` | Inlines everything into `dist/` single files and stamps asset URLs so a reload after a push gets new files |
| `dist/` | Built single-file pages (client, admin, combined demo) |
| `docs/` | This file, the drawing tool, the assumptions, Lee's rates |

Development has been on the branch `claude/website-design-planning-cnoltd`.
`main` is the initial commit. GitHub Pages serves the feature branch root.

## 7. Running and testing it

```
open index.html                      # or any static server, e.g.
python3 -m http.server 8788          # then http://localhost:8788/
node build.mjs                       # rebuild dist/ (also stamps asset URLs)
```

There is no test framework checked in. Verification has been done with
Playwright scripts driving Chromium and WebKit at laptop and iPhone sizes,
including emulated touch with deliberately wobbly taps. The pattern is: start
a static server, open `#/start`, tick a build type, set `location.hash` to
`#/draw`, drive the tool by clicking at world coordinates converted through
the SVG's screen matrix, and read state from `window.DATUM.SKETCH._S` and
`DATUM.SKETCH.measure()`. Playwright is installed with
`npm install --no-save playwright` and the browsers with
`npx playwright install chromium webkit`.

## 8. Decisions already taken, and why

- **Build the drawing tool ourselves** rather than adopt a floor-plan library.
  Our needs are narrow (measure a house for a price) and the tool is the
  thing that differentiates us.
- **True grid snap only.** Angle snapping put corners off the grid.
- **Inside walls before rooms.** The walls are what make a room a room.
- **Stage order follows the project.** An extension project draws the
  extension second; a renovation walks the inside.
- **Adding and moving walls are separate modes.** A tap that should start a
  wall kept being taken as "drag this wall", especially on a phone.
- **Rooms come from the walls**, with real areas, and the estimator lists
  only the rooms named on the drawing.
- **The extension is part of the floor it sits on.** Walls, doors, windows,
  bi-folds and rooms go in it.
- **No size questions.** If the drawing gave it, it is a measured row.
- **A new build stands alone.** Nothing to extend or renovate yet.
- **No AI plan reading yet.** It would need a server to hold an API key and a
  consent change to "nothing leaves the browser". Worth doing as an
  accelerator on the upload path, with the result shown as editable walls
  over the plan (never a clean redraw). See the roadmap.
- **No 3D or renders.** Partner, don't build.
- **Margin on the invoice.** Nobody else prints it; it is our sharpest
  sentence in a market whose problem is trust.

## 9. The name

"Hammr" is taken by a well-funded US construction payroll company
(hammr.com); do not use it. "HAMR" is cleaner but Companies House has a HAMR
Solutions Limited in construction installation, and Seagate's HAMR drive
technology owns the word on Google. Before printing anything, search the UK
trade mark register for class 42 (software) and class 37 (building). If it
is clean, the recommendation is: company and domain HAMR, wordmark "Hamr",
lead line "Know the hammer price". Alternatives if it is not: "On the Nail",
"Plumb". Datum remains a good builder's word.

## 10. Where it sits against the market

One day of desk research (September 2026), published as a web report. In
short: homeowner-facing tools are £/m² calculators that capture leads;
builder-facing tools (PriceNailer, RenoCalc, BuildPartner, Buildxact,
Magicplan, Hover) read drawings and produce itemised quotes for the trade;
managed-build platforms (Beams, Weaver in London; Block in the US) vet
builders, fix a price and hold money at milestones. Nobody has all three of:
the client measuring their own house by drawing it, a builder's own rate book
as the price source, and the margin printed on the quote. The company to watch
is Beams, which has the model and a pricing engine and is London-only. The most
plausible fast follower is a builder tool turning to face the client. Being
live with vetted builders in Essex first matters more than any feature.

## 11. Roadmap

In rough order of value.

1. **Lee's rates, properly.** Confirm the assumptions in
   `docs/rates/newbuild-rates-lee.md` with him (foundation width and depth,
   storey height, roof pitch, the "£48,00" cabling figure, standard versus
   upgrade products). Then build a quantity take-off for the new build type:
   the drawing produces perimeter, wall area less openings, footprint, roof
   area, inside wall length, room areas and opening counts; his schedule
   prices them; the client sees the short headings with his sections behind
   a "how this was priced" link. Extensions follow (three walls and a flat
   roof); renovations map the per-room ticks to his finishes, joinery,
   kitchen and bathroom sections.
2. **The builder side.** Vetted builders see priced jobs and accept or pass;
   fortnightly valuations signed off by us release the money. This needs a
   backend (accounts, saved projects, a job queue, payments) and is where
   Beams has set the client's expectations: builders visited in person,
   milestones, money held.
3. **A saved, shareable quote.** Today the drawing and answers live in one
   browser. Accounts and a real PDF quote are the first backend features.
4. **AI reading of an uploaded plan** behind a small proxy (Cloudflare
   Worker or similar) holding the key, as "Read my plan for me" beside "or
   tap round it". Show the result as our walls over the plan so errors are
   obvious. Measure the correction rate; pull it if trust suffers.
5. **The rebrand**, once the trade mark search is clean.
6. **Real-device testing** with first-time users. Everything has been verified
   in emulated browsers; the last point is a real thumb on a real phone.
7. **Partnerships** for what is not the quote: design (architects), renders,
   finance.

## 12. Glossary

- **Rate line** — one priced item: label, unit, driver, rate.
- **Driver** — the measurement a line multiplies (floor area, perimeter, count).
- **Modifier** — a factor applied to a group of lines (access, specification).
- **Measured row** — a question answered by the drawing, shown read-only with an override.
- **Preset** — leave, decorate, refit, strip out: a starting set of per-room ticks.
- **PC sum** — a supply allowance the client can trade up or down.
- **PS** — a provisional sum, to be firmed up.
- **Take-off** — the quantities measured from a drawing for a bill of quantities.
