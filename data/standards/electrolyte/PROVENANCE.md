# Electrolyte catalogue — provenance & licence manifest

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
Cl, OH, SO4`) gained two fields in `ions.dat`:

* `radius` [m] — the effective (Stokes/hydrated) radius of the aqueous ion
  (stored in raw SI metres; `nm` is **not** a parser unit alias in this build,
  so the nm value is preserved in each row comment);
* `D0` [m²/s] — the infinite-dilution (Nernst) diffusion coefficient, 25 °C.

**Single primary source:** E. R. Nightingale, *Phenomenological Theory of Ion
Solvation. Effective Radii of Hydrated Ions*, **J. Phys. Chem. 63 (1959)
1381–1387** (doi:10.1021/j150579a011). Nightingale's Table III reports BOTH the
effective hydrated radii AND the limiting ionic conductances `λ⁰`, so one clean
primary supplies both columns. `D0` is **derived** from `λ⁰` by Nernst–Einstein:

```
D0 = R·T·λ⁰ / (z²·F²)     (λ⁰ in SI, S·m²/mol = (S·cm²/mol)·1e-4)
R = 8.314462618 J/(mol·K)   T = 298.15 K   F = 96485.33212 C/mol
```

For divalent ions, `λ⁰` is the MOLAR conductance (= per-equivalent × |z|).

| species | r_eff (nm) | radius (m, stored) | λ⁰ (S·cm²/mol, molar) | D0 (m²/s) |
|---------|-----------:|-------------------:|----------------------:|----------:|
| H  (H⁺)   | 0.282 | 2.82e-10 | 349.8 | 9.31e-09 |
| Na (Na⁺)  | 0.358 | 3.58e-10 |  50.1 | 1.33e-09 |
| K  (K⁺)   | 0.331 | 3.31e-10 |  73.5 | 1.96e-09 |
| Ca (Ca²⁺) | 0.412 | 4.12e-10 | 119.0 | 7.92e-10 |
| Mg (Mg²⁺) | 0.428 | 4.28e-10 | 106.0 | 7.06e-10 |
| Cl (Cl⁻)  | 0.332 | 3.32e-10 |  76.3 | 2.03e-09 |
| OH (OH⁻)  | 0.300 | 3.00e-10 | 198.0 | 5.27e-09 |
| SO4(SO₄²⁻)| 0.379 | 3.79e-10 | 160.0 | 1.06e-09 |

Reproduce the derivation:

```python
R, T, F = 8.314462618, 298.15, 96485.33212
lam = {"H":(349.8,1),"Na":(50.1,1),"K":(73.5,1),"Ca":(119.0,2),
       "Mg":(106.0,2),"Cl":(76.3,1),"OH":(198.0,1),"SO4":(160.0,2)}
for s,(l,z) in lam.items():
    print(s, R*T*(l*1e-4)/(z*z*F*F))   # m^2/s
```

### Licence-gate notes & FLAGGED GAPS

* **No no-grant table used.** CRC Handbook, Robinson & Stokes (*Electrolyte
  Solutions*) verbatim tables, DIPPR, Yaws and the NIST WebBook are all
  no-grant / all-rights-reserved and were **not** consulted. Every stored value
  traces to the single Nightingale 1959 primary (radii read; D0 derived from the
  same paper's λ⁰). Where a value could ONLY come from a no-grant source it is
  left as a documented gap (below), never copied.

* **Grotthuss caveat (H⁺, OH⁻).** Their Nernst–Einstein `D0` is the
  conductance-equivalent value; physically their conductance is dominated by
  proton-hopping (Grotthuss), not Stokes–Einstein hydrodynamic diffusion. The
  derived `D0` is correct for migration / transport-number arithmetic (the
  electrodialysis use) but is not a hydrodynamic self-diffusivity (row comment).

* **GAP — ions without the tier.** Ba, Sr, Fe, Mn, Li, Br, F, CO3, HCO3, HSO4,
  B(OH)4 and the boron/silica complexes carry **no** `radius`/`D0`. Several are
  in Nightingale 1959 but are not needed by electrochemistry v1 (NaCl / mixed-
  monovalent ED); they are deliberately absent and the electrochem accessor
  (`ionRadius` / `ionD0`) **refuses loudly** for any ion missing the tier — never
  a silent zero. Adding one later is a one-row curation act against the same
  primary.

* **GAP — temperature dependence.** `D0` is the 25 °C value; a Stokes–Einstein
  T-correction (via the water-viscosity ratio) is deferred. v1 ED cases run at /
  near 25 °C and the unit announces the constant-`D0` assumption.

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
