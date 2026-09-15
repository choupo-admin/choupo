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

**What is NOT validated here.** The paper's per-point rejections live in its
figures, not its text; the anchors are the four Table 1 salt permeances (the
ambipolar identity) and the qualitative trace behaviour the text states.
