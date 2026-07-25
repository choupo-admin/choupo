# Sugars — candidate enrichment sources (private tier, curation reference)

Enriched 2026-07-24. Six candidate components: fructose, galactose, xylose,
arabinose, lactose, trehalose. Every value below is a FACT cited to its PRIMARY
source (facts, not table copies). FLAGGED = source identified but exact digit not
transcribable at curation (paywall) or needs verification — NEVER fabricated.

Legend: R = REAL (value in file, primary-cited) · D = DERIVED (glass-box, shown) ·
F = FLAGGED (needs curation).

## Primary references (per value class)

| Class | Primary source |
|---|---|
| dHf/dHc (hexoses, disaccharides) | Clarke & Stegeman, *J. Am. Chem. Soc.* **61** (1939) 1726-1730 (combustion); reanalysed Cox & Pilcher 1970 |
| S°, Cp galactose | Jack & Stegeman, *J. Am. Chem. Soc.* **63** (1941) 2121-2123 (adiabatic) |
| Cp galactose (300 K) | Kawaizumi, Nishio et al., *J. Chem. Thermodyn.* **13** (1981) |
| Cp lactose (300 K) | Kawaizumi, Nishio et al., *J. Chem. Thermodyn.* **13** (1981) |
| dHf, S°, Cp xylose | Ribeiro da Silva, Ribeiro da Silva, Lobo Ferreira, Shi, Woodfield, Goldberg, "Thermochemistry of α-D-xylose(cr)", *J. Chem. Thermodyn.* **58** (2013) 20-28 |
| dHf arabinose | combustion series (d-ribose/d-arabinose/l-ascorbic acid) — verify exact primary |
| Combustion trehalose | Lopes Jesus et al., "Crystalline anhydrous α,α-trehalose (polymorph β)…", *J. Chem. Thermodyn.* **37** (2005) 1231 (static bomb) |
| D_aq glucose/fructose/sucrose/lactose | Ribeiro et al., *J. Chem. Eng. Data* **51** (2006) 1836-1840 (Taylor dispersion) |
| D_aq six sugars (arabinose/xylose/glucose/mannose/galactose/sucrose) | Mogi, Sugai, Fuse, Funazukuri, *J. Chem. Eng. Data* **52** (2007) 40-43 |
| D_aq xylose (early) | Uedaira & Uedaira, *Bull. Chem. Soc. Jpn.* **42** (1969) 2140 |
| D_aq trehalose | Ekdawi-Sever, de Pablo et al., *J. Phys. Chem. A* **107** (2003) 936 |
| Partial molar volume (monosacch.) | Galema & Høiland, *J. Phys. Chem.* **95** (1991) 5321 |
| Partial molar volume (disacch.) | Banipal et al. (disaccharide V°φ studies) |
| PC-SAFT (all except arabinose) | Held & Sadowski, "Modeling…aqueous sugar solutions with PC-SAFT", *AIChE J.* **59** (2013) 4794-4805 |
| Physical facts | Merck Index 12th/14th ed.; CRC Handbook 79th ed.; PubChem experimental-properties |
| Stokes radius | DERIVED r = kT/(6πμD), μ(H₂O,25 °C)=0.8903 mPa·s ⇒ r = 2.453e-19 / D |

## Per-compound value table

### fructose (C6H12O6, CAS 57-48-7)
| Value | Result | Number | Source |
|---|---|---|---|
| dHf_298(cr) | R | -1265.6 kJ/mol | Clarke & Stegeman 1939 |
| S°_298 | F | — | 2012 JCT adiabatic (paywall) |
| Cp(solid) | F | — | 2012 JCT (paywall) |
| D_aq (25 °C) | R | 6.86e-10 m²/s | Ribeiro 2006 |
| Stokes r | D | 0.358 nm | Stokes-Einstein |
| V_m | R | 110.6 cm³/mol | Galema & Høiland 1991 |
| PC-SAFT | F | source only | Held & Sadowski 2013 (Table 2) |
| COSMO-SAC | F | — | LVPP/CHAOS by InChIKey |
| density/mp/pKa/[α]/solub | R | see file | Merck/CRC |

### galactose (C6H12O6, CAS 59-23-4)
| Value | Result | Number | Source |
|---|---|---|---|
| dHf_298(cr) | R | -1286.3 kJ/mol | Clarke & Stegeman 1939 |
| S°_298 | R | 205.4 J/mol/K | Jack & Stegeman 1941 |
| Cp(solid) | R | 216.3 J/mol/K @300K | Kawaizumi 1981 |
| D_aq (25 °C) | F | ~6.8e-10 (≈glucose) | Mogi 2007 (transcribe digit) |
| Stokes r | F | ~0.36 nm | from D_aq |
| V_m | R | 110.2 cm³/mol | Galema & Høiland 1991 |
| PC-SAFT | F | source only | Held & Sadowski 2013 |
| COSMO-SAC | F | — | LVPP/CHAOS |
| density/mp/[α]/solub | R | see file | Merck/ChemicalBook |
| pKa | F | ~12.35 (order) | verify primary |

### xylose (C5H10O5, CAS 58-86-6)
| Value | Result | Number | Source |
|---|---|---|---|
| dHf_298(cr) | R | -1054.5 kJ/mol | Ribeiro da Silva 2013 |
| S°_298 | R | 175.3 J/mol/K | Ribeiro da Silva 2013 (supersedes Miller 1935 143.5) |
| Cp(solid) | R | 178.1 J/mol/K @298K | Ribeiro da Silva 2013 |
| D_aq (25 °C) | R | 7.50e-10 m²/s | Mogi 2007 / Uedaira 1969 |
| Stokes r | D | 0.327 nm | Stokes-Einstein |
| V_m | R | 95.4 cm³/mol | Galema & Høiland 1991 |
| PC-SAFT | F | source only | Held & Sadowski 2013 |
| COSMO-SAC | F | — | LVPP/CHAOS |
| density/mp/pKa/[α]/solub | R | see file | Merck (PubChem CID 135191) |

### arabinose (C5H10O5, CAS 5328-37-0)
| Value | Result | Number | Source |
|---|---|---|---|
| dHf_298(cr) | R/F | -1058 kJ/mol (verify) | combustion series (verify exact primary) |
| S°_298 | F | ~175 (≈xylose) | β-D-arabinose low-T Cp study (paywall) |
| Cp(solid) | F | ~178 (≈xylose) | same |
| D_aq (25 °C) | F | ~7.5e-10 (≈xylose) | Mogi 2007 (transcribe digit) |
| Stokes r | F | ~0.33 nm | from D_aq |
| V_m | R | 93.4 cm³/mol | Galema & Høiland 1991 |
| PC-SAFT | F | no set | not in Held 2013 (use xylose surrogate labelled) |
| COSMO-SAC | F | — | LVPP/CHAOS |
| density/mp/[α]/solub | R | see file | Merck/ChemicalBook |
| pKa | F | ~12.34 (order) | verify |
| **InChIKey** | **F** | **wrong (copied from xylose)** | **re-fetch CID 439195** |

### lactose (C12H22O11, CAS 63-42-3, anhydrous)
| Value | Result | Number | Source |
|---|---|---|---|
| dHf_298(cr) | F | ~-2236 kJ/mol order | Clarke & Stegeman 1939 (transcribe digit + polymorph) |
| S°_298 | F | — | third-law primary needed |
| Cp(solid) | R | 417.6 J/mol/K @300K | Kawaizumi 1981 |
| D_aq (25 °C) | R | 5.66e-10 m²/s | Ribeiro 2006 |
| Stokes r | D | 0.434 nm | Stokes-Einstein |
| V_m | R | 209.1 cm³/mol | Banipal et al. |
| PC-SAFT | F | source only | Held & Sadowski 2013 |
| COSMO-SAC | F | — | LVPP/CHAOS |
| density/mp/[α]/solub | R | see file | Merck |
| pKa | F | ~12 (order) | verify |

### trehalose (C12H22O11, CAS 99-20-7, anhydrous)
| Value | Result | Number | Source |
|---|---|---|---|
| combustion Δc_u | R | -16434.05 J/g | Lopes Jesus et al. 2005 |
| dHf_298(cr) | D | -2241 kJ/mol (derived) | Hess from combustion + CODATA CO2/H2O (reconcile w/ paper) |
| S°_298 | F | — | third-law primary needed |
| Cp(solid) | F | ~400 order | primary needed |
| D_aq (25 °C) | F | ~5.0e-10 (≈sucrose) | Ekdawi-Sever 2003 (transcribe digit) |
| Stokes r | F | ~0.49 nm | from D_aq |
| V_m | R | 207.6 cm³/mol | Banipal et al. |
| PC-SAFT | F | source only | Held & Sadowski 2013 |
| COSMO-SAC | F | — | LVPP/CHAOS |
| density/mp/[α]/solub | R | see file | Merck/HMDB |
| pKa | F | ~12.5 (order) | verify |

## FLAGGED (still needed) — consolidated worklist

1. **COSMO-SAC 51-point σ-profiles — ALL SIX.** No VT-2005 set ships for any of
   these sugars. Retrieve real profiles from the LVPP sigma database
   (github `lvpp/sigma`, MIT-licensed, ~2000 compounds) or CHAOS (CC-BY), matched
   by InChIKey/CAS. Add `cosmo { <set> { variant cosmoSAC2002; source "…"; area;
   volume; sigmaProfile ( …51… ); } }` only with the real points. Do NOT fabricate.
2. **PC-SAFT parameters — five (all but arabinose).** Source is Held & Sadowski,
   *AIChE J.* 59 (2013) 4794-4805, Table 2 (glucose, fructose, xylose, galactose,
   lactose, trehalose among the 13 fitted). Transcribe m, σ, u/k, ε_AB/k, κ_AB
   (2 assoc. sites). Paywalled at curation. Arabinose: not in Held — no vetted set.
3. **D_aq exact 298.15 K digits — galactose, arabinose (Mogi 2007), trehalose
   (Ekdawi-Sever 2003).** Sources identified; transcribe the exact numbers from the
   paywalled tables, then recompute Stokes radii via r = 2.453e-19 / D.
4. **S°_298 — fructose, arabinose, lactose, trehalose.** Third-law calorimetry
   primaries: fructose (2012 JCT), arabinose (β-D-arabinose low-T Cp study),
   lactose + trehalose (locate). Do NOT fabricate.
5. **Solid Cp — fructose, arabinose, trehalose.** Same primaries as (4).
6. **dHf reconciliation — trehalose (derived -2241, reconcile with paper's own
   Washburn-corrected value); lactose (transcribe from Clarke & Stegeman 1939,
   confirm anhydrous vs hydrate); arabinose (verify -1058 kJ/mol exact primary).**
7. **arabinose IDENTITY — InChIKey is wrong (copied from xylose, SRBFZHDQGSBBOR).**
   Re-fetch the correct L-arabinose InChIKey from PubChem CID 439195.
8. **pKa — galactose, arabinose, lactose, trehalose** carry order-of-magnitude
   (~12) placeholders; confirm a primary before promotion.
