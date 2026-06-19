# Electrolyte solution enthalpy — build spec (draft for Vítor's OK)

*2026-06-09. Forum-derived (forum-electrolyte-enthalpy) **with Vítor's correction
applied**: the electrolyte solution enthalpy is NOT "ideal mixture + Hᴱ". It is
built on the aqueous **infinite-dilution reference** + the **relative apparent
molar enthalpy** `L_φ`. Companion to [`electrolyte-architecture.md`](electrolyte-architecture.md)
(the Pitzer/eNRTL *activity* build spec) — this is the *enthalpy* piece.*

Motivating case: a **NaOH–water evaporator** (the McCabe enthalpy-concentration
example). NaOH heat of solution ≈ −44.5 kJ/mol, strongly concentration-dependent;
today's ideal-mixture liquid enthalpy drops it entirely and the evaporator duty
is wrong. This also makes the v0.2.0 model-boundary rule (*H is the conserved
truth*) **true for electrolytes**, which it is not today.

---

## 1. Why NOT `Hᴱ` (Vítor's point, conceded)

`Hᴱ = H_real − Σ xᵢ Hᵢ_pure` is a deviation from an **ideal molecular mixture**.
For a strong electrolyte that reference is meaningless: there is no "pure liquid
NaOH" at 80 °C and no ideal mixing of Na⁺ + OH⁻ + water. The current
`H_liquid_formation = Σ xᵢ (h_ig,ᵢ − Hvap,ᵢ)` treats NaOH as a molecular liquid
component — physically empty. **You cannot add an `Hᴱ` to that baseline.**

## 2. The correct framing — infinite-dilution reference + `L_φ`

For a solution of `n_w` mol water and `n_s` mol salt (dissociating into the ions
the salt carries), on the **elements datum** Choupo already uses:

```
H_solution(T) = n_w · h_w(T)                              ← water stays MOLECULAR
              + n_s · [ h°_ions,aq(T) + L_φ(m, T) ]       ← salt: aqueous-ion ref + apparent enthalpy
```

- `h_w(T)` — pure-water molar enthalpy = the existing molecular form
  `h_ig,w(T) − Hvap_w(T)`. Water is molecular; unchanged.
- `h°_ions,aq(T) = Σ_ions νᵢ · Hf°ᵢ,aq(T)` — sum of the ions' **aqueous
  infinite-dilution** formation enthalpies (Na⁺ + OH⁻ for NaOH), on the H⁺(aq)=0
  convention, T-corrected by the aqueous-ion Cp°. **This is a NEW datum tier**
  (today `ions.dat` carries only z, MW).
- `L_φ(m,T)` — the **relative apparent molar enthalpy** of the salt, **→ 0 as
  m → 0** (the infinite-dilution anchor). It carries the whole concentration
  dependence (the "heat of dilution" curve) and comes from the **temperature
  derivative of the SAME Pitzer/eNRTL excess-Gibbs surface** that already gives
  the activity coefficients and the water activity / BPE:
  `L_φ(m,T) = −R T² · ∂/∂T [ Gᵉˣ/RT ]` per mole of salt.

The heat of dissolution of the solid salt then falls out, and is consistent with
the existing `Ksp(T)` lineage:

```
ΔH_diss(m,T) = [ h°_ions,aq(T) + L_φ(m,T) ] − h°_salt,solid(T)
             = ΔH_soln,∞(T)            + L_φ(m,T)
               └─ the EXISTING Component::electrolyteDissolutionEnthalpy (the Ksp offset)
```

So: **no `Hᴱ`, no molecular-NaOH term.** The salt's enthalpy is the aqueous-ion
reference **plus** `L_φ` — exactly the textbook apparent-molar-enthalpy framework.

## 3. Where it plugs in — a per-ROLE branch, not an additive term

In `ThermoPackage::H_liquid_formation(T, x)` the component loop **branches by
role** (apparent-component approach — `z` keeps NaOH as one component, no
expansion into ions):

- **molecular** component (water, ethanol, …) → the existing `xᵢ(h_ig − Hvap)`.
- **electrolyte salt** (resolved via the existing `hasElectrolyte()` /
  `dynamic_cast<ElectrolyteModel*>`) → `x_s · [ h°_ions,aq(T) + L_φ(m,T) ]`,
  where `L_φ` is a new `ElectrolyteModel::apparentMolarEnthalpy(m, T)` method
  (analytic `−R T² dGᵉˣ_RT/dT`, finite-difference only as a unit-test oracle).

`H_real`/`H_stream_formation` and the **Evaporator** (`Q_required`) inherit it for
free by routing through `H_liquid_formation` — the same term then serves the
crystalliser. No new factory; no `Origin`/provenance on the hot path.

## 4. The honesty guard (no silent crutch)

The current `tau(T)=tau₂₅·298/T` / `A_φ(T)`-only Pitzer is **calorimetrically
uncalibrated**: its T-derivative captures only the Debye–Hückel limiting tail and
misses the short-range virial (`dβ/dT`) that DOMINATES the −44 kJ/mol at
evaporator molality. *Consistency is not correctness.*

Therefore a per-salt **`calorimetricFit` provenance flag, default FALSE**: if a
salt's parameters were not regressed against ΔH_dilution, `apparentMolarEnthalpy`
returns 0 **and the run announces** `electrolyte L_φ omitted (params not
calorimetrically fitted)`. So NaCl (osmotic-only) emits no bogus enthalpy, the
143 + existing electrolyte goldens stay frozen, and the omission is loud.

## 5. Data tier (all open / public-domain, cited PRIMARY per value)

- `ions.dat += { HfAq, SAq, CpAq }` per ion — **CODATA Key Values + NBS Tables**
  (Wagman et al., *J. Phys. Chem. Ref. Data* 11 Suppl. 2, 1982), US-gov public
  domain. The DHAQFM analogue; anchors the −44.5 kJ/mol offset
  (Na⁺ ≈ −240.1, OH⁻ ≈ −230.0, NaOH(s) ≈ −425.6 kJ/mol — verify vs the table).
- Calorimetric refit/validation target: **Parker, NSRDS-NBS 2 (1965)** — NaOH
  heats of dilution + apparent molar Cp_φ. US-gov public domain.
- **EXCLUDED (licence):** Perry's / McCabe printed H-x chart (McGraw-Hill,
  all-rights-reserved — the no-grant trap; not for fit OR AAD), Aspen ELECNRTL
  databank, DIPPR/Yaws/NIST-no-grant.
- Reuse — do NOT duplicate — `Component::electrolyteDissolutionEnthalpy` for the
  offset; it is `ΔH_soln,∞`, **not** `L_φ` (must not be reused as the curve).

## 6. Validation-first (the merge gate)

1. Regress the new T-dependent params (eNRTL `tau = a + b/T`; Pitzer `dβ₀/dT,
   dβ₁/dT, dCφ/dT`) against **Parker ΔH_dil + Cp_φ** (NOT the chart) via the
   existing `fitParameters`.
2. Ship `props/compare/enthalpy/naoh_water` on the existing **AadCompare**
   harness: predict `H_φ(m,T)=ΔH_soln,∞+∫…` vs the measured ΔH_dil isotherms,
   AAD printed aloud. Separate **Cp channel** AAD (second T-derivative — where an
   un-refit model fails even when L_φ(298) looks fine).
3. **Acceptance:** AAD < 5 % on ΔH_dil across 0.1–6 mol/kg **and a LOUD
   out-of-range flag above 6 mol/kg** (NaOH evaporators run to ~30). Sanity pins:
   `ΔH_soln(m→0) = −44.5 kJ/mol`; `L_φ` finite at `m→0` and `m→sat` (guard
   `m<1e-12`).
4. Record the end-to-end NaOH-evaporator golden vs the McCabe worked example
   **only AFTER** the H-x AAD passes (else an unvalidated number is laundered in).

## 7. Glass-box surface (B is A's visible oracle, not a fallback)

Property Explorer, reusing the existing overlay instrument — **three curves on
one `H(w,T)` chart**: (i) ideal-mixture line (today's bare baseline, the null
model); (ii) ideal + the refit `L_φ`; (iii) the **measured** NBS/Parker points
with AAD %. The vertical GAP between (i) and (iii) IS the heat of dilution and
IS the dominant term in the duty. The Evaporator duty printout gains a **named
line**: `heat of dilution = F·Σ(H_φ,out − H_φ,in) = X kW`, beside its existing
sensible/latent/BPE lines (a scalar Q that hides L_φ in "sensible" is the magic
to reject).

## 8. Build order

0. **Honesty (ships alone, zero physics, zero golden churn):** the per-salt
   `calorimetricFit` flag (default FALSE) + the loud omission announcement; pin
   the reference-state contract (aqueous-ion Hf° vs elements datum, heat of
   solution counted ONCE) in the theory guide.
1. **Engine (gated FALSE, goldens byte-identical):** `Gᵉˣ_RT(m,T)` per kernel +
   analytic `apparentMolarEnthalpy = −R T² dGᵉˣ_RT/dT`, cross-checked once by a
   central-FD unit test; test the `m→0`/`m→sat` limits. Not yet wired to duty.
2. **Data act (curation):** `ions.dat += {HfAq,SAq,CpAq}` (per-value Origin);
   curate Parker ΔH_dil + Cp_φ; refit NaOH via `fitParameters`.
3. **Validation gate:** `props/compare/enthalpy/naoh_water` AadCompare; pass
   AAD < 5 % (+ Cp channel) **before** flipping NaOH's `calorimetricFit`.
4. **Wire + decompose:** the per-role branch in `H_liquid_formation`; refactor
   `Evaporator::Q_required` to consume it (kill the "no Hmix" note) + the named
   heat-of-dilution line; flip NaOH's flag; re-record the NaOH-evaporator golden.
5. **Visible surface:** the 3-curve `H(w,T)` overlay; the model-boundary audit
   explains the electrolyte boundary. Re-record existing electrolyte duty goldens
   (evaporator06/07, crystalliser05/06/07) ONLY when their salts are themselves
   fitted — NaCl stays osmotic-only/frozen until then.

## 8b. The molecular twin (added 2026-06-11 — Vítor's acceptance case)

The NaOH-antisolvent flowsheet also needs the **heat of mixing of
water-ethanol** — the SYMMETRIC analogue: molecular `Hᴱ = −RT²∂(Gᴱ/RT)/∂T` of
the NRTL surface. For molecular mixtures the ideal-mixture reference IS valid
(pure liquids exist), so there `Hᴱ` is the right frame. Same caveat, same cure:
NRTL τ constant in T ⇒ Hᴱ≡0 wrong; needs `tau { a b }` (a+b/T) refit to
measured water-ethanol Hᴱ (open primary data), same `calorimetricFit`-style
gate, AAD-first. Slices 1b (ActivityModel::excessEnthalpy, gated) and 2b/3b
(refit + AAD) — mirrors of 1-3. See `docs/thermo-hierarchy.md` (acceptance case).

## 9. Blockers + the open decision

- **Data acquisition is the real gate (~90 % of the cost; numerics is cheap):**
  the open Parker ΔH_dil + Cp_φ and the CODATA/NBS aqueous-ion Hf° must be in
  hand *before* the refit. If the refit cannot hit AAD < 5 % on the open data,
  **A is not ready and B (a case-local `H(w,T)` correlation under `constant/`,
  axiom-4) is the honest interim** — its table then becomes A's validation oracle,
  so the work compounds.
- **Reference-state bookkeeping** must be pinned by a test before wiring: the
  aqueous-ion Hf° tier must be on the SAME elements datum, or the offset will not
  cancel between feed and product (different molality) and will corrupt absolute
  duty invisibly. Pin with `ΔH_soln(m→0) = −44.5 kJ/mol`.
- **Scope:** v1 = a single aqueous strong salt, `L_φ` from the refit Gᵉˣ only.
  Defer true-component speciation, electrolyte EoS, mixed-solvent Born enthalpy,
  multi-salt `L_φ` cross-terms.
- **OPEN DECISION (Vítor):** the **Cp channel** (second T-derivative). Needed for
  multi-effect / large-ΔT evaporators; its own refit target. In or out of v1?
