# PFAS + volatile/bio components — enrichment sources (2026-07-24)

Private tier (`data/tmp/`, gitignored). Values are FACTS with a **primary per
value**; no wholesale compilation copying. Paywall-only values are **FLAGGED**,
never fabricated. Compilations used only as pointers to the primary or as
public-domain government tables (ATSDR, NIST WebBook free view, PubChem PUG-View).

Legend: **REAL** = filled into engine block / labelled comment with a citation.
**FLAG** = deliberately left uncurated (paywalled / not located / transcription
risk), with the route to obtain it noted in the `.dat`.

---

## A) PFAS (membrane rejection compounds — comment-line membrane + speciation)

Master public-domain table: **ATSDR, *Toxicological Profile for Perfluoroalkyls*
(2021), Table 4-2** (US-gov, public domain) — consolidates primaries. PubChem
PUG-View (US-NIH, public domain) for pKa/solubility with the underlying primary.

### PFOA (335-67-1, MW 414.07) — C8 carboxylate, HIGH-rejection benchmark
| property | value | primary / source | status |
|---|---|---|---|
| melting point | 54.3 °C | ATSDR 2021 T4-2 | REAL |
| boiling point | 188 °C | ATSDR 2021 T4-2 | REAL |
| density | 1.80 g/cm³ @20 °C | ATSDR 2021 T4-2 | REAL |
| molar volume | ~230 cm³/mol | = MW/ρ (derived) | REAL(derived) |
| vapour pressure | 0.017 mmHg @20 °C (extrap.) | ATSDR 2021 T4-2 | REAL |
| Henry const | 0.362 Pa·m³/mol | ATSDR 2021 T4-2 | REAL |
| pKa | −0.5 | Goss, ES&T 41 (2007) 3225 | REAL |
| pKa (alt) | 1.30 / 2.80 | Kutsuna & Hori 2008 / Moody & Field 2000 | REAL |
| log Kow | 6.3 (ill-defined for surfactant) | ILO-WHO ICSC #1613 (CC-BY) | REAL(caveat) |
| water solubility | 9.5×10³ mg/L @25 °C | ATSDR 2021 (neutral acid: 3300 Inoue 2011; 4340 Rahman 2014) | REAL |
| CMC | ~3000 mg/L (100 mM NaCl) | Costanza et al. (ES&T Lett. 2024) — aggregates, not micelles | REAL |
| **Stokes radius** | — | not located free; vdW radius >4.0 Å drives steric rejection | **FLAG** |
| **D_aq** | — | estimate Wilke–Chang from molar volume at curation | **FLAG** |
| **COSMO / PC-SAFT** | — | perfluoro; specialised PFAS-SAFT exists; no adopted set | **FLAG** |

### PFOS (1763-23-1, MW 500.13) — C8 sulfonate, permanent anion
| property | value | primary / source | status |
|---|---|---|---|
| melting point | ≥400 °C (K salt) | ATSDR 2021 T4-2 | REAL |
| vapour pressure | 2.48×10⁻⁶ mmHg @20 °C (K salt) | ATSDR 2021 T4-2 | REAL |
| pKa | <1.0 | Cheng et al., J. Phys. Chem. A 113 (2009) 8152 | REAL |
| pKa (est.) | 0.14 | ATSDR 2021 | REAL |
| water solubility | 570 mg/L pure water (K salt) | Brooke et al. 2004 (UK EA); also 680@25 °C, 519@20 °C, 12.4 seawater | REAL |
| log Kow | not applicable (ionic) | ATSDR 2021 | REAL |
| **molar volume** | — | no free-acid density in ATSDR → not derivable | **FLAG** |
| **Stokes radius / D_aq** | — | not located free; estimate at curation | **FLAG** |
| **COSMO / PC-SAFT** | — | perfluoro | **FLAG** |

### PFBA (375-22-4, MW 214.04) — C4 carboxylate, LOW-rejection contrast
| property | value | primary / source | status |
|---|---|---|---|
| melting point | −17.5 °C | ATSDR 2021 T4-2 | REAL |
| boiling point | 121 °C | ATSDR 2021 T4-2 | REAL |
| density | 1.651 g/cm³ @20 °C | ATSDR 2021 T4-2 | REAL |
| molar volume | ~129.6 cm³/mol | = MW/ρ (derived) | REAL(derived) |
| vapour pressure | 44 mmHg @56 °C | ATSDR 2021 T4-2 | REAL |
| Henry const | 1.24 Pa·m³/mol | ATSDR 2021 T4-2 | REAL |
| pKa | <1.6 (est. ~0.4) | ITRC/ATSDR (PFCA class) | REAL |
| log Kow | 1.05 (estimated) | ITRC | REAL(est) |
| water solubility | 3.3×10³ mg/L @25 °C | ATSDR 2021 T4-2 | REAL |
| **Stokes radius / D_aq** | — | not located free; small → weak steric, charge-driven | **FLAG** |
| **COSMO / PC-SAFT** | — | perfluoro | **FLAG** |

### PFBS (375-73-5, MW 300.10) — C4 sulfonate, LOW-rejection challenge
| property | value | primary / source | status |
|---|---|---|---|
| pKa | <1.6 → ~0.14 est. | ATSDR 2021 (PFSA stronger than PFCA) | REAL |
| water solubility | 52.6 g/L @22.5–24 °C (K salt) | ITRC/ATSDR | REAL |
| log Koc | 1.2–2.7 (high mobility) | ITRC | REAL |
| log Kow | not applicable (ionic) | — | REAL |
| **bulk (mp/bp/ρ/VP)** | — | no data in ATSDR (salt-dominated) | **FLAG** |
| **Stokes radius / D_aq** | — | not located free | **FLAG** |
| **COSMO / PC-SAFT** | — | perfluoro | **FLAG** |

---

## B) Volatile / bio molecules (full VLE set)

Primary VLE from **NIST Chemistry WebBook** (SRD 69, free view) with the primary
author it lists cited per value. Densities from **PubChem** experimental records.

### nPropanol (71-23-8, MW 60.096) — COMPLETE
| property | value | primary (via NIST WebBook free) | status |
|---|---|---|---|
| Tc | 536.9 K | avg 20 vals (Ambrose & Townsend 1963: 536.71) | REAL |
| Pc | 52.0 bar | avg 12 vals | REAL |
| ω | 0.620 | Poling/Reid tabulation | REAL(re-cite pending) |
| Tb | 370.3 K | avg 127 vals | REAL |
| Hvap(Tb) | 41.44 kJ/mol | Majer & Svoboda 1985 | REAL |
| Vliq | 7.48×10⁻⁵ m³/mol | ρ=0.8035 g/cm³ (PubChem) | REAL |
| ΔfH°(g) | −256 kJ/mol | NIST avg 7 vals | REAL |
| S°(g) | 322.49 J/mol/K | Chao J. 1986 | REAL |
| Antoine | 4.87601 / 1441.629 / −74.299 (333–378 K) | Ambrose & Sprake, J. Chem. Thermodyn. 2 (1970) 631 | REAL |
| Cp_ig poly | 2.470 + 0.3325 T − 1.855e-4 T² + 4.296e-8 T³ | Poling/Reid | REAL(re-cite pending) |
| Cp_liq | ~144 J/mol/K | textbook @298 | FLAG(re-cite) |
| COSMO | in VT-2005 + LVPP (InChIKey BDERNNFJNOPAEC) | not transcribed | **FLAG** |
| PC-SAFT (2B) | m 2.9997, σ 3.2522 Å, ε/k 233.40, εAB/k 2276.8, κAB 0.015268 | Gross & Sadowski, IECR 41 (2002) 5510 | REAL(comment) |

### limonene (5989-27-5, MW 136.234)
| property | value | primary | status |
|---|---|---|---|
| Tb | 450 K | NIST avg 18 vals | REAL |
| Hvap | 49.5@298 … 37.9@470 kJ/mol | Clara et al. 2009 / Steele et al. 2002 | REAL |
| Vliq | 1.620×10⁻⁴ m³/mol | ρ=0.8411 g/cm³ | REAL |
| ΔfH°(liq) | −54.52 kJ/mol | Hawkins & Eriksen 1954 / Cox & Pilcher 1970 (NIST) | REAL |
| ΔfH°(g) | ≈ −5.0 kJ/mol | DERIVED (liq + Hvap 298) | REAL(derived) |
| **Tc / Pc / ω** | — | Steele, Chirico et al., J. Chem. Eng. Data 47 (2002) 689 (paywalled) | **FLAG** |
| **Antoine** | — | Steele 2002 (paywalled) | **FLAG** |
| **COSMO / PC-SAFT** | — | InChIKey XMGQYMWWDOXHJM; LVPP/CHAOS at curation | **FLAG** |

### alphaPinene (80-56-8, MW 136.234)
| property | value | primary | status |
|---|---|---|---|
| Tb | 430 K | NIST avg 14 vals | REAL |
| Antoine | 3.92161 / 1411.869 / −68.817 (293–429 K) | Hawkins & Armstrong 1954 (NIST) | REAL |
| Hvap(298) | 44.6 kJ/mol | An, Hu et al. 1987 (calorimetric) | REAL |
| Vliq | 1.588×10⁻⁴ m³/mol | ρ=0.858 g/cm³ | REAL |
| **ΔfH° / Tc / Pc / ω** | — | not on free NIST; Joback POOR (bridged bicyclic) | **FLAG** |
| **COSMO / PC-SAFT** | — | InChIKey GRWFGVWFFZKLTI | **FLAG** |

### HMF (67-47-0, MW 126.11) — data-poor
| property | value | primary | status |
|---|---|---|---|
| Tfus | 308.5 K (dfusH 19.8 kJ/mol) | Verevkin, Emel'yanenko et al. 2009 (DSC) | REAL |
| Hvap/sub | 83.4 kJ/mol @314–368 K | Verevkin et al. 2009 (gas saturation) | REAL |
| reduced bp | 388.2 K @0.001 bar | Weast & Grasselli 1989 | REAL |
| **Tb / Tc / Pc / ω / Antoine** | — | decomposes near bp; not free | **FLAG** |
| **ΔfH°** | — | Verevkin 2009 reports dHf(cr)+dHf(g) (paywalled table) | **FLAG** |
| **COSMO / PC-SAFT** | — | InChIKey NOEGNKMFWQHSLB | **FLAG** |

### furfurylAlcohol (98-00-0, MW 98.10)
| property | value | primary | status |
|---|---|---|---|
| Tb | 443 K (170 °C) | handbook standard (NIST free noisy) | REAL |
| Hvap | 53.6 kJ/mol @319 K | Stephenson & Malanowski 1987 | REAL |
| Hvap(298) | 64.4 kJ/mol | Landrieu et al. 1929 (alt.) | REAL |
| Vliq | 8.70×10⁻⁵ m³/mol | ρ=1.128 g/cm³ | REAL |
| **ΔfH° / Tc / Pc / ω / Antoine** | — | subscription TRC only | **FLAG** |
| **COSMO / PC-SAFT** | — | InChIKey XPFVYQJUAUNWIW | **FLAG** |

### gammaValerolactone (108-29-2, MW 100.117)
| property | value | primary | status |
|---|---|---|---|
| Tb | 480.7 K | NIST (Aldrich 1990) | REAL |
| Antoine | 3.48604 / 1315.022 / −105.793 (311–481 K) | Stull 1947 (NIST) | REAL |
| Hvap | 53.9 kJ/mol @276–350 K | Emel'yanenko, Kozlova et al. 2008 | REAL |
| Vliq | 9.52×10⁻⁵ m³/mol | ρ=1.0518 g/cm³ | REAL |
| **ΔfH° / Tc / Pc / ω** | — | Emel'yanenko 2008/Leitao 1990 report dHf (paywalled) | **FLAG** |
| **COSMO / PC-SAFT** | — | InChIKey GAEKPEKOJKCEMS | **FLAG** |

### levulinicAcid (123-76-2, MW 116.11) — Joback groups CLEAN
| property | value | primary | status |
|---|---|---|---|
| Tb | 518.7 K | NIST (Aldrich 1990) | REAL |
| Tfus | 308 K (dfusH 9.22 kJ/mol) | Buechner 1906/Berthelot 1897; Acree 1991 | REAL |
| Antoine | 6.63219 / 3152.908 / −43.564 (375–519 K) | Stull 1947 (NIST) | REAL |
| Hvap | 74.4 kJ/mol @390 K | Stephenson & Malanowski 1987 | REAL |
| Vliq | 1.019×10⁻⁴ m³/mol | ρ=1.14 g/cm³ | REAL |
| Tc / Pc / ω | via `bin/estimate` (Joback, Choupo's own) | legally-clean estimate route | curate |
| **ΔfH°** | — | not free NIST; combustion data exist in primaries | **FLAG** |
| **COSMO / PC-SAFT** | — | InChIKey JOOXCMJARBKPKM | **FLAG** |

---

## FLAGGED summary (needs curation before promotion)

- **All PFAS (×4):** Stokes radius + aqueous D + COSMO/PC-SAFT — the membrane
  transport radii/diffusivities were not found in a free primary; route =
  Wilke–Chang estimate from molar volume + a dedicated NF paper. PFOS/PFBS
  free-acid bulk props absent (salt-dominated literature).
- **limonene:** Tc/Pc/ω + Antoine — Steele 2002 (paywalled).
- **alphaPinene:** Tc/Pc/ω + ΔfH°.
- **HMF:** Tb/Tc/Pc/ω/Antoine + ΔfH° (decomposes; sparse free data).
- **furfurylAlcohol:** Tc/Pc/ω + Antoine + ΔfH° (TRC subscription).
- **gammaValerolactone:** Tc/Pc/ω + ΔfH°.
- **levulinicAcid:** ΔfH° (Tc/Pc/ω obtainable via Joback — groups are clean).
- **COSMO-SAC σ-profiles:** NOT transcribed for ANY compound — 51-float
  transcription = fabrication risk. Route recorded per file: LVPP (github
  lvpp/sigma) / VT-2005 (NIST bundle) / CHAOS lookup by InChIKey at curation.
- **PC-SAFT:** only nPropanol has an adopted published set (Gross & Sadowski
  2002); all others FLAGGED.

## Legal notes
- ATSDR Toxicological Profile (2021) and NIST WebBook free view = US-gov public
  domain; PubChem PUG-View = public domain; ICSC = CC-BY. Primary author
  re-cited per value where the compilation names it.
- No paywalled numeric value (Steele 2002, TRC, Verevkin tables) was copied —
  those are FLAGGED with the citation as the route, not the value.
