# COSMO-SAC sigma-profile VALIDATION STUDY — can an `LVPP` named set be generated?

**Date** 2026-07-24 · **Tier** private staging (`data/tmp/`, gitignored) · **Scope** data only
**Nothing under `src/`, `data/standards/` or `gui/` was read-write.** No profile was written into
any component file. No commit.

**Question.** Every COSMO record staged from the LVPP raw `.cosmo` files is currently `flagged`,
because LVPP's QM protocol (NWChem, B3LYP/def2-SVPD, SES cavity) differs from the shipped
VT-2005 set — measured on ethylene as **+6.1 % cavity area / +10.3 % volume**
(`evidence/_LEDGER.md`).  Can a named `LVPP` sigma-profile set nevertheless be generated from
those files, and is it physically usable with Choupo's `cosmoSAC2002` implementation?

**Answer, in one line.** The generation is now solved and validated to machine precision — but the
resulting profiles are **not** the same physical object as the VT-2005 profiles Choupo ships, they
are **not** reconcilable by any re-tuning of the averaging, and feeding them to Choupo's
`cosmoSAC2002` constants changes activity coefficients by up to **−79 %**.  An `LVPP` set is
generatable **but must not be labelled `variant "2002"`**, and must never sit in the same
component alongside `VT2005` unless the case is forced to name one of them.

---

## 1. Method

### 1.1 What was built

| artefact | what it is |
|---|---|
| `_sources/cosmo_tools/sigma_profile.py` | standalone Klamt sigma-averaging + area-conserving binning; parses LVPP/NWChem **and** DMol3/GAMESS/Gaussian09 `.cosmo`; `--selftest` |
| `_sources/cosmo_tools/validate_panel.py` | the 15-compound panel + 1 control row → `validation_panel.csv`, per-compound profiles in `profiles/` |
| `_sources/cosmo_tools/cosmosac_gamma.py` | faithful **Python mirror** of `src/thermo/activityCoefficient/CosmoSac.cpp`, verified against the engine's own golden output; measures the consequence of a set swap |
| `_sources/nist_cosmosac_ref/` | the NIST reference `.cosmo` / `.sigma` pair (public domain), used as the external golden file |
| `_sources/cosmo_tools/validation_panel.csv` | the numbers behind every claim below |
| `_sources/cosmo_tools/gamma_consequence.txt` | captured output of the activity-coefficient consequence run |

### 1.2 The algorithm

Klamt averaging of the raw apparent surface charges, then area-conserving binning:

```
sigma_m = SUM_n w_mn sigma_n / SUM_n w_mn
w_mn    = (r_n^2 r_av^2)/(r_n^2 + r_av^2) * exp(-f_decay * d_mn^2 / (r_n^2 + r_av^2))
r_n     = sqrt(a_n/pi)          sigma_n = q_n / a_n          d_mn in Angstrom
```

then each averaged `sigma_m` deposits its segment area `a_n` onto the two bracketing nodes of the
51-point grid, split linearly.  The binned quantity is **`p(sigma)·A`, area per bin in Å²**, which
sums to the cavity area — exactly the convention `CosmoSac.cpp` expects (`pArea_`, which forms the
probability itself as `pArea_[i][k]/area_[i]`).

### 1.3 Constants used, and where each one came from

| constant | value | source — **verified**, not assumed |
|---|---|---|
| bohr → Å | 0.52917721067 | `usnistgov/COSMOSAC`, `profiles/to_sigma.py:18`, annotated in-source with the CODATA reference. Its square 0.28002852 is the factor the Choupo COSMO evidence audit had already verified independently against the LVPP `$segment_information` area column. |
| **Mullins** averaging | `r_av = 0.8176300195 Å`, `f_decay = 1.0` | `to_sigma.py::Dmol3COSMOParser.average_sigmas`, and repeated verbatim in that file's CLI help. This is the Lin & Sandler (IECR 41 (2002) 899) / Mullins et al. (IECR 45 (2006) 4389, the VT-2005 database) convention — i.e. the convention of the profiles Choupo ships as `VT2005`. The same source notes the identity `0.8176300195 = ((7.5/pi)^0.5)·0.52917721092`, reproduced by the script as an arithmetic self-check (agrees to 8e-12). |
| **Hsieh** averaging | `r_av = sqrt(7.25/pi) Å`, `f_decay = 3.57` | same function. Hsieh, Sandler & Lin, *Fluid Phase Equilib.* **297** (2010) 90, doi:10.1016/j.fluid.2010.06.011 — the same DOI LVPP's own `pars/GMHB1808/README.md` cites for its `f_decay = 3.57`. Implemented **only** because the one public input/output reference pair NIST ships was produced with it. |
| sigma grid | 51 nodes, −0.025…+0.025 e/Å², step 0.001 | `to_sigma.py::get_outputs` **and** Choupo's own `CosmoSac.H/.cpp` (`NGRID 51`, `SIGMA_MIN −0.025`, `DSIGMA 0.001`) — two independent confirmations. |
| binning rule | linear split between bracketing nodes | `to_sigma.py::weightbin_sigmas`. |
| `sigma_hb` | 0.0084 e/Å² | `CosmoSac.cpp` and `to_sigma.py::get_meta`. Used here only to define the "HB-active area" diagnostic. |

**Deliberately NOT assumed** (stated in the script header, and enforced): `--averaging` is a
**required** argument — `sigma_profile.py` refuses to pick an averaging convention for you.
Nothing in the literature read here licenses transplanting the COSMO-SAC-2002 constants
(`a_eff 7.5`, `alpha' 16466.72`, `c_hb 85580`, `z 10`, `r_0 66.69`, `q_0 79.53`, from
`CosmoSac.cpp`) onto profiles built from a different QM protocol; they were regressed *together*
with the VT-2005 profiles.  LVPP's own parametrisations confirm the point by using different
averaging radii for their own profiles: `pars/CS25/globals.csv` → `RAVG = 0.8` (NWChem/def2-SVPD,
the very protocol of `release_v25`), `pars/GMHB1808/globals.csv` → `RAVG = 1.1` (GAMESS).
Neither equals 0.8176300195.

### 1.4 The implementation is externally validated (this is not self-certification)

`python3 sigma_profile.py --selftest` reprocesses the NIST reference pair
`profiles/DMol3_TEST/LFQSCWFLJHTTHZ-UHFFFAOYSA-N.{cosmo,sigma}`:

```
cavity area  ref / mine  : 88.40645 / 88.40645 A^2
profile sum  ref / mine  : 88.406570 / 88.406570 A^2
max |bin difference|     : 1.288e-13 A^2  (1.457e-15 of total area)   PASS
```

(The reference `.sigma` is a three-profile NHB/OH/OT Hsieh output; the sum of its three columns is
algebraically identical to the single-profile output, because the `P_hb` re-weighting moves area
between the columns and conserves their sum — so summing them is a legitimate golden value.)

**And the decisive control.** That NIST reference compound is *ethanol* (InChIKey
`LFQSCWFLJHTTHZ`), cavity area **88.40645 Å²** — identical to the `area` in Choupo's shipped
`ethanol.dat` `VT2005` block, **88.40657 Å²**.  It is the VT-2005 source file.  Pushed through this
pipeline with **Mullins** averaging it reproduces the shipped 51-point profile:

| | cavity area | Σ p·A | ⟨σ⟩ | ⟨\|σ\|⟩ | ⟨σ²⟩ |
|---|---|---|---|---|---|
| VT2005, shipped in `ethanol.dat` | 88.40657 | 88.40657 | −3.114e-05 | 4.6542e-03 | 4.0742e-05 |
| NIST DMol3 `.cosmo` → this script | 88.40645 | 88.40657 | −3.113e-05 | 4.6536e-03 | 4.0733e-05 |

max bin deviation **0.0147 Å²** on 88 Å² · integrated |Δ| **0.10 %** · shape `L1_norm` **0.0010**
(residual attributable to the DMol3 file's 5-decimal charge truncation).

**Conclusion of §1.4: the averaging convention, the constants and the binning in this script ARE
the ones behind the VT-2005 profiles Choupo ships.**  Everything measured in §3 is therefore a
property of the *data*, not of the tool.  This row appears in `validation_panel.csv` as
`family = CONTROL`.

---

## 2. The validation panel

15 compounds present in **both** LVPP `release_v25` and Choupo's shipped VT-2005 sets, chosen for
family diversity, plus the CONTROL row.  Identity was checked by recomputing the molecular formula
from the LVPP `$coord_rad` atom list (column `lvppFormula` in the CSV).

| compound | family | LVPP file | formula | segments |
|---|---|---|---|---|
| ethanol **(CONTROL)** | — | `LFQSCWFLJHTTHZ-UHFFFAOYSA-N.cosmo` (DMol3, VT-2005 source) | C₂H₆O | 371 |
| nHexane | n-alkane | `N-HEXANE.cosmo` | C6H14 | 1208 |
| nOctane | n-alkane | `N-OCTANE.cosmo` | C8H18 | 1532 |
| cyclohexane | cycloalkane | `CYCLOHEXANE.cosmo` | C6H12 | 1030 |
| ethylene | olefin | `ETHYLENE.cosmo` | C2H4 | 468 |
| benzene | aromatic | `BENZENE.cosmo` | C6H6 | 756 |
| toluene | aromatic | `TOLUENE.cosmo` | C7H8 | 889 |
| methanol | alcohol | `METHANOL.cosmo` | CH4O | 465 |
| ethanol | alcohol | `ETHANOL.cosmo` | C2H6O | 617 |
| acetone | ketone | `ACETONE.cosmo` | C3H6O | 721 |
| ethylAcetate | ester | `ETHYL_ACETATE.cosmo` | C4H8O2 | 920 |
| aceticAcid | carboxylic acid | `ACETIC_ACID.cosmo` | C2H4O2 | 615 |
| diethylEther | ether | `DIETHYL_ETHER.cosmo` | C4H10O | 947 |
| Dichloroethane | halogenated | `1,2-DICHLOROETHANE.cosmo` | C2H4Cl2 | 666 |
| CS2 | sulfur / inorganic | `CARBON_DISULFIDE.cosmo` | CS2 | 400 |
| water | water | `WATER.cosmo` | H2O | 307 |

Conformer note: LVPP ships `ETHANOL`, `ETHANOL_ANTI`, `ETHANOL_GAUCHE`.  All three were tested;
they differ from each other far less than any of them differs from VT-2005
(`L1_norm` 0.2367 / 0.2366 / 0.2655 against VT-2005), so **the discrepancy is not a conformer
artefact**.

---

## 3. The four physics checks

### (a) Conservation — does the generated profile's total area equal the file's cavity area?

**YES, to the file's own printing precision.**  For every panel compound

```
| Σ_k p(sigma_k)·A  −  cavity area |   ≤  1.352e-03 A^2       (worst: acetone)
```

and in every case `Σ_k p·A − A_cavity` equals `Σ_n a_n − A_cavity` **to the last digit**, i.e. the
binning itself conserves area to machine precision and the whole residual is the NWChem header's
2-decimal printing of `area=` in bohr² (±0.005 bohr² = ±0.0014 Å² — exactly the magnitude seen).
This clears NIST's own `assert(abs(sum(psigmaA) − area) < 0.001)` in spirit; it exceeds it in
absolute terms only because LVPP prints the cavity area more coarsely than DMol3 does.
The shipped VT-2005 profiles likewise sum to their declared `area` to ±5e-6 Å².

### (b) Normalisation — is the profile what Choupo expects?

**YES.**  `CosmoSac.cpp` stores `pArea_` as **area per bin in Å²** (it divides by `area_[i]` itself
to form the probability), the grid is 51 nodes at −0.025…+0.025 step 0.001, and the generated
profile satisfies both: 51 points, summing to the cavity area, no averaged σ falling outside the
grid for any panel compound (`sigmaAvgMin/Max` in the CSV span −0.0187…+0.0154 e/Å²).  A generated
`LVPP` block would load without a single structural complaint from the C++.

*This is precisely the danger: it loads cleanly and is silently wrong.*

### (c) Sigma moments — LVPP vs VT-2005

Moments taken on the profile: `M0 = Σ p·A` (Å², = cavity area), and on the normalised profile
`⟨σ⟩`, `⟨|σ|⟩`, `⟨σ²⟩`.

| compound | ΔA % | ΔV % | Δ⟨\|σ\|⟩ % | Δ⟨σ²⟩ % | Δ(A·⟨σ²⟩) % | HB-area ratio |
|---|---|---|---|---|---|---|
| **ethanol (CONTROL)** | **−0.000** | **+0.000** | **−0.013** | **−0.022** | **−0.022** | **0.9998** |
| nHexane | +0.93 | +1.45 | −14.03 | −22.62 | −21.90 | — |
| nOctane | −0.01 | −0.20 | −11.63 | −19.91 | −19.92 | — |
| cyclohexane | +3.87 | +3.72 | −18.08 | −30.67 | −27.99 | — |
| ethylene | +6.08 | +10.30 | −23.34 | −39.49 | −35.82 | 0.00 |
| benzene | +2.72 | +7.40 | −15.61 | −25.67 | −23.64 | — |
| toluene | −0.24 | +2.58 | −12.60 | −19.53 | −19.72 | — |
| methanol | +3.43 | +7.21 | −6.92 | −15.98 | −13.10 | 0.833 |
| ethanol | +2.60 | +4.54 | −8.54 | −15.72 | −13.53 | 0.844 |
| acetone | +4.13 | +6.12 | −3.53 | −8.67 | −4.90 | 0.885 |
| ethylAcetate | +5.49 | +6.75 | −6.61 | −13.33 | −8.57 | 0.804 |
| aceticAcid | +6.58 | +9.09 | −7.23 | −11.22 | −5.38 | 0.875 |
| diethylEther | +2.15 | +2.92 | −10.46 | −19.69 | −17.97 | 0.715 |
| Dichloroethane | +1.80 | +1.08 | −4.09 | −5.38 | −3.68 | 1.198 |
| CS2 | −0.57 | −0.38 | −27.29 | −41.49 | −41.82 | — |
| water | +5.54 | +11.82 | −10.49 | −16.93 | −12.34 | 0.894 |

Panel summary (LVPP rows only, n = 15):

```
area     : mean +2.96 %   range −0.57 … +6.58 %
volume   : mean +4.96 %   range −0.38 … +11.82 %
<sigma^2> (intensive)  : mean −20.42 %   range −41.49 … −5.38 %   ALL NEGATIVE
A*<sigma^2> (extensive): mean −18.02 %   range −41.82 … −3.68 %   ALL NEGATIVE
HB-active area ratio   : mean 0.783 (11 compounds carry any |sigma| > sigma_hb)
```

The **zeroth** moment is off by only a few percent and is *not* uniformly signed (nOctane, toluene,
CS2 come out *smaller* than VT-2005) — so the "+6.1 % area" headline in the evidence ledger is a
per-compound accident of ethylene, not a transferable bias.  The **second** moment, the one that
drives the entire residual term, is **lower for all 15 compounds, by 5 to 41 %**.  That is the real
finding.  The HB-active area — the fraction of the cavity carrying `|σ| > σ_hb = 0.0084 e/Å²`, the
only part of the surface the COSMO-SAC-2002 hydrogen-bond term can act on — is **on average 22 %
smaller** in the LVPP set for the polar compounds.

### (d) Profile shape

Two shape metrics per compound: on the area profile (`maxAbsDev_area_A2`, `L1_area_pct_of_VT`) and
on the normalised profile with the area scale removed (`maxAbsDev_norm`, `L1_norm`, where
`L1_norm = 0` means identical and `2` means disjoint).

```
integrated |Δ| as % of the VT-2005 area : 17.7 %  …  60.8 %      (mean 30.8 %)
L1_norm (shape only, scale removed)     : 0.177  …  0.581        (mean 0.308)
   ... against the CONTROL's             0.0010
```

Worst: water (0.581), CS2 (0.501), ethylene (0.403), benzene (0.375).  Best: ethylAcetate (0.177).
**Every LVPP compound is 170× to 580× further from VT-2005 than the CONTROL is.**

The ethanol bin-by-bin comparison shows what "shape difference" means physically — the hydroxyl
peak sits in the wrong place:

```
sigma      VT2005    NIST->Mullins   LVPP->Mullins
+0.013     2.1255       2.1278          3.0056
+0.014     2.2319       2.2343          0.9991
+0.015     1.8820       1.8763          0.0000
+0.016     0.3561       0.3555          0.0000
```

The VT-2005 donor peak extends to +0.016 e/Å²; the LVPP one is cut at +0.014 and piled up lower.
With `sigma_hb = 0.0084` and `c_hb = 85580`, that tail *is* the hydrogen bond.

### (e) Can the gap be closed by re-tuning the averaging? — **NO**

Scanning `r_av` (the only free knob in the averaging, `f_decay = 1` fixed):

```
                VT2005       r_av=0.8176   r_av=0.80   r_av=1.10   r_av=1.60
water  <s^2>    1.207e-04       -16.9%      -15.9%      -33.8%      -62.3%
ethanol         4.074e-05       -15.7%      -14.4%      -36.1%      -64.9%
benzene         1.924e-05       -25.7%      -24.7%      -41.8%      -68.1%
acetone         3.574e-05        -8.7%       -7.9%      -20.6%      -39.5%
CS2             4.600e-06       -41.5%      -40.2%      -60.5%      -80.1%
```

Larger `r_av` makes it worse; LVPP's own `RAVG = 0.8` barely moves it.  Solving *per compound* for
the `r_av` that would force `⟨σ²⟩_LVPP = ⟨σ²⟩_VT2005`:

```
fitted r_av / A : 0.0387 (ethylene) … 0.7520 (Dichloroethane)   — a 19x spread over 14 compounds
                  CS2: no solution in the scanned range [0.02, 3.0] A
and even AT the per-compound fitted r_av, L1_norm stays 0.157 … 0.649
```

A "constant" that has to be refitted per compound is not a constant, and it does not fix the shape
anyway.  **The two databases are not reconcilable by post-processing.**  The difference is in the
QM: NWChem B3LYP/def2-SVPD with an **SES** cavity and `charge_correction=scale` (LVPP `release_v25`
headers) versus the DMol3 DFT-COSMO surface behind VT-2005 — a different cavity, a different
segmentation (LVPP mean segment area 0.147 Å² for ethanol vs DMol3's 0.238 Å²) and a different
screening charge distribution.

### (f) Consequence at the activity coefficient — the number that decides it

`cosmosac_gamma.py` mirrors `CosmoSac.cpp` exactly and is **verified against the engine's own
recorded output** (the golden CSVs of `tutorials/props/molecular/cosmoSAC01_water_ethanol`,
produced by the real `choupoProps` binary):

```
water/ethanol 0.5/0.5 @298.15  got [1.37424181 1.10622790]  ref [1.37424181, 1.10622790]
water/nHexane 0.5/0.5 @298.15  got [5.12735338 3.16476008]  ref [5.12735338, 3.16476008]
VERIFY: PASS (worst relative deviation 4.4e-09)
```

Then the same maths, same constants, only the COSMO set swapped VT-2005 → LVPP:

| system (x₁/x₂), 298.15 K | γ₁ VT-2005 | γ₁ LVPP | dev | γ₂ VT-2005 | γ₂ LVPP | dev |
|---|---|---|---|---|---|---|
| water(0.50)/ethanol(0.50) | 1.3742 | 1.2114 | **−11.9 %** | 1.1062 | 1.0375 | −6.2 % |
| water(0.01)/ethanol(0.99) | 1.7269 | 1.1950 | **−30.8 %** | 1.0000 | 1.0000 | −0.0 % |
| water(0.99)/ethanol(0.01) | 1.0005 | 1.0000 | −0.1 % | 5.0710 | 1.9674 | **−61.2 %** |
| water(0.50)/nHexane(0.50) | 5.1274 | 3.9606 | **−22.8 %** | 3.1648 | 2.7992 | −11.6 % |
| water(0.01)/nHexane(0.99) | **1052.24** | **374.82** | **−64.4 %** | 1.0085 | 1.0055 | −0.3 % |
| ethanol(0.50)/benzene(0.50) | 1.1890 | 1.1741 | −1.2 % | 1.3602 | 1.3084 | −3.8 % |
| acetone(0.50)/nHexane(0.50) | 1.3764 | 1.3996 | +1.7 % | 1.4127 | 1.4158 | +0.2 % |
| water(0.01)/acetone(0.99) | 4.6865 | **0.9669** | **−79.4 %** | 1.0007 | 1.0000 | −0.1 % |

The last row is the killer: water at infinite dilution in acetone goes from γ = 4.69 (positive
deviation) to γ = 0.97 — the **sign of the excess Gibbs energy flips**.  γ∞ of water in n-hexane
drops by a factor of 2.8.  This is not a set that is "a bit different"; with the 2002 constants it
is a different model of hydrogen bonding.

---

## 4. Verdict

**Are the two sets interchangeable?**  No.
**Are they systematically offset (i.e. correctable)?**  No — the offset is not systematic in the
zeroth moment (sign varies), it is systematic but non-uniform in the second moment (−5 to −41 %),
and no single averaging parameter reproduces it.
**They are incompatible as `variant "2002"` parameter sets.**

### The recommendation

**(i) An `LVPP` named set IS generatable — the generation problem is solved and validated — but it
is NOT safe to ship it as a `cosmoSAC2002` set today.**  Concretely:

1. **The tooling is done and trustworthy.**  `sigma_profile.py` reproduces the NIST reference to
   1.3e-13 Å² and reproduces the *shipped VT-2005 ethanol profile from its own source file* to
   0.10 % integrated deviation.  Any LVPP profile it emits is a correct application of the
   Mullins/VT-2005 averaging to the LVPP surface.  Generation is no longer the open question.

2. **What it may NOT be labelled.**  `CosmoSac.cpp` refuses anything but
   `model COSMOSAC; variant "2002";` — and that guard is the only thing currently standing between
   this data and a silently wrong γ.  Writing `variant "2002"` on an LVPP profile would defeat it,
   because the 2002 constants (`a_eff 7.5`, `alpha' 16466.72`, `c_hb 85580`, `sigma_hb 0.0084`,
   `r_0 66.69`, `q_0 79.53`) were regressed **with** the VT-2005 surfaces.  Pairing them with an
   LVPP surface is exactly the "mix a profile with the wrong variant's constants" sin the header
   comment of `CosmoSac.H` already forbids.

3. **What it would need to become usable.**  A *new runtime variant*, e.g.
   `model COSMOSAC; variant "LVPP-CS25";` or `"LVPP-GMHB1808";`, carrying **that
   parametrisation's own constants** — which are on disk already, in
   `_sources/lvpp_sigma/pars/{CS25,GMHB1808}/globals.csv`.  Note that this is *not* a constant
   swap: CS25 replaces the Staverman-Guggenheim combinatorial with a modified Flory-Huggins
   (exponent 2/3), adds an atom-pair dispersion term, and splits the hydrogen bond into six donor/
   acceptor classes with a per-segment atom type — i.e. a **new `ActivityModel` subclass**, not a
   new dictionary entry.  GMHB1808 is closer to the classical form (electrostatic + multi-`c_HB`)
   but was fitted to **GAMESS** profiles, not to the NWChem `release_v25` files staged here, so it
   is not a legitimate pairing either.
   Until such a variant exists **and** is validated against published γ/VLE data, an `LVPP` set has
   nothing correct to be computed with.

4. **Therefore the ruling in `evidence/_LEDGER.md` stands, with its basis upgraded** from
   "area and volume differ" (a 6 % argument) to "the second moment differs by 5–41 %, the shape by
   0.18–0.58 in L1, the HB-active area by ~22 %, and γ by up to 79 %" (a decisive argument).
   Every `lvpp-*` record keeps `status flagged;` and its note forbidding a paste into a component
   `cosmo` block or a `variant cosmoSAC2002` tag.

5. **If a component needs COSMO coverage that VT-2005 does not have** (the actual motivation — the
   staged pharma / sugar / amino-acid candidates), the honest options are, in order:
   (a) leave the component without a `cosmo` block, so `cosmoSAC` fails **loudly** for it, as
       `CosmoSac.cpp` already does — no silent crutch;
   (b) select a different `activityModel` for those cases;
   (c) do the work in item 3.
   What is **not** an option is a component carrying an `LVPP` set beside a `VT2005` set with both
   claiming variant 2002 — a case selecting `source LVPP;` would then get an answer that is
   numerically plausible, structurally valid, and physically wrong.

### What would still be needed (checklist, if item 3 is ever taken up)

- [ ] A `variant` string and a constants block per LVPP parametrisation, read from
      `pars/<set>/globals.csv` with the file cited per value (the CS25/GMHB1808 CSVs also carry
      optimisation bounds and an `Opt.` flag — provenance is available and should be kept).
- [ ] A new `ActivityModel` subclass for CS25 (FH combinatorial + dispersion + 6-class HB), or a
      generalised multi-`c_HB` extension for GMHB1808 — **not** a reuse of the 2002 code path.
- [ ] Per-segment **atom typing** carried in the profile (CS25's dispersion term needs it); today's
      `sigmaProfile ( 51 values );` grammar cannot express it. This is a data-format change.
- [ ] Three-profile (NHB/OH/OT) support if a 2010-family variant is ever wanted; today's grammar
      carries one profile.
- [ ] Conformer policy: LVPP ships several conformers per substance
      (`ETHANOL` / `ETHANOL_ANTI` / `ETHANOL_GAUCHE`; `ALPHA-PINENE` vs `A-PINENE`, 2.3 % apart in
      area). A named set must state which conformer it ships — a single gas-phase conformer is
      itself a modelling choice. (Measured here: conformer spread ≪ database spread, so this is a
      documentation duty, not a blocker.)
- [ ] Identity policy for tautomers/anomers, already open in the ledger (`fructose`, `xylose`).
- [ ] Validation against **published γ / VLE data**, not against another database — the panel here
      proves the two databases disagree; it cannot say which is right.
- [ ] Licence/attribution: LVPP is MIT + citation (DOI 10.5281/zenodo.3613785; Ferrarini et al.,
      *AIChE J.* **64** (2018) 3443; Soares, Mejía-Rodríguez & Aprà, *JCTC* (2025),
      doi:10.1021/acs.jctc.5c01368). Separately, the VT-2005 licence question flagged in the
      shipped `cosmo { VT2005 { license ... } }` blocks ("academic/non-commercial redistribution
      status REQUIRES REVIEW — NOT confirmed public domain") is **untouched by this study and still
      open**.

---

## 5. Reproducing

```bash
cd data/tmp/_sources/cosmo_tools
python3 sigma_profile.py --selftest                                  # vs the NIST golden pair
python3 sigma_profile.py --inpath ../lvpp_sigma/release_v25/WATER.cosmo --averaging Mullins
python3 validate_panel.py --dump                                     # -> validation_panel.csv, profiles/
python3 cosmosac_gamma.py                                            # verify + consequence
```

Dependencies: `numpy` only.  Nothing writes outside `data/tmp/`.
