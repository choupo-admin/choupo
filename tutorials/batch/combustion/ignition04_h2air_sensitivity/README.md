# ignition04_h2air_sensitivity — which reaction governs the ignition?

The stoichiometric H₂/air vessel of `ignition02_h2air_slack` (1100 K, 2 atm,
constant volume, Ó Conaire 2004, Table I verbatim) with one added block:

```
sensitivity { response tauIgnition; factor 1.1; reactions all; top 6; }
```

The engine integrates the vessel **N + 1 times** (the base run, then once per
reaction with that reaction's *net* rate multiplied by 1.1) and prints, sorted by
|S|, the normalised sensitivity of the ignition delay

    S_j = d ln τ / d ln k_j = ( ln τ_j − ln τ_0 ) / ln 1.1

with τ = the time T first exceeds T₀ + 400 K, linearly interpolated between the
two accepted states that bracket it (not the write-grid maximum of dT/dt, whose
resolution is the write interval).  `sensitivity.csv` carries all 21 reactions;
the golden pins τ₀ and the six that are not noise.

## What a student reads from it

| reaction | S | reading |
|---|---|---|
| R1  H + O₂ = O + OH | **−1.02** | chain BRANCHING: a 10 % faster R1 shortens τ by 10 %.  Nothing else comes close. |
| R9  H + O₂ (+M) = HO₂ (+M) | **+0.37** | chain TERMINATION at this temperature: it takes H atoms away from R1, so a faster R9 delays the ignition. |
| R2  O + H₂ = H + OH | −0.15 | the second branching step. |
| R3, R10, R11 | −0.05, −0.05, −0.03 | the rest of the radical pool. |
| the other 15 | \|S\| < 0.004 | irrelevant to τ: the H₂O₂ branch, the dissociations R5–R7. |

The signs and sizes are the run's own.  They were checked reaction by reaction
against Cantera 3.2.0 (`set_multiplier`, same definition of τ): on the same
mechanism and thermo the two agree to 2·10⁻⁵ in S for every reaction and to
6·10⁻⁶ in τ₀ (`docs/reviews/2026-11-19-chemkin-real-mechanism/REPORT.md`,
section 10).

## Two details that matter

* **The multiplier scales forward and reverse together** (`k_rev = k/K_c`), so
  every multiplied run ends in the same equilibrium: gate
  `check_ignition_sensitivity` holds all 21 final temperatures to 10⁻⁶ of the
  base run (measured 7·10⁻¹²), and S of R1 to a hand recomputation from two runs
  of the case with R1's `A` edited.
* **This case is not ignition02's holdup.**  `ignition02` states 2 atm but loads
  2.5·10⁻⁵ kmol into 1 L, which at 1100 K is 2.26 atm; here the moles are
  p V / R T for 2 atm exactly and the air is 2 : 1 : 3.76, so a Cantera run at 2 atm
  is the same problem.  τ₀ is 45.12 µs here.

Cost: 22 integrations of an adaptive stiff solver, about 7 s.  No adjoint, no
direct method: the brute force is what a student can read.  Theory Guide
`sec:ignition-sensitivity`.
