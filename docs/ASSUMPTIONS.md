# Datum — assumptions, and the questions behind them

Everything in this file is something we invented to make the demonstration work,
or something we need Lee to settle. Nothing here is a decision that has been
taken — it is the list of decisions that have *not* been.

The rates themselves live in one file: [`src/rates.js`](../src/rates.js). Change a
number there and the whole site follows. The foundation logic lives in
[`src/trees.js`](../src/trees.js).

---

## 1. Figures Lee supplied

These came straight from the brief and are used exactly as given.

| What | Rate | Where |
|---|---|---|
| Extension build | £3,000 / m² | `build.perSqm` |
| Bi-fold doors | £1,500 / linear m | `bifold.perLinearMetre` |
| Wall removal | £1,000 / linear m | `wallRemoval.perLinearMetre` |
| Kitchen fitting | £4,500, labour only | `kitchen.fitOnly` |
| Bathroom | £3,000 each, labour only | `bathroom.labourOnly` |
| Margin | 15%, split 5 Datum / 10 trade | `margin` |
| VAT | 20%, all prices plus VAT | `vatRate` |

---

## 2. The question that changes the headline most

**Are Lee's rates trade cost, or a selling price?**

The brief says the software uses these figures "in the background" and that 15%
is "built in to each aspect". We have read that as: the rates are **cost**, and
the 15% goes **on top**. The switch is `marginIncludedInRates: false`.

It matters enormously. On a 5 × 4 m extension with bi-folds, one tree, a kitchen
and 3 m of wall out:

- Margin on top (current setting) — the headline is roughly **£3,000/m² × 1.15 × 1.05 × 1.2**, plus fees, before you count anything else.
- Margin already inside — the headline drops by about 15%.

Flipping it is one word in `rates.js`. It needs Lee's answer before anyone sees
a number they might act on.

---

## 2b. The other four build types

Lee gave figures for extensions. Renovations, loft conversions, new builds and
outdoor work are now in the rate book with a full set of priced items — **every
one of those rates is ours, not his.** 37 placeholders in total, counted on the
admin overview.

They are plausible UK figures for 2026 and they are not his business's numbers.
The admin exists precisely so they stop being a blocker: Lee types over each one
and it stops being a placeholder. The CSV importer takes a whole schedule at
once if the QS spreadsheet is ready.

Worth knowing: the compounding matters more than any single rate. A £1,850/m²
loft shell becomes roughly £4,700/m² by the time margin, contingency and VAT are
on it. That is arithmetic, not a mistake — but it is the clearest reason section
2 needs answering.

---

## 3. Placeholders we invented

Every one of these is a guess dressed up well enough to demonstrate. None should
survive contact with the QS schedule.

### Build
- **Wall construction deltas** — brick 1.00, render 0.98, timber frame and clad 0.95. Lee quoted a single rate for all three; these deltas exist only so the question visibly does something.

### Foundations
- Standard depth already inside the £/m² rate: **1.0 m**
- Trench width: **0.6 m**
- Excavation, cart away and concrete: **£340 / m³**
- Beyond **2.5 m** we switch to piles and a ground beam at **£450 / m²** of footprint
- Maximum depth we will estimate remotely: **3.5 m**

### Professional fees
- Architectural: **6% of build cost, minimum £2,500**
- Structural engineer: **£1,200**, plus **£400** where there are new openings
- Building control: **£1,100** flat. Council fees vary by authority — this wants a real table, starting with whichever councils Lee works in most.

### Commercial
- Contingency: **5%**, shown as its own line and returned if unspent. Lee did not mention one. A platform promising no hidden extras needs it, or it is carrying that risk itself.
- Confidence range: starts at **±30%**, tightens by 3.5 points per question answered, floors at **±10%**. Presentational, but it sets expectations, so it should be defensible.

---

## 4. The foundation table

This is the most valuable thing on the site and the most provisional.

`src/trees.js` follows the *shape* of NHBC Standards Chapter 4.2 — foundation
depth as a function of species water demand, D/H (distance ÷ mature height), and
soil plasticity. The species list and mature heights are conventional. **The
depth anchors are our draft**, interpolated to match the curves' behaviour.

It is close enough to be persuasive and nowhere near good enough to dig to.

**What we need:** either the real NHBC depth tables transcribed, or Lee's
engineer marking our draft up. Also a real figure for the cost of each extra
300 mm of depth, which currently comes out of the £340/m³ guess.

Worth flagging: **the brief said "trees within 5 m".** On heavy Essex clay a
mature oak influences foundations at 20 m and beyond. We have opened the
question up to 40 m, because a 5 m rule would miss most of the cases that cost
money.

---

## 5. Not in the estimator yet

Each of these moves a real extension's price by thousands. They are listed on
the site itself, under "what this version does not know yet", so nobody is
misled:

- Number of storeys — v1 is **single storey only**
- Roof type and glazing: flat, pitched, lanterns, rooflights
- Party wall awards — a semi or terrace usually needs a surveyor per neighbour
- Site access — whether a machine, a skip and a grab lorry can reach the rear
- Drains and manholes inside the footprint
- Heating, electrics, consumer unit, decoration, floor finishes
- Planning route: permitted development, full planning, or lawful development certificate
- Asbestos in anything being removed
- Regional variation — the £3,000/m² is an Essex figure

---

## 6. Questions for Lee

**Rates**
1. Cost or selling price? (see section 2 — this is the big one)
2. Does £3,000/m² change for double storey, lofts, garage conversions?
3. Architectural, structural and building control fees — percentage or fixed? Which councils first?
4. Do we show the contingency, and does unspent contingency really come back to the client? The site currently says it does.

**Foundations**
5. Can we have the real depth table, or should we draft from NHBC 4.2 for the engineer to correct?
6. Cost per extra 300 mm of trench depth, and the piling threshold.

**Commercial and legal**
7. **Who contracts with whom?** Is the client contracting with Datum as main contractor, with a JCT Minor Works down to the builder — or is Datum introducing, with a JCT Homeowner contract directly between client and builder? This decides liability, insurance, and a large part of the interface.
8. Consumer price claims normally lead with the VAT-inclusive figure. The site does that, with an ex-VAT toggle for trade. Confirm that is right.
9. Builder subscription price. And confirm builders **accept or decline** a priced job rather than bidding — the site is built around that being true, and it is the best part of the model.
10. How many builders see each tender? First to accept, or allocated?
11. Retention, and payment terms after each fortnightly valuation.
12. Geography for v1.
13. Renovations: Rightmove floor plans are the agent's copyright, so we should not pull them. The plan is for the client to upload their own and drag a line along a known dimension to set the scale. Agreed?

**Positioning**
14. Datum prices the job, takes 5% of it, and signs off the valuations that release the builder's money. Someone will ask about that. The site answers it head-on under "straight answers" — Lee should be happy with how it is answered.
