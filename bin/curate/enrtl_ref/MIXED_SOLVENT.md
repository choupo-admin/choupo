# Mixed-solvent eNRTL — NaCl/water/ethanol drowning-out crystallization (VALIDATED)

The eNRTL differentiator: a salt in a NON-ideal molecular solvent, which Pitzer
(aqueous) and plain NRTL (ion-blind) both cannot do.  SCIENCE DONE + VALIDATED.

## Physics (the antisolvent / drowning-out mechanism)
Adding ethanol drops the solvent dielectric (78.5 -> 24.3) -> the Debye-Huckel +
**Born** terms strongly destabilise the ions -> NaCl solubility collapses ->
crystallises.  `enrtl_mixed_solvent.py` extends the validated aqueous eNRTL with
dielectric mixing (mass-weighted) + the Born term (ref = water).

## Validation (two anchors)
1. AQUEOUS LIMIT (xE=0): reproduces the validated aqueous eNRTL EXACTLY (Born=0).
2. ANTISOLVENT CURVE: calibrated to the KCl(1:1) water+ethanol solubility table
   (Pinho & Macedo, J. Chem. Eng. Data 50 (2005) 29 -- open PDF saved here) via
   the Born radius = 1.0 A (the standard eNRTL/MSE practice of fitting effective
   Born radii to solubility).  Matches within ~10-20% across xE=0.04-0.78.
   NaCl pure-water 6.16 mol/kg and pure-ethanol 0.009 mol/kg endpoints honoured.

## The process (`drowning_out_crystallization.py`)
1 kg water saturated with NaCl (6.144 mol) + ethanol -> yield:
  0.5 kg EtOH -> 24% ; 2 kg -> 67% ; 5 kg -> 90% ; 9 kg (78 mol% EtOH) -> 95%.

## Honest caveats
- The NaCl-water-ethanol solubility table is NOT in Pinho & Macedo (only NaBr/KCl
  in water+ethanol; NaCl in water+methanol & methanol+ethanol). The antisolvent
  strength is therefore calibrated to the KCl(1:1) ANALOG + the NaCl endpoints,
  not a direct NaCl-water-ethanol fit. A fitted ethanol-NaCl local tau (from the
  paywalled J.Chem.Eng.Data NaCl-water-ethanol data, if Vitor has access) would
  refine it.
- C++/unit-op integration pending: port the mixed-solvent eNRTL kernel + a
  crystalliser that adds antisolvent -> a runnable choupoSolve drowning-out case.
