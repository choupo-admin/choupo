# Electrolyte catalogue — provenance & licence manifest

> **DATA MIGRATED 2026-06-30 — the kind-by-kind layout.** The electrolyte catalogue this
> document covers was consolidated kind-by-kind into the ratified layout: Pitzer
> pairs -> `parameters/Pitzer/pairs/`, mixing -> `.../pitzer/mixing/`,
> eNRTL -> `parameters/eNRTL/` (this folder); aqueous ions -> `species/aqueous/`;
> aqueous complexes + gas dissolution -> `chemistry/{aqueousSpeciation,gasLiquid}/`; minerals -> the
> `solidPhases` block of each `components/<mineral>.dat`; resins -> `assets/resins/`. The apparent/true
> split was retired 2026-07-01 (one component = one file). The monolith names (`pairs.dat`, `ions.dat`,
> ...) and `components/true/` referenced below are HISTORICAL; **no value changed**, and the
> per-value provenance now also lives in each per-file record's `source`/`origin`.

This folder holds the Pitzer ion-interaction parameters used by Choupo's
electrolyte activity model.  Per Choupo's data-licensing policy (CODE vs DATA):
the data is an **aggregate** carrying its own open licence; it does **not** infect
the GPL-3.0-or-later code.  Cite the **primary** paper per value, never the aggregator.

## Source

* **`ions.dat`, `pairs.dat`** — extracted from the PHREEQC database file
  `pitzer.dat`, distributed with **PHREEQC version 3** by the
  **U.S. Geological Survey (USGS)**.
  * **Licence:** USGS software is a work of the U.S. federal government and is
    released into the **public domain** (no copyright; free worldwide use). This
    is the most permissive possible — it passes Choupo's policy trivially (it is
    NOT NonCommercial and NOT no-grant).
  * **Retrieved:** `https://raw.githubusercontent.com/usgs-coupled/phreeqc3/master/database/pitzer.dat`
  * **Extraction:** deterministic parse of the `-B0/-B1/-B2/-C0` blocks (25 °C
    base value of each cation–anion pair) + `SOLUTION_MASTER_SPECIES` (ion
    charges).  No values were typed by hand; ion names were made dict-safe and
    polyatomic-ion molar masses corrected (PHREEQC lists the element gfw).

* **`mixing.dat`** — the Pitzer **ternary mixing** parameters (`theta` like-sign
  ion pairs + `psi` triplets) for the core seawater/brine system, extracted from
  the SAME PHREEQC `pitzer.dat` (USGS public-domain grant as above).
  * **Extraction:** deterministic parse by `bin/curate/parse_mixing.py` of the
    `PITZER` section's `-THETA` and `-PSI` blocks (25 °C base value), restricted
    to the core ions Na K Ca Mg H | Cl SO4 OH (out-of-scope rows — borate,
    carbonate, H4SiO4, Br, Fe, Mn, Li, Sr, Ba — are dropped and reported, not
    silently skipped).  12 theta + 26 psi rows; re-running is byte-identical.
  * **Primary citation per value:** Harvie, Moller & Weare, *Geochim. Cosmochim.
    Acta* **48** (1984) 723 (the HMW seawater-system ternary assembly); the
    Pitzer FORM is Pitzer (1991) ch. 3.  Verified on synthetic seawater —
    see `VALIDATION.md` and `tutorials/props/electrolyte/pitzer_seawater_verify`.

* **`speciation.dat`, `minerals.dat`** (+ the `F`/`H4SiO4` rows appended to
  `ions.dat`) — extracted from the PHREEQC database file `phreeqc.dat`
  (same USGS public-domain grant as above).
  * **Retrieved:** `https://raw.githubusercontent.com/usgs-coupled/phreeqc3/master/database/phreeqc.dat`
    (master, fetched 2026-06-11 — the post-2024 Appelo revision: calcite
    log K −8.45, gypsum −4.55, not the classic −8.48/−4.58).
  * **Extraction:** deterministic parse by `bin/curate/parse_speciation.py` of
    the `SOLUTION_SPECIES` block (equilibrium associations over the
    scaling-relevant master set; all redox/e⁻ couples and the `(CO2)2`-type
    activity-correction dimers excluded) and the `PHASES` block (the named
    scaling minerals only).  Carbonate master = **HCO3⁻**; log K/ΔH converted
    from the db's CO3²⁻ basis (conversion pin: CO2aq log K 6.352 = pK₁ of
    carbonic acid).  ΔH in J/mol; the db's `-delta_h` default unit is
    **kJ/mol** (verified against its own `-analytic` expressions).
    Spot-checks (Kw, calcite, gypsum) fail the run loudly on mismatch.
    Brucite is absent from `phreeqc.dat` and therefore not imported.
  * **Analytic K(T)** (added 2026-06-13) — where `phreeqc.dat` carries a
    `-analytical_expression` for a reaction/phase, its coefficients
    `A1..A6` (`log K(T) = A1 + A2·T + A3/T + A4·log₁₀T + A5/T² + A6·T²`,
    T in K) are imported into a new **absence-tolerant** `analytic ( … );`
    field, with the comment's validity window (e.g. "0 - 300 °C") emitted as
    a real `validC ( lo hi );` field (Celsius).  The coefficients are carried
    through the **same chaining and the same CO3²⁻→HCO3⁻ basis swap** as
    log K/ΔH (the swap combines coefficient-vectors linearly, so the stored
    analytic is in the HCO3⁻ basis).  A **commented-out** `#-analytic` line
    (e.g. Halite) is correctly **not** imported — that entry keeps the
    van't Hoff (ΔH) path.  The runtime uses the analytic only as an
    **anchored correction** on `logK25` — `logK(T) = logK25 + [ana(T) −
    ana(298.15)]` — so `logK(298.15) = logK25` **exactly** (byte-stable at
    25 °C) and the published fit's absolute offset never overrides the
    curated 25 °C anchor.  `logK25` and existing `dH` values are **NOT**
    overwritten; only the `analytic`/`validC` fields are added.  Counts:
    **25** speciation reactions and **9** minerals gained an analytic block.

* **`exchange.dat`** (cation-exchange softener half-reactions) — extracted from
  the PHREEQC database file `phreeqc.dat` `EXCHANGE_SPECIES` block (same USGS
  public-domain grant).
  * **Retrieved:** `https://raw.githubusercontent.com/usgs-coupled/phreeqc3/master/database/phreeqc.dat`
    (master, fetched 2026-06-11).
  * **Extraction:** deterministic parse by `bin/curate/parse_speciation.py` of
    the `EXCHANGE_SPECIES` block — the **Gaines-Thomas** half-reactions
    `Me(z+) + z X⁻ = MeX(z)` over the exchangeable cations the scaling master
    set carries (`Na, K, Ca, Mg, Sr, Ba`).  `NaX` is the reference (log K 0).
    PHREEQC's `-gamma` activity-coefficient slots are **not** imported — Choupo
    uses the Gaines-Thomas **equivalent-fraction** exchanger activity, not a
    Davies on the bound species.  `X⁻` is a pseudo-species declared in
    `exchange.dat` itself (it is NOT an ion in `ions.dat`; `NaX`/`CaX2` are not
    aqueous ions).  Spot-checks (NaX/KX/CaX2/MgX2 log K, the Na/Ca binary
    selectivity isotherm) fail the run loudly on mismatch.  Per-row literature
    notes (Jardine & Sparks 1984; Van Bladel & Gheyl 1980; Laudelout et al.
    1968) are the database's own inline comments.

* **`resins/SAC_Na.dat`** (ion-exchange resin nameplate) — a **textbook
  representative** of a Strong-Acid Cation resin in the sodium form (capacity,
  bulk density, service-T), NOT a specific vendor datasheet.
  * **Source:** Wachinski, *Ion Exchange Treatment for Water* (2017), Ch. 2–3;
    Helfferich, *Ion Exchange* (1962, Dover reprint).  A real selection reads
    the manufacturer's product certificate.

## Primary citations (the values themselves)

The `source` field on each pair row points to one of:

* **Appelo, Parkhurst & Post**, *Geochim. Cosmochim. Acta* **125** (2014) 49–67.
* **Appelo**, *Appl. Geochem.* **55** (2015) 62–71.
* **Appelo**, *Cem. Concr. Res.* **101** (2017) 102–113.

The underlying ion-interaction model is **Pitzer**, *J. Phys. Chem.* **77**
(1973) 268; the classic single-salt parameter convention is **Pitzer & Mayorga**,
*J. Phys. Chem.* **77** (1973) 2300.

## Scope & honest limits

* **25 °C base only.** The source file's temperature/pressure coefficients are
  **deferred** (the current kernel is isothermal at 25 °C).
* **Ternary mixing: core seawater + carbonate (S3 + S4).** The `-THETA`
  (like-charge) and `-PSI` (triplet) mixing terms ARE loaded (`mixing.dat`) for
  the core ions Na K Ca Mg H | Cl SO4 OH **and the carbonate anions CO3 HCO3**
  (S4).  **Constant-theta** approximation: the I-dependent E_theta(I)
  higher-order electrostatic term is deferred to v2 (announced at run time).
  Borate / H4SiO4 / HSO4 ternaries remain deferred.
* **Neutral interactions: the CO2-brine set (S4).** `mixing.dat` carries the
  `-LAMBDA` neutral-ion terms `lambda_CO2,ion` (Na K Ca Mg Cl SO4) and one
  `-ZETA` triplet (CO2·Na·SO4), giving the neutral CO2(aq) its salting-out
  activity coefficient (gamma_CO2 > 1 in brine).  **Primary source:** the
  CO2-brine lambda set is attributed in the pitzer.dat `-LAMBDA` listing to
  Pitzer, Peiper & Busey, *J. Phys. Chem. Ref. Data* **13** (1984) 1, and
  He & Morse, *Geochim. Cosmochim. Acta* **57** (1993) 3533; the seawater
  carbonate THETA/PSI are Harvie, Moller & Weare (1984).  The CO2-self lambda
  (high-pressure CO2 solubility, carrying T/P coefficients) and the borate /
  H2S / H4SiO4 neutral system are **out of scope** (dropped + reported by the
  importer).  T-dependence of lambda/zeta is **deferred** (25 °C base).
* **2:2 salts** (MgSO₄, CaSO₄, …) carry the `β2`/`α2` ion-pairing term but remain
  the hard case; their 25 °C γ± accuracy is recorded in `VALIDATION.md`.
* Per-pair γ± validation against literature is in `VALIDATION.md`.

**CURATION FLAG (2026-06-11):** the master-branch phreeqc.dat revises CaHCO3+ to logK 6.27 (CO3 basis; -4.06 on HCO3 basis) — every RELEASED PHREEQC (v3.7.3: 11.435) is ~5.2 log units stronger, effectively suppressing the pair. Pin against the released db before trusting Ca speciation at high alkalinity.

---

## Ion-transport tier — `radius` and `D0` (electrochemistry v1, added 2026-06-14)

The eight master ions an electrodialysis run can transport (`H, Na, K, Ca, Mg,
Cl, OH, SO4`) gained two fields in `ions.dat` (today each ion's own
`species/<ion>.dat`, block `transport {}`):

* `radius` [m] — the effective HYDRATED radius of the aqueous ion (stored in
  raw SI metres; `nm` is **not** a parser unit alias in this build);
* `D0` [m²/s] — the infinite-dilution (tracer) diffusion coefficient, 25 °C.

**Radius — primary source:** E. R. Nightingale, *Phenomenological Theory of
Ion Solvation. Effective Radii of Hydrated Ions*, **J. Phys. Chem. 63 (1959)
1381–1387** (doi:10.1021/j150579a011), **Table I** (p. 1383), column `r_H`,
the effective hydrated radius at 25 °C.  The eight stored radii were READ BACK
against that page on 2026-10-25 and match it to the digit; since 2026-10-26
each record carries that reading in its own `provenance { radius {} }`.

**D0 — primary source (since 2026-10-26, DEV.md 4c C163):** the public-domain
USGS PHREEQC database `phreeqc.dat` (usgs-coupled/phreeqc3, branch master,
sha256 `5b80d45c989cd1db7aab485e198321ba550d5902be8097c8be26d85ba03da278`, the
same file the fourteen C157 ions cite), the first field of each species'
`-dw` line (its 25 °C `Dw`), read by a parse that checks the species
equation above the line.  Each record cites its equation line and its `-dw`
line, says `licence publicDomain; origin literature; reviewStatus interim;`,
and names the database's file-level references (Appelo, Parkhurst & Post,
GCA 125 (2014) 49; Appelo, Cem. Concr. Res. 101 (2017) 102) because the
lines themselves name none.

| species | radius (m) | `-dw` line | D0 (m²/s) | before 2026-10-26 |
|---------|-----------:|-----------:|----------:|------------------:|
| H  (H⁺)    | 2.82e-10 |  65 | 9.31e-09  | 9.31e-09 |
| Na (Na⁺)   | 3.58e-10 |  91 | 1.33e-09  | 1.33e-09 |
| K  (K⁺)    | 3.31e-10 |  96 | 1.96e-09  | 1.96e-09 |
| Ca (Ca²⁺)  | 4.12e-10 | 106 | 7.92e-10  | 7.92e-10 |
| Mg (Mg²⁺)  | 4.28e-10 | 101 | 7.05e-10  | 7.06e-10 |
| Cl (Cl⁻)   | 3.32e-10 | 137 | 2.033e-09 | 2.03e-09 |
| OH (OH⁻)   | 3.00e-10 | 208 | 5.27e-09  | 5.27e-09 |
| SO4 (SO₄²⁻)| 3.79e-10 | 147 | 1.07e-09  | 1.06e-09 |

Three values moved in their third or fourth figure (Mg, Cl, SO4); five were
already PHREEQC's to the digit.  The sealed tutorial cases carry their own
copies (`constant/species/`) and run from them, so this change moves no
golden until a case is re-imported; `check_seal_drift` reports the drift.

*History, one line:* from 2026-06-14 this file attributed the eight `D0` to
"the same paper's λ⁰" (a Nightingale Table III that does not exist); C161
(2026-10-25) recorded them as UNSOURCED; C163 re-sourced them here.  The
Nernst–Einstein derivation from `λ⁰` that stood in this section is retired
with the attribution.

### Licence-gate notes & FLAGGED GAPS

* **No no-grant table used.** CRC Handbook, Robinson & Stokes (*Electrolyte
  Solutions*) verbatim tables, DIPPR, Yaws and the NIST WebBook are all
  no-grant / all-rights-reserved and were **not** consulted: every radius
  traces to Nightingale 1959, Table I, and every `D0` to the public-domain
  PHREEQC `phreeqc.dat`.  Where a value could ONLY come from a no-grant
  source it is left as a documented gap (below), never copied.

* **Grotthuss caveat (H⁺, OH⁻).** Their `D0` is the conductance-equivalent
  value; physically their conductance is dominated by proton-hopping
  (Grotthuss), not Stokes–Einstein hydrodynamic diffusion.  It is correct for
  migration / transport-number arithmetic (the electrodialysis use) but is not
  a hydrodynamic self-diffusivity (each record's `D0` notes say so).
  Nightingale PARENTHESISES both ions' entries in Table I (extrapolated from
  his calibration curve), and each record's radius notes say so.

* **The eleven radii added 2026-10-25 (DEV.md 4c C161),** each read from
  Table I's `r_H` column and cross-checked against the scan's text layer, each
  record carrying its own `provenance { radius {} }` with `reviewStatus
  interim` (their `D0` is PHREEQC's, C157):

  | species | r_H (Å) | radius (m, stored) |
  |---------|--------:|-------------------:|
  | Li⁺     | 3.82 | 3.82e-10 |
  | Sr²⁺    | 4.12 | 4.12e-10 |
  | Ba²⁺    | 4.04 | 4.04e-10 |
  | Fe²⁺ (FeII) | 4.28 | 4.28e-10 |
  | Mn²⁺ (MnII) | 4.38 | 4.38e-10 |
  | CO₃²⁻   | 3.94 | 3.94e-10 |
  | NO₃⁻    | 3.35 | 3.35e-10 |
  | F⁻      | 3.52 | 3.52e-10 |
  | Br⁻     | 3.30 | 3.30e-10 |
  | NH₄⁺    | 3.31 | 3.31e-10 |
  | I⁻      | 3.31 | 3.31e-10 (no `D0`: none in any PHREEQC database) |

* **GAP — ions without the tier.** Table I does NOT list HCO3, PO4, HPO4,
  H2PO4, HSO4, B(OH)4 or the boron/silica complexes, so they carry no
  `radius` (the four carbonate/phosphate ions carry a PHREEQC `D0`), and the
  accessor (`ionRadius` / `ionD0`) **refuses loudly** for any ion missing the
  tier — never a silent zero.  A Stokes radius from `D0` is a different
  convention and is never written under `radius`.

* **Temperature dependence.** `D0` is the 25 °C value; the consumer corrects
  it to the run temperature by Stokes–Einstein on the package's own liquid
  viscosity (`src/thermo/transport/StokesEinstein.H`, DEV.md 4c C145/C148; 1
  exactly at 298.15 K, announced as 1 when no liquid-viscosity model is
  declared).  PHREEQC's own `-dw` temperature fields are not used.

---

## Expansion 2026-06-21

A coordinated catalogue expansion widened the master-ion / species / mineral /
gas coverage beyond the core seawater system, plus a NEW `gases.dat` file.  All
imports were **deterministic** (no hand-typed values), re-using the existing
`bin/curate/parse_*.py` machinery with the master set widened; every existing
entry is **preserved byte-for-byte** (each importer guards by re-deriving the
prior rows identically) and new rows are appended below a clearly-marked
divider.  Per-value primary-citation discipline is unchanged: the `source`
field carries the database's **own inline primary** where it gives one, and is
explicitly marked `"… ; primary not stated in db"` where it does not — the
**aggregator's arrangement is never cited as the primary**.  Public-domain
status (USGS, no copyright) was re-confirmed by re-fetching each DB.

**Databases fetched (all USGS PHREEQC v3, public domain):**

* `phreeqc.dat` —
  `https://raw.githubusercontent.com/usgs-coupled/phreeqc3/master/database/phreeqc.dat`
  (fetched 2026-06-21; **byte-identical** to the cached import ref
  `bin/curate/refs/phreeqc.dat` — md5 `07ba2ffc…`, so the expansion is provably
  consistent with the original import).
* `pitzer.dat` —
  `https://raw.githubusercontent.com/usgs-coupled/phreeqc3/master/database/pitzer.dat`
  (fetched 2026-06-21; byte-identical to the cached ref — 37,225 bytes).
* `wateq4f.dat` — fetched 2026-06-21 (consulted for coverage gaps only; no rows
  imported in this round — its Al/Si/aluminosilicate/redox masters are outside
  the catalogue's master set).

**Per-file detail:**

* **`ions.dat`** — **+14 master ions** (of the 50 `SOLUTION_MASTER_SPECIES`
  lines in `phreeqc.dat`; the rest were already present, or are neutral / gas /
  electron placeholders, or redox duplicates of an emitted ion).  Added: Fe(3)
  `Fe+3`, Mn(3) `Mn+3`, Al `Al+3`, B as the neutral boric-acid master `H3BO3`,
  the N family `NO3-`/`NO2-`/`NH4+`, P `PO4-3`, S(-2) `HS-`, and the trace
  metals `Zn+2`/`Cd+2`/`Pb+2`/`Cu+2`/`Cu+1`.  Source: deterministic parse of the
  `SOLUTION_MASTER_SPECIES` block.  Dict-safe keys, charge-disambiguated on
  collision (`Fep3`/`Mnp3`/`Cup` vs the existing `Fe`/`Mn`/`Cu`); polyatomic
  molar masses summed from IUPAC atomic weights (NO3 62.004, PO4 94.97, NH4
  18.039, HS 33.068, H3BO3 61.831).  No per-master primary in the db → every new
  row marked `"USGS PHREEQC phreeqc.dat (public domain); primary not stated in
  db"`.  No enthalpy/transport tier added (absence-tolerant, a later pin).
  **Skipped:** neutral/gas/electron placeholders (not aqueous ions).

* **`speciation.dat`** — **+18 aqueous-complex rows** (35 → 53 species, 0
  minerals), appended below a `--- EXPANSION 2026-06-21 ---` divider.  Source:
  `bin/curate/parse_speciation.py` `SOLUTION_SPECIES` path with `MASTERS`
  widened by `Fe+2→Fe`, `Mn+2→Mn`.  New Fe complexes: FeOHp, FeOH2aq, FeOH3m,
  FeCO3aq, FeHCO3p, FeFp, FeSO4aq, FeHSO4p, FeClp.  New Mn complexes: MnOHp,
  MnOH3m, MnCO3aq, MnHCO3p, MnFp, MnSO4aq, MnClp, MnCl2aq, MnCl3m.  Same HCO3⁻
  basis swap, chaining, dH-unit handling as the original import (FeOH+ 13.2 kcal
  = 55228.8 J; MnSO4 21.55 kJ = 21550 J, both verified against the db text).  No
  per-row primary in the db → all carry `"USGS PHREEQC phreeqc.dat (public
  domain)"`.  **Skipped:** Al complexes (no Al master pre-existing in scope),
  Fe(+3)/Mn(+3) complexes (form only via excluded e⁻ redox couples), and
  PO4/NO3/HS complexes of Fe/Mn (masters outside the parse set).

* **`minerals.dat`** — **+12 minerals** (11 → 23), appended after the preserved
  original block (all 11 originals re-derive byte-for-byte vs `git show HEAD`).
  Source: `bin/curate/parse_speciation.py` PHASES path with widened `MASTERS`
  and `TARGET_PHASES`.  Added carbonates (HCO3⁻ basis, CO3²⁻→HCO3⁻ sign-flip):
  dolomite (*Hemingway & Robie 1994; Bénézeth et al. 2018, GCA 224*), siderite,
  rhodochrosite, strontianite, witherite; sulfates: arcanite K2SO4, mirabilite
  Na2SO4·10H2O, thenardite Na2SO4 (all *ref. 3 = Appelo, Appl. Geochem. 55
  (2015) 62*), epsomite MgSO4·7H2O, hexahydrite MgSO4·6H2O, kieserite
  MgSO4·H2O; silica: quartz SiO2.  Each carries `analytic`/`validC` where the db
  provides them and `dH` in J/mol.  Per-row primary = the db's own `lit:` note
  (or "primary not stated" where absent).  **Skipped:** hydroxyapatite (needs a
  PO4 master not in `ions.dat` at parse time), brucite (absent from
  `phreeqc.dat`), and gibbsite/kaolinite/feldspars/pyrite/hematite/heavy-metal
  minerals (need Al/Si/redox/heavy-metal masters outside the master set).

* **`gases.dat`** — **NEW FILE** (did not exist before): the gas–aqueous
  Henry's-law dissolution catalogue, plus its importer `bin/curate/parse_gases.py`.
  Source: deterministic parse of the `PHASES` gas reactions in `phreeqc.dat`.
  **+8 gases** (of 13 gas PHASES): CO2, H2O, O2, H2, N2, H2S, CH4, NH3.  Each row
  carries `logK25` (decadic Henry constant, 25 °C), `dH` [J/mol], the full
  `analytic` A1..A6 K(T) vector, and Peng–Robinson `Tc` [K] / `Pc` [atm] /
  `omega`.  dH-unit verified by van't Hoff against each phase's own `-analytic`
  slope (CO2 −4.776 kcal ×4.184 = −19.98 kJ matches; the script GUARDS this and
  fails loudly on mismatch).  H2S(g) is the db's fused `H2S = H+ + HS-`
  (Henry + Ka1), flagged `// Henry+Ka1 fused`.  Per-row primary from the db's
  inline comments: H2 → *Zhu 2022; Chabab 2020; Gordon 1977; Crozier 1974*;
  H2S → *Jiang et al., 2020, Chem. Geol. 555, 119816*; CH4 → "CH4 solubilities
  25–100 °C"; CO2/H2O/O2/N2/NH3 → `"… ; primary not stated in db"`.  **Skipped:**
  the 5 redox-decoupled twin masters Oxg/Hdg/Ntg/Mtg/H2Sg (duplicates of
  O2/H2/N2/CH4/H2S, not new chemistry).

* **`pairs.dat`** — **no entries added.**  A re-fetch + re-parse of `pitzer.dat`
  via `bin/curate/parse_pitzer.py` confirmed the file is **already fully
  expanded**: all 54 cation–anion Pitzer binaries the db yields (including the
  Sr/Ba/Br/Li/B-borate/Fe/Mn pairs) are present, and the 25 °C base values
  match the freshly-fetched DB exactly (spot-checked e.g. Mn|SO4 β0=0.2065,
  β1=2.9511, β2=−40.0, Cφ=0.01636).  Appending would have duplicated every entry
  (forbidden by the preserve rule), so the correct action was none.  Gap made
  visible: Al/F have no pitzer.dat master; Si appears only as the neutral H4SiO4
  LAMBDA term (no charged β-pair) — Al/F/Si binaries would need a different DB
  (wateq4f/llnl), out of scope.

**Summary table**

| file | entries added | db | primary discipline |
|------|--------------:|----|--------------------|
| `ions.dat` | +14 master ions | phreeqc.dat | db has no per-master primary → "primary not stated in db" |
| `speciation.dat` | +18 aqueous complexes (Fe, Mn) | phreeqc.dat | db has no per-row primary → "USGS PHREEQC phreeqc.dat (public domain)" |
| `minerals.dat` | +12 minerals | phreeqc.dat | per-row db `lit:` note (Hemingway & Robie 1994; Bénézeth 2018; Appelo 2015), else "primary not stated" |
| `gases.dat` (NEW) | +8 gases | phreeqc.dat | db inline (Zhu 2022 / Jiang 2020 / …), else "primary not stated in db" |
| `pairs.dat` | 0 (already complete) | pitzer.dat | (unchanged — Appelo 2014/2015/2017) |

---

## Migration scope — what IS and IS NOT migrated (2026-06-30)

The electrolyte work is **complete for the scope it undertook**; what was not
migrated is **by design, not omission** (a reader must be able to tell the
difference — hence this section):

- **Salt-level front-end + data tier — FULLY MIGRATED.** The 8 standards
  monoliths (`ions / pairs / mixing / enrtl / minerals / speciation / gases /
  exchange.dat`) are **DELETED**, split into per-file records under
  `species/aqueous/` (ions), `parameters/electrolyte/{pitzer/pairs, pitzer/mixing,
  eNRTL}/`, `chemistry/{aqueousSpeciation, gasLiquid, ionExchange}/`, the
  `solidPhases` block of each `components/<mineral>.dat` (minerals), and
  `assets/resins/`. The engine reads the per-file tree via
  **dual-leg** readers (case-local `constant/electrolyte/` OLD-flat overlay
  FIRST, else standards per-file). The 12 salt-level electrolyte tutorial cases
  SELECT a `propertyPackage`; the legacy `ElectrolyteActivity::configure()` and
  the `model pitzer` / `model eNRTL` ActivityModel factory registrations are
  **DELETED** (a `model pitzer;` thermoPackage now fails loudly at `New`).

- **Multi-ion speciation — DELIBERATELY SEPARATE, not migrated.** The cases
  `pitzer_seawater_verify`, `pitzer_vs_davies_ro_concentrate`,
  `pitzer_calcite_brine`, `farelo_nacl_nh4cl` run the `pitzerHMW` / `davies`
  per-ion engine via a `propsDict` speciate op — a DISTINCT front-end (CLAUDE.md
  §5 ratifies `pitzer` ≠ `pitzerHMW` as two factory keys). They are **not**
  package-selectable by design; routing them through the salt-level builder
  would be re-architecture.

- **Divalent / membrane electrolytes — flat by design.** `CaCl2`,
  `calciumTartrate`, `potassiumBitartrate` (and `MgSO4`) stay flat components
  with `electrolyte{}` blocks, read by membrane DSPM-DE + propsDict + the
  solubility-curve crystalliser (cation/anion by name; **zero** `propertyPackage`
  logic needed). An apparent/true split for them would be machinery with no
  consumer.

The `origin "data/standards/{species,parameters,chemistry}/ (migrated from the old electrolyte/ monoliths)"` strings in the migrated records
are **import breadcrumbs** (the historical monolith), not a live path — the
runtime never reads them, and the primary scientific citation lives in the
separate `source` field per value.

### Roadmap (demand-driven, not blocking)

- **Multi-ion → package-selectable (long-term).** Today `pitzerHMW` / `davies` are
  the tested front-end via the `propsDict` speciate op. The clean future form is
  `methods/ (kind electrolyteModel) {pitzerHMW,davies}.dat` + a package
  `propertyMethods { aqueousSpeciation electrolyte.pitzerHMW; }` key — so "a
  package selects everything" becomes true for multi-ion too. NOT forced now
  (the propsDict engine is functional + tested; routing it through the builder
  is deferred, not abandoned).

- **CaCl2 / calciumTartrate / potassiumBitartrate — demand-driven candidates.**
  Add the component (+ its `dissociatesTo` and chemistry) ONLY when a salt-level
  `propertyPackage` / tutorial needs them (CaCl2 → a divalent-electrolyte package;
  the tartrates → a wine/tartrate crystallisation package). NOT by symmetry with
  NaCl/KCl/NaOH — today nothing consumes them through the builder (only membrane
  DSPM-DE + propsDict + the solubility-curve crystalliser, by cation/anion name).
  (The apparent/true split was retired 2026-07-01; one component = one file, the
  role chosen by the package that selects it.)
