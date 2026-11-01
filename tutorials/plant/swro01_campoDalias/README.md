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
= 98 668.7 m3/day; first pass 47.20 %, second 87.0 %; 2.0 mg/L NaCl-equivalent
and 0.043 mg/L boron in the product; 2.81 kWh/m3 of pump shaft work.

**Boron (DEV.md 4c C198, Stage 1).**  Boron is carried as boric acid and borate,
split by the pH against the acid's curated pKa through the package; each
module declares its pH (8.2 for the first pass, Table 2; 10 for the second,
Table 1 -- the caustic dosing is not modelled).  Lower the second pass's pH to 9
and the product's boron rises; the sheet's one test per element fixes the acid
and the borate is assumed rejected like the salt (declared, announced).

**Six trains, one building (DEV.md 4c C199).**  The case study says six skids of
16 442 m3/day, and an industrial SWRO plant is built so: identical trains, each
with its own high-pressure pump, its own array of pressure exchangers and its
own vessel racks.  The flowsheet is solved ONCE at plant flow (six identical
trains in parallel carry six times a train's flow) and the SIZING is done per
train: `system/postDict` declares `trains { count 6; ... }` and the pumps, the
exchanger arrays and the vessel banks yield items `train1` .. `train6` with
their per-train numbers beside the plant's.  A pump is rated by the largest
machine one make builds (Sulzer MSD-RO, 1600 m3/h: one per train at 50 % load,
plus a declared spare), the exchanger array is 6 devices of the Energy Recovery
PX Q650 window per train under its 83 bar limit, and each pass's vessels stand
in racks (233 vessels of 7.64 m in 5 racks of four tiers, the loading clearance
of one vessel length at the east end of each bank).  The 42 items stand in the
four rooms of one reverse-osmosis building in `system/layoutDict`.  What the
open sources did not give -- the rack pitch, the aisle, the loading clearance --
is declared `assumed` and says so.

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
5. The pump count is `ceil(flow per train / the largest pump)`: with 6 trains it
   is 1 per train; with ONE train the same high-pressure flow (4791 m3/h) would need 3 pumps in parallel
   (declare `installed { count 3; }`; the sizer says so when you do not).

Record: `docs/design/a-desalination-plant-is-trains-and-racks.md`.  Gate:
`bin/curate/check_swro_plant.py`.
