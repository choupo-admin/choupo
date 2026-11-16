# C408 (b) + C407 (2): one EoS/G^E mixing-rule object for the cubics

Status: DESIGN, 2026-11-16.  Nothing is built.

Sources HELD and read (`~/Choupo-Literature`):

* Wong & Sandler, AIChE J. 38 (1992) 671-680 (`wong1992-wong-sandler-mixing-rule.pdf`).
* Poling, Prausnitz & O'Connell, The Properties of Gases and Liquids, 5th
  ed.: Sec. 5-5, pp. 5.14-5.18 (Eqs. 5-5.6 to 5-5.14, Table 5-1); Sec. 8-12,
  pp. 8.142-8.150 (Examples 8-25 to 8-29, Tables 8-44, 8-46, 8-49).
* Brunner, Hueltenschmidt & Schlichthaerle, J. Chem. Thermodyn. 19 (1987)
  273-291 (`brunner1987-methanol-gases-high-pressure-vle.pdf`), Table 1.

Sources NOT held (requested): Huron & Vidal 1979, Michelsen 1990, Dahl &
Michelsen 1990, Holderbaum & Gmehling 1991.  Where only they print
something, this record says `TO READ` and writes no number from memory.  The
forms written below are the ones Poling prints at the pages above; the
composition derivatives and the departure with a temperature-dependent
co-volume are this record's own algebra, checked numerically (section 3.4).
The text extraction of both held sources garbles the display equations: the
BUILDER reads the page image, never this record's transcription.

## 1. What the engine does today (measured, file:line)

| fact | where |
|---|---|
| One generic cubic for SRK and PR; `(eps, sig)` = (0, 1) and (1 - sqrt 2, 1 + sqrt 2) | `src/thermo/equationOfState/CubicEoS.H:37-40`, `SRK.cpp:70`, `PR.cpp:117` |
| The constructor takes the kij matrix; no other mixing input exists | `CubicEoS.H:180-183`, `CubicEoS.cpp:55-97` |
| `b_mix = sum y_i b_i` | `CubicEoS.cpp:135-136` |
| `a_mix = sum sum y_i y_j (1 - k_ij) sqrt(a_i a_j)` and its T derivative on the signed root | `CubicEoS.cpp:143-160` |
| `ln phi_i = (b_i/b)(Z-1) - ln(Z-B) - (A/B)[2 sum_j y_j a_ij / a - b_i/b] I` | `CubicEoS.cpp:394-397` |
| `H^R = RT(Z-1) + (T da/dT - a)/((sig-eps) b) ln[...]` and `S^R`, on the VAPOUR root only | `CubicEoS.cpp:414-434` (`root(..., false, ...)` at :417, :428) |
| The ledger a props op reads is filled by the same `buildMix` | `CubicEoS.cpp:165-174`, `EquationOfState.H:116-129` |
| kij read from `binaryInteractions`; absent pairs run 0, announced | `CubicEoS.cpp:437-524` |
| EoS factory: `(dict, components)`, explicit registration of `SRK`, `PR`, `PengRobinson` | `EquationOfState.H:180-185`, `EquationOfState.cpp:54-84` |
| An activity model answers `gamma(T, x)`; no pressure argument | `ActivityModel.H:74` |
| `excessEnthalpy(T, x)`: central difference (h = 0.05 K) on the model's own gamma | `ActivityModel.H:91-105` |
| Activity factory: `ideal`, `NRTL`, `Wilson`, `UNIFAC`, `UNIQUAC`, `cosmoSAC` | `ActivityModel.cpp:104-144` |
| Each model keeps the pairs it resolved, with status (`idealDefault` among them) and validity span | `ActivityModel.H:128`, `src/core/ThermoResolution.H:59-87` |
| NRTL: a missing pair defaults to ideal, announced; it REFUSES only under `activeComponents`, a key NRTL alone reads | `NRTL.cpp:192-197`, `:207-222`, `:249-265`; grep 2026-11-16 |
| phiPhi K: `K_i = phi_i^L(x) / phi_i^V(y)`, one cubic, two roots | `ThermoPackage.cpp:973-981` |
| phiPhi grammar accepts `mixingRule vanDerWaalsOneFluid;` and refuses any other word | `ThermoPackageBuilder.cpp:2863-2866` |
| phiPhi assembles with a placeholder `ideal` activity model, "unused in the phi-phi K" | `ThermoPackageBuilder.cpp:3068-3072` |
| A kij record regressed for another cubic is refused: "not transferable" | `ThermoPackageBuilder.cpp:2909-2922` |
| The vapour's real enthalpy and entropy: `H_ig + eos.H_residual`, `S_ig + eos.S_residual` | `ThermoPackage.cpp:1522-1524`, `:2073-2075` |
| A LIQUID stream's enthalpy: `H_liquid_formation(T, x)`: no pressure argument, no EoS call in its body | `ThermoPackage.cpp:1870`, `:1657-1759` |
| `H^E` enters the liquid enthalpy only when every pair is calorimetrically fitted | `ThermoPackage.cpp:1756-1757` |
| `check_mixing_ledger` does not audit `dadT_mix` | `bin/curate/check_mixing_ledger.py:69-73` |

Catalogue (2026-11-16): 793 NRTL pair records, 791 with `origin fitted`
(Choupo's regression on isobaric bubble temperatures; "FRAME: ideal-gas
vapour, no Poynting term, the catalogue's own vapour-pressure records",
header of `2Methoxyethanol-water.dat`) and a machine-readable
`provenance.validity { temperature; pressure; }`.  Form: `tau_ij = a_ij +
b_ij/T`, `a = 0` in the fitted records.

## 2. Three findings that shape the design

**F1.  Under phiPhi the liquid enthalpy is not the cubic's.**  The builder
announces "caloric: departure from the SAME EoS" (`ThermoPackageBuilder.cpp:
3062-3066`) and the resolved view prints "the liquid root's departures"
(`ResolvedView.cpp:572`).  The code prices a liquid stream on
`H_liquid_formation` (component liquid heat capacities, ideal mixing), and
`CubicEoS::H_residual` only ever takes the vapour root.  This was READ, not
run.  It predates this commission and is not fixed by it; it bounds section
7 and goes to the coordinator as a defect of its own (a view that disagrees
with the computation).

**F2.  The cubic's own pure-component vapour pressure is the first error an
EoS/G^E rule meets.**  Independent recomputation (Python, the records' own
Tc, Pc, omega, the Graboski-Daubert slope of `SRK.cpp:56`), saturation
pressure at the record's normal boiling point against 1.01325 bar:

| component | SRK Psat(Tb) / bar | deviation |
|---|---|---|
| water | 0.9245 | -8.8 % |
| methanol | 0.9862 | -2.7 % |
| acetone, ethanol | 0.9968, 1.0020 | -1.6 %, -1.1 % |
| isopropanol, MTBE | 1.0171, 1.0166 | +0.4 %, +0.3 % |

A gammaPhi package reads the record's vapour-pressure law; a phiPhi package
reads the cubic.  A pair fitted in the first frame and used in the second
inherits the cubic's pure-component error at each end of the diagram,
whatever the rule; for an aqueous system that exceeds the difference
between the variants (section 6).

**F3.  Of the C239 targets only the MTBE columns are polar.**  column08
(propane to n-hexane, 16 bar) already runs `phiPhi` SRK with the one-fluid
rule; process05 and recycle02 (neopentane, n-pentane, 5 bar) need a plain
cubic vapour; column19 and column20 (methanol, isobutene, MTBE, 7 bar) run
`gammaPhi` with UNIFAC and an SRK vapour.  A G^E rule with `G^E = 0` is NOT
the one-fluid rule (section 3.2), so it is the wrong tool for hydrocarbons.
"The C239 columns are its targets" holds for column19/20 only, and there as
a comparison of two routes at 7 bar, not as a repair.

## 3. The formulation

### 3.1 One reduced attraction

Write `beta = a / (b R T)` (the engine's own symbol: `CubicEoS.H:70`,
`beta = A/B`), `beta_i = a_i / (b_i R T)`, and for mole numbers `n_i`

    bbar_i   = d(n b)/dn_i
    betabar_i = d(n beta)/dn_i .

For any two-parameter cubic and ANY mixing rule (the structure of Poling
Eq. 8-12.37, written there for PR; `I = ln[(Z + sig B)/(Z + eps B)]/(sig - eps)`):

    ln phi_i = (bbar_i / b)(Z - 1) - ln(Z - B) - betabar_i I            (1)

because `(1/n) d(n^2 a)/dn_i / a - bbar_i / b = betabar_i / beta`.  With the
one-fluid rule `bbar_i = b_i` and (1) is `CubicEoS.cpp:394-397` term for term.
So the cubic core needs four things from a rule: `b`, `beta`, `bbar_i`,
`betabar_i`; and two more for the departures: `d beta/dT`, `db/dT`.

### 3.2 The five variants are two co-volume rules and one attraction form

`C(u) = -ln[(u + sig)/(u + eps)]/(sig - eps)` is Poling Eq. 5-5.8 in the
engine's `(eps, sig)`; `C_SRK(u) = -ln(1 + 1/u)`.  Checked: u = 1, 1.235,
1.100, 1.632 give -0.693, -0.593, -0.647, -0.478, the four SRK entries of
Poling Table 5-1 (p. 5.17); `C_PR(1) = -0.623`, the constant Poling prints
for PRSV (p. 8.143) and Wong & Sandler define (Eq. A4).

| variant | reference pressure of G^E | co-volume | attraction (per mole) | source of the form |
|---|---|---|---|---|
| `HuronVidal` | infinite | linear | `beta = sum y_i beta_i + (1/C(1)) G^E/RT` | Poling Eq. 5-5.9 |
| `WongSandler` | A^E at infinite pressure, set equal to the low-pressure G^E | second-virial, Eq. (3) below | the same as Huron-Vidal | Wong & Sandler Eqs. 7, 18-20, A8-A9; Poling Eq. 5-5.10, 8-12.32 |
| `MHV1` | zero | linear | `q1 (beta - sum y_i beta_i) = G^E/RT + sum y_i ln(b/b_i)` | Poling Eqs. 5-5.13, 5-5.14 |
| `PSRK` | 1 atm (Table 5-1) | linear | the MHV1 form with its own `q1` | Poling Table 5-1 |
| `MHV2` | zero | linear | `q1 (beta - sum y_i beta_i) + q2 (beta^2 - sum y_i beta_i^2) = G^E/RT + sum y_i ln(b/b_i)` | Poling Eqs. 5-5.13, 5-5.14; the quadratic term TO READ at Dahl & Michelsen 1990, Eq. ? |

Linear co-volume: `b = sum y_i b_i`, `bbar_i = b_i`.  Wong-Sandler:

    Q = sum sum y_i y_j (b - a/RT)_ij ,   D = beta          (2)
    b = Q / (1 - D)                                           (3)
    (b - a/RT)_ij = (1/2)[(b_i - a_i/RT) + (b_j - a_j/RT)] (1 - k_ij)

(Poling Eq. 5-5.11; Eq. 8-12.34 prints another combining rule: OPEN QUESTION 3.)

Composition derivatives (this record's algebra; `d(n G^E/RT)/dn_i = ln gamma_i`,
so NO derivative of the activity model is needed for a fugacity coefficient):

    HuronVidal, WongSandler:  betabar_i = beta_i + ln gamma_i / C(1)
    MHV1, PSRK:   betabar_i = beta_i + [ln gamma_i + ln(b/b_i) + b_i/b - 1] / q1
    MHV2:         (q1 + 2 q2 beta) betabar_i = q1 beta_i + q2 (beta_i^2 + beta^2)
                                              + ln gamma_i + ln(b/b_i) + b_i/b - 1
    WongSandler:  bbar_i = [2 sum_j y_j (b - a/RT)_ij] / (1 - D)
                           - Q (1 - betabar_i) / (1 - D)^2

(the last line is Poling Eq. 8-12.38b with 8-12.39).  MHV2's `beta` is the
root of its quadratic that tends to the MHV1 value as `q2 -> 0`, written
`beta = 2 r / (q1 - sqrt(q1^2 + 4 q2 r))` with `r` the right-hand side plus
`sum y_i (q1 beta_i + q2 beta_i^2)`, a form with no cancellation.

With `G^E = 0` none of these is the one-fluid rule (Huron-Vidal gives `a/b = sum y_i a_i/b_i`).

### 3.3 The departures

`a = beta b R T`, so `da/dT` is no longer a sum over pairs.  With
`beta_T = d beta/dT` and `b_T = db/dT` (zero except for Wong-Sandler):

    H^R = R T (Z - 1) + R T^2 beta_T I - R T^2 b_T Psi                  (4)
    S^R = R ln(Z - B) + R (beta + T beta_T) I - R T b_T Psi             (5)
    Psi = 1/(v - b) - beta v / [(v + sig b)(v + eps b)]

With `b_T = 0`, (4) and (5) are `CubicEoS.cpp:421-422` and `:432-433`.
`beta_T` of every variant contains `d(G^E/RT)/dT = -H^E/(R T^2)`: the
departure enthalpy carries the temperature slope of the activity model.

### 3.4 What was checked numerically

An independent probe (Python, SRK, ethanol + water, the catalogue pair
`ethanol-water.dat`; not the engine) implemented sections 3.2 and 3.3:

* `sum y_i ln phi_i = Z - 1 - ln(Z - B) - beta I` held to 1e-9 for the
  one-fluid rule and all five variants (it fails if any `betabar_i` or
  `bbar_i` is wrong);
* `H^R` of Eq. (4) against `-R T^2 d(sum y_i ln phi_i)/dT` at 423.15 K,
  10 bar, x1 = 0.3, liquid root: one-fluid -34936.783 / -34936.783 J/mol,
  MHV1 -37854.010 / -37854.010, MHV2 -38289.677 / -38289.677, Wong-Sandler
  (`db/dT = -1.0e-9 m3/mol/K`) -38238.060 / -38238.060; the vapour root
  agrees likewise.  These two identities are the gate arms of slice 1.

## 4. Decision 1: the object and its place

**D1.1  A `CubicMixingRule` base class in
`src/thermo/equationOfState/CubicMixingRule.{H,cpp}`, with the explicit
factory every base has, owned by `CubicEoS`.**  Registered names:
`vanDerWaalsOneFluid`, `HuronVidal`, `MHV1`, `MHV2`, `PSRK`, `WongSandler`.
It is not a new equation of state: the cubic, its root picker, its
pseudo-root and its announcements are untouched.

**D1.2  The interface is section 3.1.**

    struct Mixed { a, b, dadT, dbdT, abar[i], bbar[i] };
    virtual void mix(T, y, a_i, dadT_i, b_i, Mixed&, bool partials, bool temperature) const;

`CubicEoS::buildMix` (`CubicEoS.cpp:128-163`) becomes the body of
`VanDerWaalsOneFluid::mix`, its arithmetic order intact, with
`abar_i = 2 sum_j y_j a_ij`, `bbar_i = b_i`; `phiAt` then evaluates
`abar_i/a - bbar_i/b`, the floating-point expression of today's `:396`.
Acceptance: every phiPhi and SRK/PR-vapour case byte-identical.

**D1.3  Three classes, not six: this is where the variants share code.**
`VanDerWaalsOneFluid`; `ExcessGibbsRule` holding one row of a table
`{ q1, q2, lambda }` (`lambda` = 0 for Huron-Vidal, 1 for the zero-pressure
rules; MHV2 adds the quadratic); `WongSandlerRule`, which reuses the
Huron-Vidal attraction and replaces the co-volume.  The table lives in one
place with the page of each constant beside it.

**D1.4  The rule owns the activity model and calls it at the composition of
the phase being priced.**  `gamma(T, y)` (`ActivityModel.H:74`) is called
once per `mix` with the SAME `y` the cubic was handed: the liquid's for
`phiLiquid`, the vapour's for `phi`.  The pressure never reaches it: the
reference pressure of `G^E` belongs to the variant (section 6).
`excessEnthalpy(T, y)` (`ActivityModel.H:92-105`) is called only for a
departure.  The model is built by `ActivityModel::New` from the block a
gammaPhi liquid uses, so pair lookup, sealing, provenance and the span guard
(`PairAudit.H`) are the existing ones.  Cost: one gamma evaluation per phase
per K, against one per K in gammaPhi.

**D1.5  A pair that resolved to `idealDefault` is REFUSED inside an
excess-Gibbs rule, in one place.**  The rule reads `resolvedPairs()`
(`ActivityModel.H:128`) after construction and refuses, naming the pair and
the remedy.  Under gammaPhi a missing pair is an announced ideal assumption;
here a zero `G^E` is a definite, non-one-fluid claim about `a` (section 3.2)
with no kij to correct it.  This covers NRTL, UNIQUAC and Wilson alike.

**D1.6  `modelName()` remains `SRK`** (it names the kij record directory,
`CubicEoS.cpp:460`); a `ruleName()` is printed beside it.

## 5. Decision 2: the grammar

Existing form copied (`docs/ai/thermo.md`, "phiPhi"): `mixingRule` is
already a key of `equationOfState` with one legal word.  The design adds
words to it and reuses the `activityModel` block under its one name.

```
equilibrium
{
    formulation phiPhi;

    equationOfState
    {
        model      SRK;
        mixingRule MHV1;      // vanDerWaalsOneFluid | HuronVidal | MHV1 | MHV2 | PSRK | WongSandler

        activityModel         // the block a gammaPhi liquid takes, read by the same reader
        {
            model NRTL;
            binaryParameters
            {
                methanol-water { source "data/standards/parameters/NRTL/methanol-water.dat"; }
            }
        }
    }

    liquid { fugacityRoute equationOfState; root liquid; }
    vapour { fugacityRoute equationOfState; root vapour; }
}
```

Wong-Sandler adds its own interaction record:

```
        mixingRule WongSandler;
        activityModel { model NRTL; }
        binaryInteractions { CO2-methanol { source "constant/parameters/SRK/WongSandler/CO2-methanol.dat"; } }
```

Rules, each a named refusal:

* `activityModel` under `vanDerWaalsOneFluid`, or an excess-Gibbs word
  without `activityModel`: refused, naming the other.
* `binaryInteractions` under `HuronVidal`, `MHV1`, `MHV2`, `PSRK`: refused
  (those rules have no kij).
* Under `WongSandler` a pair with no record is REFUSED, not run at 0 (at
  `k_ij = 0` the rule returns half the activity coefficient it was fed:
  section 6).  The record is `recordType eosBinaryInteraction` with `eos`
  and the new fields `mixingRule WongSandler;`, `activityModel` and the
  temperature it was derived at.  A kij record without that field is
  refused here, and a Wong-Sandler record under the one-fluid rule, by the
  "not transferable" precedent of `ThermoPackageBuilder.cpp:2909-2922`:
  one key name, two quantities, kept apart by the record's field.
* A missing G^E pair: D1.5.
* `PSRK` is a bundle, not a free word: it requires `model SRK`,
  `activityModel { model UNIFAC; }` with the PSRK group table, and the
  alpha function of slice 0; any other combination is refused.
* A non-one-fluid word with `model PCSAFT`, or in a `gammaPhi` vapour slot
  (`vapour { fugacityModel SRK; }`): refused in this round.

A case chooses the rule; a VARIANT (`variants { srkMHV1 { equilibrium {
... } } }`) may hold it, and since it replaces `equilibrium` it is a model
boundary, announced as such by the existing rule.

**The choice printed.**  The builder's phiPhi line (`ThermoPackageBuilder.cpp:
3062-3066`) names the rule, its reference pressure, the G^E model, and each
pair with its tier and validity span.  **The view.**  `ResolvedView` gains the row "cubic mixing rule", CHOICE and
DATA as for every property, "default" when the case wrote none.  The
`mixingRules` props op and `MixingLedger` (`EquationOfState.H:116-124`) gain
the terms of the rule in force (`beta_i`, `G^E/RT`, the `ln(b/b_i)` sum, `Q`
and `D`, `beta`, `b`), filled by the same `mix` the hot path runs and
re-added independently by a new arm of `check_mixing_ledger`.

## 6. Decision 3: can the catalogue's low-pressure NRTL pairs be reused as they are?

Measured with the probe of section 3.4 (SRK, ethanol (1) + water (2), the
catalogue pair): activity coefficients recovered from the cubic,
`gamma_i = phi_i^L(x) / phi_i^L(pure i)` at the same T and P, against the
NRTL model fed in; `max` = largest `|ln gamma_EoS - ln gamma_NRTL|` over
`x1` = 0.05 to 0.95.

| rule | 351.44 K, 1.013 bar: max | gamma1 at x1 = 0.05 | 423.15 K, 10 bar: max |
|---|---|---|---|
| NRTL itself | 0 | 4.110 | 0 (4.524) |
| one-fluid, kij = 0 | 2.353 | 43.2 | 1.200 |
| Huron-Vidal | 0.777 | 1.890 | 0.833 |
| MHV1 | 0.103 | 4.556 | 0.046 |
| MHV1 form, PSRK constant | 0.074 | 3.816 | 0.168 |
| MHV2 | 0.008 | 4.108 | 0.036 |
| Wong-Sandler, k_ij = 0 | 0.577 | 2.308 | 0.606 |
| Wong-Sandler, k_ij = 0.237 (fitted to the NRTL gammas at 351.44 K) | 0.056 | 4.303 | 0.055 |

| variant | reference pressure | a pair fitted at 1 atm, used as it is |
|---|---|---|
| `HuronVidal` | infinite | NO.  The pair's G^E is taken as the infinite-pressure excess Gibbs energy, which it is not; the cubic returns about half of the activity coefficient.  Usable only with pairs regressed THROUGH the rule. |
| `MHV1` | zero | YES, within about 10 % in gamma at 1 atm for this system, with no new parameter. |
| `MHV2` | zero | YES, within 1 % at 1 atm; within 4 % at 10 bar. |
| `PSRK` | 1 atm | The form is MHV1's; the name is a bundle with its own alpha function and group table (section 10). |
| `WongSandler` | A^E at infinite pressure taken equal to the low-pressure G^E (Wong & Sandler Eqs. 23-24) | YES, but only with one k_ij per pair; that k_ij is DERIVED from the G^E model at a stated temperature, with no measurement, so it is a curation product, not a fitted datum. |

**D3.  MHV1 and MHV2 satisfy the criterion as it was written; Wong-Sandler
satisfies it with a derived record per pair; Huron-Vidal does not, and is
built for what it is: the rule whose pairs must be regressed through it.**
Huron-Vidal with a catalogue pair whose `validity.pressure` is finite is
REFUSED in a flowsheet (the kij precedent again); it runs under
`variedBy fitParameters`, and with a pair record that declares it was
regressed through the rule.

Two limits of "as they are": the pair's frame is the record's vapour
pressure, so without slice 0 an aqueous diagram is 8.8 % low at the water
end under every variant (F2); and the rule returns the pair, including
where the pair is wrong (section 8).

## 7. Decision 4: energy

**D4.1  `beta_T` is assembled analytically from `d beta_i/dT` (the existing
`buildAi` derivatives, `CubicEoS.cpp:99-126`) and `H^E` from
`ActivityModel::excessEnthalpy`** (today a central difference on the
model's own gamma; an analytic slope per model changes no interface).
Wong-Sandler's `b_T` follows from Eq. (3) with the same ingredients.

**D4.2  The H^E term is NOT gated by `calorimetricFit` inside the cubic.**
In gammaPhi the liquid's `H^E` is withheld unless every pair was fitted to
heats of mixing (`ThermoPackage.cpp:1756-1757`).  Inside an equation of
state it cannot be withheld: `H^R = -R T^2 d(G^R/RT)/dT` is an identity of
the surface, and a departure without the slope of its own `G^E` is not the
departure of the fugacities the flash used.  So it is kept and ANNOUNCED,
once per run: the departure enthalpy carries the temperature slope of pairs
fitted to phase equilibrium only (with `a = 0`, a slope fixed by the same
two numbers that fix `G^E`, never fitted to a heat of mixing).

**D4.3  What the existing gates hold, stated without flattery.**

* `check_energy_closure` holds that a flowsheet's first law closes on the
  enthalpy surface in use.  Any single-valued `H(T, P, y)` closes, so it
  CANNOT see a wrong `beta_T`.  It runs on every witness and stays green.
* `check_explain_property` re-adds `S_ig + S_R` from the published rows: it
  audits the assembly, not the derivative.  `check_mixing_ledger` names
  `dadT_mix` as not checked (`:69-73`).
* `check_column_thermo_consistency` (a column's stage K is the package's K)
  applies unchanged to a column on the new rule.

**D4.4  One new gate, `check_cubic_mixing_rule`, with the two identities of
section 3.4 as arms**, through the real binary on the witness cases:
(a) `sum y_i ln phi_i` against the closed form; (b) `H^R` and `S^R` against
a temperature difference of it, both roots; (c) `mixingRule
vanDerWaalsOneFluid` byte-identical to no `mixingRule`; (d) every rule
returns the pure cubic at `y_i = 1`; (e) the refusals of section 5.  It
needs `ln phi_i` on both roots as a `propertyPoint` key
(`PropertyEvaluator.cpp:277-288` carries `Z`, `H_R`, `S_R`, no fugacity
coefficient; the builder checks before adding one).

**D4.5  F1 bounds the claim.**  With the liquid enthalpy on
`H_liquid_formation`, the new `beta_T` reaches the VAPOUR enthalpy and
entropy only.  Pricing the liquid on the liquid root's departure moves every
phiPhi case and is a decision this commission does not take; until it is
taken, the guide says which phase's enthalpy the rule reaches.

## 8. Decision 5: witnesses

**W1 (slice 1), measured, moderate pressure: methanol (1) + water (2) at
100 C.**  Points of Griswold & Wong (1952) as printed in Poling Table 8-46
(p. 8.146): twelve, 760.0 to 2650.9 mmHg.  The catalogue pair
`methanol-water.dat` was fitted at 297.4-361.2 K and 15-95 kPa, so this is
outside its span in T and in P.  Probe (Python; values from the text
extraction, the builder reads the page):

| route | mean abs dP | max abs dP | mean abs dy1 |
|---|---|---|---|
| gammaPhi, same pair, ideal vapour, measured pure pressures | 4.2 % | 7.1 % | 0.021 |
| SRK + MHV1, Soave alpha as in the engine | 6.2 % | 11.2 % | 0.023 |
| SRK + MHV2, same | 6.5 % | 12.5 % | 0.022 |
| SRK + MHV1, pure pressures matched at this T | 3.4 % | 5.9 % | 0.017 |
| SRK + MHV2, pure pressures matched at this T | 3.4 % | 7.5 % | 0.020 |

What each variant must reproduce, in order: (i) its own input, the gammas
of section 6, within the bands measured there; (ii) the gammaPhi answer of
the same pair, within 1.5 % in bubble pressure once slice 0 supplies the
pure pressures; (iii) the measurement to the pair's own error.  The 4 % is
the pair's, not the rule's, and the case header says so.

**W2 (slice 3), measured, high pressure, polar: CO2 + methanol,** Brunner
et al. 1987, Table 1, isotherms from 298.15 to 473.15 K to high pressure
(tables TO READ at the page before the brief).  CO2 is supercritical on all
but the first, so no gammaPhi reference state exists: this is the system
the family is FOR, and one of Wong & Sandler's own (their Table 1).  No
catalogue pair exists: the witness regresses the pair through the rule on
ONE isotherm (`variedBy fitParameters`) and is HELD to another, never a
prediction claimed from a low-pressure pair.

**W3 (slice 3), a printed worked example: 2-propanol + water at 80 C,**
Poling Example 8-25 (pp. 8.142-8.145): Wong-Sandler on PR with NRTL
(`alpha` 0.2893, `tau12` 0.1759, `tau21` 2.1028, fitted at 30 C), `k12`
0.3644; Table 8-44 prints the CALCULATED column (a code check) and the
measured one (Wu et al. 1988, the witness).  It needs the Stryjek-Vera
alpha and the `kappa1` the example prints: slice 0's object.

**The C239 columns.**  column19/20: a props case compares the K of the
column's components at stage conditions under today's gammaPhi + UNIFAC +
SRK vapour and under phiPhi SRK + MHV1 + UNIFAC; agreement of a few per
cent is expected at 7 bar, and the band is recorded after the run.  The
columns do not move.  column08, process05, recycle02: not targets (F3).

## 9. Decision 6: slices

| slice | content | moved rows | validation |
|---|---|---|---|
| 0 | A per-component alpha function for the cubics (own short design: Mathias-Copeman and Stryjek-Vera forms as printed in Poling Table 4-7; constants are a curation product fitted to each record's preferred vapour-pressure law, never transcribed from a licensed table).  Default unchanged. | none (opt-in key) | byte-identical corpus; `check_thermo_limits`; pure Psat of the six components of F2 within 1 % |
| 1 | `CubicMixingRule`, the one-fluid body moved, `ExcessGibbsRule` with `MHV1` and `MHV2` on SRK; grammar, refusals, printed choice, view, ledger; W1; `check_cubic_mixing_rule`; rule 4d (guide section with labels per registered name, Theory links, catalogue, docs/ai/thermo.md, PDFs) | none: every phiPhi and SRK/PR-vapour case byte-identical; new cases only | this record's reach is `CubicEoS`, a path of every phiPhi and real-gas case: build, the 19 cases whose property dictionary names phiPhi (grep, 2026-11-16) and every `fugacityModel SRK|PR` case byte-identical, the gates naming the touched files, `--fast`, `--gui` if a lesson cites `CubicEoS.cpp` by line; a full sweep only with its written reason if byte-identity fails anywhere |
| 2 | `HuronVidal` (with its refusal and the regression route) and the Huron-Vidal-versus-MHV1 teaching case on ethanol + water (the table of section 6 as a props case) | none | the slice-1 gate plus the new refusal arm |
| 3 | `WongSandler` on SRK and PR; the `wongSandlerKij` props op that derives the k_ij record at a declared temperature (the C123 "route P" pattern: the number a unit runs on is in a file); W2 and W3 | none | as slice 1, plus the record round trip |
| 4 | `PSRK` as a bundle: only what Holderbaum & Gmehling 1991 prints | none | as slice 1 |
| 5 | The column19/20 comparison case; MHV1/MHV2 on PR once the PR constants are read | none | scoped |

**Why MHV1 and MHV2 first.**  They answer C407's criterion with no new
record type; their forms and SRK constants are printed in a held book; MHV2
returns the catalogue pair most faithfully (section 6) and MHV1 is its
`q2 = 0` case, so both cost one class.  Wong-Sandler's primary is held, but
it needs a record type, a props op and a decision on the k_ij objective.

Every slice is opt-in: no golden row moves; if one does, the slice is wrong.

## 10. Decision 7: risks

| risk | what it does | mitigation |
|---|---|---|
| The MHV2 quadratic | Two roots; the wrong one is silent.  The discriminant `q1^2 + 4 q2 r` can go negative for a strongly positive `r`; and the fit of `q(beta)` behind `q1`, `q2` holds on a window of `beta` (TO READ at Dahl & Michelsen 1990: the window).  Measured `beta_i` here: 11.2 and 14.5 at 351 K, 7.7 and 10.7 at 423 K. | The cancellation-free root of section 3.2, a refusal by name on a negative discriminant, and an announcement when any `beta_i` leaves the published window. |
| Constants per cubic | `q1` and `q2` are fitted per equation of state.  Poling Table 5-1 prints the SRK values to three digits; `C_PR(1.632) = -0.4245` computed from Eq. 5-5.8 is NOT a published MHV2 constant for PR. | MHV1/MHV2 ship on SRK only until the PR constants are read; `MHV2` with `model PengRobinson` is refused by name.  Huron-Vidal and Wong-Sandler use `C(1)`, exact for any `(eps, sig)`. |
| PSRK's group table and licence | PSRK is SRK + a three-constant alpha per component + UNIFAC with its own gas groups.  The 1991 paper's printed parameters may be entered; later revisions and any distributed table may not (C408 (c)'s rule, `check_source_licence`).  The tree's UNIFAC is the original table (Hansen et al. 1991, held). | The `PSRK` word is a bundle that names its sources; it runs with the groups and alpha constants printed in the 1991 paper and refuses any component outside them.  If the paper prints too little to run a witness, slice 4 is reported as not buildable rather than filled from elsewhere. |
| Wong-Sandler's k_ij | A second quantity under the name `kij`; no default is acceptable (section 6); its objective is ambiguous in the held texts (OPEN QUESTION 2); `1 - D` can approach zero and `(b - a/RT)` must stay of one sign (Poling p. 5.16). | The record's `mixingRule` field; refusal without a record; refusal by name when `1 - D <= 0`; the derivation done by a props op that prints the mismatch it left. |
| The pair's temperature span | The whole use of these rules is extrapolation in T and P of a pair fitted near 1 atm; `a = 0` pairs extrapolate as `1/T` only. | The existing span guard announces every excursion (`PairAudit.H`); the witness cases state the pair's own error (W1). |
| Supercritical components in the G^E model | NRTL has no meaning for a pure "liquid" CO2 at 373 K; the pair is then a parameter of the rule, not a transferable liquid property. | Such pairs live in the CASE (`constant/parameters/`), carry the rule they were regressed through, and are never promoted to the catalogue as plain NRTL pairs. |
| Cost | One gamma evaluation per phase per K; UNIFAC inside a column's Newton. | Measured after slice 1 on the column19/20 comparison; `build/suiteTimings.csv`. |
| F1 | A reader takes "consistent energy" to cover the liquid. | Said in the guide and in the builder's line; the defect is reported separately. |
| Volume translation (C408 (a)) | Lands on the same class in parallel. | A translation shifts `v` and leaves `phi` ratios untouched; it composes after `mix`.  One general at a time on `CubicEoS.{H,cpp}`. |

## 11. To read before slice 1

1. Michelsen 1990, Fluid Phase Equilib. 60 (the DOI of C408; Poling's
   reference list gives two papers in that volume, pp. 47 and 213): the
   definition of `q1`, its value for SRK and for PR, the zero-pressure
   reference and the window of `beta`.  Eq. ? and page.
2. Dahl & Michelsen, AIChE J. 36 (1990) 1829: the quadratic `q`, `q1` and
   `q2` for SRK (cross-check of Poling's -0.478 and -0.0047), whether the
   ideal-solution term is `sum y_i beta_i^2`, the validity window.
3. Poling 5th ed., on the PAGE IMAGE: Table 5-1 (p. 5.17), Eqs. 5-5.8,
   5-5.13, 5-5.14 (pp. 5.15-5.18), Table 8-46 (p. 8.146, W1's twelve
   points) and, for slice 0, Table 4-7 (the alpha functions).

Before slice 2: Huron & Vidal 1979.  Before slice 3: Wong & Sandler 1992
Eqs. 7, 18-22, A1-A19 (page image); Poling Eqs. 8-12.32 to 8-12.39, Table
8-44; Brunner et al. 1987 Table 1.  Before slice 4: Holderbaum & Gmehling 1991.

## 12. Open questions

1. F1: is the liquid enthalpy under phiPhi to move to the liquid root's
   departure?  It decides whether section 7 covers one phase or two.
2. Wong-Sandler's k_ij objective.  As extracted, Poling Eqs. 8-12.35/36
   compare `g^E` with an EoS excess Helmholtz energy that, under
   Eq. 8-12.32a, would equal it identically; the page image and Orbey &
   Sandler (1995, not held) must say at which pressure the EoS side is
   evaluated.  The probe of section 6 matched low-pressure gammas.
3. Wong-Sandler's combining rule: the mean of `(b - a/RT)` times
   `(1 - k_ij)` (Poling Eq. 5-5.11) or Eq. 8-12.34
   (`(b_i + b_j)/2 - sqrt(a_i a_j)(1 - k_ij)/RT`).  Both are printed; the
   k_ij of Example 8-25 belongs to the second.  To settle on the page.
4. May a Huron-Vidal demonstration with a low-pressure pair run in a props
   case, announced, for the lesson it teaches, or only by the route of D3?

## Rulings (architect, 2026-11-16)

1. F1 is a defect of its own, recorded as C410: under phiPhi the liquid
   enthalpy must be the liquid root's departure, as the view already says.
   It is measured first (how many phiPhi cases, how large the move), then
   built as its own slice with every moved row listed.  C408 does not wait
   for it; the energy section of slice 1 covers the phases the engine prices
   through the cubic today and says so.
2. Slice 0 (a per-component alpha function) goes first, with its own short
   design: constants fitted by curation to each record's vapour-pressure law
   and stored with the record, never transcribed from a table.
3. Wong-Sandler's combining rule is the one its worked example uses (Poling
   Eq. 8-12.34); its k_ij objective waits for the page image and the primary.
4. A Huron-Vidal demonstration with a low-pressure pair may run in a props
   case, announced on the run, as a lesson in why it fails; it is refused in
   a flowsheet.
5. MHV2 on PR stays refused until its constants are read in a primary.
6. No equation reaches the engine before it is read in its primary or in a
   held book at the page; the record's own algebra is checked against them
   in slice 1.
