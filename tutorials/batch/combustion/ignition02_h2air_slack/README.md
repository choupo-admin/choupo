# ignition02_h2air_slack — the quantitative shock-tube pin

Stoichiometric H₂/air, **1100 K, 2 atm, constant volume** — the reflected-shock
condition of Slack (1977) as compiled in Ó Conaire et al. 2004 (Fig 8).
Kinetics: the Ó Conaire H₂/O₂ mechanism, Table I **verbatim** (19 reactions;
two Troe falloffs; two summed pairs; A in cm³-mol-s, Ea in kcal — the engine
converts and announces every one).

**Result: τ_ign (max dT/dt) = 43 µs** vs the measured ~40–60 µs window.

Two lessons:
1. **No seed.** This mechanism self-initiates (R5: H₂ + M = 2Ḣ, Ea = 105
   kcal/mol — slow, but that slowness IS the induction chemistry).  With the
   ignition01-style trace-H seed the delay collapses to 12 µs: initial
   conditions are physics, not knobs.
2. The engine now prints `tau_ign` in the epilogue (time of max dT/dt on the
   write grid) whenever a vessel ignites — no CSV spelunking.

Run `ignition01_h2o2` (GRI kinetics, 5 bar) for the sibling case and the
stiffness lesson (`_rk4`).
