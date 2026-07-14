# KCl drowning-out (antisolvent) crystallisation by ethanol

The KCl counterpart of `crystalliser06` (NaCl): a saturated **aqueous KCl brine**
is mixed with **ethanol**, whose low dielectric collapses the KCl solubility, so
KCl crystallises with **no cooling and no evaporation**. KCl is the salt the
catalogue's `KCl.dat` names as *"recovered by ANTISOLVENT (drowning-out with
ethanol)"* — this case realises it.

## The physics

Ethanol's relative permittivity (24.3) is far below water's (78.5). Dosing it
lowers the mixed-solvent dielectric, which **raises the mean ionic activity
coefficient** γ± (eNRTL mixed-solvent + Born term), so the saturation molality
collapses. The saturation is the **same ion-activity product**
`Ksp = (γ± · m_sat)²` anchored in pure water, re-solved with the mixed-solvent
γ± at the feed's salt-free ethanol fraction — the physics the aqueous Pitzer
model cannot reach (the reason eNRTL exists).

## The case + result

100 kmol/h saturated brine (x_water 0.921, x_KCl 0.079 = 4.76 mol/kg) + 60 kmol/h
ethanol → salt-free x_ethanol ≈ 0.39:

| quantity | value |
|---|---|
| ethanol fraction (salt-free) | 0.394 |
| m_sat | **4.76 → 0.615 mol/kg** |
| γ± at saturation | 6.63 |
| **yield** | **65.5 %** |

## Experimental anchor — the Farelo paper

The KCl–water–ethanol activity behaviour modelled here is measured in **A. Lopes,
F. Farelo & M. I. A. Ferra, "Activity Coefficients of Potassium Chloride in
Water–Ethanol Mixtures", *J. Solution Chem.* 28 (1999) 117** — mean activity
coefficients of KCl by emf in 5–20 % w/w ethanol, 25–45 °C. That γ± rise with
ethanol content is exactly the driver of the drowning-out captured above.

## Honest scope

- The **eNRTL τ for K–Cl is the illustrative 1:1-alkali-chloride proxy** (= Chen
  & Evans water–NaCl), so the numbers are qualitative. The Farelo data is the
  path to a **quantitative refit** of the KCl–water–ethanol interaction (the
  paper reports Pitzer β⁰/β¹/Cᵞ per solvent composition).
- The **mass / yield is the reliable output**. The crystalliser's heat term
  carries the shared electrolyte-enthalpy caveat (a dissolved salt's formation
  datum lives in its ions, so the stream enthalpy falls back to the sensible
  datum and is announced) — identical to `crystalliser06`.
