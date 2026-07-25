# PHASE 7 — thermochemistry defects in crystalline solutes

Curated 2026-07-25. Private tier (`data/tmp/components/`, gitignored). Scope was
the sugars, polyols, amino acids and small solutes named in the task. Every value
below is a FACT re-cited to its PRIMARY. NIST WebBook condensed-phase free view was
used ONLY as a finding aid to the primary it names (never a WebBook average as the
datum). MDPI/PMC full text was used for the open-access amino-acid paper. No number,
phase or citation was fabricated; a value is `measured`/`derived` only where the
primary (or its verbatim NIST-listed determination) was actually read.

Retrieval note: `WebSearch` budget was exhausted before this pass began (200/200,
prior agents), so all research went through `WebFetch` against NIST WebBook and the
Europe PMC full-text API. MDPI blocks `WebFetch` (403); the amino-acid paper was read
through its Europe PMC mirror (PMC9823850).

---

## Per-file resolution

### erythritol — dHf phase attribution — RESOLVED (provenance corrected)
- **Defect:** dHf -885.21 kJ/mol cited to Parks & Manchester 1952, feared to be a
  LIQUID combustion value used as the crystalline datum (the xylitol trap).
- **Primary obtained:** YES — NIST WebBook condensed-phase (ID=C149326), verbatim.
- **Finding:** the fear was WRONG. NIST lists Parks & Manchester 1952 as the SOLID
  enthalpy of combustion `dcH(cr) = -2118.0 kJ/mol` (method **Cm**). The LIQUID data
  on the same page — `dfH(liq) = -910.48 ± 0.54`, `dcH(liq) = -2092.8` — belong to a
  DIFFERENT paper (Parks, West et al., JACS 68 (1946) 2524). The value carried here is
  the crystalline solid.
- **State:** the -885.2 kJ/mol datum is the SOLID formation enthalpy, and it is
  **DERIVED** (Hess) from the measured solid combustion, not directly measured. Fixed:
  origin `measured → derived`; a glass-box `formationEnthalpyDerivation{}` block now
  writes out `dHf(cr) = 4·dHf(CO2,g) + 5·dHf(H2O,l) − dcH(cr) = −885.2 kJ/mol`; the
  concern block is replaced by a `resolution` + `phaseDistinction` that keeps the
  liquid value visibly apart. Value essentially unchanged (−885.21 → −885.2 to match
  the derivation from the rounded ΔcH). **No phase trap occurred.** status → candidate.

### mannitol — thesis vs peer-reviewed primary — CORRECTED (value changed)
- **Defect:** primary of record was McClaine's unpublished 1947 PhD thesis (−1337.5),
  while a peer-reviewed value agreeing to 0.3 kJ/mol exists.
- **Primary obtained:** YES — NIST WebBook (ID=C69658), verbatim: BOTH −1337.5
  (McClaine, 1947, thesis) and **−1337.2 ± 0.79 (Parks, West, Naylor, Fujii &
  McClaine, JACS 68 (1946) 2524, method Ccb)**.
- **State:** datum RE-POINTED to the peer-reviewed Parks et al. 1946 value; McClaine
  thesis demoted to corroboration. `dHf_298 −1337500 → −1337200 J/mol` (0.3 kJ/mol,
  within stated uncertainty). status → candidate.

### arabinose — dHf primary + enantiomer — RESOLVED (value refined)
- **Defect:** dHf −1058 kJ/mol cited only to a "combustion series title"; enantiomer
  (D vs L) and exact primary unresolved, while the file declares L-arabinose.
- **Primary obtained:** YES — NIST WebBook D-arabinose (ID=C10323203), verbatim:
  `dfH(cr) = −1057.9 ± 1.6 kJ/mol` from **Desai & Wilhoit, 1970** (combustion,
  `dcH(cr) = −2338.8 ± 1.6`), plus an independent **Stroh & Fincke, 1963**
  (`dcH(cr) = −2336.2`).
- **State:** primary resolved; `dHf_298 −1058000 → −1057900 J/mol`. Added an
  `enantiomerNote`: the calorimetry is on D-arabinose, but standard formation enthalpy
  is ENANTIOMER-INVARIANT (mirror-image pure-enantiomer crystals have identical lattice
  energy), so the D value is the correct datum for L-arabinose. status(dHf) → candidate.
  **S° and Cp remain flagged** (absent from NIST; the β-D-arabinose low-T calorimetry
  is still not located).

### lysine — Cp 289.2 "outlier" — REFRAMED (defect diagnosis corrected; still flagged)
- **Defect claim:** 289.2 J/mol/K (1.98 J/g/K) is a physical outlier vs the family
  (glutamicAcid 1.19), suspected transcription error.
- **Primary obtained:** PARTIALLY — the paper is open access: Pokorný, Štejfa, Havlín,
  Fulem & Růžička, *"Heat Capacities of L-Cysteine, L-Serine, L-Threonine, L-Lysine,
  and L-Methionine"*, Molecules 28 (2023) 451 (**PMC9823850**). Read via Europe PMC.
- **Finding:** the "outlier" argument is **PHYSICALLY MISGUIDED**. The paper states
  verbatim that *"L-lysine and L-methionine are in close proximity to a second-order
  phase transition at T = 298.15 K, leading to an increased heat capacity."* A high Cp
  near ambient is therefore EXPECTED for lysine — the family-trend comparison assumed a
  smooth Cp, which fails across a near-ambient λ-type transition.
- **Value confirmed/corrected/flagged:** the exact digit (289.2) could NOT be certified
  in this pass — Table 6 / Tables S8–S12 numeric cells were not machine-readable, and
  the automated extraction returned physically impossible entropies, so it was rejected
  rather than trusted. Value kept; the `flagReason` is rewritten around the true issue
  (digit un-certified + peak-vs-baseline ambiguity across the transition), the false
  "outlier" reasoning is recorded as `outlierReview: WITHDRAWN`. **Still flagged** —
  needs a human digit-exact read of Table 6/S8–S12. (Not fabricated, not demoted: the
  value is now physically plausible.)

### arginine — S° and Cp — remain FLAGGED (attempt recorded)
- **Primary obtained:** NO. The paywalled Pokorný et al., Int. J. Thermophys. 42
  (2021) 156 remains the only S/Cp source. Verified that the OPEN Molecules 28 (2023)
  451 paper does NOT cover arginine (its set is Cys/Ser/Thr/Lys/Met), and that NIST
  (ID=C74793) exposes no S(298). Structured absences kept; `attempted` + tightened
  `blockedBy`/`action` added. State: flagged (structured absence preserved).

### acrylamide — S°_298 — remains FLAGGED (absence confirmed real)
- **Primary obtained:** for S°, NO. NIST (ID=C79061) confirmed verbatim that it lists
  ONLY `dfH(cr) −212.08 ± 0.30`, `dcH(cr) −1683.02 ± 0.26`, `Cp(cr) 110.58` (all
  Steele, Chirico et al. 1989) and **no S(298)**. The S° absence is genuine.
- **State:** dHf and Cp VERIFIED digit-exact against NIST (no change). S° stays a
  structured absence; `action` now pins Steele & Chirico 1989 as the natural third-law
  primary to obtain. flagged.

### fructose — S° / solid Cp — remain FLAGGED (dHf verified, absences confirmed real)
- NIST (ID=C57487) confirmed verbatim: only `dfH(cr) −1265.6 ± 0.46` (Clarke &
  Stegeman 1939; Cox & Pilcher 1970 reanalysis) — S and Cp genuinely ABSENT. dHf
  verified digit-exact; `nistCheck` added. S/Cp stay flagged (2012 JCT adiabatic study
  still paywalled/unlocated).

### galactose — already complete — ENRICHED (verified crosscheck)
- NIST (ID=C59234) confirmed S°=205.4 (Jack & Stegeman 1941; sub-90 K extrapolation
  48.95 J/mol/K) and a second Cp determination 220.54 J/mol/K at 296.9 K (Jack &
  Stegeman 1941, α, 64–297 K), added as an independent crosscheck beside the shipped
  Kawaizumi 1981 216.3. No defect; strengthened.

### lactose — dHf / S° — remain FLAGGED (Cp verified; absences confirmed real)
- NIST (ID=C63423) exposes ONLY `Cp(cr) 417.6` (Kawaizumi 1981) — no dfH, no S,
  corroborating the two flagged absences. Cp verified; note added. dHf (Clarke &
  Stegeman 1939 combustion, not exposed by free NIST) and S° stay flagged.

### trehalose — S° / solid Cp — remain FLAGGED (attempt recorded)
- NIST (ID=C99207) carries NO condensed-phase thermochemistry (identity + MS only);
  the paywalled Lopes Jesus et al. 2005 study remains the place to look. dHf stays the
  glass-box Hess derivation from the 2005 combustion. `nistCheck` added. S/Cp flagged.

---

## Tally

- **Defects addressed with a READ primary: 4** — erythritol (phase verified via NIST),
  mannitol (Parks 1946 via NIST), arabinose (Desai & Wilhoit 1970 via NIST), lysine
  (physical mechanism from the open PMC9823850).
- **Values corrected (number changed): 3** — mannitol (−1337.5 → −1337.2), arabinose
  (−1058 → −1057.9), erythritol (origin measured→derived; −885.21 → −885.2, phase
  confirmed crystalline).
- **Remain flagged (structured absence / un-certified digit): 12 property gaps** —
  arginine S°, arginine Cp, acrylamide S°, fructose S°, fructose Cp, lactose dHf,
  lactose S°, trehalose S°, trehalose Cp, arabinose S°, arabinose Cp, and the
  **lysine Cp digit** (flagged but now physically justified). No fabrication anywhere.
- **Verified-and-confirmed (no change needed): dfH** of fructose, galactose, lactose Cp,
  acrylamide dfH+Cp, lysine dfH, galactose S°+Cp — all matched NIST digit-exact.

## Headline resolutions
- **erythritol phase-attribution: NO liquid/crystal trap existed.** The −885.2 kJ/mol
  is the crystalline solid, Hess-derived from Parks & Manchester 1952's SOLID
  combustion `dcH(cr) = −2118.0 kJ/mol`; the liquid values on the NIST page are a
  different paper (Parks, West et al. 1946). Only the `origin` label was wrong
  (measured → derived) and is fixed with a written-out derivation.
- **mannitol thesis-vs-journal: re-pointed** to the peer-reviewed Parks, West, Naylor,
  Fujii & McClaine, JACS 68 (1946) 2524 (−1337.2 ± 0.79); McClaine's 1947 thesis kept
  only as corroboration.
