# Acetone from 2-propanol — reference-case anchor record

**Status: ANCHOR RECORD -- six cases now built from it.**  What follows is the
numerical content of two primary sources, transcribed, plus an honest statement
of what Choupo would still need to run the whole flowsheet.

Built so far, each stating what it establishes and what it does not:
`props/compare/acetone01_ipa_water_azeotrope` (the IPA/water binary),
`steady/reactors/acetone02_luyben_reactor`,
`steady/flowsheets/acetone03_luyben_reaction_section`,
`props/compare/acetone04_acetone_water_vle` (the acetone/water binary, and the
azeotrope PREDICTION), `steady/absorption/acetone05_luyben_absorber`,
`steady/distillation/acetone06_luyben_column_C1` (which tests that prediction).
**No case makes a global reproduction claim**, and the running pattern across
all six is worth stating here rather than in six places: the energy quantities
land within roughly 5-15 % of the paper, and every SEPARATION is off by a
factor -- each for a different, named reason.

Assembled 2026-08-11 from two PDFs supplied by Vítor.  **Every number below was
read from the papers themselves**, not from an abstract, a search summary or
memory — which matters, because the same environment could not reach the
publisher sites and a summary was available and would have been wrong to use.

---

## 1. The two sources, and why they are NOT interchangeable

### S1 — the process anchor

> **W. L. Luyben**, *Design and Control of the Acetone Process via
> Dehydrogenation of 2-Propanol*, **Ind. Eng. Chem. Res. 50 (2011) 1206–1218**.
> DOI [10.1021/ie901923a](https://doi.org/10.1021/ie901923a).

Luyben restates and then modifies the design of **Turton et al.** (his ref 6).
He supplies, in one coherent place: the flowsheet topology, a complete stream
table, the reaction kinetics, the thermodynamic model, and the equipment specs.

### S2 — the kinetic anchor

> **R. M. Rioux and M. A. Vannice**, *Hydrogenation/dehydrogenation reactions:
> isopropanol dehydrogenation over copper catalysts*, **J. Catal. 216 (2003)
> 362–376**.  DOI [10.1016/S0021-9517(02)00035-0](https://doi.org/10.1016/S0021-9517(02)00035-0).

A measured Langmuir–Hinshelwood study on characterised Cu catalysts, with
turnover frequencies, reaction orders and fitted adsorption parameters.

### THE TWO ARE AT DIFFERENT SCALES AND MUST NOT BE MIXED SILENTLY

This is the single most important line in this record.

| | S1 (Luyben / Turton) | S2 (Rioux & Vannice) |
|---|---|---|
| reactor | industrial tubular, 450 tubes, molten salt | differential microreactor |
| T | 623 K | 433–473 K |
| P | 2 atm | ~1 atm (14 Torr IPA in He) |
| catalyst | unspecified solid, 2000 kg/m³, ε 0.5 | 0.98 % Cu/AC-HTT-H₂, characterised |
| rate form | power law, first order in IPA | Langmuir–Hinshelwood |
| **E_forward** | **72 380 kJ/kmol** | **E_rds 22.9 kcal/mol ≈ 95 810 kJ/kmol** |

Those activation energies differ by ~32 %.  They are not a discrepancy to be
reconciled — they describe different catalysts in different regimes.  **Dropping
S2's kinetics into S1's flowsheet and comparing the result to S1's stream table
would validate nothing.**

---

## 2. S1 — the numbers

### 2.1 Reaction and kinetics (Luyben Table 1, eqs 1–4)

    (CH3)2CHOH  <->  (CH3)2CO  +  H2

Rates in **kmol s⁻¹ m⁻³**:

    R_F = C_IPA      · k_F · exp(-72380 / (R T))
    R_R = C_acetone · C_H2 · k_R · exp(-9480  / (R T))

| | Turton, irreversible | modified reversible, forward | reverse |
|---|---|---|---|
| k | 3.51 × 10⁵ | 22 × 10⁶ | 1000 |
| E (kJ/kmol) | 72 380 | 72 380 | 9 480 |
| concentration terms | C_IPA | C_IPA | C_acetone · C_H2 |

* Heat of reaction **+62 900 kJ/kmol** (endothermic).
* The reverse activation energy is DERIVED: `λ = E_F − E_R` (eq 4), i.e.
  9 480 = 72 380 − 62 900.  **Choupo would compute the 62 900 itself from
  formation data**, so this is a cross-check, not an input.
* Catalyst bed: void fraction 0.5, solid density 2000 kg/m³.
* Luyben states the pre-exponentials were found by trial and error to satisfy
  two conditions: match the RGIBBS pressure dependence, and give 90 %
  conversion in the Turton reactor.  **They are FITTED TO THE DESIGN, not
  measured** — the paper says so, and a case using them must too.

### 2.2 Equilibrium conversion (Aspen RGIBBS, at 623 K)

| P (atm) | equilibrium conversion |
|---|---|
| 2 | 97.1 % |
| 5 | 93.3 % |
| 10 | 87.8 % |
| 15 | 83.2 % |

Design conversion is held at **90 %** throughout the paper.

### 2.3 Thermodynamics

**UNIQUAC**, stated explicitly ("UNIQUAC physical properties are used in the
Aspen simulations").  Two facts that are independent validation targets:

* **IPA/water azeotrope: 67.32 mol % IPA at 1 atm, 353.4 K.**
* Normal boiling points: IPA **355.4 K**, water **373 K**, acetone **329.4 K**.
* Acetone/water: **no azeotrope**, but a pinch at the high-acetone end.

### 2.4 The Turton flowsheet (Luyben Figure 1) — full stream table

Compositions are mole fractions; A = acetone, W = water.

| stream | kmol/h | T | P | composition |
|---|---|---|---|---|
| Fresh feed | 51.96 | 320 K | — | IPA 0.67, W 0.33 |
| Rin (reactor in) | 57.83 | 389 K | 2.6 atm | — |
| Rout (reactor out) | 92.6 | 623 K | — | H₂ 0.3755, A 0.3755, IPA 0.0417, W 0.2073 |
| F1 (flash liquid) | 72.85 | 325 K | — | H₂ 0.0002, A 0.4427, IPA 0.0529, W 0.5041 |
| Absorber gas | 39.76 | 318 K | 1.5 atm | H₂ 0.8742, A 0.0634, IPA 0.0002, W 0.0622 |
| Absorber water | 20 | 320 K | — | water |
| Absorber bottoms | 20.05 | — | — | H₂ 0.0001, A 0.1020, IPA 0.0062, W 0.8916 |
| Gas (to absorber) | 39.80 | — | — | A 0.1147, IPA 0.0033 |
| **Acetone product** | **32.25** | 320 K | 1 atm | **A 0.999, W 0.001** |
| Vent | 0.0465 | — | — | H₂ 0.2798, A 0.7196, W 0.0006 |
| B1 (C1 bottoms) | 40.56 | 370 K | — | A 0.0001, IPA 0.0951, W 0.9048 |
| IPA recycle | 5.88 | — | — | A 0.0007, IPA 0.6500, W 0.3493 |
| **Water product** | **34.67** | 377 K | — | A 0.001, W 0.999 |

Equipment:

| unit | spec |
|---|---|
| Vaporizer | 0.7577 MW, LP steam |
| Reactor | 450 tubes, T_H 624 K, 0.960 MW |
| HX1 | 0.8993 MW, cooling water, → 318 K |
| HX2 | 0.2203 MW, refrigerant, → 293 K |
| Absorber | 9 stages, ID 0.217 m, 1.5 atm |
| C1 | 66 stages, feed 54, RR 2.78, ID 0.8915 m, condenser 1.045 MW, reboiler 1.217 MW |
| C2 | 19 stages, feed 16, RR 0.849, ID 0.251 m, condenser 0.1193 MW, reboiler 0.1204 MW |

Loss figures Luyben quotes for the base case: acetone in the off-gas
**2.52 kmol/h (7.2 % loss)**; acetone in the C1 vent **0.0335 kmol/h**.

---

## 3. S2 — the numbers

### 3.1 Fitted LHHW rate parameters (Rioux Table 9, 0.98 % Cu/AC-HTT-H₂, reduced at 573 K)

| T (K) | k (µmol s⁻¹ g_cat⁻¹) | K_IPA (atm⁻¹) | K′ × 10⁻¹² | K_H2 (atm⁻¹) | K_Ace (atm⁻¹) |
|---|---|---|---|---|---|
| 433 | 0.73 | 41.2 | 6.27 | 0.103 | 25.8 |
| 448 | 1.63 | 37.4 | 3.41 | 0.062 | 18.1 |
| 458 | 2.92 | 30.5 | 2.12 | 0.047 | 12.9 |
| 473 | 6.89 | 21.0 | 0.86 | 0.027 | 6.9 |

| quantity | IPA | H₂ | acetone |
|---|---|---|---|
| ΔH°_ad (kcal/mol) | −6.8 | −13.4 | −13.3 |
| ΔS°_ad (cal/mol/K) | −8 | −35 | −24 |
| S°_g (cal/mol/K) | 68 | 36 | 71 |

`E_rds = 22.9 kcal/mol`.

### 3.2 Measured reaction orders (Rioux Table 8)

| T (K) | IPA | H₂ | acetone |
|---|---|---|---|
| 433 | 0 | −0.11 | −0.11 |
| 448 | 0.04 | −0.07 | −0.10 |
| 458 | 0.14 | −0.05 | −0.05 |
| 473 | 0.34 | −0.04 | 0 |

Reported uncertainties: **±5 % on reaction orders, ±3 kcal/mol on activation
energies**, TOF reproducibility better than 90 %.

Other anchors: apparent activation energy for acetone formation **~20 kcal/mol**
on all Cu/C catalysts and Cu powder, but **12 kcal/mol** on Cu chromite;
selectivity to acetone **100 %** on all catalysts except the nitric-acid-treated
carbon.

---

## 4. What Choupo would still need — the honest gap list

Every unit Luyben's flowsheet uses exists in Choupo (`absorber`, `pfr`,
`flash`, `distillationColumn`, `shortcutColumn`, `heater`, `compressor`).
**The gaps are entirely in the DATA**, and they are exactly the gaps the
2026-08-11 agent test hit:

| gap | status | note |
|---|---|---|
| `isopropanol` component | **ABSENT from `data/standards/`** | a Joback-estimated record exists in `data/groupEstimative/`; the agent test showed the legal promotion route works |
| `liquidHeatCapacity` for isopropanol | **ABSENT; closeable, not closed** | what blocked the rigorous column in the agent test.  This row used to read *"ABSENT and UNCLOSEABLE -- no estimator produces it for a real molecule"*.  **That was wrong**, and the error is worth keeping visible: it was reached by listing the estimators that EXIST rather than asking what is legitimately DERIVABLE.  Rowlinson-Bondi gives `(Cp_L - Cp_ig)/R` from `Tr`, `omega` and the ideal-gas Cp, all three of which `data/groupEstimative/` already carries for isopropanol.  This row has now been corrected TWICE and both corrections are kept, because the sequence is the lesson.  It first read *"ABSENT and UNCLOSEABLE -- no estimator produces it for a real molecule"*, which was reached by listing the estimators that EXIST rather than asking what is legitimately DERIVABLE.  On 2026-08-12 it was corrected to *"a MISSING ESTIMATOR, not a missing possibility"* -- Rowlinson-Bondi gives `(Cp_L - Cp_ig)/R` from `Tr`, `omega` and the ideal-gas Cp, all three of which `data/groupEstimative/` already carries for isopropanol.  **CLOSED the same day:** `RowlinsonBondi` is a registered `HeatCapacityModel`, its accuracy MEASURED against 86 curated components rather than claimed (`check_rowlinson_bondi`), and its known weakness on hydrogen-bonding molecules is stated in the isopropanol record that uses it.  `acetone06_luyben_column_C1` runs on it. |
| UNIQUAC pair IPA–water | **ABSENT** | Luyben's model |
| UNIQUAC pair acetone–water | **ABSENT** | |
| UNIQUAC pair acetone–IPA | **ABSENT** | |

**The azeotrope is the validation target.**  67.32 mol % IPA at 353.4 K and
1 atm is a single, sharp, published number that ANY candidate pair set must
reproduce — fitted UNIQUAC, fitted NRTL, or predictive UNIFAC.  It is the
natural held-out anchor for the evidence machinery built on 2026-08-11: fit the
pairs on VLE data, hold the azeotrope out, and see which model lands on it.

---

## 5. Which case category this belongs to

Two different cases are possible and they make different claims.

**(a) A true reproduction case — S1 ALONE.**  Luyben satisfies the existing
doctrine (`CLAUDE.md`: *one coherent primary source end to end, never a
blend*): his kinetics, his thermodynamics, his flowsheet, his stream table.
The claim would be "Choupo reproduces the Turton/Luyben base case", and the
stream table above is the pass/fail criterion.  S2 must not appear in it.

**(b) A layered multiscale case.**  S1 for the process structure, S2 for
measured kinetics, ThermoML for the VLE — each layer declaring its own anchor
and its own verdict, and the case making **no global reproduction claim**.
This is the category Vítor proposed on 2026-08-11 and it does not yet exist in
the doctrine.

**(a) is buildable under today's rules; (b) needs the doctrine amended first.**
Note that (b) is also where the interesting question lives — *does the
difference between a design-fitted power law and a measured LHHW rate propagate
materially to the acetone product purity?* — but it can only be asked honestly
once each layer can state what it rests on.

---

## 6. What this record does NOT contain

* Luyben's own **optimized** design (his §3 onward).  Only the Turton base case
  of Figure 1 was transcribed; the optimization results were not read.
* The control structure (the paper's second half).
* Any of Rioux's catalyst characterisation (BET areas, dispersions, XRD).
* **Any judgement that these numbers are right.**  They are transcribed from
  the primary sources, with their own stated uncertainties where the papers
  give them.  Nothing here has been checked against a third source.
