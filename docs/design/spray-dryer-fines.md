# Fines on the spray dryer's exhaust (C512, part A)

Status: built 2026-11-25, opt-in, one slice.  Sources read in hand (page
text extracted from `~/Choupo-Literature`), nothing from memory.

## The defect

`SprayDryer` sent every particle to the powder outlet.  In the
ChemicalPlantTutorial the cyclone that follows (DRYING.CY) therefore read an
exhaust with no solid (`solidsIn_mass` 0) and was idle.  Real dryers do not
work like that.

## What the engine has

* A powder size distribution: 15 Rosin-Rammler classes (`dCen`, `mf`) about
  the dried-droplet size, built in `SprayDryer.cpp` ("Particle-size
  distribution"), on the stream as `powder.psd`.
* A particle terminal velocity `v_t` of the characteristic particle and the
  chamber's superficial gas velocity `v_gas` (a cylinder, D and H declared).
* No cone, no exit duct, no outlet velocity: nothing in the unit says at what
  gas velocity the exhaust leaves the chamber.
* Streams carry a solid beside a gas: a gas stream has `s` (kmol/s per
  component) and a `psd` (the cyclone case reads exactly that).

## What the sources say

* Perry's, 9th ed., p. 12-74, "Product Recovery": two layouts.  *Two-point
  discharge*: the coarse fraction leaves by gravity from the base of the
  chamber, "the fine fraction is recovered by secondary equipment downstream
  of the chamber air exit".  *Single-point discharge*: "total recovery of dry
  product is accomplished in the dryer separation equipment".  No share is
  given.
* van 't Land, *Drying in the Process Industry* (2011), Sec. 8.7 (p. 154):
  "the spent drying air from the dryer usually carries the total powder load"
  (the single-point layout); dry cyclones recover down to 5-10 um.  No share
  for a two-point layout.
* Mujumdar, *Handbook of Industrial Drying* 3rd ed., Sec. 10.5.2: horizontal
  dryers return the fines of the exhaust to the chamber.  No share.
* The 2023 lecture slides (Drying of Solids) name spray drying as a dryer type
  and give no carry-over figure.

No source read gives a number for the share of a spray dryer's product that
leaves with the exhaust, nor a velocity at which a cone-based chamber cuts.
The share is a property of the cone, the take-off and the powder, and
manufacturers give it from pilot tests.

## The options

1. **Terminal velocity against the chamber's gas velocity** (elutriation: a
   particle leaves when v_t(d) < u).  Computable from the engine's PSD, but
   the velocity that matters is the one at the chamber's outlet, which this
   unit does not have, and the superficial velocity in the cylinder would
   give a cut that no source supports (the particles fall WITH the gas in a
   co-current dryer, v_particle = v_gas + v_t; the cut is made at the cone
   and the duct).  Rejected: it would be a number that looks derived and is
   a guess.
2. **A declared share of the dry solid** (`fraction`).  Honest, simple, and
   the one a student can read against a pilot test.  Both outlets keep the
   same size distribution, which is said so (a share carries no size
   information).
3. **A declared cut diameter read on the engine's own size distribution**
   (`cutDiameter`).  The size distribution IS the engine's, so the share is
   computed from something the unit has, while the cut (a property of the
   hardware) is the case's.  Every class whose centre diameter is below the
   cut leaves with the exhaust; the exhaust's and the powder's size
   distributions are each renormalised on their own classes.  The share is
   discrete (a whole class goes one way or the other), and the run prints it.

**Choice: options 2 and 3, as two spellings of one opt-in block.**
`operation { carryOver { fraction f; } }` or `{ cutDiameter d; }`, exactly one
of the two (both or none refuses by name, an unknown key refuses by name).  The
share is the CASE's, declared, never predicted; a cut is the only thing about
it the engine can read from its own distribution.

## Validity

* The cut model is a sharp cut on a discretised distribution (15 classes over
  0.2-3.2 times the characteristic size): it resolves the share to the class
  width (a factor of 1.4 in diameter).  It is a pedagogical device, not a
  collection efficiency (a real separator has a grade-efficiency curve; the
  cyclone downstream of the exhaust has one, and it is the unit that carries
  it).
* The residual water stays on the powder outlet: the fines are the smallest
  particles and the first to dry, so giving them a share of the water would be
  wrong in the other direction; and a liquid cannot ride on the exhaust's
  vapour stream (the package would flash it).  The powder's moisture per kg of
  solid therefore reads slightly higher than `X_final`, announced in the run.
  A dryer with no sorption block (phase 1, bone-dry) has no water on either
  outlet and the point does not arise.
* The temperature of both outlets is T_out (the same as before); the fines are
  solid at T_out like the powder.

## Closure

* Mass and elements: the solid of the feed is split between `powder.s` and
  `exhaustAir.s` with shares (1 - c) and c; the water and gases are unchanged.
  The golden gates read `s` of every outlet; nothing is created.
* Energy: the solid's enthalpy is priced per stream at the stream's T and
  composition, and both outlets are at T_out; the unit's energy balance
  (`H(powder) + H(exhaust) = H(feed) + H(air)` with the solid summed over the
  two outlets) is the same equation as before, so T_out does not move.
* KPIs: with the block declared, `powder_dry` and `powder_flow` are the powder
  outlet's, `fines_flow` (kg/s dry solid on the exhaust) and `carryOver` (the
  share) are published.  Without the block no KPI changes (byte-identical).

## What it makes possible

The cyclone behind the dryer receives a solid and works (DRYING.CY).  Whether
the shipped sugar plant gets the block is a separate decision: it moves the
plant's golden rows (the product flow, the cyclone, the dust stream), and the
list of moved rows, produced on a copy, is in the C512 report.

## Not built

A computed share (needs the chamber's exit geometry and a source for the cut);
a grade-efficiency curve of the chamber itself; the fines' own residual
moisture.
