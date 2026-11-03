# cstr01_first_order — the first reactor, and the number that sizes it

A 1 kmol/h equimolar ethanol / acetic-acid feed at 350 K enters a 5-litre
CSTR.  One reaction (Fischer esterification), pseudo-first-order in
ethanol, Arrhenius kinetics from `constant/reactions`.  The golden:
**X = 52.59 %** conversion of ethanol, extent **ξ = 0.0730 mol/s**,
residence time **τ = 310.3 s**, rate constant **k = 3.575e-3 s⁻¹** at
350 K, and the reactor removing only **0.154 kW** to stay isothermal (the
reaction is only mildly exothermic; see lesson 4).

## The lesson

1. **One equation, one unknown, and the unknown is the extent.**  The
   **Log** tab prints `Newton in extent ξ (ξ_max = 1.389e-01 mol/s)`
   and a two-row table: from a guess of ξ_max/2 the residual goes
   −7.6e-3 → −2.4e-13 in **one step** — a first-order rate law in a CSTR
   is linear in ξ, so Newton lands exactly.
2. **Damköhler is the whole design in one number.**  `Da = kτ = 1.109`,
   and for first order `X = Da/(1 + Da) = 0.526`.  Do that division by
   hand; it is the golden to three figures.
3. **k comes from `A` and `Ea`, at this T.**  The reaction record says
   the pair is ILLUSTRATIVE.  Read the Arrhenius line in the log
   (`k_fwd: 3.5750e-03`) and reproduce it from `A exp(−Ea/RT)`.
4. **Isothermal means somebody removes the heat.**  The liquid-phase
   esterification is only mildly exothermic: calorimetry puts it at about
   −3 to −4 kJ/mol, and Choupo prices it from the four liquid formation
   enthalpies at about −2.1 kJ/mol at 350 K (`dHrxn_kJ_per_mol` in the
   log; `Q_kW = −0.154`).  Acetic acid's liquid is bridged to the
   ideal-gas monomer datum through the heat of vaporising to the MONOMER
   (the measured latent heat at Tb plus the dissociation of the dimers its
   vapour carries, carried to 298 K on the record's own heat capacities;
   announced in the log); with the calorimetric heat alone the reaction
   would read −25.7 kJ/mol, which is the heat of making dimers, not of
   esterifying.
   `cstr04_adiabatic` removes nothing and lets T answer.

## What to try

Double `V_R` to 0.010: τ doubles, Da doubles, and X moves to
Da/(1+Da) — check it before you run.  Then open `pfr01_first_order`: the
same volume, the same kinetics, and a different answer.
