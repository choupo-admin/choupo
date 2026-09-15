# membrane12 -- SDEM on NF270, dominant NaCl with NO3-/NH4+ traces

**The question.** Why does nitrate slip through a nanofiltration membrane
that rejects chloride, when the two ions have almost the same hydrated size?

**The lesson.** Under `transport SDEM;` every ion keeps its own permeance,
but the ions share ONE electric field, fixed by zero current.  NF270 is less
permeable to Cl- than to Na+ (the record: 3.9 against 113 um/s), so a field
arises that slows the cation and speeds the anions -- and a trace anion more
permeable than Cl- (NO3-, 13.8 um/s) is pushed through faster than the
dominant salt: its rejection sits BELOW the salt's and, at small fluxes, goes
negative.  The run publishes the field (`membranePotential_mV_avg`, and
`psi_mV` along the channel) so the mechanism is a number, not a sentence.

**Source of the numbers.** Fernandez de Labastida & Yaroshchuk, Membranes 11
(2021) 272, CC BY 4.0, Table 1 (row NaCl) -- ion permeances the authors
fitted with the SDEM model to CP-corrected rejections on NF270 at 0.01 M
NaCl + 2e-4 M traces, 20 C.  What the paper reports for this case: NaCl and
NH4+ rejected 40-80 %, NO3- below 50 % and lightly negative at small fluxes.
This run is intrinsic (large k_film) at one operating point; the gate
`check_sdem` holds the permeate electroneutral to machine precision and the
dominant-salt rejection to the single-salt law R = J_v/(J_v + P_s) with the
AMBIPOLAR P_s, recomputed independently.

**The figures, digitised.** `constant/experimental/fdl2021_figures.csv` holds
the 106 measured points and the authors' fitted lines of the paper's Figures
1-4, read off the published panels by `bin/curate/digitise_fdl2021.py` (the
reading error is declared per point; the images are not in the tree).
`check_sdem` drives the engine to each figure's flux and holds it, in the
trace limit the authors' lines assume, to those lines within a stated band
per series -- and pins that at the paper's own 2e-4 M the traces are NOT
traces (under a sulfate they carry the anion current and relax the field).

**What is NOT validated here.** The measured SYMBOLS are compared by
nobody: the model is held to the authors' FIT, and the symbols scatter about
it by a residual that is theirs to explain.  NH4+ here is a bound in the
paper ('>60 um/s, the fit became insensitive'); the engine meets that line
only near 1000 um/s and the record keeps the bound.
