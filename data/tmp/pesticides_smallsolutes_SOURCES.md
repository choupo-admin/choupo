# Pesticides + small solutes — SOURCES ledger

Private (gitignored `data/tmp`) provenance for the 7 enriched candidate records:
**atrazine, simazine, diuron, glyphosate, urea, NDMA, acrylamide.**
Every value re-cited to its PRIMARY. Values are individual FACTS staged in the
private tier; no compilation/table copied wholesale. FLAGGED = not obtained clean
(paywalled or absent) — never fabricated.

Retrieval date: **2026-07-24**. Tools: PubChem PUG-View (public domain, per-value
primary in HSDB/peer-reviewed refs), NIST WebBook free condensed-phase pages
(cite the primary they compile), open NF/RO literature.

Identity (CID/InChIKey/CAS) for all: PubChem (US NIH, public domain). Unchanged
from the original candidate headers.

---

## urea (CH4N2O, CAS 57-13-6) — RICH
| field | value | primary source |
|---|---|---|
| dHf_298 (cr) | -333.11 ± 0.69 kJ/mol | Kabo, Miroshnichenko et al. (1990), combustion cal.; via NIST WebBook C57136 Mask=2 |
| S°_298 (cr) | 104.26 J/mol·K | Andersson, Matsuo et al. (1993), adiabatic cal. 15–310 K; via NIST WebBook |
| Cp (cr, 298 K) | 92.79 J/mol·K | Andersson, Matsuo et al. (1993); via NIST WebBook |
| logKow | -2.11 | Hansch, Leo & Hoekman, "Exploring QSAR", ACS 1995, p.3; via PubChem/HSDB |
| solubility | 545 g/L @25 °C | Yalkowsky, AZ Aqueous Solubility Database, Univ. Arizona 1989; via PubChem |
| density (solid) | 1.3230 g/cm³ @20 °C | CRC Handbook 81st ed. 2000, p.3-328; via PubChem |
| molarVolume | ~45.4 cm³/mol (derived MW/ρ, crystalline) | from density above |
| D_aq | 1.38e-9 m²/s @25 °C | Gosting & Akeley, J. Am. Chem. Soc. 74 (1952) 2058, Gouy interferometry |
| charge@pH7 | 0 (neutral) | — |
| COSMO-SAC | **FLAGGED** | LVPP QM lead only (UREA.gout, GAMESS HF/TZVP) — variant-mismatched vs cosmoSAC2002 |

## acrylamide (C3H5NO, CAS 79-06-1) — RICH (S° flagged)
| field | value | primary source |
|---|---|---|
| dHf_298 (cr) | -212.08 ± 0.30 kJ/mol | Steele, Chirico et al. (1989), combustion cal.; via NIST WebBook C79061 Mask=2 |
| Cp (cr, 298 K) | 110.58 J/mol·K (305–415 K; polymerises >415 K) | Steele, Chirico et al. (1989); via NIST WebBook |
| dHc (cr) | -1683.02 ± 0.26 kJ/mol | Steele, Chirico et al. (1989); via NIST WebBook |
| S°_298 | **FLAGGED** (absent from NIST condensed-phase page) | fill from a primary |
| logKow | -0.67 | Hansch, Leo & Hoekman, ACS 1995, p.6; via PubChem/HSDB |
| solubility | 204 g/100 mL @25 °C | ILO-WHO ICSC #0091; via PubChem (CRC 95th: 371 g/L @20 °C) |
| molarVolume | **FLAGGED** | fill from cited density or Le Bas |
| D_aq | **FLAGGED** (~1.06e-9 m²/s order-of-mag) | fill from primary |
| charge@pH7 | 0 (neutral) | — |
| COSMO-SAC | **FLAGGED** | LVPP QM lead only (ACRYLAMIDE.gout, HF/TZVP) — variant-mismatched |

## NDMA (C2H6N2O, CAS 62-75-9) — solute descriptors real; thermo flagged
| field | value | primary source |
|---|---|---|
| logKow | -0.57 | Hansch, Leo & Hoekman, ACS 1995, p.5; via PubChem/HSDB |
| solubility | miscible / "infinitely soluble" @23–25 °C | Mirvish et al., J. Natl. Cancer Inst. 1976; via PubChem |
| charge@pH7 | 0 (neutral) | — |
| thermochemistry (dHf/S/Cp) | **FLAGGED** | fill from primary (NIST C62759) |
| molarVolume | **FLAGGED** | fill from cited liquid density or Le Bas |
| D_aq | **FLAGGED** (~1.1e-9 m²/s order-of-mag) | fill from primary RO-transport / diffusion study |
| COSMO-SAC | **FLAGGED** | no VT-2005 entry, no LVPP lead |

## atrazine (C8H14ClN5, CAS 1912-24-9)
| field | value | primary source |
|---|---|---|
| pKa | 1.60 (very weak base) | e-Pesticide Manual 15th ed. (BCPC 2008-2010); via PubChem/HSDB |
| charge@pH7 | 0 (neutral; negligible protonation) | derived from pKa |
| logKow | 2.61 | Hansch, Leo & Hoekman, ACS 1995, p.48; via PubChem/HSDB |
| solubility | 33 mg/L @25 °C | Yalkowsky, Handbook of Aqueous Solubility Data 2nd ed. 2010, p.152; (Ward & Weber, J. Agric. Food Chem. 16 (1968) 959: 34.7 mg/L @26 °C) |
| density (solid) | 1.23 g/cm³ @22 °C | e-Pesticide Manual 15th ed.; via PubChem |
| molarVolume | ~175.4 cm³/mol (derived MW/ρ, crystalline) | from density above |
| StokesRadius / D_aq | **FLAGGED** | Kiso et al., J. Membr. Sci. 358 (2010) 101-113; Van der Bruggen et al., J. Membr. Sci. 193 (2001) 51-63 (paywalled tables) |
| thermochemistry | **FLAGGED** | fill from primary |
| COSMO-SAC | **FLAGGED** | no VT-2005 entry, no LVPP lead |

## simazine (C7H12ClN5, CAS 122-34-9)
| field | value | primary source |
|---|---|---|
| pKa | 1.62 @20 °C (very weak base) | Tomlin, The Pesticide Manual 11th ed. (BCPC 1997); via PubChem/HSDB |
| charge@pH7 | 0 (neutral) | derived from pKa |
| logKow | 2.18 | Hansch, Leo & Hoekman, ACS 1995, p.34; via PubChem/HSDB |
| solubility | 6.2 mg/L @pH7,20 °C | Tomlin, The Pesticide Manual 11th ed. (BCPC 1997); via PubChem |
| density (solid) | 1.302 g/cm³ @20 °C | NTP Chemical Repository Database 1992; via PubChem |
| molarVolume | ~154.9 cm³/mol (derived MW/ρ, crystalline) | from density above |
| StokesRadius / D_aq | **FLAGGED** | Kiso 2010 / Van der Bruggen 2001 (paywalled) |
| thermochemistry | **FLAGGED** | fill from primary |
| COSMO-SAC | **FLAGGED** | no VT-2005 entry, no LVPP lead |

## diuron (C9H10Cl2N2O, CAS 330-54-1)
| field | value | primary source |
|---|---|---|
| pKa | none in ambient range (non-ionizable phenylurea) | no PubChem dissociation-constant record |
| charge@pH7 | 0 (neutral; high dipole via carbonyl) | — |
| logKow | 2.68 | Hansch, Leo & Hoekman, ACS 1995, p.56; via PubChem/HSDB |
| solubility | 37.4 mg/L @25 °C | e-Pesticide Manual 15th ed.; via PubChem (USDA ARS PPD: 42 mg/L) |
| density (solid) | 1.48 g/cm³ | e-Pesticide Manual 15th ed.; via PubChem |
| molarVolume | ~157.5 cm³/mol (derived MW/ρ, crystalline) | from density above |
| StokesRadius / D_aq | **FLAGGED** | Kiso 2010 / Van der Bruggen 2001 (paywalled) |
| thermochemistry | **FLAGGED** | fill from primary |
| COSMO-SAC | **FLAGGED** | no VT-2005 entry, no LVPP lead |

## glyphosate (C3H8NO5P, CAS 1071-83-6)
| field | value | primary source |
|---|---|---|
| pKa1..4 | 2.0 / 2.6 / 5.6 / 10.6 | Caceres-Jensen et al., J. Environ. Qual. 38 (2009) 1449; via PubChem |
| pKa (alt, 3) | 2.34 / 5.73 / 10.2 | e-Pesticide Manual 15th ed.; via PubChem |
| charge@pH7 | ~ -2 (net; divalent anion predominant) | derived from pKa set |
| logKow | -3.40 | Sangster, LOGKOW evaluated database; via PubChem (range -4 to -1 reported) |
| solubility | 12 g/L @25 °C | Worthing & Walker, The Pesticide Manual 1987; via PubChem (10.5 g/L @pH1.9, e-Pesticide Manual) |
| density (solid) | 1.705 g/cm³ @20 °C | e-Pesticide Manual 15th ed.; via PubChem |
| molarVolume | ~99.2 cm³/mol (derived MW/ρ, crystalline) | from density above |
| StokesRadius / D_aq | **FLAGGED** (speciation-dependent) | fill from primary |
| thermochemistry | **FLAGGED** | fill from primary |
| COSMO-SAC | **FLAGGED** | LVPP has GLYPHOSATE.mol geometry but no shipped .gout in 18.07; variant-mismatched anyway; electrolyte speciation model is the right route |

---

## FLAGGED summary (what was NOT obtained clean — fill later, do NOT fabricate)

**COSMO-SAC σ-profiles — ALL 7 FLAGGED.** No matching-variant (cosmoSAC2002 /
VT-2005 grid) 51-point profile is available for any of these compounds:
- None are in the Choupo standards VT-2005 set (77 shipped; InChIKeys checked, no match).
- The LVPP sigma database (MIT-licensed, cloned at `data/tmp/_sources/lvpp_sigma`)
  ships only QM geometry/output — raw GAMESS `.gout` at **HF/TZVP**, a DIFFERENT
  parametrization than Choupo's only-implemented cosmoSAC2002 constants. Mixing them
  would be the "variant mismatch = LOUD error" the CLAUDE.md COSMO-SAC contract forbids.
- QM leads extracted for a future 2002-compatible re-processing:
  `data/tmp/_sources/lvpp_gout_leads/UREA.gout`, `ACRYLAMIDE.gout`.
  (LVPP also has `mol/std/{UREA,ACRYLAMIDE,GLYPHOSATE}.mol` geometries.)
- Correct fix: run the σ-profile extraction at a cosmoSAC2002-compatible level (or add a
  matching constant set); do NOT paste an HF/TZVP profile under a "2002" variant tag.

**Thermochemistry FLAGGED:** atrazine, simazine, diuron, glyphosate, NDMA (no clean
primary solid dHf/S/Cp sourced); acrylamide **S°_298** only (dHf + Cp real).
- urea + acrylamide dHf/Cp are REAL (NIST WebBook → primary).

**Stokes radius + D_aq FLAGGED** for atrazine/simazine/diuron/glyphosate (and D_aq for
NDMA/acrylamide). The canonical fill-from primaries (tables paywalled at curation time):
- Kiso et al., "Effect of molecular shape on rejection of uncharged organic compounds
  by nanofiltration membranes and on calculated pore radii", J. Membr. Sci. 358 (2010) 101-113.
- Van der Bruggen et al., "Application of nanofiltration for removal of pesticides,
  nitrate and hardness from ground water", J. Membr. Sci. 193 (2001) 51-63.
- urea D_aq is REAL (Gosting & Akeley 1952).

**Molar volume:** derived (MW/ρ, crystalline) for atrazine/simazine/diuron/glyphosate/urea
from cited densities — labelled as crystalline, NOT the Le Bas/liquid volume for Wilke-Chang.
FLAGGED for acrylamide + NDMA (no clean cited density obtained).

**PC-SAFT parameters — ALL 7 FLAGGED / not attempted.** Out of the obtained scope;
urea has published PC-SAFT/ePC-SAFT studies (Held/Sadowski lineage) to fill later.

---

### License / distributability note
- PubChem, NIST WebBook, LVPP identities/facts staged privately (`data/tmp`, gitignored).
- LVPP sigma database is MIT-licensed (`data/tmp/_sources/lvpp_sigma/LICENSE`) — reusable,
  but no σ-profile was emitted (variant mismatch, see above).
- Values are individual re-cited FACTS, primary per value; no third-party compilation/table
  redistributed. Nothing here is committed to the public repo.
