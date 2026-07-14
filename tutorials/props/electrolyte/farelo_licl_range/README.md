# Pitzer for LiCl, recalibrated to Farelo's saturation

Prof. Fátima Farelo measured LiCl solubility at **19.7 → 23.5 mol/kg** (solid:
LiCl·H₂O) — *J. Chem. Eng. Data* **50** (2005) 1470, DOI 10.1021/je050111j. That
is one of the most concentrated aqueous electrolytes there is.

## The arc: the model first fails, then the measurement fixes it

The catalogue's earlier Li–Cl Pitzer parameters (Appelo, Parkhurst & Post,
*Geochim. Cosmochim. Acta* 125 (2014) 49), fitted below ~6 mol/kg, **blow up** at
high concentration — γ± = 774 at 19.7 mol/kg vs ~45 measured. The two-parameter
B-term is linear in *m*, so γ grows exponentially.

Rather than declare defeat, the parameters were **refitted** to Hamer & Wu (1972)
γ± **and** Farelo's saturation. A **negative Cφ** (−0.0026) tames the high-*m*
blow-up, and the three-parameter form then reaches saturation:

| m (LiCl) | γ± refit (engine) | γ± Hamer–Wu | |
|---|---|---|---|
| 6.0 | 2.48 | 2.72 | ✓ −9 % |
| 13.0 | 12.8 | 11.5 | ✓ +11 % |
| 19.7 (Farelo sat.) | **46.8** | ~45 | ✓ **+4 %** (was 774) |

## The hydrate needs the water activity

The LiCl·H₂O hydrate dissolution

```
LiCl·H₂O(s) ⇌ Li⁺ + Cl⁻ + H₂O      logK = log(a_Li·a_Cl) + log(a_w)
```

carries a **water-activity leg**. At 19.7 mol/kg the model gives **a_w = 0.11**
(not 1!) — which only the rigorous **Pitzer-HMW osmotic coefficient** delivers, not
the φ = 1 dilute shortcut. The `lithiumChlorideH2O` mineral Ksp (logK₂₅ = 4.984)
is calibrated to Farelo's saturation *through* that a_w. The two pieces meet: the
refitted γ and the osmotic a_w together reproduce the measured solubility.

## What this added to the standard catalogue

- `electrolyte/pairs.dat`: the **Li–Cl** Pitzer pair, **refitted** to Hamer–Wu +
  Farelo, valid to ~19 mol/kg (supersedes the Appelo low-*m* fit for concentrated
  LiCl).
- `electrolyte/minerals.dat`: the **LiCl·H₂O** hydrate Ksp, calibrated to Farelo.
- `electrolyte/ions.dat`: Li⁺ aqueous formation datum (`hfAq` = −278.49 kJ/mol,
  CODATA).

## Notes (the honest limits)

- The full measured dataset (this and the other five ternaries) is tabulated, cited,
  in `constant/experimental/farelo_solubility.csv`.
- The `equilibrate` round-trip (precipitate LiCl·H₂O from a supersaturated feed)
  **diverges at I ≈ 20** — a known active-set / γ fixed-point numerical limit at
  extreme ionic strength, *independent of the activity model*. The SI = 0
  calibration at the saturation composition is exact; reaching it by precipitation
  is the convergence problem, not the thermodynamics.
- The **AlCl₃** systems from the same paper remain deferred: Al³⁺ hydrolyses (the
  paper notes pH < 2.75) and needs an Al speciation model Choupo does not yet carry.

## The teaching point

This is the measurement *recalibrating* the model. Where the model already works
(the NaCl+NH₄Cl case next door) it earns trust by reproducing the data; where it
first failed (here), Farelo's measurement is what made the honest extension
possible. Experimental solubility work like hers is not redundant with a
simulator — it is what the simulator stands on.
