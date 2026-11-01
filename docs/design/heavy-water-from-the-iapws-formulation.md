# Heavy water from the IAPWS formulation

*2026-11-02.  Commissioned by Vítor ("because researchers asked me"): promote
`heavyWater` (D2O, CAS 7789-20-0) from an unverified import to a record a
researcher can defend.  Decision taken on a stated default; reversible by
reverting the record.*

## 1. The question and the old record

`data/standards/components/heavyWater.dat` was `reviewStatus interim;
importedFromCoolProp720_notCheckedAgainstPrimaries`: an Antoine and two Cp
polynomials fitted to the CoolProp 7.2.0 implementation of the reference EOS,
no formation datum, no entropy, and a UNIFAC decomposition copied from the H2O
group.  Measured against the primary equation (below), the Antoine fit was
+0.33 % at 298.15 K, −0.56 % at the normal boiling point and −2.3 % at 630 K.
Its constants (Tb, HvapTb, omega, Vliq, MW, Tc) turn out to be right: they are
the EOS values to their printed digits, so the import was faithful to the
EOS and what was missing was the reading of the EOS.

## 2. Sources READ in this session

| Source | What was taken |
|---|---|
| IAPWS R16-17(2018), *Revised Release on the IAPWS Formulation 2017 for the Thermodynamic Properties of Heavy Water*, https://iapws.org/technical-guidance/release/Heavy (cover page: publication allowed with attribution) | Eqs. (1)-(7), Tables 1-2 (the full Helmholtz function), Tables 6, 7, 8 (computer-verification values), Eqs. (9)-(13) |
| Herrig, Thol, Harvey, Lemmon, *A Reference Equation of State for Heavy Water*, J. Phys. Chem. Ref. Data **47**, 043102 (2018), doi:10.1063/1.5053993 (NIST reprint) | Table 1 (constants), Eqs. (1)-(3) with Table 3 (auxiliary vapour pressure, saturated-liquid and -vapour density), Sec. 5.1.1 uncertainty |
| Simkó, Furtenbacher, Hrubý, Zobov, Polyansky, Tennyson, Gamache, Szidarovszky, *Recommended Ideal-Gas Thermochemical Functions for Heavy Water and its Substituent Isotopologues*, J. Phys. Chem. Ref. Data **46**, 023104 (2017), doi:10.1063/1.4983120 | Table 6: Cp, S, H of D2(16O); used to cross-check the ideal-gas Cp, and the S(298.15 K) = 216.60269(3) J/(mol K) that is read and NOT entered (§5) |
| IAPWS R5-85(1994), *Surface Tension of Heavy Water Substance* | READ, not entered (§6): σ = B τ^μ (1 + b τ), B = 238 mN/m, b = −0.639, μ = 1.25, Tc = 643.847 K |
| The brief named "Herrig, Span, Lemmon, Bell" for the EOS; the authors are **Herrig, Thol, Harvey, Lemmon**. | — |

NOT read: IAPWS R17-20 (viscosity of heavy water), R18-21 (thermal
conductivity) -- their existence was confirmed by search only.

## 3. What was built

* `bin/curate/heavy_water_iapws.py` -- a pure-Python transcription of the
  Helmholtz equation, tool-side (CLAUDE.md §4: a tool may read the runtime,
  nothing in the runtime reads a tool).  `--check` reproduces **every**
  computer-verification value of R16-17 Tables 6, 7 and 8 (to 1e-8) and the
  paper's check values for Eqs. (1)-(3) and (9).  This is what makes the
  transcription trustworthy: the first run failed on the ideal-gas part
  because the text extraction of the release dropped the sign of one exponent
  (ν1 = 0.106 33 × 10^-1, not 10^1); Table 6 found it, and nothing else would
  have, since the pressure, density and saturation values do not depend on
  the ideal-gas part.
* `heavyWater.dat` rewritten: `vaporPressure` is `model Wagner` with the
  paper's Eq. (1) exponents (1, 1.5, 2.44, 5.3, 14, 20), reducing constants
  (643.847 K, 21.6618 MPa) and Table 3 coefficients as printed.  The engine's
  existing `Wagner` model took it as DATA: **no new engine model**.  Constants
  from R16-17 / Herrig Table 1, or derived from the EOS by the script (omega,
  HvapTb, Vliq).  Cp polynomials fitted to Eq. (6) and to the EOS
  saturated-liquid cp, with their residuals in the record.
* `reviewStatus reviewed;`, per-value `provenance {}` in the NH3.dat form.
* Witness `tutorials/props/thermo/heavyWater01_isotope_effect`; gate
  `bin/curate/check_heavy_water.py`.

## 4. Old against new (K, Pa, J/mol; EOS = Maxwell-criterion saturation of R16-17)

| T | EOS p_sat | old Antoine | new Wagner Eq. (1) |
|---|---|---|---|
| 298.15 K | 2736.386 | 2745.409 (+0.330 %) | 2736.230 (−0.006 %) |
| 373.15 K | 96 307.3 | 95 766.5 (−0.562 %) | 96 302.7 (−0.005 %) |
| 374.549 K | 101 325.1 | 100 752.3 (−0.565 %) | 101 319.9 (−0.005 %) |
| 630 K | 18 302 498 | 17 881 890 (−2.30 %) | 18 301 610 (−0.005 %) |

Eq. (1) differs from the EOS by at most 8.0e-5 over 276.969-643.847 K (the paper
states < 1e-4); the printed 7-digit coefficients reproduce the paper's own check
value at 293.15 K to 9.4e-7.  Normal boiling point, from the EOS: 374.5488 K
(Table 1: 374.549); from the record's Wagner equation: within 0.002 K.
Isotope shift against ordinary water is computed by the witness, not quoted.

## 5. What stayed unverified, and why

* **Formation datum (`dHf_298`, `s_298`): not entered.**  The loader requires
  the pair.  S°(298.15 K, ideal gas, D2(16O)) is read (216.602 69(3)
  J mol⁻¹ K⁻¹, Simkó Table 6) but `ΔfH°` has no cleared primary read here: the
  NIST-JANAF table is NIST SRD (no grant, `check_source_licence`'s NEVER list),
  the ATcT server refused the request, and CODATA Key Values carry no D2O row.
  The consequence for researchers is stated in the record header: D2O can be
  flashed, heated and cooled; it cannot enter a reactor or a formation-datum
  energy balance.  The way to close it: an open ATcT or Chase-JANAF primary
  read by a human with access, then the pair entered at once.
* **UNIFAC group: removed**, not verified (D2O is not H2O to a group method).
* S and Cp refer to D2(16O); IAPWS "heavy water" has ordinary-water oxygen
  isotopes (an entropy-of-mixing term of order 0.1 J/(mol K) is not included).
* CAS 7789-20-0 was cross-checked by lookup (NIST WebBook identity page); it is
  an identifier, not a datum.

## 6. What researchers still cannot do with D2O in Choupo

1. Mix D2O and H2O with isotope exchange: H2O + D2O = 2 HDO has no species
   (HDO), no equilibrium constant and no record; a D2O+H2O stream is two
   independent components.
2. Any reaction or formation-datum balance with D2O (no `dHf`).
3. Isotopic VLE of mixtures (the vapour-pressure isotope effect on the
   *mixture*, the fractionation factor): the ideal-Raoult model gives none
   beyond the pure-component ratio.
4. Liquid density versus T: the engine's Rackett form is anchored on `Vliq`
   at 298.15 K; the EOS density, including the density maximum at 284.748 K,
   is not reproduced (needs a per-component liquid-density correlation in the
   grammar, which also water lacks).
5. Transport (viscosity R17-20, thermal conductivity R18-21, surface tension
   R5-85): not carried; the engine has no record-level form for the IAPWS
   power-law surface tension, and the viscosity/conductivity formulations are
   kernels like `IAPWSTransport`.
6. A Helmholtz-EOS pure-fluid route for D2O (`pureFluids { heavyWater {
   method ...; } }`): the existing pure-fluid path serves water through IF97
   only; a D2O route would need the equation of `heavy_water_iapws.py` in C++
   (new engine model; not built here).
7. NMR use (T1/T2 isotope shifts, deuterated solvents as a matrix), solid
   D2O (ice Ih Cp, sublimation: the release gives p_melt and p_subl curves,
   Eqs. (9)-(13), not entered).
8. Enthalpy of vaporisation away from the normal boiling point is the
   engine's Watson estimate, not the EOS latent heat.

## 7. Rejected alternatives

* **Refit the Antoine form to the EOS** (the previous record's route): a
  three-parameter form cannot follow the saturation line over 277-644 K (it
  was −2.3 % at 630 K); the paper's own Wagner form is data to an existing
  model, so there is nothing to approximate.
* **A Helmholtz-EOS pure-fluid model for D2O in C++**: the correct long-term
  route for caloric/density work, but a new engine model and out of this
  task's scope; the record's auxiliary equations serve the flash and the
  vapour-pressure use the researchers asked for.  Named in §6.
* **Enter ΔfH° from the NIST-JANAF page**: a NIST SRD table is on the NEVER
  list of `check_source_licence` ("do not enter their numbers, even cited");
  the primary behind it was not read here.
* **Keep `reviewStatus interim` and enter only the cleared values**: rejected
  because every value left in the record IS verified; an `interim` label would
  hide that from the caveat block's reader (`[unreviewed]` on a verified record
  is the same false signal in the other direction).

## 8. Gate

`check_heavy_water` (7 arms, see its docstring); sabotages are listed in the
commit message.
