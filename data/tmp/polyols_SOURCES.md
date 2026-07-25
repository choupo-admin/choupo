# Polyols (sugar alcohols) -- provenance for candidate enrichment

Compounds: sorbitol, mannitol, xylitol, erythritol.
Tier: PRIVATE (data/tmp, gitignored). Values are FACTS, one PRIMARY per value.
Curated 2026-07-24. NIST WebBook free view is used only to reach the PRIMARY it cites.

Legend: [OK] promoted, primary-cited real value; [FLAG] not filled / not fabricated.

---

## sorbitol (C6H14O6, CAS 50-70-4, CID 5780, InChIKey FBPFZTCFMRRESA-JGWLITMVSA-N)

| Property | Value | Primary source | Status |
|---|---|---|---|
| dHf_298 (cr) | -1353.7 +/- 1.4 kJ/mol | Gerasimov, Blokh & Gubareva, Izv. Vyssh. Uchebn. Zaved. Khim. Khim. Tekhnol. 28 (1985) 54 (combustion) | [OK] |
| Cp,solid(298.15) | 241.43 J/mol/K | Lian, Chen, Suurkuusk & Wadsoe, Acta Chem. Scand. A36 (1982) 735 | [OK] |
| S_298 (cr) | -- | not in NIST WebBook; needs low-T adiabatic calorimetry | [FLAG] |
| Cp(T) curve | -- | Della Gatta group (Thermochim. Acta 2021) | [FLAG] |
| density | 1.489 g/cm3 | CRC Handbook 79th ed.; PubChem CID 5780 | [OK] |
| meltingPoint | 99-101 C | CRC 79th; Merck Index 12th | [OK] |
| solubility | ~2350 g/L (70% w/v) @25C | Merck Index 12th | [OK] |
| solidMolarVolume | 122.3 cm3/mol | M/rho (Choupo calc) | [OK, derived] |
| equivSphereRadius | 0.365 nm | (3Vm/4piNA)^1/3 (Choupo geom.) | [OK, estimate] |
| D_aq(25C) | ~0.67e-9 m2/s | Stokes-Einstein (Choupo) | [OK, estimate] |
| D_aq experimental | -- | Paduano, Sartorio, Vitagliano & Costantino, J. Solution Chem. (Gouy) | [FLAG paywall] |
| COSMO-SAC sigma-profile | -- | LVPP (lvpp/sigma, MIT) / VT-2005 (NIST) by InChIKey | [FLAG] |
| PC-SAFT (m,sigma,eps,eps_AB,kappa_AB) | -- | Carneiro, Held, Rodriguez, Sadowski & Macedo, J. Phys. Chem. B 117 (2013) 9980 | [FLAG paywall] |

## mannitol (C6H14O6, CAS 69-65-8, CID 6251, InChIKey FBPFZTCFMRRESA-KVTDHHQDSA-N)

| Property | Value | Primary source | Status |
|---|---|---|---|
| dHf_298 (cr) | -1337.5 kJ/mol (corrob. -1337.2 +/- 0.79) | McClaine PhD Thesis, Stanford (1947); Parks, West, Naylor, Fujii & McClaine, JACS 68 (1946) 2524 | [OK] |
| S_298 (cr) | 238.5 J/mol/K | Parks, Kelley & Huffman, JACS 51 (1929) 1969 | [OK] |
| Cp,solid(298.15) | 239.00 J/mol/K | Lian, Chen, Suurkuusk & Wadsoe, Acta Chem. Scand. A36 (1982) 735 | [OK] |
| dHfus / Tfus | 54.69 +/- 1.64 kJ/mol @ 437.25 K | Xu, Chen et al., J. Chem. Eng. Data (2010), doi 10.1021/je900285w (DSC) | [OK] |
| density | 1.514 g/cm3 | CRC 79th; PubChem CID 6251 | [OK] |
| meltingPoint | 165-169 C | CRC 79th; Merck 12th | [OK] |
| solubility | ~216 g/L @25C | Merck Index 12th | [OK] |
| solidMolarVolume | 120.3 cm3/mol | M/rho (Choupo) | [OK, derived] |
| equivSphereRadius | 0.362 nm | Choupo geom. | [OK, estimate] |
| D_aq(25C) | ~0.68e-9 m2/s | Stokes-Einstein (Choupo) | [OK, estimate] |
| D_aq experimental | ~0.66e-9 m2/s (approx) | Ribeiro et al., "Diffusion coefficient of mannitol in water at infinite dilution" (Taylor); Longsworth, JACS 75 (1953) 5705 | [FLAG exact paywall] |
| COSMO-SAC | -- | LVPP / VT-2005 by InChIKey | [FLAG] |
| PC-SAFT | -- | Carneiro et al., J. Phys. Chem. B 117 (2013) 9980 | [FLAG paywall] |

## xylitol (C5H12O5, CAS 87-99-0, CID 6912, InChIKey HEBKCHPVOIAQTA-NGQZWQHPSA-N)

| Property | Value | Primary source | Status |
|---|---|---|---|
| dHf_298 (cr) | -1219.3 +/- 0.3 kJ/mol | Tong, Tan, Shi, Li, Yue & Wang, Thermochim. Acta 457 (2007) 20-26 (O2 bomb; dcH=-2463.2 kJ/mol) | [OK -- SOLID, resolves prior liquid-only note] |
| dHf_298 (liquid, superseded) | -1118.6 +/- 0.63 kJ/mol | Oberemok-Yakubova & Balandin, Bull. Acad. Sci. USSR Div. Chem. Sci. (1963) 2038 | (historical) |
| Cp,solid(T) 80-390 K | measured (exact 298 value not extracted) | Tong et al., Thermochim. Acta 457 (2007) 20 (adiabatic) | [FLAG exact] |
| S_298 (cr) | derived in Tong 2007 (not extracted) | Tong et al. 2007 | [FLAG exact] |
| dHfus / Tfus | 37.4 kJ/mol @ 365.7 K (33.26 @369K, Tong) | Barone & Della Gatta 1990; Domalski & Hearing, J. Phys. Chem. Ref. Data 25 (1996) 1 | [OK] |
| density | 1.52 g/cm3 | CRC 79th; PubChem CID 6912 | [OK] |
| meltingPoint | 92-96 C (365.7 K) | NIST/TRC; Merck 12th | [OK] |
| solubility | very soluble (~640 g/L) | Merck Index 12th | [OK approx; exact FLAG] |
| solidMolarVolume | 100.1 cm3/mol | M/rho (Choupo) | [OK, derived] |
| equivSphereRadius | 0.341 nm | Choupo geom. | [OK, estimate] |
| D_aq(25C) | ~0.72e-9 m2/s | Stokes-Einstein (Choupo) | [OK, estimate] |
| D_aq experimental | -- | Kimura et al., Bull. Chem. Soc. Jpn. 63 (1990) 533 | [FLAG paywall] |
| COSMO-SAC | -- | LVPP / VT-2005 by InChIKey | [FLAG] |
| PC-SAFT | -- | Carneiro et al., J. Phys. Chem. B 117 (2013) 9980 | [FLAG paywall] |

## erythritol (C4H10O4, CAS 149-32-6, CID 222285, InChIKey UNXHWFMMPAWVPI-ZXZARUISSA-N)

| Property | Value | Primary source | Status |
|---|---|---|---|
| dHf_298 (cr) | -885.21 kJ/mol | Parks & Manchester, JACS 74 (1952) 3435 (combustion; via NIST condensed-phase) | [OK -- cite corrected from Parks 1946 to Parks & Manchester 1952] |
| S_298 (cr) | 166.5 J/mol/K | Parks, Kelley & Huffman, JACS 51 (1929) 1969 | [OK] |
| Cp,solid | 161.9 J/mol/K @291.7K; 170.7 @303K | Parks & Anderson, JACS 48 (1926) 1506; Spaght, Thomas & Parks, J. Phys. Chem. 36 (1932) 882 | [OK; Cp(298) interpolation FLAG] |
| hydrodynamicRadius | 0.34 +/- 0.01 nm | Song, Marsh et al., Atmos. Meas. Tech. 11 (2018) 4809 | [OK -- MEASURED] |
| density | 1.45 g/cm3 | CRC 79th; PubChem CID 222285 | [OK] |
| meltingPoint | 118-121 C | CRC 79th; Merck 12th | [OK] |
| solubility | ~61 g/100 mL @25C | Merck Index 12th | [OK] |
| solidMolarVolume | 84.2 cm3/mol | M/rho (Choupo) | [OK, derived] |
| equivSphereRadius | 0.322 nm (agrees w/ measured 0.34) | Choupo geom. | [OK, estimate] |
| D_aq(25C) | ~0.76e-9 m2/s (measured ~0.9) | Stokes-Einstein (Choupo, r=0.34nm) | [OK, estimate] |
| D_aq experimental | -- | Longsworth, JACS 75 (1953) 5705; Kimura et al., BCSJ 63 (1990) 533 | [FLAG paywall] |
| COSMO-SAC | -- | LVPP / VT-2005 by InChIKey | [FLAG] |
| PC-SAFT | -- | Held & Sadowski framework (confirm erythritol fitted) | [FLAG] |

---

## Notes / method

- Stokes-Einstein D = kT/(6 pi eta r), T=298.15 K, eta(water,25C)=0.890e-3 Pa s,
  kT=4.1155e-21 J => kT/(6 pi eta)=2.453e-19 m. r = equivalent-sphere radius from
  the SOLID molar volume (M/rho), r=(3 Vm / 4 pi NA)^(1/3). These are GLASS-BOX
  Choupo estimates (labelled), NOT measured; SE with a hard-sphere radius
  underestimates D for small solutes by ~20-40%, so measured D run higher.
- Erythritol is the one polyol with a directly MEASURED hydrodynamic radius
  (0.34 nm, Song et al. 2018); its equivalent-sphere radius (0.322 nm) corroborates.
- COSMO-SAC and PC-SAFT: profiles/params EXIST in open sources (LVPP MIT / VT-2005
  NIST public-domain; Carneiro/Held/Sadowski 2013) but the numeric 51-pt profiles
  and (m,sigma,eps,eps_AB,kappa_AB) sets were NOT extracted at curation time and are
  FLAGGED -- never fabricated. Match by InChIKey when promoting.
- All four take referenceState pureSolid (decompose/melt low; NF solute carries no
  energy balance -- water dominates Cp), consistent with glucose.dat / fructose.dat.
