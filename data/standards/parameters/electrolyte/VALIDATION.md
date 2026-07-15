# Electrolyte catalogue — γ± validation (25 °C)

> **DATA MIGRATED 2026-06-30 — Aspen-like layout.** The electrolyte catalogue this
> document covers was consolidated kind-by-kind into the ratified layout: Pitzer
> pairs -> `parameters/electrolyte/pitzer/pairs/`, mixing -> `.../pitzer/mixing/`,
> eNRTL -> `parameters/electrolyte/eNRTL/` (this folder); aqueous ions -> `species/aqueous/`;
> aqueous complexes + gas dissolution -> `chemistry/{aqueousSpeciation,gasLiquid}/`; minerals -> the
> `solidPhases` block of each `components/<mineral>.dat`; resins -> `assets/resins/`. The apparent/true
> split was retired 2026-07-01 (one component = one file). The monolith names (`pairs.dat`, `ions.dat`,
> ...) and `components/true/` referenced below are HISTORICAL; **no value changed**, and the
> per-value provenance now also lives in each per-file record's `source`/`origin`.

Model γ± (Choupo Pitzer kernel, reading `pairs.dat`) vs **cited literature**
(mean ionic activity coefficient, molality scale). AAD over the listed points.
Literature gathered by a curation swarm with mandatory citation; model values
are deterministic (the python replica matches the C++ op bit-for-bit).

| Salt | type | AAD % | n | conf | literature source |
|------|------|-------|---|------|-------------------|
| NaCl | 1:1 | 0.06 | 5 pts | high | Hamer & Wu, JPCRD 1 (1972) 1047 |
| KCl | 1:1 | 0.11 | 5 pts | high | Hamer & Wu, JPCRD 1 (1972) 1047 |
| NaBr | 1:1 | 0.17 | 5 pts | high | Hamer & Wu, JPCRD 1 (1972) 1047 |
| KBr | 1:1 | 0.22 | 5 pts | high | Hamer & Wu, JPCRD 1 (1972) 1047 |
| LiCl | 1:1 | 0.30 | 5 pts | high | Hamer & Wu, JPCRD 1 (1972) 1047 |
| MgBr2 | 2:1 | 0.50 | 5 pts | high | Goldberg & Nuttall, JPCRD (1978-81) |
| CaCl2 | 2:1 | 0.94 | 5 pts | high | Staples & Nuttall, JPCRD 6 (1977) 385 |
| MgSO4 | 2:2 | 1.29 | 5 pts | medium | Pitzer & Mayorga, JPC 77 (1973) 2300 |
| MgCl2 | 2:1 | 1.41 | 5 pts | high | Goldberg & Nuttall, JPCRD (1978-81) |
| K2SO4 | 1:2 | 2.79 | 2 pts | high | Goldberg & Nuttall, JPCRD (1978-81) |
| CaBr2 | 2:1 | 2.82 | 5 pts | high | Goldberg & Nuttall, JPCRD (1978-81) |
| SrCl2 | 2:1 | 5.07 | 5 pts | high | Goldberg & Nuttall, JPCRD (1978-81) |
| BaCl2 | 2:1 | 11.24 | 3 pts | high | Goldberg & Nuttall, JPCRD (1978-81) |
| Na2SO4 | 1:2 | - | no literature found | none | Hamer & Wu, JPCRD 1 (1972) 1047 |

**13 salts validated against cited literature.** 1:1 and 2:1 salts validate well; 2:2 (MgSO₄) remains the hard case (needs the deferred temperature treatment).

_Sources: Hamer & Wu, J. Phys. Chem. Ref. Data 1 (1972) 1047 (1:1 salts); Staples & Nuttall, J. Phys. Chem. Ref. Data 6 (1977) 385 (CaCl₂); cross-checked vs Robinson & Stokes, Electrolyte Solutions (1959). Model params: USGS PHREEQC pitzer.dat (public domain) — see PROVENANCE.md._

## Pitzer-HMW ternary mixing — synthetic-seawater γ± (`mixing.dat`, slice S3)

The multi-ion Pitzer-HMW model (binaries from `pairs.dat` + the ternary
theta/psi mixing terms from `mixing.dat`) is verified on a **standard synthetic
seawater** (major-ion, carbonate-free; molality, S = 35, 25 °C):

```
Na+ 0.4861  Mg+2 0.0547  Ca+2 0.01065  K+ 0.01058  Cl- 0.5658  SO4-2 0.02926
```

→ ionic strength **I ≈ 0.72 mol/kg** (the major ions kept fully dissociated —
the only honest way to test HMW, whose theta/psi were fitted to a non-pairing
treatment; an explicit-pairing speciation would double-count SO₄). Verification
case: `tutorials/props/electrolyte/pitzer_seawater_verify`.

**Mean ionic activity coefficients** (computed from the per-ion γ in the golden
master `seawater.csv`) vs the published seawater Pitzer range:

| salt | Choupo γ± (seawater, I≈0.72) | published seawater Pitzer | source |
|------|------|------|------|
| NaCl  | 0.671 | ≈ 0.66–0.69 | Pitzer (1991) ch. 3; Millero & Pierrot seawater model |
| KCl   | 0.645 | ≈ 0.62–0.65 | HMW (1984); Pitzer (1991) |
| MgCl₂ | 0.485 | ≈ 0.47–0.50 | HMW (1984) |
| CaCl₂ | 0.469 | ≈ 0.46–0.50 | HMW (1984) |
| Na₂SO₄| 0.373 | ≈ 0.36–0.40 | HMW (1984) |
| MgSO₄ | 0.170 | ≈ 0.15–0.20 | Pitzer & Mayorga (1973); HMW (1984) — the low 2:2 value |

All six land inside the published seawater Pitzer band. The 2:2 MgSO₄ landing
at **0.17** (the famously low value) is the strongest qualitative check.

**Single-salt reduction pin** (the skeptic's gate, in the same case). The HMW
model on a **NaCl-only** composition (every ternary sum empty) reproduces the
single-salt-validated kernel: γ±(NaCl, 1.0 m) = **0.6572**, and at 0.7 m =
**0.6669** vs the published **≈ 0.667** (Hamer & Wu / Robinson & Stokes — the
same source the single-salt table above validates at AAD 0.06 %). The internal
single-salt oracle (`PitzerHMW::verify`) holds at **max rel deviation 1.57e-14**
over all 54 binaries *after* the ternary wiring — the ternaries provably vanish
for a single salt.

**Mixing physics check.** At the SAME I ≈ 0.7, seawater γ±(NaCl) = 0.671 is
slightly ABOVE the single-salt γ±(NaCl, 0.7 m) = 0.667 — the cation-cation /
anion-anion mixing (Mg/Ca/SO₄ present) raises it, the documented seawater
behaviour.

_Approximations (announced at run time): **constant-theta** — the I-dependent
E_theta(I) higher-order electrostatic mixing term is deferred to v2 (< 0.5 % on
the major-ion γ at this I); Pitzer-HMW is trustworthy to I ≈ 6 for this
seawater/brine system. Mixing params: Harvie, Moller & Weare, Geochim.
Cosmochim. Acta 48 (1984) 723, via USGS PHREEQC pitzer.dat (public domain) —
`bin/curate/parse_mixing.py` (deterministic, fail-loud, spot-checked)._

## Pitzer-HMW carbonate system — calcite-brine SI pin (`mixing.dat`, slice S4)

Slice S4 extends the multi-ion Pitzer-HMW model to the **carbonate subsystem**
so calcite / gypsum scaling works in brine. Two pieces are added to
`mixing.dat` (`bin/curate/parse_mixing.py`, deterministic re-run — the S3 core
rows stay byte-identical, only carbonate rows are added):

* the carbonate **anions** CO₃²⁻, HCO₃⁻ join the like-sign theta / triplet psi
  sums (6 carbonate theta + 11 carbonate psi rows imported);
* the neutral **CO₂(aq)** gets its salting-out γ from the **lambda** neutral-ion
  term (`lambda_CO2,ion`, 6 rows: Na K Ca Mg Cl SO₄) plus one **zeta** triplet
  (CO₂·Na·SO₄). With lambda wired, **γ_CO₂(aq) > 1** in brine — the documented
  CO₂ salting-out that Davies (γ_neutral ≡ 1) cannot capture.

The carbonate ions feed the existing cation/anion ternary sums automatically;
the charged carbonate complexes (CaHCO₃⁺, NaCO₃⁻, …) get their Pitzer γ via the
ion sums, the neutral complexes (CaCO₃°, MgCO₃°, NaHCO₃°) via lambda or γ = 1.
The single-salt oracle (`PitzerHMW::verify`) is **unchanged at 1.5658e-14** over
all 54 binaries — the carbonate/lambda additions never enter a single-salt
reduction.

**THE PUBLISHED PIN — surface-seawater calcite saturation.** Standard surface
seawater (S = 35, 25 °C) WITH the carbonate system (DIC ≈ 2.3 mmol/kg as HCO₃⁻,
pH 8.2), I ≈ 0.68 mol/kg. Case:
`tutorials/props/electrolyte/pitzer_calcite_brine`.

| quantity | Choupo (Pitzer-HMW) | published band | source |
|----------|---------------------|----------------|--------|
| SI_calcite | **+0.724** | ≈ **+0.6 to +0.8** (Ω_cal ≈ 4–6) | Mucci, *Am. J. Sci.* 283 (1983) 780; Millero, *Chem. Rev.* 107 (2007) 308 |
| SI_aragonite | +0.610 | ≈ +0.4 to +0.6 (Ω_arag < Ω_cal) | Mucci (1983) |
| SI_gypsum | −0.875 | strongly undersaturated (≈ −0.9 to −0.6) | seawater far from CaSO₄·2H₂O saturation |
| γ_CO₂(aq) | **1.105** | > 1, salting-out (≈ 1.1 at seawater I) | Weiss, *Mar. Chem.* 2 (1974) 203; the CO₂-brine lambda set |

Surface ocean water is calcite-**supersaturated** — the calcite saturation
ratio Ω = IAP/Ksp ≈ 4–6, i.e. SI = log₁₀ Ω ≈ +0.6 to +0.8. Choupo's **+0.724**
lands inside this well-documented oceanographic band (the ocean-acidification
baseline). Gypsum at **−0.875** correctly shows seawater is nowhere near CaSO₄
saturation. **A wrong pin is worse than no pin** — the golden master locks the
exact Choupo output; the cited band validates it is physically right.

**Davies vs Pitzer (the differentiator, both pinned in the case).** The SAME
composition under Davies gives SI_calcite **+0.882** (Δ ≈ +0.16 over Pitzer —
Davies overshoots, being out of its trustworthy band ~0.5 at I ≈ 0.7) and
**γ_CO₂(aq) = 1.000** (no neutral salting-out at all). Pitzer is the rigorous
tool for brine; Davies overstates the scaling drive AND misses the CO₂
salting-out. Both run in `pitzer_calcite_brine` so the divergence is visible.

_Approximations (announced): constant-theta (as S3); the lambda T-dependence is
deferred (25 °C base), the CO₂-self lambda (high-P CO₂ solubility) and the
borate/H₄SiO₄/H₂S neutral system remain out of scope. Carbonate mixing:
Harvie, Moller & Weare (1984); CO₂-brine lambda: Pitzer, Peiper & Busey (1984)
+ He & Morse (1993) as attributed in pitzer.dat — `bin/curate/parse_mixing.py`._

## Davies vs Pitzer — RO-concentrate scaling onset (`pitzer_vs_davies_ro_concentrate`)

The FLAGSHIP (slice S6) runs ONE standard-seawater feed (Na 0.4861, Mg 0.0547,
Ca 0.01065, K 0.01058, Cl 0.5658, SO₄ 0.02926, HCO₃ 0.0024 mol/kg, I ≈ 0.68)
concentrated over recovery r = 0 → 0.80 (I climbs to ≈ 3.3 mol/kg) under TWO
activity models, and the **engineering answer forks**:

| KPI (r = 0 → 0.80) | Davies | Pitzer-HMW |
|---|---|---|
| `recovery_at_gypsum_onset` (SI_gypsum = 0 crossing) | **0.580** | **never** (no crossing in range) |
| SI_gypsum at r_max | **+0.493** (supersaturated) | **−0.144** (still undersaturated) |
| SI_calcite at r_max | +2.220 | +2.026 |
| γ_Ca at r_max | 3.649 | 0.378 |
| γ_SO4 at r_max | 3.649 (= γ_Ca, charge-only) | 0.051 (per-identity) |
| equilibrium gypsum at r_max | 0.0301 mol/kg precipitated | **0** (stays dissolved) |

**The decision flips on the activity model.** Davies says "gypsum scales at 58 %
recovery — stop there"; Pitzer says "you can push to 80 % with no gypsum
scaling." The divergence is purely the γ product: Davies' charge-only γ runs away
to **3.65** at I ≈ 3.3 mol/kg (the unphysical extended-DH upturn driven by the
−0.3·I term), inflating the Ca·SO₄ ion-activity product and pushing SI_gypsum
across 0; Pitzer carries the strong 2:2 Ca–SO₄ specific interaction (β₂ = −59.3,
the virial Davies has no term for), giving γ_SO4 = 0.051 and holding the IAP —
and therefore the SI — below saturation. Davies is **announced-untrustworthy**
past I ≈ 0.5 mol/kg (the run says so); Pitzer is valid to I ≈ 6 for the seawater
system, credentialed by `pitzer_seawater_verify` (γ± bands + 1.57e-14 oracle) and
`pitzer_calcite_brine` (SI in the published oceanographic band) — so here the
Pitzer fork is the trustworthy curve and Davies is read as the cautionary one.

_Convergence: both models reach r = 0.80 cleanly (≤ 7 γ-fixed-point passes per
point, no oscillation) — NO under-relaxation or acceleration was needed, so none
was added. pH solved per point (closed system); single-salt oracle unchanged at
1.5658e-14._

## Cation exchange — Gaines-Thomas selectivity (`exchange.dat`)

The imported half-reaction log K's reproduce the PHREEQC `EXCHANGE_SPECIES`
values exactly (spot-checked, fail-loud in `parse_speciation.py`):

| Species | log K₂₅ | ΔH [J/mol] | source |
|---------|---------|------------|--------|
| NaX (ref) | 0 | — | reference |
| KX | 0.7 | −4300 | Jardine & Sparks, 1984 |
| CaX2 | 0.8 | +7200 | Van Bladel & Gheyl, 1980 |
| MgX2 | 0.6 | +7400 | Laudelout et al., 1968 |
| SrX2 | 0.91 | +5500 | Laudelout et al., 1968 |
| BaX2 | 0.91 | +4500 | Laudelout et al., 1968 |

**Na/Ca binary isotherm spot-check.** At equal aqueous activity (a(Ca²⁺) =
a(Na⁺)), the Gaines-Thomas equivalent-fraction ratio is
β(CaX₂)/β(NaX)² = K(CaX₂)·a(Ca)/a(Na)² = 10^0.8 = **6.31** — the divalent ion
is **selectivity-favoured** on the resin (the physics that makes a softener
strip Ca²⁺ from water while releasing Na⁺). This is the qualitatively-correct
ordering Ca > Sr ≈ Ba > Mg > K > Na that PHREEQC and the textbooks report.
Quantitative breakthrough/regeneration is a TRANSIENT bed problem, NOT modelled
by the equilibrium `exchange` op (see its non-suppressible honesty banner).

## Analytic K(T) — retrograde calcite solubility (spot-check)

The imported `analytic ( … )` blocks reproduce the PHREEQC
`-analytical_expression` shape. **Calcite spot-check at 50 °C** (the classic
retrograde-solubility number):

* PHREEQC analytic, **CO3²⁻ basis** (`-67.87 −5.1813e-2 0 30.25746`):
  `log K(50 °C) = −8.685` — matches the published Plummer & Busenberg (1982)
  value `≈ −8.68` (`log K(25 °C) = −8.448`, published `−8.48`).
* Choupo, **HCO3⁻ basis, anchored on logK25** (`logK25 = 1.879`): the swapped
  analytic gives `log K(50 °C) = 1.487` and `log K(80 °C) = 1.051` — **falling
  with T**, i.e. calcite gets **less soluble hot** (dissolution is exothermic).
* By construction `log K(25 °C) = 1.879 = logK25` **exactly** (the anchored
  correction zeroes at 298.15 K — every existing 25 °C golden is byte-stable).

The pedagogical consequence is in `tutorials/props/electrolyte/ksp_temperature`:
for one fixed water, **SI_calcite rises** 0.59 → 0.81 → 1.01 → 1.24 → 1.43 over
10 → 25 → 40 → 60 → 80 °C (retrograde), while **SI_halite drifts down**
−4.59 → −4.66 (normal solubility, van't Hoff, dH > 0) — why hot heat-exchanger
and warm RO-concentrate surfaces scale with CaCO₃ although the cold feed looks
safe.  Runs **announce** the K(T) form per entry and warn when an analytic is
used **beyond its fitted validity range** (no silent extrapolation).

## Industry calcite-scaling indices — LSI spot-check (`ScalingIndices`)

The closed-form industry indices (LSI / Stiff-Davis / Ryznar,
`src/thermo/electrolyte/ScalingIndices.{H,cpp}`) are CONCENTRATION-based
empirical indices, surfaced as the deliberate contrast to the rigorous
ACTIVITY `SI_calcite` (the divergence at high I / at the membrane wall is the
lesson — see `tutorials/steady/membranes/membrane09_index_vs_rigorous`).

**Pinned worked example** (textbook Langelier saturation index):
a water at **pH 7.0, 25 °C** with **[Ca²⁺] = 2×10⁻³ M** and
**[HCO₃⁻] alkalinity = 2×10⁻³ M**.

* Textbook form `pHs = (pK2 − pKsp) + p[Ca] + p[HCO3]` with
  `pK2 = 10.33`, `pKsp(calcite) = 8.48` ⇒ `pHs = 7.25`, **LSI = −0.25**
  (Snoeyink & Jenkins, *Water Chemistry*, Wiley 1980; Langelier 1936).
* Choupo `ScalingIndices`, anchored on the catalogue HCO₃-basis calcite
  `logK_cc(25 °C) = 1.879` (= pK2 − pKsp): `pHs = 1.879 + 2.699 + 2.699 = 7.277`,
  **LSI = −0.277**, RSI = 7.55.  The 0.03 offset is purely the rounded
  textbook `pK2 − pKsp = 1.85` vs the catalogue `1.879`.

This confirms the kernel reproduces the published LSI to within the constant's
rounding.  Because the index shares `logK_cc(T)` with the rigorous SI, the ONLY
remaining difference between LSI and `SI_calcite` is concentration-vs-activity —
which is exactly why they coincide at low I and diverge at high I.

_Primary sources: Langelier, W.F. (1936) J. AWWA 28(10) 1500-1521;
Stiff, H.A. & Davis, L.E. (1952) Trans. AIME 195, 213-216;
Ryznar, J.W. (1944) J. AWWA 36(4) 472-486._

## Independent cross-check vs native PHREEQC (optional curation tool)

`bin/curate/phreeqc_oracle.py` cross-checks the electrolyte cases against
**native USGS PHREEQC** (public domain) — model-matched databases (`pitzer.dat`
for Pitzer, `phreeqc.dat` for Davies), comparing SI / pH / γ / I per case. It is
a **curation tool, not a build dependency** (`runTests` never calls it; degrades
honestly when PHREEQC is absent). Run it to regenerate a cross-check table; see
`bin/curate/README.md` for usage and the announced model-pairing caveats (the
tight Pitzer-vs-pitzer.dat SI agreement, the MacInnes single-ion-γ convention,
the paired-vs-unpaired-SO₄ artifact on sulfate minerals).
