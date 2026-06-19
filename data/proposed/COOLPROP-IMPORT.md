# CoolProp 7.2.0 import -- proposal tier (STAGE-ONLY)

- Source: CoolProp 7.2.0 (MIT); pure-fluid properties from the published reference EOS per fluid.
- Fluids processed: **124**  ->  **13 NEW** (`data/proposed/components/`), **105 COLLISION** (`data/proposed/_coolprop_review/`, non-destructive), **6 skipped**.
- Formation properties (dHf, s_298) and group decompositions are NOT in CoolProp -> omitted (documented gap).
- Vapour pressure: 3-param Antoine FITTED to the EOS saturation curve (AAD per row). Cp: polynomials fitted to EOS cp0 / sat-liquid cp.
- Triple-point T,P stored in a `sublimation{}` block (anchors only; no Hsub -> no curve drawn).
- NOTHING committed; NOTHING promoted to `data/standards/`.

## NEW fluids (data/proposed/components/)

| name | CoolProp | MW | Tc/K | Pc/bar | omega | Tb/K | VP AAD% | EOS |
|---|---|---|---|---|---|---|---|---|
| 1Butene | 1-Butene | 56.11 | 419.29 | 40.057 | 0.1919 | 266.8 | 0.69 | Lemmon-FPE-2005 |
| D2 | Deuterium | 4.03 | 38.34 | 16.796 | -0.1363 | 23.7 | 0.63 | Richardson-JPCRD-2013 |
| Dichloroethane | Dichloroethane | 98.96 | 561.58 | 52.261 | 0.2686 | 356.6 | 0.63 | Thol-THESIS-2015 |
| ethane | Ethane | 30.07 | 305.32 | 48.722 | 0.0990 | 184.6 | 0.71 | Buecker-JPCRD-2006 |
| Ethylene | Ethylene | 28.05 | 282.35 | 50.417 | 0.0866 | 169.4 | 0.72 | Smukala-JPCRD-2000 |
| nButane | n-Butane | 58.12 | 425.13 | 37.960 | 0.2008 | 272.7 | 0.63 | Buecker-JPCRD-2006B |
| neon | Neon | 20.18 | 44.40 | 26.616 | -0.0355 | 27.1 | 0.39 | Thol-JPCRD-2019-Neon |
| nOctane | n-Octane | 114.23 | 568.74 | 24.836 | 0.3975 | 398.8 | 0.49 | Beckmueller-IJT-2019-octane |
| OrthoDeuterium | OrthoDeuterium | 4.03 | 38.34 | 16.796 | -0.1363 | 23.7 | 0.63 | Richardson-JPCRD-2013 |
| OrthoHydrogen | OrthoHydrogen | 2.02 | 33.22 | 13.098 | -0.2186 | 20.4 | 0.68 | Leachman-JPCRD-2009 |
| ParaDeuterium | ParaDeuterium | 4.03 | 38.34 | 16.796 | -0.1363 | 23.7 | 0.63 | Richardson-JPCRD-2013 |
| ParaHydrogen | ParaHydrogen | 2.02 | 32.94 | 12.858 | -0.2190 | 20.3 | 0.67 | Leachman-JPCRD-2009 |
| Propylene | Propylene | 42.08 | 364.21 | 45.550 | 0.1460 | 225.5 | 0.67 | Lemmon-PROPYLENE-2013 |

## COLLISIONS (data/proposed/_coolprop_review/ -- existing file preserved)

These names already exist in `data/standards/` or `data/proposed/components/`. The CoolProp-anchored version is staged in `_coolprop_review/` for human comparison; the existing curated/scrubbed file was left untouched. Review and decide per file.

| name | CoolProp | Tc/K | Pc/bar | omega | Tb/K | VP AAD% | EOS |
|---|---|---|---|---|---|---|---|
| acetone | Acetone | 508.10 | 46.924 | 0.3071 | 329.2 | 0.63 | Lemmon-JCED-2006 |
| Ar | Argon | 150.69 | 48.630 | -0.0022 | 87.3 | 0.41 | Tegeler-JPCRD-1999 |
| benzene | Benzene | 562.02 | 49.063 | 0.2108 | 353.2 | 0.67 | Thol-HTHP-2012 |
| carbonylSulfide | CarbonylSulfide | 378.77 | 63.688 | 0.0978 | 223.0 | 0.70 | Lemmon-JCED-2006 |
| CH4 | Methane | 190.56 | 45.992 | 0.0114 | 111.7 | 0.65 | Setzmann-JPCRD-1991 |
| cis2Butene | cis-2-Butene | 435.75 | 42.360 | 0.2024 | 276.9 | 0.65 | Lemmon-FPE-2005 |
| CO | CarbonMonoxide | 132.86 | 34.982 | 0.0497 | 81.6 | 0.54 | Lemmon-JCED-2006 |
| CO2 | CarbonDioxide | 304.13 | 73.773 | 0.2239 | subl. | 0.16 | Span-JPCRD-1996 |
| cyclohexane | CycloHexane | 553.60 | 40.805 | 0.2093 | 353.9 | 0.56 | Zhou-JPCRD-2014 |
| cyclopentane | Cyclopentane | 511.72 | 45.828 | 0.2019 | 322.4 | 0.71 | Gedanitz-JCED-2015 |
| cyclopropane | CycloPropane | 398.69 | 56.053 | 0.1305 | subl. | 0.20 | Polt-CT-1992 |
| decamethylcyclopentasiloxane | D5 | 618.30 | 10.777 | 0.6309 | 484.1 | 1.23 | Thol-FPE-2019-siloxanes |
| diethylEther | DiethylEther | 467.90 | 37.173 | 0.2816 | 307.6 | 0.45 | Thol-IJT-2014 |
| dimethylCarbonate | DimethylCarbonate | 557.00 | 49.088 | 0.3460 | 363.3 | 0.78 | Zhou-JPCRD-2011 |
| dimethylEther | DimethylEther | 400.38 | 53.367 | 0.1960 | 248.4 | 0.62 | Wu-JPCRD-2011 |
| dodecamethylcyclohexasiloxane | D6 | 645.76 | 9.614 | 0.7360 | 518.1 | 1.21 | Colonna-FPE-2008 |
| ethanol | Ethanol | 514.71 | 62.679 | 0.6440 | 351.6 | 1.40 | Schroeder-JPCRD-2014 |
| ethylBenzene | EthylBenzene | 617.12 | 36.224 | 0.3040 | 409.3 | 0.58 | Zhou-JPCRD-2012 |
| ethyleneOxide | EthyleneOxide | 468.92 | 73.047 | 0.2102 | 283.7 | 0.75 | Thol-CES-2015,Thol-CES-2015-CORR,Thol-THESIS-2015 |
| fluorine | Fluorine | 144.41 | 52.395 | 0.0449 | 85.0 | 0.66 | deReuck-BOOK-1990 |
| H2 | Hydrogen | 33.14 | 12.964 | -0.2190 | 20.4 | 0.70 | Leachman-JPCRD-2009 |
| H2S | HydrogenSulfide | 373.10 | 89.989 | 0.1005 | 212.9 | 0.56 | Lemmon-JCED-2006 |
| HCl | HydrogenChloride | 324.68 | 83.135 | 0.1297 | 188.2 | 0.72 | Thol-JCED-2018-HCl |
| He | Helium | 5.20 | 2.283 | -0.3835 | 4.2 | 0.65 | OrtizVega-JPCRD-2019 |
| heavyWater | HeavyWater | 643.85 | 216.618 | 0.3642 | 374.5 | 0.55 | Herrig-JPCRD-2019 |
| hexamethyldisiloxane | MM | 518.70 | 19.311 | 0.4180 | 373.7 | 0.60 | Thol-FPE-2016-MM,Thol-THESIS-2015 |
| hfe143m | HFE143m | 377.92 | 36.449 | 0.2889 | 249.6 | 0.31 | Akasaka-IJR-2012 |
| isoButane | IsoButane | 407.81 | 36.290 | 0.1835 | 261.4 | 0.61 | Buecker-JPCRD-2006B |
| isoButene | IsoButene | 418.09 | 40.157 | 0.1926 | 266.1 | 0.66 | Lemmon-FPE-2005 |
| isohexane | Isohexane | 497.70 | 30.427 | 0.2797 | 333.4 | 0.54 | Lemmon-JCED-2006 |
| isopentane | Isopentane | 460.35 | 33.782 | 0.2274 | 301.0 | 0.60 | Lemmon-JCED-2006 |
| krypton | Krypton | 209.48 | 55.254 | -0.0009 | 119.7 | 0.43 | Lemmon-JCED-2006 |
| MD2M | MD2M | 599.40 | 11.440 | 0.6354 | 467.6 | 1.18 | Thol-JCED-2017-siloxanes |
| MD3M | MD3M | 628.00 | 9.540 | 0.7296 | 503.0 | 1.40 | Thol-FPE-2019-siloxanes |
| MD4M | MD4M | 653.20 | 8.286 | 0.8001 | 532.8 | 2.07 | Thol-FPE-2019-siloxanes |
| MDM | MDM | 565.36 | 14.375 | 0.5281 | 425.6 | 0.83 | Thol-JCED-2017-siloxanes |
| methanol | Methanol | 513.38 | 82.159 | 0.5649 | 337.6 | 0.33 | deReuck-BOOK-1993 |
| methylLinoleate | MethylLinoleate | 799.00 | 13.408 | 0.8054 | 628.8 | 1.14 | Huber-EF-2009 |
| methylLinolenate | MethylLinolenate | 772.00 | 13.690 | 1.1426 | 629.1 | 1.46 | Huber-EF-2009 |
| methylOleate | MethylOleate | 782.00 | 12.460 | 0.9058 | 627.2 | 1.49 | Huber-EF-2009 |
| methylPalmitate | MethylPalmitate | 755.00 | 13.500 | 0.9103 | 602.3 | 1.34 | Huber-EF-2009 |
| methylStearate | MethylStearate | 775.00 | 12.390 | 1.0176 | 629.6 | 1.54 | Huber-EF-2009 |
| mXylene | m-Xylene | 616.89 | 35.346 | 0.3260 | 412.2 | 0.53 | Zhou-JPCRD-2012 |
| N2 | Nitrogen | 126.19 | 33.958 | 0.0372 | 77.4 | 0.57 | Span-JPCRD-2000 |
| N2O | NitrousOxide | 309.52 | 72.448 | 0.1613 | 184.7 | 0.37 | Lemmon-JCED-2006 |
| nDecane | n-Decane | 617.70 | 21.013 | 0.4884 | 447.3 | 0.57 | Lemmon-JCED-2006 |
| nDodecane | n-Dodecane | 658.10 | 18.176 | 0.5742 | 489.4 | 0.68 | Lemmon-EF-2004 |
| neopentane | Neopentane | 433.74 | 31.963 | 0.1961 | 282.7 | 0.37 | Lemmon-JCED-2006 |
| NH3 | Ammonia | 405.56 | 113.634 | 0.2557 | 239.8 | 0.54 | Gao-JPCRD-2020 |
| nHeptane | n-Heptane | 541.23 | 27.738 | 0.3490 | 371.5 | 0.51 | Span-IJT-2003B |
| nHexane | n-Hexane | 507.82 | 30.441 | 0.3003 | 341.9 | 0.52 | Thol-FPE-2019-alkanes-hexane |
| nNonane | n-Nonane | 594.55 | 22.819 | 0.4433 | 423.9 | 0.54 | Lemmon-JCED-2006 |
| novec649 | Novec649 | 441.81 | 18.690 | 0.4710 | 322.2 | 0.56 | McLinden-JCED-2015-Novec649 |
| nPentane | n-Pentane | 469.70 | 33.675 | 0.2510 | 309.2 | 0.55 | Thol-FPE-2019-alkanes-pentane |
| nUndecane | n-Undecane | 638.80 | 19.905 | 0.5390 | 468.9 | 0.71 | Aleksandrov-TE-2011 |
| O2 | Oxygen | 154.60 | 50.464 | 0.0222 | 90.2 | 0.74 | Schmidt-FPE-1985,Stewart-JPCRD-1991 |
| octamethylcyclotetrasiloxane | D4 | 586.50 | 13.472 | 0.5981 | 448.9 | 0.55 | Thol-THESIS-2015 |
| oXylene | o-Xylene | 630.26 | 37.375 | 0.3120 | 417.5 | 0.63 | Zhou-JPCRD-2012 |
| propane | n-Propane | 369.89 | 42.512 | 0.1521 | 231.0 | 0.65 | Lemmon-JCED-2009 |
| propyne | Propyne | 402.70 | 56.575 | 0.2040 | subl. | 0.11 | Polt-CT-1992 |
| pXylene | p-Xylene | 616.17 | 35.315 | 0.3240 | 411.5 | 0.70 | Zhou-JPCRD-2012 |
| R11 | R11 | 471.11 | 44.076 | 0.1888 | 296.9 | 0.61 | Jacobsen-FPE-1992 |
| R113 | R113 | 487.21 | 33.923 | 0.2525 | 320.7 | 0.58 | Marx-BOOK-1992 |
| R114 | R114 | 420.61 | 33.525 | 0.2523 | 276.7 | 0.30 | Platzer-BOOK-1990 |
| R115 | R115 | 353.10 | 31.292 | 0.2484 | 233.9 | 0.55 | Lemmon-JCED-2016-365227 |
| R116 | R116 | 293.03 | 30.477 | 0.2566 | 195.1 | 0.40 | Lemmon-JCED-2006 |
| R12 | R12 | 385.12 | 41.362 | 0.1795 | 243.4 | 0.64 | Marx-BOOK-1992 |
| R123 | R123 | 456.83 | 36.618 | 0.2819 | 301.0 | 0.54 | Younglove-JPCRD-1994 |
| R1233zdE | R1233zd(E) | 439.60 | 36.237 | 0.3025 | 291.4 | 0.57 | Mondejar-JCED-2015-R1233zdE |
| R1234yf | R1234yf | 367.85 | 33.822 | 0.2760 | 243.7 | 0.36 | Richter-JCED-2011 |
| R1234zeE | R1234ze(E) | 382.51 | 36.349 | 0.3131 | 254.2 | 0.59 | Thol-IJT-2016-R1234zeE |
| R1234zeZ | R1234ze(Z) | 423.27 | 35.306 | 0.3268 | 282.9 | 0.27 | Akasaka-JCED-2019 |
| R124 | R124 | 395.43 | 36.245 | 0.2881 | 261.2 | 0.50 | deVries-ICR-1995 |
| R1243zf | R1243zf | 376.93 | 35.179 | 0.2604 | 247.7 | 0.39 | Akasaka-JCED-2019 |
| R125 | R125 | 339.18 | 36.183 | 0.3052 | 225.1 | 0.48 | Lemmon-JPCRD-2005 |
| R13 | R13 | 303.05 | 39.731 | 0.1746 | 191.7 | 0.62 | Platzer-BOOK-1990 |
| R1336mzzE | R1336mzz(E) | 403.53 | 27.790 | 0.4128 | 281.0 | 0.51 | Akasaka-IJT-2023 |
| R134a | R134a | 374.21 | 40.593 | 0.3268 | 247.1 | 0.52 | TillnerRoth-JPCRD-1994 |
| R13I1 | R13I1 | 396.44 | 39.525 | 0.1762 | 251.3 | 0.51 | Lemmon-JCED-2016-365227 |
| R14 | R14 | 227.40 | 37.625 | 0.1785 | 145.1 | 0.53 | Platzer-BOOK-1990 |
| R141b | R141b | 477.50 | 42.117 | 0.2195 | 305.2 | 0.54 | Lemmon-JCED-2006 |
| R142b | R142b | 410.26 | 40.548 | 0.2321 | 264.0 | 0.57 | Lemmon-JCED-2006 |
| R143a | R143a | 345.86 | 37.618 | 0.2615 | 225.9 | 0.62 | LemmonJacobsen-JPCRD-2000 |
| R152a | R152A | 386.41 | 45.167 | 0.2752 | 249.1 | 0.61 | Outcalt-JPCRD-1996-R152A |
| R161 | R161 | 375.25 | 50.100 | 0.2162 | 235.6 | 0.58 | Wu-IJT-2012 |
| R21 | R21 | 452.72 | 52.885 | 0.2061 | 282.0 | 0.46 | Platzer-BOOK-1990 |
| R218 | R218 | 345.02 | 26.402 | 0.3172 | 236.4 | 0.47 | Lemmon-JCED-2006 |
| R22 | R22 | 369.30 | 49.900 | 0.2208 | 232.3 | 0.59 | Kamei-IJT-1995 |
| R227EA | R227EA | 374.90 | 29.252 | 0.3576 | 256.8 | 0.44 | Lemmon-JCED-2016-365227 |
| R23 | R23 | 299.29 | 48.317 | 0.2630 | 191.1 | 0.61 | Penoncello-JPCRD-2003 |
| R236EA | R236EA | 412.41 | 34.137 | 0.3682 | 279.3 | 0.45 | Rui-FPE-2013 |
| R236FA | R236FA | 398.07 | 31.909 | 0.3769 | 271.7 | 0.58 | Pan-FPE-2012 |
| R245ca | R245ca | 447.57 | 39.407 | 0.3546 | 298.4 | 0.63 | Zhou-IJT-2016-R245ca |
| R245fa | R245fa | 427.01 | 36.510 | 0.3776 | 288.2 | 0.43 | Akasaka-JPCRD-2015-R245fa |
| R32 | R32 | 351.26 | 57.826 | 0.2769 | 221.5 | 0.65 | TillnerRoth-JPCRD-1997 |
| R365MFC | R365MFC | 460.00 | 32.664 | 0.3774 | 313.3 | 0.60 | Lemmon-JCED-2016-365227 |
| R40 | R40 | 418.63 | 69.290 | 0.1501 | 249.2 | 0.48 | Thol-IJT-2014 |
| R41 | R41 | 317.28 | 59.061 | 0.2004 | 194.8 | 0.81 | Lemmon-JCED-2006 |
| RC318 | RC318 | 388.37 | 27.775 | 0.3553 | 267.2 | 0.36 | Platzer-BOOK-1990 |
| SF6 | SulfurHexafluoride | 318.72 | 37.550 | 0.2100 | subl. | 0.18 | Guder-JPCRD-2009 |
| SO2 | SulfurDioxide | 430.64 | 78.866 | 0.2561 | 263.1 | 0.52 | Gao-JCED-2016 |
| toluene | Toluene | 591.75 | 41.263 | 0.2657 | 383.7 | 0.70 | Lemmon-JCED-2006 |
| trans2Butene | trans-2-Butene | 428.61 | 40.191 | 0.2101 | 274.0 | 0.65 | Lemmon-FPE-2005 |
| water | Water | 647.10 | 220.640 | 0.3443 | 373.1 | 0.57 | Wagner-JPCRD-2002 [sanitised] |
| Xe | Xenon | 289.73 | 58.419 | 0.0036 | 165.1 | 0.41 | Lemmon-JCED-2006 |

## Skipped

- SES36: pseudo-pure (mixture) -- not a component
- R410A: pseudo-pure (mixture) -- not a component
- R507A: pseudo-pure (mixture) -- not a component
- R404A: pseudo-pure (mixture) -- not a component
- R407C: pseudo-pure (mixture) -- not a component
- Air: pseudo-pure (mixture) -- not a component
