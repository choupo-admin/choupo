# hormones_SOURCES.md — steroid EDCs + bisphenol A

Curation of 7 candidate component records for Choupo (private, gitignored tier
`data/tmp`). Compounds: estradiol, estrone, ethinylestradiol, estriol,
testosterone, progesterone, bisphenolA.

Scope: these are **non-volatile hydrophobic trace organics** — characterized for
**MEMBRANE rejection + adsorption**, NOT Joback/VLE. Fields curated: logKow,
phenol/di-phenol pKa, water solubility, melting point, crystal density → molar
volume, aqueous diffusion coefficient D_aq(25C), Stokes radius, plus the
COSMO-SAC / PC-SAFT / standardThermochemistry status.

**Legal frame:** every value is an individual FACT re-cited to its primary
(HSDB/DrugBank/HMDB via PubChem PUG-View trace to the primary; solubility to
Shareef 2006 J. Chem. Eng. Data). No compilation copied wholesale. Private tier
only — no public-repo redistribution. Retrieved 2026-07-24 via PubChem PUG-REST
(`/rest/pug_view/data/compound/<CID>/JSON?heading=...`).

Legend: **[REAL]** curated primary-cited value · **[DERIVED]** computed from a
cited value (V=MW/ρ) · **[EST]** transparent estimate by this work
(Wilke-Chang / Stokes-Einstein), labelled as such in the .dat · **[FLAG]**
not obtained — paywalled/absent, never fabricated.

---

## Primary-source key

- **PubChem PUG-View** (US NIH, public domain aggregation). Each value below
  traces through it to the cited primary compilation.
- **Hansch, Leo & Hoekman**, *Exploring QSAR: Hydrophobic, Electronic, and Steric
  Constants*, ACS 1995 — the logKow (log Kow) primary behind HSDB's values.
- **Shareef, Angove, Wells & Johnson**, "Aqueous Solubilities of Estrone,
  17β-Estradiol, 17α-Ethynylestradiol, and Bisphenol A", *J. Chem. Eng. Data*
  **51** (2006) 879–881 — PRIMARY measured aqueous solubilities (pure water, 25 °C).
- **Nghiem, Schäfer & Elimelech**, "Removal of Natural Hormones by Nanofiltration
  Membranes: Measurement, Modeling, and Mechanisms", *Environ. Sci. Technol.*
  **38** (2004) 1888–1896 — Stokes radii + hindered-transport D (PAYWALLED; flagged).
- **Comerton, Andrews, Bagley & Yang**, *J. Membr. Sci.* **303** (2007) 267 —
  EDC/PhAC rejection descriptors (PAYWALLED; flagged).
- **Lewis & Archer**, "pKa values of estrone, 17β-estradiol and 2-methoxyestrone",
  *Steroids* **34** (1979) 485–499 — estrogen phenolic-OH pKa PRIMARY (flag: verify exact value).
- **Staples et al.**, *Chemosphere* **36** (1998) 2149 — bisphenol A pKa/fate (pKa2 lead).
- **LVPP sigma database** (github `lvpp/sigma`, MIT) — COSMO geometry inputs only
  (`.xyz`/`.mol`); NO precomputed 51-pt σ-profiles.

---

## Per-compound values

### estradiol (17β-estradiol) — C18H24O2, CAS 50-28-2, CID 5757
| field | value | class | source |
|---|---|---|---|
| logKow | 4.01 | REAL | Hansch/Leo/Hoekman 1995 via PubChem/HSDB |
| phenol pKa | 10.46 ± 0.03 | REAL | DrugBank via PubChem CID 5757 |
| water solubility | 3.90 mg/L @27C; 1.51±0.04 mg/L @25C | REAL | HSDB; Shareef 2006 (PRIMARY) |
| melting point | 178.5 °C | REAL | HSDB via PubChem |
| molar volume | Le Bas Vb ~313.5 cm³/mol | EST/FLAG | crystal density absent from PubChem |
| D_aq(25C) | ~5.4e-10 m²/s | EST | Wilke-Chang (this work); agarose-gel ~4.6e-10 corroborates |
| Stokes radius | ~0.46 nm | EST | Stokes-Einstein (this work); primary paywalled (Nghiem 2004) |
| COSMO-SAC | geometry only | FLAG | LVPP ESTRADIOL.xyz/.mol; no σ-profile |
| PC-SAFT | — | FLAG | none published |
| standardThermochemistry | — | FLAG | paywalled; not needed |

### estrone — C18H22O2, CAS 53-16-7, CID 5870
| field | value | class | source |
|---|---|---|---|
| logKow | 3.13 | REAL | Hansch/Leo/Hoekman 1995 via HSDB |
| phenol pKa | ~10.3–10.8 | FLAG | not in PubChem; Lewis&Archer 1979 / Hurwitz&Liu 1977 — verify exact |
| water solubility | 12.42 mg/L; 1.30±0.08 mg/L @25C | REAL | HSDB; Shareef 2006 (PRIMARY) |
| melting point | 260.2 °C | REAL | HSDB |
| density → molar volume | 1.236 g/cm³ @25C → 218.7 cm³/mol | REAL/DERIVED | HSDB; V=MW/ρ |
| D_aq(25C) | ~5.5e-10 m²/s | EST | Wilke-Chang (this work) |
| Stokes radius | ~0.45 nm | EST | Stokes-Einstein; primary paywalled |
| COSMO-SAC | geometry only | FLAG | LVPP ESTRONE.xyz/.mol |
| PC-SAFT / thermochemistry | — | FLAG | none / paywalled |

### ethinylestradiol (17α-ethinylestradiol) — C20H24O2, CAS 57-63-6, CID 5991
| field | value | class | source |
|---|---|---|---|
| logKow | 3.67 | REAL | Hansch/Leo/Hoekman 1995 via HSDB |
| phenol pKa | ~10.4 | FLAG | not in PubChem; Lewis&Archer 1979 — verify exact |
| water solubility | 11.3 mg/L @27C; 9.20±0.09 mg/L @25C | REAL | HSDB; Shareef 2006 (PRIMARY) |
| melting point | 142–146 °C (polymorph 180–186) | REAL | HSDB |
| molar volume | Le Bas Vb ~343 cm³/mol | EST/FLAG | crystal density absent from PubChem |
| D_aq(25C) | ~5.1e-10 m²/s | EST | Wilke-Chang (this work) |
| Stokes radius | ~0.48 nm | EST | Stokes-Einstein; primary paywalled |
| COSMO-SAC | **absent** | FLAG | NOT in LVPP (no EE2 geometry) |
| PC-SAFT / thermochemistry | — | FLAG | none / paywalled |

### estriol — C18H24O3, CAS 50-27-1, CID 5756
| field | value | class | source |
|---|---|---|---|
| logKow | 2.45 | REAL | Hansch/Leo/Hoekman 1995 via HSDB (least hydrophobic, 3 OH) |
| phenol pKa | ~10.4 | FLAG | not in PubChem; Lewis&Archer 1979 — verify exact |
| water solubility | 13.25 mg/L | REAL | HSDB |
| melting point | 288 °C (dec) | REAL | HSDB |
| density → molar volume | 1.27 g/cm³ @25C → 227.1 cm³/mol | REAL/DERIVED | HSDB; V=MW/ρ |
| D_aq(25C) | ~5.3e-10 m²/s | EST | Wilke-Chang (this work) |
| Stokes radius | ~0.46 nm | EST | Stokes-Einstein; primary paywalled |
| COSMO-SAC | geometry only | FLAG | LVPP ESTRIOL.xyz/.mol |
| PC-SAFT / thermochemistry | — | FLAG | none / paywalled |

### testosterone — C19H28O2, CAS 58-22-0, CID 6013
| field | value | class | source |
|---|---|---|---|
| logKow | 3.32 | REAL | Hansch/Leo/Hoekman 1995 via HSDB |
| pKa | none (non-ionizable; neutral all environmental pH) | REAL | DrugBank via PubChem — no phenol, no acidic pKa |
| water solubility | 23.4 mg/L @25C | REAL | HSDB |
| melting point | 153–157 °C | REAL | HSDB (155, HMDB) |
| molar volume | Le Bas Vb ~343 cm³/mol | EST/FLAG | crystal density absent from PubChem |
| D_aq(25C) | ~5.1e-10 m²/s | EST | Wilke-Chang (this work) |
| Stokes radius | ~0.48 nm | EST | Stokes-Einstein; primary paywalled |
| COSMO-SAC | geometry only | FLAG | LVPP TESTOSTERONE.xyz/.mol |
| PC-SAFT / thermochemistry | — | FLAG | none / paywalled |

### progesterone — C21H30O2, CAS 57-83-0, CID 5994
| field | value | class | source |
|---|---|---|---|
| logKow | 3.87 | REAL | Hansch/Leo/Hoekman 1995 via HSDB |
| pKa | none (non-ionizable; neutral all environmental pH) | REAL | DrugBank via PubChem — 3,20-diketone, no phenol |
| water solubility | 8.81 mg/L @25C | REAL | HSDB |
| melting point | 129 °C | REAL | HSDB |
| density → molar volume | 1.166 g/cm³ @23C → 269.7 cm³/mol | REAL/DERIVED | HSDB; V=MW/ρ |
| D_aq(25C) | ~4.8e-10 m²/s | EST | Wilke-Chang (this work) |
| Stokes radius | ~0.51 nm | EST | Stokes-Einstein; primary paywalled |
| COSMO-SAC | geometry only | FLAG | LVPP PROGESTERONE.xyz/.mol |
| PC-SAFT / thermochemistry | — | FLAG | none / paywalled |

### bisphenolA — C15H16O2, CAS 80-05-7, CID 6623
| field | value | class | source |
|---|---|---|---|
| logKow | 3.32 | REAL | Hansch/Leo/Hoekman 1995 via HSDB; ICSC |
| pKa1 | 9.6 | REAL | HSDB via PubChem — first phenolic OH |
| pKa2 | ~10.2 | FLAG | diprotic; Staples 1998 / Cousins 2002 — verify exact |
| water solubility | 300 mg/L @25C (also 120 mg/L) | REAL | HSDB; Shareef 2006 (PRIMARY, 300±5) |
| melting point | 156–158 °C | REAL | HMDB/HSDB |
| density → molar volume | 1.195 g/cm³ @25C → 191.0 cm³/mol | REAL/DERIVED | HSDB; V=MW/ρ |
| D_aq(25C) | ~6.0e-10 m²/s | EST | Wilke-Chang (this work); open studies 4–6e-10 |
| Stokes radius | ~0.41 nm | EST | Stokes-Einstein; primary paywalled |
| COSMO-SAC | geometry only | FLAG | LVPP BISPHENOL_A.xyz/.mol |
| PC-SAFT / thermochemistry | — | FLAG | none adopted / paywalled |

---

## Method notes (transparent estimates)

- **molar volume [DERIVED]** = MW / crystal density, using the PubChem/HSDB
  density (estrone, estriol, progesterone, bisphenolA). Estradiol, EE2,
  testosterone carry no PubChem density → molar volume FLAGGED; a Le Bas
  additive Vb is given only to feed the D estimate.
- **Le Bas Vb (cm³/mol)** additive volumes C=14.8, H=3.7, O=7.4; ring corrections
  −15 per six-membered, −11.5 per five-membered (steroid nucleus = 3×six + 1×five
  → −56.5; bisphenol A = 2×six → −30).
- **D_aq(25C) [EST]** Wilke-Chang: D = 7.4e-8·(φ·M_w)^0.5·T/(μ·Vb^0.6) cm²/s,
  φ=2.6, M_w=18, T=298.15 K, μ=0.890 cP. Overestimates measured D by ~15–20 %
  for fused-ring steroids — labelled ESTIMATE in every .dat, never as measured.
- **Stokes radius [EST]** Stokes-Einstein r = kT/(6πμD) from the D above.
  Yields 0.41–0.51 nm, consistent with the accepted EDC range.

## FLAGGED list (not obtained — paywalled or out-of-scope; never fabricated)

1. **Measured Stokes radii + hindered-transport D_aq** — paywalled primary
   (Nghiem et al., ES&T 38 (2004) 1888; Comerton et al., JMS 303 (2007) 267).
   All 7 carry EST placeholders labelled as such.
2. **Molar volume (crystal-density-derived)** for estradiol, ethinylestradiol,
   testosterone — PubChem lists no density; only a Le Bas Vb estimate given.
3. **Phenol pKa (exact)** for estrone, ethinylestradiol, estriol — not in
   PubChem; canonical ~10.3–10.8 range flagged to Lewis&Archer 1979 / Hurwitz&Liu 1977.
4. **bisphenolA pKa2** — flagged to Staples 1998 / Cousins 2002.
5. **COSMO-SAC σ-profiles (51-pt)** — all 7. LVPP ships COSMO **geometry** for 6
   (not ethinylestradiol) but no precomputed profile; profile generation is a
   quantum-chemistry pipeline, explicitly OUT of Choupo scope.
6. **PC-SAFT parameters** — all 7; no published steroid parameter sets, no open
   bisphenol A set adopted.
7. **standardThermochemistry (ΔHf / combustion)** — all 7; paywalled and not
   needed for a nonvolatile membrane solute (no VLE/energy leg).
