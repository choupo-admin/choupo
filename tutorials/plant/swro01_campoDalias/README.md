# swro01_campoDalias -- a seawater desalination plant from a manufacturer's case study

**The question.** Two pages from a membrane maker describe a 98 664 m3/day
two-pass seawater plant in Almeria: pretreatment, a first pass at 47.2 %
recovery with isobaric energy recovery, a second pass that polishes the boron,
the second pass's concentrate recycled to the first.  What does it take to
turn those two pages into a simulated plant -- and what do the pages not say?

**What the case is.** `system/flowsheetDict` (read its header first): intake,
pretreatment placeholders, a high-pressure pump, a pressure exchanger and a
booster feeding 1398 vessels of TM820E-400 elements (the first pass), a second
pass of 324 + 108 vessels of TM720C-430 on the first pass's permeate, the
concentrate recycled, post-treatment placeholders and a product store.  The
two Toray element records are CASE-LOCAL (`constant/assets/`): the document's
figures are the manufacturer's claim, and what it does not state (the test
conditions, the water permeances, the geometry) is declared `assumed` or
`estimated`.  `system/layoutDict` is Choupo's plot plan of a plant of this scale
up to the fence -- NOT the real site.

**The answer** (2026-11-02; `expected` is the authority).  Product 4111 m3/h
= 98 664.7 m3/day; first pass 47.20 %, second 87.0 %; 2.0 mg/L NaCl-equivalent
and 0.046 mg/L boron in the product; 2.81 kWh/m3 of pump shaft work.

**What a student should notice.**
1. The document's "feed pressure" figures (5.52 and 1.03 MPa) are TEST
   pressures: 47.2 % recovery of this seawater needs 58.6 bar, and the second
   pass needs 10.74 bar for 87 %.  The header shows the arithmetic.
2. **Boron is where the engine stops.**  The module does not couple the pH to the
   transport, so boron is one lumped solute with a constant rejection read from
   the manufacturer's two pH-labelled tests; the gate pins that relabelling the
   pH moves nothing.  The follow-up is named in the header and in
   `docs/design/a-desalination-plant-from-a-case-study.md`.
3. The loop through the exchanger is a knife-edge with a spurious solution; `0/`
   is a converged state for that reason.
4. The plot plan announces six findings (five water tanks with no bund, one
   entrance) and leaves them.

Gate: `bin/curate/check_swro_plant.py`.
