# pharma1 — pharmaceutical NF/RO micropollutants: per-value sources

Enrichment date: 2026-07-24. Private tier (`data/tmp/`, gitignored). Values are
FACTS gathered for Vítor's private working tier; PRIMARY cited per value.
Compounds: caffeine, carbamazepine, ibuprofen, diclofenac, naproxen, ketoprofen.

Conventions used
- **McGowan V_x** (molar volume, cm³/mol): COMPUTED by Choupo (additive atomic
  contributions − 6.56 per bond; bonds = N_atoms − 1 + N_rings). Method primary:
  Abraham, M.H. & McGowan, J.C., *Chromatographia* 23 (1987) 243. This is
  Choupo's OWN estimate (glass-box), not a copied table value.
- **Stokes radius** derived from D_aq by Stokes–Einstein r = kT/(6πηD),
  water η=0.890 mPa·s, T=298.15 K — Choupo's own derivation (labelled).
- PubChem = PUG-View Experimental Properties; each value carries the ORIGINAL
  primary that PubChem attributes (Hansch/Sangster/Avdeef/Yalkowsky/etc.), which
  is what is cited — not PubChem's arrangement.

---

## caffeine (C8H10N4O2, CID 2519, InChIKey RYYVLZVUVIJVGH, MW 194.19)
| property | value | primary source |
|---|---|---|
| molarVolume (McGowan V_x) | 136.3 cm³/mol | COMPUTED (Abraham & McGowan, Chromatographia 23 (1987) 243) |
| logKow | −0.07 | Hansch, Leo & Hoekman, *Exploring QSAR*, ACS 1995, p.44 (via PubChem HSDB) |
| water solubility | 21.6 g/L @25 °C | Yalkowsky, He & Jain, *Handbook of Aqueous Solubility Data* 2nd ed., CRC 2010 (via PubChem) |
| pKa (weak acid) | ~14 | Sigma-Aldrich C0750 product sheet (via PubChem) |
| pKa (cation) | ~0.6 | Svorc, Int. J. Electrochem. Sci. 8 (2013) 5755 (via PubChem) |
| charge @ pH7 | 0 (neutral) | derived from pKa |
| **D_aq** | **FLAG** | primary = Niesner & Heintz, J. Chem. Eng. Data 45 (2000) 1121 (caffeine, Taylor dispersion, 298.15 K); exact value paywalled/not transcribed |
| **Stokes radius** | **FLAG** | derive once D_aq pinned |
| **standardThermochemistry** | **FLAG** | needs primary combustion/DSC |
| **cosmo σ-profile** | **FLAG** | not in VT-2005; LVPP/CHAOS by InChIKey |
| **PC-SAFT** | **FLAG** | no verified set |

## carbamazepine (C15H12N2O, CID 2554, InChIKey FFGPTBGBLSHEPO, MW 236.27)
| property | value | primary source |
|---|---|---|
| **Stokes radius** | **0.37 nm** | Hidalgo, Gómez, Murcia et al., *Membranes* 13 (2023) 868, Table 3 (open access, CC-BY) |
| D_aq (derived) | 0.66e-9 m²/s | Choupo Stokes–Einstein from r=0.37 nm |
| D_aq (measured) | FLAG (exact) | Fluid Phase Equilibria 580 (2024) 114056 (Taylor dispersion, paywalled) |
| molarVolume (McGowan V_x) | 181.1 cm³/mol | COMPUTED (Abraham & McGowan 1987) |
| pKa | 13.9 (amide) | Jones et al., Water Res. 36 (2002) 5013 (via PubChem HSDB) |
| charge @ pH7 | 0 (neutral) | derived |
| logKow | 2.45 | Dal Pozzo et al., Int. J. Pharm. 50 (1989) 97 (via PubChem HSDB) |
| water solubility | 152 mg/L | Human Metabolome Database (via PubChem); Hidalgo 2023 quotes 18 mg/L |
| **standardThermochemistry** | **FLAG** | primary combustion/DSC |
| **cosmo / PC-SAFT** | **FLAG** | LVPP/CHAOS; cocrystal-solubility PC-SAFT studies exist |

## ibuprofen (C13H18O2, CID 3672, InChIKey HEFNNWSXXWATRW, MW 206.28)
| property | value | primary source |
|---|---|---|
| **D_aq** | **0.50e-9 m²/s @298.15 K** | Mendes, Cruz, Martins, Ramalho & Martins, *J. Chem. Thermodyn.* 178 (2023) 106955 (Taylor dispersion) — MEASURED |
| Stokes radius (derived) | 0.49 nm | Choupo Stokes–Einstein from measured D_aq |
| molarVolume (McGowan V_x) | 177.7 cm³/mol | COMPUTED (Abraham & McGowan 1987) |
| pKa | 4.91 | Sangster, LOGKOW Databank 1994 (via PubChem HSDB); ChEMBL 4.45 |
| charge @ pH7 | −1 (anionic) | derived |
| logKow | 3.97 | Avdeef, J. Pharm. Sci. 82 (1993) 183 (via PubChem HSDB) |
| water solubility | 21 mg/L @25 °C (neutral) | Yalkowsky & Dannenfelser, AQUASOL 1992 (via PubChem) |
| **standardThermochemistry** | **FLAG** | primary combustion/DSC |
| **cosmo σ-profile** | **FLAG** | LVPP/CHAOS by InChIKey |
| **PC-SAFT** | **FLAG (leads exist)** | Ruether & Sadowski; Ferreira et al., J. Supercrit. Fluids 2022 — transcribe+cite if adopted |

## diclofenac (C14H11Cl2NO2, CID 3033, InChIKey DCOPUUMXTXDBNB, MW 296.15)
| property | value | primary source |
|---|---|---|
| molarVolume (McGowan V_x) | 202.5 cm³/mol | COMPUTED (Abraham & McGowan 1987) |
| pKa | 4.15 | Sangster, LOGKOW Databank 1994 (via PubChem); ChEMBL 3.99–4.30 |
| charge @ pH7 | −1 (anionic) | derived |
| logKow | 4.51 | Avdeef 1997 (via PubChem DrugBank/HSDB); HMDB 3.9 |
| water solubility | 2.37 mg/L @25 °C (neutral acid) | Fini et al., 1986 (via PubChem HSDB) |
| **D_aq** | **FLAG** | no clean open primary; Wilke-Chang estimable ~0.5e-9 |
| **Stokes radius** | **FLAG** | derive once D_aq pinned |
| **standardThermochemistry / cosmo / PC-SAFT** | **FLAG** | primary calorimetry; LVPP/CHAOS; fit PC-SAFT |

## naproxen (C14H14O3, CID 156391, InChIKey CMWTZPSULFXXJA, MW 230.26)
| property | value | primary source |
|---|---|---|
| molarVolume (McGowan V_x) | 178.2 cm³/mol | COMPUTED (Abraham & McGowan 1987) |
| pKa | 4.15 | Sangster, LOGKOW Databank 1994 (via PubChem); ChEMBL 4.18 |
| charge @ pH7 | −1 (anionic) | derived |
| logKow | 3.18 | Hansch, Leo & Hoekman, *Exploring QSAR*, ACS 1995, p.121 (via PubChem HSDB) |
| water solubility | 15.9 mg/L @25 °C (neutral) | Yalkowsky & He, *Handbook of Aqueous Solubility Data*, CRC 2003, p.962 (via PubChem) |
| **D_aq** | **FLAG** | no clean open primary; Wilke-Chang estimable ~0.6e-9 |
| **Stokes radius** | **FLAG** | derive once D_aq pinned |
| **standardThermochemistry / cosmo / PC-SAFT** | **FLAG** | primary calorimetry; LVPP/CHAOS; fit PC-SAFT |

## ketoprofen (C16H14O3, CID 3825, InChIKey DKYWVDODHFEZIM, MW 254.28)
| property | value | primary source |
|---|---|---|
| **D_aq** | **0.44e-9 m²/s @298.15 K** | Mendes, Cruz, Martins, Ramalho & Martins, *J. Chem. Thermodyn.* 178 (2023) 106955 (Taylor dispersion) — MEASURED |
| Stokes radius (derived) | 0.56 nm | Choupo Stokes–Einstein from measured D_aq |
| molarVolume (McGowan V_x) | 197.8 cm³/mol | COMPUTED (Abraham & McGowan 1987) |
| pKa | 4.45 | Sangster, LOGKOW Databank 1994 (via PubChem); ChEMBL/Hidalgo 3.98 |
| charge @ pH7 | −1 (anionic) | derived |
| logKow | 3.12 | Sangster, LOGKOW Databank 1993 (via PubChem DrugBank); Hidalgo, Membranes 13 (2023) 868 Table 3 |
| water solubility | 51 mg/L @22 °C (neutral) | Yalkowsky & Dannenfelser, AQUASOL 1992 (via PubChem); Hidalgo 2023 Table 3 |
| **standardThermochemistry** | **FLAG** | primary combustion/DSC |
| **cosmo σ-profile** | **FLAG** | LVPP/CHAOS by InChIKey |
| **PC-SAFT** | **FLAG (lead exists)** | Ferreira et al., J. Supercrit. Fluids 2022 — transcribe+cite if adopted |

---

## FLAGGED (not fabricated — needs a verified primary before use)
- **D_aq measured**: caffeine (Niesner & Heintz 2000 — pin exact table value),
  diclofenac, naproxen (no clean open primary found; Wilke-Chang estimable from
  the computed McGowan V_x as Choupo's own estimate).
- **D_aq / Stokes radius** for diclofenac, naproxen (derive once D pinned).
- **carbamazepine D_aq exact measured** value (Fluid Phase Equilibria 580 (2024)
  114056, paywalled) — the 0.37 nm Stokes radius (Hidalgo 2023, open) is used.
- **standardThermochemistry** (solid ΔfH°, S°, Cp): ALL SIX — needs primary
  combustion/DSC calorimetry (much of it paywalled). Non-essential for the
  nonvolatile membrane-solute role.
- **cosmo σ-profile (COSMO-SAC 2002)**: ALL SIX — none in the VT-2005 77-set.
  Available by InChIKey match in LVPP (github lvpp/sigma, MIT) and/or CHAOS
  (CC-BY); the 51-pt profile + area + volume must be extracted and pasted.
- **PC-SAFT parameters**: ALL SIX not verified here. Published leads for
  ibuprofen (Ruether & Sadowski; Ferreira 2022) and ketoprofen (Ferreira 2022);
  the rest need fitting or a cited primary.

## Sources consulted (URLs)
- PubChem PUG-View Experimental Properties (LogP / Solubility / Dissociation
  Constants), CIDs 2519, 2554, 3672, 3033, 156391, 3825.
- Hidalgo A.M., Gómez M., Murcia M.D. et al., "Prediction of Flux and Rejection
  Coefficients ... Nanofiltration Membrane", *Membranes* 13(11) (2023) 868,
  doi:10.3390/membranes13110868 (open access).
- Mendes F.S., Cruz C.E.M., Martins R.N., Prates Ramalho J.P., Martins L.F.G.,
  "On the diffusion of ketoprofen and ibuprofen in water", *J. Chem.
  Thermodynamics* 178 (2023) 106955 (open PDF, U. Évora dspace).
- Niesner R. & Heintz A., "Diffusion Coefficients of Aromatics in Aqueous
  Solution", *J. Chem. Eng. Data* 45 (2000) 1121–1124.
- Ribeiro/Esteso group, "On the diffusion of carbamazepine, acetaminophen and
  atenolol in water", *Fluid Phase Equilibria* 580 (2024) 114056 (paywalled).
- Abraham M.H. & McGowan J.C., *Chromatographia* 23 (1987) 243 (McGowan V_x method).
