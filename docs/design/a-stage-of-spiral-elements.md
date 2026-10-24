# A stage of spiral elements: vessels, elements, and the spacer as a record

*C146, 2026-10-24.  Vitor's request: spiral-wound modules of the standard
sizes (2.5, 4, 8, 16 inch) with different spacers, Schock & Miquel's
correlation, multi-ion throughout on Geraldes & Afonso's film, and a unit
that says how many modules it has in series and in parallel.  His ruling on
the commander's proposal: "Faz como achares a melhor boa pratica para
simuladores de processos quimicos."*

## 1. What was there

`spiralWoundModule` marched ONE pressure vessel of N elements in series.
A standard size was a hand table inside `SpiralWoundModule.cpp`
(`moduleDiameter` + `nModules`): four areas -- 2.6, 7.9, 37.2, 148.6 m2 --
and nothing else, a second home for what an element record says.  The
feed spacer was two inline numbers, `channelHeight` and `spacerPorosity`,
and the hydraulic diameter the correlations read was `2 h eps`.  The
Schock-Miquel correlations were registered with their coefficients as
defaults, and their measured window was nowhere.

## 2. The source, read

G. Schock, A. Miquel, *Mass transfer and pressure loss in spiral wound
modules*, Desalination 64 (1987) 339-352.  Read from the paper itself on
2026-10-24 (Vitor supplied it; Elsevier copyright, NOT in the tree -- only
the numbers below, each cited by page, table or equation):

* **Tab. 1, p. 343**, feed spacers: h_SP, d_F, l_M, eps, S_V,SP, d_h for
  Toray PEC-1000, Naltex 1228, Desal RO, FilmTec FT30, Desal UF.
* **Eq. (17), p. 341**: `d_h = 4 eps / (2/h + (1 - eps) S_V,SP)`; with
  **Eq. (23)** `S_V,SP = 4/d_F` and **Eqs. (20)-(22)** `eps = 1 -
  0.5 pi d_F^2 l_M / (l_M^2 h_SP)`.  eps -> 1 gives the empty channel's 2h
  (Eq. 10).
* **Eqs. (11)-(12), p. 341**: `v = V / A_eff`, `A_eff = b h eps`, the
  channel height equal to the spacer thickness -- the interstitial velocity
  the engine already used.
* **Eq. (24), p. 345**: `lambda = 6.23 Re^-0.3`, "only be valid in the
  tested flow regime, i.e. 100<Re<1000".
* **Eq. (30), p. 347**: `Sh = 0.065 Re^0.875 Sc^0.25`, "independently of the
  type of spacer and membrane"; Fig. 9's Reynolds axis is 100-1000 (the text
  states the window only for Eq. 24 -- recorded as such).
* **p. 340**: dimensionless numbers on "average bulk physical properties",
  the concentration dependence "assumed to be insignificant" -- **no
  viscosity correction**, so none is applied.
* **p. 346**: the filament diameter taken as half the spacer thickness is
  "sufficient for feed spacer materials" (every Tab. 1 row has d_F = h/2).
* **Tab. 3, p. 344**: the FilmTec FT30 SW2540 element: leaf length without
  glue strips 854 mm (the generic elements' leaf-length estimate).
* **p. 349, Fig. 10, Tab. 4-5**: the optimal leaf number of a 4-inch x
  40-inch element is 3-4 with a glue line; total leaf width 4.3 m.

**Where the paper and a value already used disagreed, the paper won, and
this is the list:** the hydraulic diameter of a spacer channel is Eq. 17,
not `2 h eps` (on the FT30 spacer 0.952 mm against 1.371 mm).  The
correlation coefficients the engine had (0.065/0.875/0.25; 6.23/0.3) agree
with the paper.

## 3. The decisions (the commander's, on the delegation)

**One unit is one STAGE.**  `vessels <n>;` identical pressure vessels in
parallel, `elements <m>;` in series in each -- `elements` keeps its meaning
(the series count), so no existing case changes spelling.  Identical
vessels see the same feed state, so ONE vessel is solved on F/n and its
outlets are scaled by n: exact, announced (`[array]`).  A maldistribution
is not modelled and is said so.  A multi-stage array is the flowsheet's,
one unit per stage, the interstage pump a unit of its own -- the practice
of every process simulator, and the one that puts the booster's shaft work
on the stream table.

**The feed spacer is a record** (`kind feedSpacer`, `FeedSpacer.{H,cpp}`,
loaded by the module registry's scan).  It stores what was MEASURED --
`thickness`, `filamentDiameter`, and `porosity` XOR `meshLength` -- and the
engine derives S_V,SP and d_h.  Tab. 1's eps is stored rather than its mesh
because the paper's own d_h column follows from the TABULATED eps (Eq. 17
on the mesh-derived eps misses Tab. 1's d_h for Naltex, Desal RO, FT30 and
Desal UF by 0.006-0.011 mm; on the tabulated eps all five agree within the
printed rounding, Desal RO's 0.9751 against 0.97 at its edge);
the gate holds the mesh route to the table instead.  `hydraulicDiameter` is
stored only where a source publishes d_h and not the filament.

**The correlations are data on the spacer.**  The case NAMES the model in
its own `massTransfer {}` / `pressureDrop {}` (so a case that fixes
`k_film` or `dP_feed_total` still reads only the spacer's geometry); the
record supplies the coefficients and the window.  A case coefficient beside
the spacer, or a model the spacer does not carry, refuses (one home).
Outside the window: `[window] ... EXTRAPOLATED`, an `extrapolation`
advisory, the run continues.

**The standard sizes are records** -- `Generic-2540/4040/8040/16040`, the
retired table's areas, a leaf count, the 0.854 m leaf, the FT30 spacer,
every value an announced estimate, NO membrane (the case declares it
beside `module`, as beside a flat cell).  The leaf width is DERIVED, A/(2 n
L); a record storing it refuses.  `moduleDiameter` / `nModules` refuse,
naming the records -- no dual reader.

**SW30HR-380** names `Spacer-28mil` (its sheet's 28 mil; porosity 0.90 and
d_F = h/2 as announced estimates).  **NF270-4040**'s sheet states no spacer,
so it keeps its inline estimates.

**Per ion.**  Confirmed in `massTransfer/Polarisation.cpp`: the correlation
is evaluated per solute on that solute's own D (`kFilm(hyd, s)`), so
`k_i ~ D_i^0.75` through Sc^0.25 -- no change was needed; the gate holds it.

**The booster.**  `pump` refused a brine written ion by ion (an ion has no
Vliq, no liquid Cp).  A dissolved ion (a component with a declared aqueous
bridge) is now left out of the volume and the heat capacity -- the
solvent's are used, the dilute-solution reading -- ANNOUNCED with the ion
mole fraction neglected.  Any other component without Vliq still refuses.

## 4. What did not move, and what would

No golden row moved.  The cases that used the hand table hold their
numbers (fixed k_film and dP read only the area, which the records carry
unchanged; re-sealed through `bin/choupo-import`, which reproduced every
golden with the catalogue hidden); membrane14 was typed as the explicit
area and length the table gave.  membrane16 is sealed against the pre-C146
SW30HR-380 and keeps its numbers; re-sealing it would move its film and
friction (listed in the branch's moved-rows note, Vitor's to authorise).
The legacy inline channel keeps `2 h eps` and says on every run that
reads it that this is not Eq. 17 -- changing it would move every
correlation-driven membrane golden, so it is Vitor's.

## 5. Not done, named

The spacer's edge bypass Schock & Miquel describe (p. 344: the spacer is
wider than the leaf, so their velocity used the spacer width); the
permeate-side pressure drop and the permeate spacers of Tab. 2; any
maldistribution between vessels; any measured array performance (nothing
here is validated against a plant).

Witness `tutorials/steady/membranes/membrane21_two_stage_nf_array`; gate
`bin/curate/check_spiral_array.py`.
