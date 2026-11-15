# C329 slice B2 -- the rate-based packed segment for three components at total reflux

*Design record, 2026-11-15, written by a design general for the architect.
No engine code was written and no engine run was made.  Commission: DEV.md
4c, "C329, WHO THE RATE-BASED COLUMN IS FOR" (the five decisions of
2026-11-14) and "C329 SLICE B1 LANDED".  Engine facts carry the `file:line`
they were read at: `main` at 4ac116d90, and the branch
`origin/c398/slice-d-diffusion` at bb4e8f00b (marked "(d)") for what slice
(d) of C398 adds.  `distillation/` abbreviates
`src/unitOperations/distillation/`.  Every equation carries the page it was
read on.  Every number is either read at the place named or printed by one
of two scratch scripts written for this record (section 9), and is marked
"script" in that case.*

Sources read for this record, with the short names used below:

| short name | what it is | how it was read |
|---|---|---|
| KT91 | Kooijman and Taylor, Ind. Eng. Chem. Res. 30 (1991) 1217-1222 | page images, all six pages |
| TK93 | Taylor and Krishna, *Multicomponent Mass Transfer*, Wiley 1993 | the DjVu file's text layer through the system's `libdjvulibre` (no package installed), and page images for p. 91 |
| TK14 | Taylor and Kooijman, "Mass Transfer in Distillation", chapter 3 of a 2014 distillation handbook | text layer, and page images for pp. 109 and 125 |
| KrT85 | Krishnamurthy and Taylor, AIChE J. 31 (1985) 449-456 (part I) | text layer, pp. 449-453 |
| P01 | Pelkonen, Gorak, Ohligschlaeger and Kaesemann, Chem. Eng. Process. 40 (2001) 235-243 | text layer and page images (Fig. 1 at 300 dpi) |
| P97 | Pelkonen, Kaesemann and Gorak, Ind. Eng. Chem. Res. 36 (1997) 5392-5398 | text layer and the image of p. 5396 |
| V67 | Vignes, Ind. Eng. Chem. Fundam. 6 (1967) 614-616 (a letter) | page images, pp. 614-615 |
| Poling | Poling, Prausnitz and O'Connell, 5th ed., ch. 11 | text layer, pp. 11.20 and 11.41-11.43 |

Not opened beyond their first page: Leffler and Cullinan 1970 and Anderson
and Babb 1961 (both are BINARY papers by their titles and first pages; this
record needs nothing from them).  Not in the folder: section 8.

## 0. For a phone

* **The liquid film** takes one effective diffusivity per component,
  `D_i,eff = (1 - x_i) / sum_{j != i} x_j / D_ij` (TK93 Eq. 6.1.14, p. 126),
  from pair values `D_ij` given by the Kooijman-Taylor generalisation of
  Vignes (KT91 Eq. 23, p. 1219).  The thermodynamic factor stays `take 1`.
  With two components present both formulas return the shipped `Vignes`
  value exactly.
* **The chapter's Eq. 3.41 IS misprinted**, and so is the 1993 book's Eq.
  4.2.19 it descends from.  The primary paper's own Table IV is reproduced
  by the paper's Eq. 21 and not by the form the two books print (section
  1.2, script).
* **The vapour film** gets both models on the same pair coefficients: the
  effective-diffusivity film (one coefficient per component, one DECLARED
  component taking the remainder of the fluxes) and the Maxwell-Stefan film
  (`[k] = [R]^-1`, TK93 Eqs. 8.3.25 and 8.3.27, p. 165).  The total flux
  comes from the interface energy balance in both, as in B1.  The high-flux
  correction is left out and its size is printed.
* **The n = 3 analogue of B1's limit test exists and is exact:** a binary
  whose one component is split into two identical halves must return the
  binary bed.  It exercises the whole n = 3 code at finite composition.
* **The measured witness has a defect in its source.**  P01's Table 3 and
  its Fig. 1 disagree on which packing is the lower section, the second
  packing ("Platte K") has no geometry anywhere in the folder, the paper
  tabulates no temperature profile, and its reflux temperature contradicts
  its own text.  The record therefore proposes the COMPOSITION PATH (2-propanol
  against methanol, height eliminated) as the acceptance, which is what the
  authors themselves compared (P97 Fig. 6), and prints the height profile
  without accepting on it.
* **Slices:** B2a properties (rule, reduction, a props witness against KT91
  Table I); B2b the n-component segment with the effective-diffusivity
  films; B2c the Maxwell-Stefan vapour film and the comparison table.

## 1. The liquid side

### 1.1 What the liquid film needs

B1's liquid-film row is `w_lk = beta_L (xbar_lk - xI_lk) + (xI_lk +
xbar_lk)/2 w_t` (`distillation/RateBasedSegment.cpp:605`), with `beta_L`
from the packing model's `kL` evaluated on ONE liquid diffusivity
(`:443-448`; (d) `:446`, where the value comes through the door).  For n
components the effective-diffusivity film writes the same row for n - 1
components, each with its own coefficient (TK93 Eqs. 8.6.5-8.6.7, p. 205;
definition of the effective diffusivity TK93 Eq. 6.1.1, p. 124, TK14 Eq.
3.26, p. 104):

    w_i = beta_L,i (xbar_i - xI_i) + (xI_i + xbar_i)/2 w_t,
    beta_L,i = c_L kL(D_i,eff) a_e A dz / V_ref.

So the liquid film needs ONE NUMBER PER COMPONENT, `D_i,eff(T, x)`, and the
package must return it for a named component.  Today's door request returns
one value for the binary (`ThermoPackage::diffusivityLiquidEffective`, (d)
`src/thermo/ThermoPackage.cpp:3418`) and refuses three components present
((d) `:3437`), saying that no rule reducing the pair values has been read.
Two things were missing and are both read now: the pair values in a
mixture, and the reduction.

### 1.2 The pair values: Kooijman and Taylor's rule, and the misprint settled

KT91 writes the binary Vignes equation as (Eq. 11, p. 1218)

    D_12 = (D0_12)^x2 (D0_21)^x1,

with `D0_ij` the value for i infinitely dilute in j (the convention is
fixed by KT91 Eq. 18, p. 1219: `D_ij` at `x_j -> 1` is `D0_ij`).  The
multicomponent generalisation is (Eqs. 16 and 19, p. 1219)

    D_ij = (D0_ij)^xj (D0_ji)^xi  prod_{k != i,j} (D_ij,xk->1)^xk,

and what remains is a model for the limiting value of the i-j pair in
nearly pure k.  KT91 discusses three choices:

| rule | limiting value | where | what KT91 says of it |
|---|---|---|---|
| pseudo-binary | Eq. 12 with Eq. 13 (`X_ij = x_i/(x_i + x_j)`), p. 1218 | two different limits at a corner (Eq. 14): discontinuous | "on average, the worst" (p. 1221) |
| Wesselingh-Krishna | `(D0_ij D0_ji)^(1/2)`, Eq. 20, giving Eq. 22 | p. 1219 | "not significantly better" |
| Kooijman-Taylor | `(D0_ik D0_jk)^(1/2)`, Eq. 21, giving Eq. 23 | p. 1219 | recommended (Conclusion, p. 1221) |

KT91 Eq. 23 in full:

    D_ij = (D0_ij)^xj (D0_ji)^xi  prod_{k != i,j} (D0_ik D0_jk)^(xk/2).

**The misprint.**  TK14 Eq. 3.41 (p. 109, read on the page image) prints
the limiting value as `(D0_i,k D0_k,i)^(1/2)`.  TK93 Eq. 4.2.19 (p. 91,
page image) prints the same thing.  The primary, KT91 Eq. 21 (p. 1219,
page image), prints `(D0_ik D0_jk)^(1/2)`.  The primary is right and both
books are wrong, on three grounds:

1. The books' form does not contain j, so `D_ij != D_ji`, against the
   requirement the same page of each book states (KT91 p. 1219; TK93 p. 91:
   "must be symmetric").
2. TK14's own Eq. 3.42 (p. 110) is said to include Eq. 3.41 "as a (very)
   special case", and Eq. 3.42 carries `D_i,k D_j,k`, which reduces to the
   primary's form and not to the printed one.
3. MEASURED (script, section 9): the Fick matrix `[D] = [B]^-1 [Gamma]`
   (KT91 Eqs. 6-8, p. 1217) computed at the four compositions of KT91 Table
   I with the table's own infinite-dilution values and NRTL parameters,
   scored by KT91's own discrepancy (p. 1220), gives

   | limiting value used | overall average | average diagonal | average off-diagonal |
   |---|---|---|---|
   | KT91 Table IV, column "eq 23" (printed) | 0.0763 | 0.0916 | 0.0611 |
   | `(D0_ik D0_jk)^(1/2)` (primary, script) | 0.0782 | 0.0924 | 0.0639 |
   | `(D0_ik D0_ki)^(1/2)` (as the books print, script) | 0.1002 | 0.0995 | 0.1009 |
   | KT91 Table IV, column "eq 22" (printed) / script | 0.1125 / 0.1143 | 0.0712 / 0.0714 | 0.1538 / 0.1573 |
   | KT91 Table IV, column "eq 12" (printed) / script | 0.1145 / 0.1161 | 0.0799 / 0.0796 | 0.1491 / 0.1525 |

   The script reproduces all three printed columns to within 0.004 with the
   primary's form, and misses the "eq 23" column by 0.024 with the books'.
   (The residual 0.002-0.004 IS EXPLAINED, slice B2a review row B2-05: KT91
   Table I prints tau_21 = 0.74632 and TK93 Example 3.3.1, p. 61, prints
   0.76432; with 0.76432 the primary's form gives 0.0763 / 0.0916 / 0.0611,
   the printed "eq 23" column to its four digits, and the books' form (pairs
   evaluated i<j and copied) 0.0974.  The 0.1002 above is with 0.74632.)

A second misprint of the same chapter was met on the way and matters for
slice B2c: TK14 Eq. 3.120 (p. 125, page image) prints the off-diagonal rate
factor as `-N_i (1/(c kappa_ij) - 1/(c kappa_ij))`, which is identically
zero; TK93 Eq. 8.3.29 (p. 166) has `kappa_in` in the second term.  And TK14
Eq. 3.40 prints its left side as `D_i,i`.  **The chapter is not cited as
the authority for any equation of this slice; the 1991 paper and the 1993
book are.**  Slice (d)'s refusal text ((d)
`src/thermo/transport/LiquidTransportDeclarations.cpp:449-454`) already
says the chapter's form "does not contain j"; that reading was right.

**How well the rule does** (KT91 Table IV, p. 1221, average discrepancy of
the Fick matrix with Eq. 23): acetone-benzene-carbon tetrachloride 0.0763;
methanol-1-propanol-isobutanol 0.0558; acetone-benzene-methanol 0.1862,
with a maximum of 0.7051.  KT91 gives the reason for the third (p. 1221):
two of its binaries are associating, and "the Vignes equation does not
perform well for such systems".  **Methanol, 2-propanol and water is an
associating system; nothing read measures the rule on it.**  That is
recorded as a risk (section 8), and it is one more reason the liquid film
is not asked to carry more than an effective diffusivity.

**Where the sources disagree.**  V67 (pp. 614-615) is a rebuttal of an
earlier corner-value extension (Cullinan and Cusick 1967): it shows that
extension asymmetric and concludes that "it seems very difficult to predict
the ternary diffusion coefficients in all the composition diagram from
only the limiting values of these coefficients at each corner".  KT91 does
exactly that, 24 years later, with a symmetric rule and a measured error.
Poling (p. 11.43) says "there are no convenient and simple estimation
methods" and points to KT91.  TK93 (p. 91), written by one of KT91's
authors, uses the Wesselingh-Krishna form (Eq. 4.2.18) "for want of a
fundamentally sound method"; TK14 (p. 110) calls the Kooijman-Taylor form
"arguably, among the least unsatisfactory".  None of them claims more than
an interpolation.  (V67 is NOT the source of the Vignes equation; that is a
1966 paper which is not in the folder.  Slice (d) cites the equation
through Poling Eq. 11-10.4, which stands.)

### 1.3 The reduction to one value per component

Read formulas that turn pair values into `D_i,eff`:

| name | formula | where | exact when |
|---|---|---|---|
| Wilke | `D_i,eff = (1 - x_i) / sum_{j != i} x_j / D_ij` | TK93 Eq. 6.1.14, p. 126 | i diffuses through the others at rest |
| Blanc's law | `1/D_im = sum_{j != i} x_j / D_ij` | Poling Eq. 11-7.4, p. 11.20 | i a trace; it is Wilke's dilute limit |
| Burghardt-Krupiczka | `1/D_i,eff = x_i/D_in + sum_{k != i} x_k/D_ik` (= `B_ii`) | TK93 Eq. 6.1.15, p. 127 | never in general; it drops the off-diagonal of `[B]` |
| Kato et al. | `D_i,eff = D_ii` of the Fick matrix | TK93 Eq. 6.1.16, p. 127 | never in general |
| Stewart | `D_i,eff = sum_k D_ik grad x_k / grad x_i` | TK93 Eq. 6.1.8, p. 125 | always, but it needs the gradients |

**Recommended: Wilke**, for four reasons.  (1) It is what the architect's
decision (2) of 2026-11-14 names ("the stagnant-mixture solution of the
Maxwell-Stefan relation").  (2) It is a function of the state alone and
does not depend on the order of the components; Burghardt-Krupiczka depends
on which component is numbered last, and Stewart's needs the film's
gradients, so neither is a PROPERTY a package can return.  (3) Its dilute
limit is `D_in` (TK93 Eq. 6.1.13, p. 126) and Blanc's law.  (4) A worked
number exists: TK93 Example 6.1.1 (pp. 127-128) gives 50.99 and 16.95
mm2/s for hydrogen and nitrogen in a hydrogen / nitrogen /
dichlorodifluoromethane mixture, and 42.88 and 11.79 by Burghardt's
formula; the script reproduces all four (50.990, 16.945, 42.879, 11.794).

**What the source says against it, and it must be on the page.**  TK93 is
hostile to the whole class: Eq. 6.1.14 "is often used ... even in cases
where none of the components has a vanishing flux" (p. 126, with an
exclamation mark); effective diffusivities "may assume values ranging from
minus to plus infinity" (p. 126); and using the limiting formulas outside
their limits "would stand about as much chance of successfully predicting
the fluxes as the throw of a dice" (p. 208, quoting Smith and Taylor 1983).
The two formulas above differ by 16 to 30 % on the book's own example.
**I cannot decide from what was read whether Wilke or Burghardt-Krupiczka
is closer to a Maxwell-Stefan film in distillation**; no source read
compares them there.  Wilke is recommended on the four grounds above, not
on accuracy, and the grammar names the reduction so that a second one can
be added and compared on the same witness.

### 1.4 The thermodynamic factor: `take 1` is kept, and what it omits is printed

The Fick matrix of a nonideal liquid is `[D] = [B]^-1 [Gamma]` (KT91 Eq.
6, p. 1217; TK93 Eq. 4.2.11, p. 89), `Gamma_ij = delta_ij + x_i d ln
gamma_i / d x_j` at constant T, P and the other independent mole fractions
(KT91 Eq. 4), and the film coefficient is `[k] = [R]^-1 [Gamma]` (TK93 Eq.
8.8.14, p. 216; binary `k = kappa Gamma`, Eq. 8.8.15).  `take 1` drops
`[Gamma]`.  It is kept in B2, for the reason already ruled (a second
derivative of the excess Gibbs energy that a phase-equilibrium fit does not
pin) and for one more that is specific to an effective diffusivity: with n
= 3 `[Gamma]` is a full 2 x 2 matrix, and a film with one coefficient per
component has no place to put its off-diagonal terms.  A thermodynamic
factor belongs with a Maxwell-Stefan liquid film, which is not planned.

How large the omission is, from what was read: at 0.70 / 0.15 / 0.15 in
acetone / benzene / carbon tetrachloride TK93 Example 4.2.6 (p. 92) prints
`[Gamma] = [0.788 -0.088; 0.075 1.043]` (script: 0.789, -0.090, 0.073,
1.045).  THE 0.002 IS EXPLAINED (slice B2a review, row B2-05, read at the
page): TK93 Example 3.3.1 (p. 61), whose NRTL parameters Example 4.2.6
cites, prints tau_21 = 0.76432 where KT91 Table I prints 0.74632; with the
book's value an independent NRTL gives [0.78751 -0.08751; 0.07476 1.04330],
the book's matrix to every printed digit.  The B2a witness carries the
paper's 0.74632 and its gate checks both.  For an aqueous alcohol mixture it will be further from the
identity; nobody has computed it here.  In which direction it acts: with
the equilibrium linearised as `[M] = [K][Gamma]` (TK93 Eq. 7.3.7, p. 150)
the overall resistance is `[R_OV] = [R_V] + (c_V/c_L) [K] [R_L]` and "the
thermodynamic factors cancel out" (TK93 Eqs. 8.8.19-8.8.20, p. 219).  A
film with `take 1` and the true equilibrium keeps `[M]` and loses the
`[Gamma]^-1` of the film, so its liquid term is `(c_V/c_L) [K] [Gamma]
[R_L]`: the liquid resistance is multiplied by `[Gamma]`.  The error of
`take 1` on the overall resistance is therefore about (liquid film's share)
x `(Gamma - 1)`.  B1 already publishes the share; slice B2a's props
operation prints `[Gamma]` along the bed's compositions, so the product is
in front of the student.  P97 (p. 5396) reports that on this system, with
a gauze-packing correlation, "the liquid-phase resistance had practically
no influence" on the composition paths; if the engine's own share agrees,
the omission is small where it matters.

### 1.5 The reduction to the binary, and the gate that holds it

With `x_k = 0` for every k other than i and j:

* KT91 Eq. 23 becomes `(D0_ij)^xj (D0_ji)^xi`, the `Vignes` rule as shipped
  ((d) `ThermoPackage.cpp:3471`, the `Rule::Vignes` branch), for
  any values of the third component's `D0`;
* Wilke becomes `(1 - x_1)/(x_2/D_12) = D_12` for both components.

So `D_1,eff = D_2,eff =` the value `rule Vignes` returns today.  The gate
`check_liquid_diffusivity_declaration` gains two arms on a three-component
package: (a) on the binary edge, `D_i,eff` under the new rule equals
`D_L_effective` of the `Vignes` variant to 1e-12 relative, for each of the
three edges; (b) continuity: at `x_k = 1e-9` it differs from the edge value
by less than 1e-6 relative.  The implementation may route "exactly two
present" through the existing binary function; (b) is what proves that the
route is a limit and not a switch.

The other three shipped rules (`CaldwellBabb`, `LefflerCullinan`,
`AndersonBabb`) have NO multicomponent form in anything read.  KT91 says
that arithmetic averages and "a mole fraction weighted sum" were tried and
none was better than Eq. 23 (p. 1221), and prints no formula for them.
They stay REFUSED with three or more components present, by name, naming
the rule that is accepted.  A viscosity-corrected multicomponent rule is
not invented here.

### 1.6 The grammar (an extension of slice (d)'s, nothing replaced)

    transport { liquid { diffusivity
    {
        returns          effective;
        composition
        {
            rule       VignesKooijmanTaylor;   // pair values in the mixture, KT91 Eq. 23
            reduction  Wilke;                  // D_i,eff from them, TK93 Eq. 6.1.14
        }
        infiniteDilution
        {
            default { model WilkeChang; }
            entries ( ... );                   // as in slice (d), unchanged
        }
        thermodynamicFactor { take 1; }
    } } }

* `rule VignesKooijmanTaylor` is the fifth rule word (the one (d) already
  refuses by this name).  In a binary it IS `Vignes` (1.5).
* `reduction` is REQUIRED when the package holds three or more components
  and `returns effective`, and refused when absent, by name.  In a binary
  package it may be written; the view then prints that every reduction
  returns the pair value.
* `returns infiniteDilution` is untouched.  `returns effective` now answers
  for n >= 3 with a COMPONENT: the door request gains the component it is
  asked for (`liquidProperty::evaluate(..., Property::diffusivity, T, P, x)`
  today, (d) `distillation/RateBasedSegment.cpp:446`; the extension is an
  optional index, absent meaning "the binary's one value", refused when
  absent with three present).
* Six infinite-dilution values are needed for a ternary.  Ruling (4) of
  2026-11-15 refuses the default Wilke-Chang for a pair whose SOLUTE is
  water, so the Pelkonen case must carry declared entries for water in
  methanol and water in 2-propanol, each a value with its source.  No such
  value was looked for in this record (section 8).
* A unit block carries none of this (A4).  The run prints the rule, the
  reduction, both equations and the six `D0` values with their sources, in
  the liquid-properties table the column already prints ((d)
  `RateBasedSegment.cpp`, the "liquid Fick diffusivity" lines).

## 2. The vapour side

### 2.1 What the package gives

Pair diffusivities of a low-pressure gas are independent of composition and
ARE the Maxwell-Stefan values (TK93 p. 162, introduction of section 8.3;
TK14 Eq. 3.35, p. 109).  The engine has one gas-diffusivity model,
`Fuller` (`src/thermo/transport/Fuller.H:64`; `ThermoPackage::diffusivityGas(T,
P, i, j)`, `src/thermo/ThermoPackage.H:662`); `ChapmanEnskog` is a
VISCOSITY model and `Fuller.H:52` says a Chapman-Enskog pair diffusivity
"is NOT built".  P97 used the same correlation for its vapour (p. 5396).
The three pairs come from the package as they do today; the case's
component records need Fuller diffusion volumes for methanol and
2-propanol (the standards records carry one only for water,
`data/standards/components/water.dat:76`), from Poling Table 11-1 as the B1
cases did.

There is no thermodynamic factor (ideal gas; B1 refuses an
equation-of-state vapour and B2 keeps that refusal).

### 2.2 Both films are written on the same pair coefficients

For each pair the packing model gives a film coefficient from that pair's
diffusivity: `kappa_ij = kG(D_ij)` (TK93 section 8.8.3, p. 215; TK14 Eqs.
3.119 and 3.121, p. 125; TK93 Example 12.3.3, p. 368, does exactly this
for a gauze packing).  The packing models already take the diffusivity as
an argument (`PackingRBF::State::DG`, `distillation/PackingRBF.H:103`); kG
is NOT a pure power of D in the Delft model
(`distillation/PackingDelft.cpp:120-126`), so the code calls the model once
per diffusivity and never rescales by an exponent.

**The effective-diffusivity film** (TK93 Eqs. 8.6.5-8.6.7, p. 205, low
flux): for n - 1 components

    w_i = beta_V,i (yI_i - ybar_i) + (yI_i + ybar_i)/2 w_t,
    beta_V,i = c_G kG(D_i,eff^V) a_e A dz / V_ref,
    D_i,eff^V = (1 - y_i) / sum_{j != i} y_j / D_ij      (TK93 Eq. 6.1.14).

The n-th component "takes the remainder": its row is not written, and its
transfer follows from the others and from the total.  Written for all n
components the Fickian fluxes do not sum to zero unless every `D_i,eff` is
equal (TK93 Eqs. 6.1.3-6.1.5, pp. 124-125; KrT85 p. 451 says the same of
its Eq. 12).  Three consequences for the design:

* the remainder component is DECLARED by the case (decision (4) of
  2026-11-14 says it is named in the run; this record adds that it is not
  chosen by the engine, because any rule that picks it from the state
  would switch along the bed);
* the run prints the film's own inconsistency: `sum_i beta_V,i (yI_i -
  ybar_i)` over ALL n components, as a fraction of the sum of their
  magnitudes, per segment, minimum and maximum.  It is zero for a binary
  and for equal diffusivities, and it is the honest measure of how far the
  simple film is from a consistent one;
* the result depends on the choice.  Slice B2b measures by how much (the
  same case with each of the three components as the remainder) and prints
  it; that number is part of the slice's report.

**The Maxwell-Stefan film** (TK93 Eqs. 8.3.25 and 8.3.27, p. 165; in terms
of pair coefficients, low flux):

    R_ii = y_i/kappa_in + sum_{k != i} y_k/kappa_ik,
    R_ij = -y_i (1/kappa_ij - 1/kappa_in),            i, j = 1 .. n-1,
    [k] = [R]^-1,
    w_i = sum_{k=1}^{n-1} beta_V,ik (yI_k - ybar_k) + (yI_i + ybar_i)/2 w_t,
    [beta_V] = c_G [k] a_e A dz / V_ref,

with the mole fractions in `[R]` the average of bulk and interface (TK93 p.
215: "using the average mole fractions").  For a ternary the inverse is
closed (TK93 Eqs. 8.3.30-8.3.31, p. 166), which is a second route for the
gate.  No component takes a remainder: the fluxes sum correctly by
construction and the result does not depend on which component is numbered
last (a gate holds this, section 3.4).  P97 writes the same matrix (its
Eqs. 11-13, p. 5393, and Eq. 34 for the ternary).

**The two films differ exactly by the off-diagonal of `[k]`.**  How large
that is on this system, as an order of magnitude only (script: the three
vapour pair values TK93 Example 12.3.3, p. 366, prints for methanol /
2-propanol / water at 101 kPa, 1.220, 2.896 and 1.883 in 1e-5 m2/s, at
three liquid compositions of P01 run MIW 9, water numbered last, kappa
taken as D^(2/3)):

| composition (P01 Table 3, MIW 9) | k_12/k_11 | k_21/k_11 | k_22/k_11 |
|---|---|---|---|
| h = 0.1 m (0.0573, 0.5827) | 0.033 | 0.192 | 1.071 |
| h = 0.705 m (0.4229, 0.3952) | 0.217 | 0.116 | 0.860 |
| h = 1.79 m (0.8175, 0.1357) | 0.375 | 0.036 | 0.651 |

Cross terms of 20 to 40 % of the diagonal: the two films cannot be expected
to agree here, which is what the witness is for.

### 2.3 The total flux (the bootstrap)

Only n - 1 film rows per phase are independent; the total comes from the
interface energy balance (KrT85 p. 452: "the flux of component c is
determined from the first c - 1 fluxes and from the energy transfer rate
equation"; TK93 Eq. 11.5.7, p. 280, and Eq. 11.5.14, p. 281; P97 Eq. 5, p.
5393).  B1 already has this row (`distillation/RateBasedSegment.cpp`, the
`eV - eL` row, `:619`) and B2 keeps it unchanged in form.  The
shortcut `sum N_i dH_vap,i = 0` (TK93 Eq. 7.2.3, p. 145; TK14 Eq. 3.54) is
NOT used: the book calls it "a special case of a more general
relationship", and the general one is what B1 solves.

### 2.4 The high-flux correction: left out, its size printed

The film coefficients above are zero-flux values.  At a finite total flux
they are multiplied by `[Xi] = [Phi] (exp[Phi] - [I])^-1` (TK93 Eq. 8.3.20,
p. 165, with `[Phi]` from Eqs. 8.3.28-8.3.29, p. 166; scalar form for the
effective-diffusivity film, Eq. 8.6.8, p. 205).  B1 carries the convective
term `(yI + ybar)/2 w_t` and no correction factor; its measured flux ratio
was 0.97 to 1.01 on xylenes.  TK93 says of distillation that "the finite
flux mass transfer coefficients will often be well approximated by their
low flux limits" (p. 151, before Eq. 7.3.14).

Recommended: leave `[Xi]` out in B2b and B2c, and print the largest
`|Phi_i| = |w_t| / beta_i` along the bed for each phase.  To first order
`Xi = 1 - Phi/2`, so half of that number is the relative error of a
coefficient.  The three alcohols-and-water latent heats differ more than
two xylenes', so this number will not be as small as on B1's cases; if it
passes 0.05 on the Pelkonen bed the correction becomes the next slice's
first item, and if it stays below it the omission is recorded with its
measured size.  The threshold is fixed here, before any run.

## 3. The segment equations

### 3.1 Unknowns and rows

The count is unchanged: 5n + 5 per segment, 20 for a ternary
(`distillation/RateBasedSegment.H`, `SegmentLayout::block`), in the order
B1 fixed.  Rows that change:

| rows | B1 | B2 |
|---|---|---|
| vapour film, n - 1 | the light key (`:604`) | every component but the declared remainder (effective diffusivity), or the first n - 1 with the matrix (Maxwell-Stefan) |
| liquid film, n - 1 | the light key (`:605`) | every component but the SAME remainder, each with its own `beta_L,i` |
| interface equilibrium, n | `yI_i = K_i xI_i` | unchanged |
| interface energy | `eV - eL = 0` | unchanged in form; the liquid partial molar enthalpies need their n-component form (B1's is the binary's, `:349-351`): `Hbar_i = h + sum_k (delta_ik - x_k) dh/dx_k` |
| balances, summations | 2n + 4 | unchanged |

The film heat-transfer coefficients.  B1 writes `h_G = kG rho cp
(alpha/D_G)^(2/3)` and `h_L = kL rho cp (alpha/D_L)^(1/2)` (`:495-496`),
which needs "the" diffusivity.  With three pairs there is none.  The
analogy itself says: the Sherwood correlation evaluated with the thermal
diffusivity in place of the mass diffusivity.  So B2 computes `h = rho cp
k(alpha)`, calling the packing model with `alpha`.  For a power-law
correlation this is the same statement as B1's; it is NOT byte-identical
(the Rocha-Bravo-Fair exponent is 0.33 on Schmidt,
`distillation/PackingRBF.cpp:127`, against B1's 2/3 on the ratio, and the
Delft kG is not a power law), so the energy-related rows of the four
`ratebased0x` goldens move in their later digits.  Recommended: one
definition for every n, the moved rows listed with this reason at the
landing.  The alternative (B1's formula for a binary, the new one for n >=
3) is a law switched on the component count and is rejected.

### 3.2 The Newton

Nothing new in structure.  B1 freezes the coefficients of a pass at the
previous pass's mid-states and iterates the passes to a fixed point (the
"coefficients did not settle" refusal, `:764`).  `[beta_V]` (four numbers
per segment for a ternary), the `beta_L,i` and the average mole fractions
inside `[R]` are frozen the same way, so every film row stays linear in
the unknowns within a pass, the block stays 5n + 5, and the declared
block-tridiagonal structure and its audit are unchanged.

What does change is the discretisation estimate.  B1's is a Richardson
estimate on the HETP (`:806`), a binary notion.  For n components: the
largest change of any liquid mole fraction at the declared sampling heights
between M and M/2 segments, divided by 3.  Near a distillation boundary
the profile below the pinned point is a diverging family of paths; a small
discretisation error there is amplified, and the estimate will say so.
That is a measurement the slice must report, not a defect to tune away.

### 3.3 The ends: a pinned section, a rate at the top, the reflux temperature

B1's bed stands on an equilibrium reboiler whose liquid composition is
declared (`specifiedAt reboiler`, the only accepted value, `:185-188`).
The ruling of 2026-11-14 ("a partial bed needs its own lower boundary")
is built in this slice because the witness needs it:

* **The pin.**  At total reflux the balance around everything above a
  cross-section gives `V = L` and `y = x` there (P97 Eq. 23, p. 5394).  One
  liquid composition at one face of the bed therefore fixes the profile.
  `totalReflux { specifiedAt height; height <z>; composition {...} }`, z on
  a segment face (refused otherwise, naming the nearest faces).
* **The lower boundary of a bed with no reboiler:** the vapour entering the
  lowest segment has the composition of the liquid leaving it, and the same
  molar rate.  Its temperature is an ASSUMPTION the run names: saturated
  (the dew point of that composition).
* **The rate.**  P01 gives the liquid molar flux at the top (`LTop`,
  mol/(m2 s)), not an F-factor.  `totalReflux { refluxFlux <mol/m2/s>; }`
  beside `fFactor`, exactly one of the two.
* **The reflux temperature.**  The liquid enters the top segment at a
  DECLARED temperature when the case gives one (`refluxTemperature`),
  otherwise at its bubble point as in B1.  The segment model has its own
  liquid temperature, so a subcooled reflux needs no new equation; the run
  prints the internal condensation it causes.

### 3.4 What B1's limit test becomes

B1's `limit transferUnits` holds the segment to an oracle that exists in
the tree only for a binary (`model totalReflux;` with `packing {}`).  There
is no three-component transfer-unit bed to compare with, and building one
to serve as an oracle would be a second model with the same author.  Four
checks replace it, the first being the true analogue:

1. **THE SPLIT COMPONENT (exact, at finite composition).**  Take a B1 case
   (A, B) and make a ternary (A1, A2, B) in which A1 and A2 are two copies
   of A's record, with the bed's A divided between them.  In the
   Maxwell-Stefan relations B's equation contains only `D_B,A1 = D_B,A2`
   and is the binary's whatever `D_A1,A2` is; Wilke's `D_B,eff` is `(1 -
   x_B)/((x_A1 + x_A2)/D_AB) = D_AB`.  So B's profile, the HETP on (A1 +
   A2, B) and the duties must equal the binary case's under BOTH vapour
   films and under the liquid film.  Tolerance, fixed here: 1e-8 relative
   on the HETP (same segments, same scheme, same solver tolerance; no
   discretisation difference as in B1's 0.016 %).
   One finding on the way: KT91 Eq. 23 is NOT invariant under this split.
   Its limiting value with k a copy of j is `(D0_ij D0_jj)^(1/2)`, not
   `D0_ij`.  The test therefore declares the two A1-A2 entries equal to
   `D0_BA` (marked as the test's device), which makes Eq. 23 return the
   binary Vignes value exactly.  This is a property of the rule (it holds
   for the Wesselingh-Krishna form too), worth a sentence in the guide.
2. **THE TRACE.**  The same binary with a third real component at 1e-8 in
   the pinned composition: HETP and duties within 1e-6 relative of the
   binary case.
3. **EQUAL PAIRS.**  With every pair coefficient equal, `[k] = kappa [I]`
   (TK93 Eqs. 8.3.34-8.3.35, p. 167) and every `D_i,eff` equals the common
   value (TK93 Eq. 6.1.12, p. 126): the two vapour films are the same film
   and the remainder component does not matter.  A kernel-level check.
4. **PERMUTATION.**  The Maxwell-Stefan film's profile is unchanged when
   the components are listed in another order (solver tolerance).  The
   effective-diffusivity film's is unchanged when the same component is
   declared as the remainder.

And a kernel anchor from a printed worked example: TK93 Example 12.3.3 (pp.
365-370) gives, for a quaternary at total reflux on a gauze packing, the
six vapour pair coefficients (0.0216, 0.0160, 0.0288, 0.0211, 0.0376,
0.0282 m/s), the vapour composition, and the resulting `[R_V]` (first row
47.5323, -0.0367, -0.0872 s/m).  The `[R]` builder is checked against that
matrix for n = 4.  The example is NOT used beyond `[R_V]`: it is internally
inconsistent elsewhere (it prints the corrugation side as 8.9 mm and
computes with 6.4 mm; the same packing has 492 m2/m3 in Example 12.3.2 and
450 in 12.3.3; an effective velocity of 1.085 m/s becomes 1.0750 two lines
later), and it uses the 1985 gauze correlation (Sherwood constant 0.0338),
not the 1996 model the engine carries (0.054,
`distillation/PackingRBF.cpp:127`).

Conservation and the first law are held as in B1 (material to round-off
per component, the first law by a second route with the interface row's
sabotage as the gate's self-test arm), now for three components.

## 4. Witnesses and acceptance

### 4.1 Pelkonen 2001: what the paper holds, read at source

* **Runs.**  Table 3 (pp. 239-240): seven runs MIW 9 to MIW 15 of methanol
  / 2-propanol / water, liquid mole fractions of methanol and 2-propanol
  against height, top pressure 960 mbar, total reflux.  "The packing height
  0 m corresponds to the sampling place below the lowest packing section"
  (table footnote).  Per run a reflux temperature `TTop` (deg C) and a
  liquid molar flux at the top `LTop` (mol/(m2 s)): MIW 9 55.47 / 43.83;
  MIW 12 54.55 / 43.25; MIW 13 53.62 / 42.91; MIW 14 53.38 / 38.98; MIW 15
  54.08 / 40.31.
* **Which runs.**  MIW 9, 12, 14 and 15 have the sample at 0 m (16, 15, 17
  and 17 points; MIW 9 lacks 0.605 m, MIW 12 lacks 0.705 and 0.805 m).  MIW 13 has no value at 0 m.
  MIW 10 and MIW 11 are set aside: their heights (0.905, 1.324, 1.795 m)
  fit neither sampling scheme of Fig. 1, MIW 10 has three empty rows, and
  MIW 11's `TTop` 51.05 and `LTop` 55.86 look like the other runs' values
  exchanged (not resolvable from the paper).
* **No temperature profile is tabulated**, and no reboiler composition, and
  no pressure drop ("not reported because of its insignificant influence",
  p. 241).  The brief asked for temperature by height: the paper does not
  hold it.
* **Stated uncertainty** (p. 241): "The maximal relative error of the
  composition analysis with the GC was measured to be 2% and that of the
  molar liquid load 10%."
* **The column** (Table 2, p. 238; Fig. 1, p. 236): 100 mm diameter, 1.79 m
  of packing in TWO sections, Sulzer BX and "Platte K".
* **The reflux.**  The text says "the reflux is fed back into the column
  at its boiling point" (p. 238); the symbol list defines `TTop` as the
  "temperature of the reflux stream at the column top" (p. 243), and the
  tabulated values are 53 to 56 deg C for liquids rich in methanol at 960
  mbar.  Whether that is below the bubble point is for the engine's own
  bubble point to say in the slice's first step; if it is, the paper
  contradicts itself and the case declares `refluxTemperature` from the
  table.

**THE SOURCE'S DEFECT, which decides the acceptance.**  Fig. 1 (read at 300
dpi) draws Sulzer BX as the LOWER section, with sampling points 10, 142,
255, 368, 481, 613, 726, 858 and 990 mm above its base and "0 m" at that
base, and Platte K as the UPPER section, with points 100, 205, 320, 405,
505, 605, 705 and 800 mm above its own base and "1.79 m" at its top.
Table 3's heights are 0.1, 0.205, 0.320, 0.405, 0.505, 0.605, 0.705, 0.805,
then 0.810, 0.942, 1.055, 1.168, 1.281, 1.413, 1.526, then 1.790: the
Platte K offsets as they stand, followed by 0.800 plus the BX offsets
(0.800 + 0.010, + 0.142, ... + 0.990; the 858 mm point is absent from every
run).  **The table places Platte K at the bottom and BX on top; the figure
draws the opposite.**  One of the two is wrong and the paper does not say
which.  The primary source of these runs is a 1991 habilitation thesis
(P01 reference [7]); it is not in the folder.

Second defect: **"Platte K" has no geometry anywhere in what was read**
(not in P01, not in P97, not in the folder's index).  Choupo has a Sulzer BX
record (`data/standards/assets/SulzerBX.dat`, every value read at its
page, served by Rocha-Bravo-Fair's gauze area); it has nothing for the
other section.

So a comparison of composition against HEIGHT over this bed would rest on
a packing whose position is ambiguous and a second packing that cannot be
described.  It is not proposed as an acceptance.

### 4.2 What is accepted instead: the composition path

P97 compares exactly this: its Fig. 6 (p. 5396) plots 2-propanol against
methanol, six experiments, each simulated line made to pass through one
measured composition ("six different experimental compositions have been
fixed in the simulations").  The reason is in P97's own algebra: with the
resistance in the vapour and pair coefficients `kappa_ij = A_V D_ij^(2/3)`
(Eq. 35, p. 5395), the direction of the path `dx_1/dx_2` (Eq. 25, p. 5394)
does not contain the packing factor `A_V`.  The path is a property of the
equilibrium and of the RATIOS of the pair diffusivities; the height is a
property of the packing.  B1's experience says the same from the other
side: its error against measurement "is the packing correlation's, not the
model's form".

Acceptance for the Pelkonen cases, fixed here before any run:

1. **The discriminating feature, yes or no per run and per film.**  In all
   four complete runs the tabulated 2-propanol fraction passes a maximum
   and FALLS towards the base (MIW 9: 0.5889 at 0.205 m, 0.5827 at 0.1 m,
   0.5156 at 0 m; MIW 12: 0.4099, then 0.3704 at 0 m; MIW 14: 0.5507, then
   0.4558; MIW 15: 0.5621 at 0.205 m, 0.5610, then 0.4748), that is, the
   profile turns towards water.  P97 reports that the Maxwell-Stefan model
   ends on water "as is the case in the experiments" and the equal-facility
   and equilibrium models end on 2-propanol (p. 5396).  The slice reports,
   for each run and each vapour film, whether the computed path from the
   pinned point turns the same way.  **This is a finding, not a pass
   mark:** an effective-diffusivity film that turns the wrong way is the
   result the architect's decision expects to be able to show, and it is
   printed as a MODEL MISS in the run and on the page.
2. **The path, quantitatively.**  With the pin at the uppermost sample of a
   run (1.790 m), the largest and the mean `|x_2-propanol(computed) -
   x_2-propanol(measured)|` taken at equal methanol fraction over the
   run's other samples.  Tolerance: mean <= 0.03 mole fraction.  Where the
   0.03 comes from: the table has two samples that its heights place 5 mm
   apart, across the joint of the two sections (0.805 and 0.810 m), and
   they differ by 0.026 in methanol in MIW 9 (0.4610, 0.4870), 0.032 in
   MIW 13 (0.8152, 0.8468), 0.021 in MIW 14 and 0.007 in MIW 15.  The
   paper does not say whether that is sampling scatter or what the joint
   does to the liquid; either way a model with a continuous profile cannot
   be held to a tighter line than that step.  A miss is reported as a miss.
3. **The height profile is printed beside the measurement and NOT accepted
   on**, under two declared hypotheses, both named in the case header: the
   table's arrangement, and the BX correlation borrowed for the Platte K
   section (slice (e)'s `borrowed` origin).  The record of the run says
   that the height axis of this case carries no claim.

**What I could not decide.**  Whether (2) can pass at all depends on the
vapour-liquid equilibrium more than on the film: P97 (pp. 5396-5397) finds
that with one activity model all three of its transfer models follow the
measurement, and with two others only the Maxwell-Stefan one does, "which
stresses the sensitivity ... to the VLE calculation".  The paper's
parameter set was fitted to ternary measurements and comes from a
commercial data collection; it is not used.  The tree has its own NRTL
pairs for the three binaries, regressed by Choupo from archived
measurements (`data/standards/parameters/NRTL/isopropanol-methanol.dat`,
`isopropanol-water.dat`, `methanol-water.dat`).  **Step 0 of slice B2b,
before any column is run:** with those pairs, locate the 2-propanol / water
azeotrope and the distillation boundary at 960 mbar and place the four
pinned compositions against it.  If the engine's boundary puts them on the
other side from the measurement's end, no film model will be judged on
this witness until the equilibrium is; that outcome is reported to the
architect and the tolerance above is not loosened.

### 4.3 The Kooijman-Taylor table as the property-level witness

KT91 Table I (p. 1218): acetone (1) / benzene (2) / carbon tetrachloride
(3) at 25 deg C; four compositions with the measured Fick matrix in the
molar-average frame (1e-9 m2/s), converted by KT91 from the volume-frame
data of Cullinan and Toor (1965); six infinite-dilution values (2.75, 4.15,
1.70, 3.57, 1.42, 1.91 for 12, 21, 13, 31, 23, 32); dimensionless NRTL
parameters with all `alpha = 0.2`.

| x1 | x2 | x3 | D11 | D12 | D21 | D22 |
|---|---|---|---|---|---|---|
| 0.2989 | 0.3490 | 0.3521 | 1.8690 | -0.2129 | -0.0043 | 2.2730 |
| 0.1496 | 0.1499 | 0.7005 | 1.5968 | -0.0592 | -0.0771 | 1.8132 |
| 0.1497 | 0.6984 | 0.1519 | 1.9652 | 0.0137 | -0.1522 | 1.9248 |
| 0.6999 | 0.1497 | 0.1504 | 2.3041 | -0.4019 | 0.1848 | 2.9969 |

A props case (`tutorials/props/transport/`), self-contained (the six `D0`
as declared entries with KT91 as their source, the NRTL pairs case-local),
with a new operation (`liquidDiffusionMatrix`, or new keys of
`propertyPoint`; the builder's choice) that prints at each composition:

* the three pair values `D_ij` (keys `D_L_MS_<i>_<j>`);
* `[Gamma]` (2 x 2, by central differences of `ln gamma` along `x_j` with
  the last component taking the change, step printed);
* the Fick matrix `[B]^-1 [Gamma]` (KT91 Eqs. 6-8), with the component
  numbered last NAMED, because the matrix depends on it (KT91 p. 1219-1220,
  Figs. 5-7);
* `D_i,eff` by the declared reduction (keys `D_L_effective_<i>`);
* the measured matrix beside it as `anchor` rows.

Acceptance, fixed here: (a) the averages of KT91's discrepancy `(D_calc -
D_exp)/D_ii` over the four points within 0.005 of KT91 Table IV's "eq 23"
column (0.0763 overall, 0.0916 diagonal, 0.0611 off-diagonal; this
record's script gives 0.0782, 0.0924, 0.0639); (b) `[Gamma]` at 0.70 / 0.15
/ 0.15 within 0.005 absolute of TK93 Example 4.2.6's printed matrix (p. 92;
the example's composition is not one of the table's, so it is a fifth
point of the case).  HELD OUT in the C300 sense: nothing is fitted in the
case; the six `D0` are KT91's inputs, which TK93 (p. 91) says "have been
estimated".

What this witness does and does not show.  It shows that the engine
computes the rule KT91 proposed and that, on a non-associating system, the
rule's Fick matrix is within about 8 % of a measurement.  It does not show
anything about methanol / 2-propanol / water, and it exercises `[Gamma]`,
which the column does not use.

One trap in the table: its header gives the molar volumes in "1e-6
m3/kmol" (74.05, 89.41, 97.09); those numbers are cm3/mol.  The volumes
were KT91's for the change of frame and are not needed by the case.

The existing props case of slice (d),
`tutorials/props/transport/liquidDiffusivity01_pelkonen_ternary`, holds the
REFUSAL of an effective value on this very ternary (its header and its
gate arm).  B2a turns that refusal into an answer: the header, the gate
arm and the view's sentence are absences that become false and are
rewritten in the same slice.

## 5. Slicing

Each slice lists its rule-4d deliverables; a report without them is
partial.

**B2a -- properties.**  Depends on slice (d) of C398 landing first.
* Builds: `rule VignesKooijmanTaylor` and `reduction Wilke` (1.6); the
  package function for `D_i,eff` of a named component and the door request
  that carries it; the same reduction for the gas pair values; the pair
  values in the mixture as readable properties; `[Gamma]` and the Fick
  matrix as PROPS quantities only.
* Witnesses: 4.3; TK93 Example 6.1.1 as the reduction's `verify()` anchor
  (50.99 and 16.95 mm2/s, a gas, where the formula has no rule under it);
  the binary-edge and continuity arms of 1.5.
* Must not move: every existing case byte-identical (the new words are
  selected by none).  Validation by reach: the props family, the gates that
  read the diffusivity declaration, `--fast`.
* Guides: Theory Guide section on the multicomponent liquid diffusivity
  (KT91 Eqs. 16-23 as implemented, the two rejected limiting values and
  why, the misprint in the two books said plainly with the measurement of
  1.2, Wilke's reduction with its derivation from the Maxwell-Stefan
  relation for stagnant others, what `take 1` omits) with a `\label`;
  `gui/src/case/modelDocs.ts` anchors for the rule and the reduction;
  Props Guide operation reference; `docs/tutorials-catalogue.md`;
  `docs/ai/thermo.md` and the capability index; PDFs rebuilt.

**B2b -- the n-component segment with the effective-diffusivity films.**
* Builds: section 3 (rows for n - 1 components, the declared remainder, the
  n-component partial molar enthalpies, `h = rho cp k(alpha)`, the pinned
  section, the rate at the top, the reflux temperature, sampling heights
  and the new discretisation estimate); the refusal at `:139` lifted for n
  = 3 (n >= 4 is not refused by the mathematics, but stays refused until a
  case exercises it); the printed inconsistency of the film and the printed
  rate factor.
* Step 0: the equilibrium check of 4.2, reported before the column runs.
* Witnesses: 3.4 checks 1, 2 and the conservation and first-law arms; the
  four Pelkonen cases with their reference tables transcribed (three
  readings of each number, as for any transcribed table) and the
  acceptance of 4.2; the remainder-component sensitivity.
* Moves: the energy-related rows of `ratebased01`-`04` (3.1), listed.
* Guides: `sec:rateBasedSegment` extended (the n-component rows, each film
  coefficient written out with its diffusivity in sight, which B1 still
  owes; the remainder; the pin); the model's `modelDocs` entries;
  Tutorials Guide and catalogue for the new cases; `docs/ai/unit-ops.md`;
  the page on equilibrium stages or rate-based where this makes a sentence
  false; PDFs.

**B2c -- the Maxwell-Stefan vapour film.**
* Builds: `film { vapour { model MaxwellStefan; } }` beside
  `effectiveDiffusivity` (a unit-level MODEL choice, no property value);
  `[R]`, its inverse, the matrix rows.
* Witnesses: 3.4 checks 1, 3 and 4; the `[R_V]` anchor of TK93 Example
  12.3.3; the closed ternary inverse (TK93 Eq. 8.3.30) as a second route;
  the four Pelkonen cases again, and THE TABLE the slice exists for:
  measured / effective-diffusivity film / Maxwell-Stefan film, per run,
  feature and path.
* Guides: the film's section with `[R]` written out for a ternary and the
  statement that the two films differ by its off-diagonal; the EduTool
  page updated with the measured table; catalogue; PDFs.

**A different cut, considered and not recommended.**  Building the matrix
film first and deriving the simple film from it would save a little code.
It is rejected because the two films are NOT nested as built: Wilke's
`D_i,eff` is not the diagonal of `[R]^-1` nor `1/R_ii` (that would be
Burghardt-Krupiczka's formula), so "the simple film is the matrix film
with its off-diagonal removed" would be false for the reduction the
architect chose.  If the architect prefers that nesting for its teaching
value, the reduction to choose is Burghardt-Krupiczka's, and it then
depends on the remainder component (1.3).  That is a real alternative and
the one place in this record where the pedagogy could overturn the
recommendation.

## 6. Decisions recommended, each with its reason

1. `rule VignesKooijmanTaylor` = KT91 Eq. 23, cited to the 1991 paper.  The
   two books' printed form is a misprint (measured).
2. `reduction Wilke` (TK93 Eq. 6.1.14) for both phases.  A function of
   state, order-independent, named by the architect, with a worked number.
3. `take 1` kept.  An effective diffusivity has no place for a matrix; the
   size and direction of the omission are printed.
4. The other three binary rules stay refused for three components.  No
   multicomponent form of them was read.
5. Pair coefficients by calling the packing model per diffusivity, never by
   an exponent.  The Delft kG is not a power law.
6. The remainder component is declared, and the film's inconsistency is
   printed.  A choice made from the state would switch along the bed.
7. No high-flux correction; its size printed; 0.05 on the rate factor is
   the line above which it becomes the next item.
8. `h = rho cp k(alpha)` for every n.  One definition; B1's rows move in
   late digits, listed.
9. The n = 3 limit test is the split component, to 1e-8.  It is exact and
   runs the whole code.
10. Pelkonen is accepted on the composition path and on the turn towards
    water, not on height.  The source cannot support a height claim.
11. Step 0 (the equilibrium's boundary) precedes any judgement of a film.

## 7. Absences that become false when this is built

* (d) `LiquidTransportDeclarations.cpp:449-454`: "refused until its source
  is read ... the 1991 paper that proposed it is not in hand".
* (d) `ThermoPackage.cpp:3437` and the sentence after it: "no rule that
  reduces the pair values to it has been read".
* (d) `liquidDiffusivity01_pelkonen_ternary`, header and gate arm (4.3).
* `distillation/RateBasedSegment.cpp:139-143`: three components refused.
* `docs/design/c329-ratebased-at-general-reflux.md` section 6: "Pelkonen
  2001: nothing in the tree", and section 4.3's row "liquid diffusivity at
  finite concentration, every pair: infinite dilution only".
* The ruled sentence that the liquid thermodynamic factor exists in no
  activity model stays TRUE for the runtime; B2a adds it as a props
  quantity only, and the guide must say which.

## 8. Risks and unknowns

**Not read, or not in the folder.**
* Cullinan and Toor (1965), the measurements behind KT91 Table I.  The
  table is KT91's conversion to another frame; the conversion was not
  checked.
* KT91's supplementary material (the complete tabulations).
* Vignes (1966), the binary equation's own paper.
* The 1991 habilitation thesis and the 1997 doctoral thesis behind P01's
  runs: the only places the section order, the Platte K geometry and the
  reflux condition could be settled.  Only Vitor can obtain them.
* Gorak and Vogelpohl (1985), the same ternary at total reflux on ONE
  packing (P01 Table 1, row [8]: 100 mm, 0.8 m, ten compositions).  It
  would be the clean height witness; the packing's geometry would have to
  come with it.
* The 1985 gauze-packing correlation the authors' simulations used (the
  folder has the 1982 and 1993/1996 papers).
* Leffler and Cullinan (1970) and Anderson and Babb (1961) beyond their
  first pages.
* TK93 was read through its text layer, whose equations are garbled; every
  TK93 equation used above was either legible in the text, reproduced by a
  number the book prints, or read on a page image (p. 91).  Eqs. 8.3.25 and
  11.5.14 were read from garbled text and their form confirmed against
  TK14 Eq. 3.118 (page image) and P97 Eqs. 12-13 respectively.

**Unknown until measured.**
* Whether Choupo's own NRTL pairs put the runs on the measured side of the
  boundary (Step 0).  This is the largest risk to the witness.
* Whether the effective-diffusivity film turns towards water.  Nothing read
  says; P97's "fluctuation" model is an EQUAL-facility film, which is not
  the film proposed here (per-component coefficients).
* How much the remainder component moves the answer.
* The six liquid `D0` values: two need a measured source (water as the
  solute); the rule under them is at its weakest on associating liquids
  (KT91: 19 to 42 % average error with methanol present).  The liquid
  film's share of the resistance bounds the damage and is printed.
* The size of the rate factor on this bed (2.4).
* Conditioning near the boundary: the Newton is a boundary-value solve of
  what is physically a diverging family of paths below the pin.  It may
  need the pin low in the bed for a first solution and a continuation up.
  Not tested.
* The heat/mass analogy for the film heat-transfer coefficients still has
  no measurement behind it (B1's own statement); P01 offers none.

**A limit of the design itself.**  Two approximations are stacked in the
simple film (a reduction formula exact only for stagnant others, and a
remainder component), and the liquid adds a third (an interpolation rule
on an associating system) and a fourth (`take 1`).  The run prints a
number for each: the film's inconsistency, the remainder sensitivity, the
liquid share, `[Gamma]`.  If those four numbers are not on the student's
screen the slice has hidden what it was built to show.

## 9. How the numbers of this record were obtained

* The DjVu book: the system library `libdjvulibre.so.21` called through
  Python's `ctypes` for the text layer; `convert` for page images.  Nothing
  was installed.
* Script 1 (KT91 Table I): Renon's NRTL with the table's `tau_ij` and
  `alpha = 0.2`; `[Gamma]` by central differences (step 1e-6) with
  component 3 taking the change; `[B]` by KT91 Eqs. 7-8; five limiting-value
  rules; KT91's discrepancy.  It was checked first against TK93 Example
  4.2.6 (p. 92): pair values 3.783, 3.021, 1.647 (book 3.783, 3.021,
  1.647); `[B]` 0.321, 0.047, 0.051, 0.367 (book the same); `[D]` 2.479,
  -0.708, -0.147, 2.945 (book 2.476, -0.701, -0.142, 2.939).  With the NRTL
  parameters transposed the same check fails (`D11` 1.926), which fixes the
  convention of the table's `tau_12`.
* Script 2: the `[R]^-1` ratios of 2.2 and the four numbers of TK93 Example
  6.1.1.

Both scripts and their outputs were scratch files of the session and are
not in the repository; the builder of B2a writes the engine's own.
