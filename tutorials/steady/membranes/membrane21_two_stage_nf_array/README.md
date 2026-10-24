# membrane21 -- a two-stage NF array: one unit per stage, the hardware as records

**The question.** A real membrane plant is not one element: it is an ARRAY
of pressure vessels, several elements in series in each, the vessels of a
stage in parallel, the concentrate of one stage boosted and fed to the
next on fewer vessels.  What does each stage, and each element of a vessel,
actually do -- and where does the film correlation stop being a
measurement?

**The case.** 48 m3/h of membrane14's solution (NaCl 0.01 mol/L with
NO3-/NH4+ traces at 2e-4 mol/L, written ion by ion) through a 4:2 array of
`Generic-8040` elements, six per vessel:

    feed (2.4 bar) -> Stage1 (4 vessels x 6) -> concentrate1 -> Booster (+1.5 bar)
                         -> Stage2 (2 vessels x 6) -> concentrate2
                     permeate1, permeate2 leave as two product streams

`spiralWoundModule` with `vessels <n>; elements <m>;` IS a stage: the
vessels are identical, so the engine solves ONE vessel on F/n and scales its
outlets by n, and says so (`[array]`).  The booster is a `pump` of its own,
so its shaft work is on the stream table.

**The hardware is records.** `module Generic-8040;` is a generic 8-inch x
40-inch element (data/standards/assets/Generic-8040.dat): 37.2 m2, 16
leaves, 0.854 m leaf length -- every value an ANNOUNCED estimate -- and the
leaf width DERIVED, W = A/(2 n L) = 1.361 m.  It is wound with the FilmTec
FT30 feed spacer of Schock & Miquel, Desalination 64 (1987) 339-352, Tab. 1
(assets/SchockMiquel-FilmTecFT30.dat): h = 0.77 mm, d_F = 0.385 mm,
eps = 0.89, so S_v = 4/d_F (Eq. 23) and the hydraulic diameter is their
Eq. 17, d_h = 4 eps/(2/h + (1 - eps) S_v) = 0.952 mm -- not the 2 h eps =
1.37 mm an inline channel would use.  The spacer record carries the two
correlations (Sh = 0.065 Re^0.875 Sc^0.25, Eq. 30; lambda = 6.23 Re^-0.3,
Eq. 24) WITH their window, 100 < Re < 1000: the case names the model, the
record supplies the numbers, and a run outside the window is announced.

**What a student sees.**
- Per stage: stage 1 recovers 37.7 % of its feed, stage 2 35.1 % of its
  own (about 60 % overall); the observed rejections rise in stage 2
  (Na+ 35.1 % -> 40.2 %) because its flux is lower against a richer feed.
- Per element (`J_w_avg_elemK`, `dP_elemK`, `feedFlow_elemK`,
  `Re_in_elemK`, `Gamma_<ion>_elemK`): the first element of each vessel does
  the most work and polarises the most (Gamma_Na 0.090 in element 1 of
  stage 1, 0.014 in element 6); Re falls from 213 to 132 along a stage-1
  vessel, still inside the spacer's window -- the 4:2 taper keeps stage 2's
  inlet Re at 265.
- Per ion: the film coefficient is the spacer correlation evaluated on each
  ion's own D (`k_film_<ion>`, k proportional to D^0.75 through Sc^0.25),
  and the four ions are coupled at the wall by electroneutrality (Geraldes &
  Afonso, J. Membr. Sci. 300 (2007) 20-27): the trace nitrate passes
  NEGATIVELY rejected under the dominant NaCl (R_obs -4.7 % in stage 1), as
  in membrane12/14.

**What is NOT modelled, said plainly.** A maldistribution between the
vessels of a stage (they are identical by construction); the permeate-side
pressure drop and the permeate tube; the feed spacer's bypass at the leaf
edge Schock & Miquel describe (p. 344: their velocity used the spacer width,
wider than the leaf); fouling.  The booster prices the dissolved ions as
volume-less and heat-capacity-less (the dilute-solution reading, announced):
they carry no Vliq or liquid Cp.  The permeances are the NaCl row of
Fernandez de Labastida & Yaroshchuk, Membranes 11 (2021) 272, Table 1 (a
flat NF270 disc), applied to an element; A_w is the standard NF270
record's.  Every Generic-8040 value is an estimate.

**Gate.** `bin/curate/check_spiral_array.py`.
