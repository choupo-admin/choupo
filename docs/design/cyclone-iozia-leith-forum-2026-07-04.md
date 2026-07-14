# Forum — the real Iozia-Leith cyclone model + the eq-5 decimal typo (2026-07-04)

**Convened by:** Vítor ("convoca o forum e avança").
**Papers (in Literature, Crossref-verified):**
Iozia & Leith (1989), *Aerosol Sci. Technol.* 10:491, DOI 10.1080/02786828908959289
(the flow-pattern model); Dirgo & Leith (1985), *Aerosol Sci. Technol.* 4:401,
DOI 10.1080/02786828508959066 (the validation data).

## The problem

Choupo's `IoziaLeith` cyclone sub-model was a stub: the Lapple residence-time
cut diameter + a fixed logistic slope β. The real Iozia-Leith (1989) is a
**flow-pattern** model — the critical particle sits at the core radius where the
tangential velocity peaks, and d50 falls out of the centrifugal/drag balance:

- **eq (4):** `d50 = sqrt( 9 μ Q / (π z_c ρ_p Vt_max²) )`
- **eq (5):** `Vt_max = C · Vi · (ab/D²)^(−0.61) (De/D)^(−0.74) (H/D)^(−0.33)`
- **eq (6):** `d_c = 0.52 D (ab/D²)^(−0.25) (De/D)^(1.53)`  (core diameter)
- **eq (7):** `z_c = H−S`, or if `d_c>B`: `(H−S) − ((H−h)/(D/B−1))·(d_c/B−1)`

with `Vi = Q/(ab)` the inlet velocity.

## The eq-5 discrepancy (the reason the forum was called)

The printed 1989 prefactor is **C = 6.1**. Transcribed literally, for the
Stairmand geometry (Vi = 15.2 m/s) it yields **Vt_max ≈ 399 m/s** — supersonic,
physically impossible — and hence **d50 ≈ 0.1 μm** (≈10–27× smaller than the
1–3 μm every other model gives for the same case, and than the known d50 of a
Stairmand high-efficiency cyclone).

## The evidence (the data is the arbiter, not a reading)

1. **The paper contradicts itself.** Its OWN Figure 4 (measured vs predicted
   Vt_max, r²=0.983) caps Vt_max at **~40 m/s**; Figure 2 shows the Stairmand
   peak at ~20 m/s. So eq 5 *must* output ~20–40 m/s, not 399.
2. **The factor is exactly 10.** 399 / 39.9 = 10 and 6.1 / 0.61 = 10 — the clean
   signature of a **misplaced decimal point** in the 1989 typesetting, not a
   modelling choice.
3. **0.61 restores the physics.** With C = 0.61: Vt_max = 32.8 m/s (inside
   Figure 4's range) and **d50 = 0.99 μm** for `cyclone03` — squarely in the
   sane band (Leith-Licht 1.11 μm, Lapple 2.71 μm), and a high-efficiency
   flow-pattern model *should* sit at the fine end.
4. **The exponent SIGNS stay as printed (negative).** They are physically
   correct: a larger gas outlet (De↑) and a taller body (H↑) both *lower*
   Vt_max. Flipping them to positive would also fix the magnitude but breaks the
   physics — so the fault is the prefactor alone, consistent with a decimal typo.

## Ratified decision

- **Ship the real Iozia-Leith (eqs 4–7) with C = 0.61**, the Figure-4-consistent
  value, with a glass-box source comment stating the printed 6.1 is a decimal
  typo and why (this note IS the transparency — no hidden fudge).
- **Full standard geometry** (a, b, De, S, h, H, B) added to `CycloneContext`,
  read from an optional `operation.geometry {}` sub-dict, each dimension
  defaulting to its **Stairmand high-efficiency ratio × Dc** so a Dc-only case
  still runs and the classical models are untouched.
- **Validate against Dirgo & Leith (1985)**: a tutorial at their measured
  baseline — Stairmand HE, D = 0.305 m, design flow 0.139 m³/s (inlet 15 m/s),
  oil aerosol — running every sub-model side by side, so the student compares
  the predictions against the paper's measured fractional-efficiency curves.
- **Document it in the theory** (`ch:solids-sep`): the flow-pattern derivation
  (core radius, Vt_max, z_c → d50), so the model the code runs is the model the
  guide derives (the standing theory-must-match-code rule).

## Rejected

- Shipping the literal 6.1 (physically impossible; fails the paper's own Fig 4).
- Flipping the exponent signs to fix the magnitude (breaks the De/H physics).
- Guessing a non-decimal prefactor (0.30, 0.46…) to hit a single Fig-2 point —
  0.61 is the unique decimal-typo correction and is Figure-4-consistent.
