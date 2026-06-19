# Promotion candidates -- RE-RANKED after CoolProp import + refresh

Supersedes the pre-import hand-built list. Deterministic re-rank by `bin/curate/rank_candidates.py`. **Promotes nothing** -- review and run the (commented) `mv` per file.

Score = provenance tier (CoolProp 100 / literature 60 / Joback 30) + validation (30 - 3*AAD%, PASS; -25 DROP) + completeness (6 per of idealGasCp / liquidCp / gibbsFormation / groups / curated-sublimation) + 12 if a teaching staple. "compl" column = blocks-present count.

## Track NEW -- clean ADD to data/standards/ (no existing standard)

| name | score | tier | valid | AAD% | compl | primary citation |
|---|---|---|---|---|---|---|
| hfe143m | 154 | CoolProp-measured | PASS | 0.07 | 4 | Akasaka-IJR-2012 |
| R1234zeZ | 154 | CoolProp-measured | PASS | 0.11 | 4 | Akasaka-JCED-2019 |
| R236FA | 154 | CoolProp-measured | PASS | 0.14 | 4 | Pan-FPE-2012 |
| nOctane | 153 | CoolProp-measured | PASS | 0.20 | 2 | Beckmueller-IJT-2019-octane |
| nUndecane | 153 | CoolProp-measured | PASS | 0.23 | 4 | Aleksandrov-TE-2011 |
| R227EA | 153 | CoolProp-measured | PASS | 0.24 | 4 | Lemmon-JCED-2016-365227 |
| R40 | 153 | CoolProp-measured | PASS | 0.27 | 4 | Thol-IJT-2014 |
| R1234zeE | 153 | CoolProp-measured | PASS | 0.32 | 4 | Thol-IJT-2016-R1234zeE |
| R1233zdE | 153 | CoolProp-measured | PASS | 0.33 | 4 | Mondejar-JCED-2015-R1233zdE |
| nDodecane | 153 | CoolProp-measured | PASS | 0.34 | 4 | Lemmon-EF-2004 |
| isoButane | 153 | CoolProp-measured | PASS | 0.35 | 4 | Buecker-JPCRD-2006B |
| R13 | 153 | CoolProp-measured | PASS | 0.35 | 4 | Platzer-BOOK-1990 |
| R218 | 153 | CoolProp-measured | PASS | 0.35 | 4 | Lemmon-JCED-2006 |
| nButane | 153 | CoolProp-measured | PASS | 0.36 | 2 | Buecker-JPCRD-2006B |
| novec649 | 153 | CoolProp-measured | PASS | 0.36 | 4 | McLinden-JCED-2015-Novec649 |
| R1234yf | 153 | CoolProp-measured | PASS | 0.37 | 4 | Richter-JCED-2011 |
| R124 | 153 | CoolProp-measured | PASS | 0.37 | 4 | deVries-ICR-1995 |
| R13I1 | 153 | CoolProp-measured | PASS | 0.38 | 4 | Lemmon-JCED-2016-365227 |
| R143a | 153 | CoolProp-measured | PASS | 0.38 | 4 | LemmonJacobsen-JPCRD-2000 |
| R115 | 153 | CoolProp-measured | PASS | 0.39 | 4 | Lemmon-JCED-2016-365227 |
| R141b | 153 | CoolProp-measured | PASS | 0.39 | 4 | Lemmon-JCED-2006 |
| R245ca | 153 | CoolProp-measured | PASS | 0.39 | 4 | Zhou-IJT-2016-R245ca |
| R123 | 153 | CoolProp-measured | PASS | 0.40 | 4 | Younglove-JPCRD-1994 |
| ethylBenzene | 153 | CoolProp-measured | PASS | 0.41 | 4 | Zhou-JPCRD-2012 |
| R125 | 153 | CoolProp-measured | PASS | 0.42 | 4 | Lemmon-JPCRD-2005 |
| RC318 | 153 | CoolProp-measured | PASS | 0.42 | 4 | Platzer-BOOK-1990 |
| trans2Butene | 153 | CoolProp-measured | PASS | 0.42 | 4 | Lemmon-FPE-2005 |
| R1243zf | 153 | CoolProp-measured | PASS | 0.43 | 4 | Akasaka-JCED-2019 |
| R142b | 153 | CoolProp-measured | PASS | 0.43 | 4 | Lemmon-JCED-2006 |
| R11 | 153 | CoolProp-measured | PASS | 0.44 | 4 | Jacobsen-FPE-1992 |
| R134a | 153 | CoolProp-measured | PASS | 0.44 | 4 | TillnerRoth-JPCRD-1994 |
| R113 | 153 | CoolProp-measured | PASS | 0.45 | 4 | Marx-BOOK-1992 |
| R114 | 153 | CoolProp-measured | PASS | 0.46 | 4 | Platzer-BOOK-1990 |
| R116 | 153 | CoolProp-measured | PASS | 0.46 | 4 | Lemmon-JCED-2006 |
| R152a | 153 | CoolProp-measured | PASS | 0.46 | 4 | Outcalt-JPCRD-1996-R152A |
| R161 | 153 | CoolProp-measured | PASS | 0.46 | 4 | Wu-IJT-2012 |
| R365MFC | 153 | CoolProp-measured | PASS | 0.46 | 4 | Lemmon-JCED-2016-365227 |
| cis2Butene | 153 | CoolProp-measured | PASS | 0.47 | 4 | Lemmon-FPE-2005 |
| R12 | 153 | CoolProp-measured | PASS | 0.47 | 4 | Marx-BOOK-1992 |
| R23 | 152 | CoolProp-measured | PASS | 0.52 | 4 | Penoncello-JPCRD-2003 |
| cyclopentane | 152 | CoolProp-measured | PASS | 0.53 | 4 | Gedanitz-JCED-2015 |
| dimethylEther | 152 | CoolProp-measured | PASS | 0.53 | 4 | Wu-JPCRD-2011 |
| isoButene | 152 | CoolProp-measured | PASS | 0.53 | 4 | Lemmon-FPE-2005 |
| R22 | 152 | CoolProp-measured | PASS | 0.53 | 4 | Kamei-IJT-1995 |
| R245fa | 152 | CoolProp-measured | PASS | 0.53 | 4 | Akasaka-JPCRD-2015-R245fa |
| R21 | 152 | CoolProp-measured | PASS | 0.56 | 4 | Platzer-BOOK-1990 |
| R32 | 152 | CoolProp-measured | PASS | 0.56 | 4 | TillnerRoth-JPCRD-1997 |
| R236EA | 152 | CoolProp-measured | PASS | 0.57 | 4 | Rui-FPE-2013 |
| methylLinoleate | 152 | CoolProp-measured | PASS | 0.64 | 4 | Huber-EF-2009 |
| R14 | 152 | CoolProp-measured | PASS | 0.65 | 4 | Platzer-BOOK-1990 |
| ethane | 152 | CoolProp-measured | PASS | 0.75 | 2 | Buecker-JPCRD-2006 |
| fluorine | 152 | CoolProp-measured | PASS | 0.77 | 4 | deReuck-BOOK-1990 |
| ethyleneOxide | 152 | CoolProp-measured | PASS | 0.78 | 4 | Thol-CES-2015,Thol-CES-2015-CORR,Thol-THESIS-2015 |
| R41 | 152 | CoolProp-measured | PASS | 0.80 | 4 | Lemmon-JCED-2006 |
| methylPalmitate | 151 | CoolProp-measured | PASS | 1.14 | 4 | Huber-EF-2009 |
| methylOleate | 150 | CoolProp-measured | PASS | 1.18 | 4 | Huber-EF-2009 |
| methylLinolenate | 149 | CoolProp-measured | PASS | 1.59 | 4 | Huber-EF-2009 |
| methylStearate | 149 | CoolProp-measured | PASS | 1.68 | 4 | Huber-EF-2009 |
| octamethylcyclotetrasiloxane | 142 | CoolProp-measured | PASS | 0.07 | 2 | Thol-THESIS-2015 |
| R1336mzzE | 142 | CoolProp-measured | PASS | 0.14 | 2 | Akasaka-IJT-2023 |
| hexamethyldisiloxane | 141 | CoolProp-measured | PASS | 0.18 | 2 | Thol-FPE-2016-MM,Thol-THESIS-2015 |
| neon | 141 | CoolProp-measured | PASS | 0.23 | 2 | Thol-JPCRD-2019-Neon |
| dodecamethylcyclohexasiloxane | 141 | CoolProp-measured | PASS | 0.33 | 2 | Colonna-FPE-2008 |
| MD4M | 141 | CoolProp-measured | PASS | 0.45 | 2 | Thol-FPE-2019-siloxanes |
| krypton | 141 | CoolProp-measured | PASS | 0.46 | 2 | Lemmon-JCED-2006 |
| MD3M | 141 | CoolProp-measured | PASS | 0.48 | 2 | Thol-FPE-2019-siloxanes |
| ParaHydrogen | 140 | CoolProp-measured | PASS | 0.52 | 2 | Leachman-JPCRD-2009 |
| Propylene | 140 | CoolProp-measured | PASS | 0.52 | 2 | Lemmon-PROPYLENE-2013 |
| Dichloroethane | 140 | CoolProp-measured | PASS | 0.54 | 2 | Thol-THESIS-2015 |
| 1Butene | 140 | CoolProp-measured | PASS | 0.55 | 2 | Lemmon-FPE-2005 |
| Xe | 140 | CoolProp-measured | PASS | 0.56 | 2 | Lemmon-JCED-2006 |
| heavyWater | 140 | CoolProp-measured | PASS | 0.57 | 2 | Herrig-JPCRD-2019 |
| OrthoHydrogen | 140 | CoolProp-measured | PASS | 0.59 | 2 | Leachman-JPCRD-2009 |
| decamethylcyclopentasiloxane | 140 | CoolProp-measured | PASS | 0.67 | 2 | Thol-FPE-2019-siloxanes |
| MDM | 140 | CoolProp-measured | PASS | 0.68 | 2 | Thol-JCED-2017-siloxanes |
| MD2M | 140 | CoolProp-measured | PASS | 0.73 | 2 | Thol-JCED-2017-siloxanes |
| carbonylSulfide | 140 | CoolProp-measured | PASS | 0.77 | 2 | Lemmon-JCED-2006 |
| dimethylCarbonate | 140 | CoolProp-measured | PASS | 0.77 | 2 | Zhou-JPCRD-2011 |
| D2 | 140 | CoolProp-measured | PASS | 0.79 | 2 | Richardson-JPCRD-2013 |
| Ethylene | 140 | CoolProp-measured | PASS | 0.79 | 2 | Smukala-JPCRD-2000 |
| OrthoDeuterium | 140 | CoolProp-measured | PASS | 0.79 | 2 | Richardson-JPCRD-2013 |
| ParaDeuterium | 140 | CoolProp-measured | PASS | 0.79 | 2 | Richardson-JPCRD-2013 |
| butene1 | 120 | literature | PASS | 0.00 | 3 | (unspecified) |
| onePropanol | 120 | literature | PASS | 0.00 | 3 | (unspecified) |
| cumene | 119 | literature | PASS | 0.18 | 3 | (unspecified) |
| chloroform | 119 | literature | PASS | 0.19 | 3 | (unspecified) |
| cyclopropane | 119 | CoolProp-measured | — | — | 4 | Polt-CT-1992 |
| propyne | 119 | CoolProp-measured | — | — | 4 | Polt-CT-1992 |
| chlorobenzene | 118 | literature | PASS | 0.53 | 3 | (unspecified) |
| styrene | 118 | literature | PASS | 0.61 | 3 | (unspecified) |
| nitrobenzene | 118 | literature | PASS | 0.71 | 3 | (unspecified) |
| mtbe | 118 | literature | PASS | 0.73 | 3 | (unspecified) |
| carbonTetrachloride | 118 | literature | PASS | 0.74 | 3 | (unspecified) |
| ethyleneGlycol | 114 | literature | PASS | 2.02 | 3 | (unspecified) |
| twoPropanol | 114 | literature | PASS | 2.14 | 3 | (unspecified) |
| pyridine | 113 | literature | PASS | 2.19 | 3 | (unspecified) |
| acetonitrile | 113 | literature | PASS | 2.43 | 3 | (unspecified) |
| methylcyclohexane | 113 | literature | PASS | 2.45 | 3 | (unspecified) |
| methylEthylKetone | 112 | literature | PASS | 2.75 | 3 | (unspecified) |
| tetrahydrofuran | 111 | literature | PASS | 2.88 | 3 | (unspecified) |
| dichloroethane12 | 108 | literature | PASS | 0.02 | 3 | (unspecified) |
| indane | 108 | literature | PASS | 0.04 | 3 | (unspecified) |
| propylAcetate | 108 | literature | PASS | 0.06 | 3 | (unspecified) |
| nonadecane | 108 | literature | PASS | 0.07 | 3 | (unspecified) |
| butyne1 | 108 | literature | PASS | 0.10 | 3 | (unspecified) |
| twoButanol | 107 | literature | PASS | 0.20 | 3 | (unspecified) |
| twoPentanone | 107 | literature | PASS | 0.20 | 3 | (unspecified) |
| morpholine | 107 | literature | PASS | 0.21 | 3 | (unspecified) |
| alphaMethylStyrene | 107 | literature | PASS | 0.31 | 3 | (unspecified) |
| phenol | 107 | literature | PASS | 4.31 | 3 | (unspecified) |
| butadiene13 | 107 | literature | PASS | 0.33 | 3 | (unspecified) |
| SF6 | 107 | CoolProp-measured | — | — | 2 | Guder-JPCRD-2009 |
| twoMethylpentane | 107 | literature | PASS | 0.37 | 3 | (unspecified) |
| naphthalene | 107 | literature | PASS | 0.38 | 3 | (unspecified) |
| nonane | 107 | literature | PASS | 0.40 | 3 | (unspecified) |
| propylbenzene | 106 | literature | PASS | 0.51 | 3 | (unspecified) |
| piperidine | 106 | literature | PASS | 0.55 | 3 | (unspecified) |
| undecane | 106 | literature | PASS | 0.55 | 3 | (unspecified) |
| vinylChloride | 106 | literature | PASS | 0.55 | 3 | (unspecified) |
| isooctane | 106 | literature | PASS | 0.66 | 3 | (unspecified) |
| heptane | 106 | literature | PASS | 0.77 | 3 | (unspecified) |
| dioxane14 | 106 | literature | PASS | 4.80 | 3 | (unspecified) |
| heptadecane | 106 | literature | PASS | 0.83 | 3 | (unspecified) |
| dimethylPhthalate | 105 | literature | PASS | 0.84 | 3 | (unspecified) |
| butylAcetate | 105 | literature | PASS | 0.94 | 3 | (unspecified) |
| hydroquinone | 105 | literature | PASS | 1.00 | 3 | (unspecified) |
| acetophenone | 105 | literature | PASS | 1.03 | 3 | (unspecified) |
| threeMethylpentane | 105 | literature | PASS | 1.04 | 3 | (unspecified) |
| tridecane | 105 | literature | PASS | 1.12 | 3 | (unspecified) |
| resorcinol | 104 | literature | PASS | 1.30 | 3 | (unspecified) |
| onePropanethiol | 104 | literature | PASS | 1.32 | 3 | (unspecified) |
| pentanal | 104 | literature | PASS | 1.42 | 3 | (unspecified) |
| allylAlcohol | 104 | literature | PASS | 1.48 | 3 | (unspecified) |
| pentan3one | 103 | literature | PASS | 1.59 | 3 | (unspecified) |
| decalin | 103 | literature | PASS | 1.61 | 3 | (unspecified) |
| pentadecane | 103 | literature | PASS | 1.64 | 3 | (unspecified) |
| ethylamine | 103 | literature | PASS | 1.67 | 3 | (unspecified) |
| octadecane | 103 | literature | PASS | 1.73 | 3 | (unspecified) |
| ethanethiol | 103 | literature | PASS | 1.77 | 3 | (unspecified) |
| benzylChloride | 102 | literature | PASS | 1.85 | 3 | (unspecified) |
| tertButanol | 102 | literature | PASS | 1.86 | 3 | (unspecified) |
| triethylamine | 102 | literature | PASS | 2.01 | 3 | (unspecified) |
| methanethiol | 102 | literature | PASS | 2.07 | 3 | (unspecified) |
| biphenyl | 101 | literature | PASS | 2.21 | 3 | (unspecified) |
| trimethylamine | 101 | literature | PASS | 2.21 | 3 | (unspecified) |
| tetralin | 101 | literature | PASS | 2.25 | 3 | (unspecified) |
| pyrrolidine | 101 | literature | PASS | 2.26 | 3 | (unspecified) |
| dodecane | 101 | literature | PASS | 2.28 | 3 | (unspecified) |
| isobutylAcetate | 101 | literature | PASS | 2.37 | 3 | (unspecified) |
| isobutanol | 101 | literature | PASS | 2.39 | 3 | (unspecified) |
| vinylAcetate | 100 | literature | PASS | 2.52 | 3 | (unspecified) |
| onePentene | 100 | literature | PASS | 2.75 | 3 | (unspecified) |
| ethylAcrylate | 100 | literature | PASS | 2.76 | 3 | (unspecified) |
| propyleneOxide | 99 | literature | PASS | 2.92 | 3 | (unspecified) |
| twoMethoxyethanol | 99 | literature | PASS | 2.93 | 3 | (unspecified) |
| anisole | 97 | literature | PASS | 3.52 | 3 | (unspecified) |
| benzylAlcohol | 97 | literature | PASS | 3.53 | 3 | (unspecified) |
| indene | 97 | literature | PASS | 3.72 | 3 | (unspecified) |
| methylAcrylate | 97 | literature | PASS | 3.78 | 3 | (unspecified) |
| epichlorohydrin | 97 | literature | PASS | 3.82 | 3 | (unspecified) |
| methylAcetate | 96 | literature | PASS | 3.89 | 3 | (unspecified) |
| dimethylamine | 96 | literature | PASS | 3.92 | 3 | (unspecified) |
| dichloroethane11 | 96 | literature | PASS | 3.96 | 3 | (unspecified) |
| dichloropropane12 | 96 | literature | PASS | 3.99 | 3 | (unspecified) |
| propyleneGlycol | 96 | literature | PASS | 4.06 | 3 | (unspecified) |
| nitroethane | 95 | literature | PASS | 4.19 | 3 | (unspecified) |
| benzoicAcid | 95 | literature | PASS | 4.25 | 3 | (unspecified) |
| amylAcetate | 95 | literature | PASS | 4.27 | 3 | (unspecified) |
| diisopropylEther | 95 | literature | PASS | 4.34 | 3 | (unspecified) |
| eicosane | 95 | literature | PASS | 4.34 | 3 | (unspecified) |
| trichloroethylene | 94 | literature | PASS | 4.76 | 3 | (unspecified) |
| hexadecane | 94 | literature | PASS | 4.78 | 3 | (unspecified) |
| dimethylFormamide | 89 | literature | PASS | 4.17 | 0 | (unspecified) |
| ethylFormate | 87 | literature | PASS | 1.15 | 0 | (unspecified) |
| aceticAnhydride | 86 | literature | PASS | 1.39 | 0 | (unspecified) |
| methylFormate | 85 | literature | PASS | 1.74 | 0 | (unspecified) |
| anthracene | 73 | literature | — | — | 3 | (unspecified) |
| benzonitrile | 73 | literature | — | — | 3 | (unspecified) |
| butanal | 73 | literature | — | — | 3 | (unspecified) |
| butanediol14 | 73 | literature | — | — | 3 | (unspecified) |
| caproicAcid | 73 | literature | — | — | 3 | (unspecified) |
| cyclopentanone | 73 | literature | — | — | 3 | (unspecified) |
| cyclopentene | 73 | literature | — | — | 3 | (unspecified) |
| decene1 | 73 | literature | — | — | 3 | (unspecified) |
| diacetyl | 73 | literature | — | — | 3 | (unspecified) |
| diethyleneGlycol | 73 | literature | — | — | 3 | (unspecified) |
| diethylSulfide | 73 | literature | — | — | 3 | (unspecified) |
| diketene | 73 | literature | — | — | 3 | (unspecified) |
| dimethylDisulfide | 73 | literature | — | — | 3 | (unspecified) |
| dimethylSulfide | 73 | literature | — | — | 3 | (unspecified) |
| diphenylmethane | 73 | literature | — | — | 3 | (unspecified) |
| ethylcyclohexane | 73 | literature | — | — | 3 | (unspecified) |
| ethylTertButylEther | 73 | literature | — | — | 3 | (unspecified) |
| furan | 73 | literature | — | — | 3 | (unspecified) |
| gammaButyrolactone | 73 | literature | — | — | 3 | (unspecified) |
| guaiacol | 73 | literature | — | — | 3 | (unspecified) |
| heptanol1 | 73 | literature | — | — | 3 | (unspecified) |
| heptene1 | 73 | literature | — | — | 3 | (unspecified) |
| hexanal | 73 | literature | — | — | 3 | (unspecified) |
| hexanol1 | 73 | literature | — | — | 3 | (unspecified) |
| hexene1 | 73 | literature | — | — | 3 | (unspecified) |
| hexyne1 | 73 | literature | — | — | 3 | (unspecified) |
| isoprene | 73 | literature | — | — | 3 | (unspecified) |
| lacticAcid | 73 | literature | — | — | 3 | (unspecified) |
| malonicAcid | 73 | literature | — | — | 3 | (unspecified) |
| methylBenzoate | 73 | literature | — | — | 3 | (unspecified) |
| nMethylpyrrolidone | 73 | literature | — | — | 3 | (unspecified) |
| oneNonene | 73 | literature | — | — | 3 | (unspecified) |
| oneOctanol | 73 | literature | — | — | 3 | (unspecified) |
| oneOctene | 73 | literature | — | — | 3 | (unspecified) |
| onePentanol | 73 | literature | — | — | 3 | (unspecified) |
| onePentyne | 73 | literature | — | — | 3 | (unspecified) |
| pentadiene13 | 73 | literature | — | — | 3 | (unspecified) |
| piperazine | 73 | literature | — | — | 3 | (unspecified) |
| propanal | 73 | literature | — | — | 3 | (unspecified) |
| propanediol13 | 73 | literature | — | — | 3 | (unspecified) |
| propylamine | 73 | literature | — | — | 3 | (unspecified) |
| tetrahydropyran | 73 | literature | — | — | 3 | (unspecified) |
| thiophene | 73 | literature | — | — | 3 | (unspecified) |
| triethanolamine | 73 | literature | — | — | 3 | (unspecified) |
| triethyleneGlycol | 73 | literature | — | — | 3 | (unspecified) |
| twoEthylhexanoicAcid | 73 | literature | — | — | 3 | (unspecified) |
| twoEthylhexanol | 73 | literature | — | — | 3 | (unspecified) |
| twoMethylfuran | 73 | literature | — | — | 3 | (unspecified) |
| twoMethyltetrahydrofuran | 73 | literature | — | — | 3 | (unspecified) |
| twoMethylTwoButene | 73 | literature | — | — | 3 | (unspecified) |
| twoPicoline | 73 | literature | — | — | 3 | (unspecified) |
| valericAcid | 73 | literature | — | — | 3 | (unspecified) |
| dimethylSulfoxide | 71 | Joback-estimated | PASS | 0.20 | 0 | (unspecified) |
| aniline | 65 | literature | DROP | 5.10 | 3 | (unspecified) |
| dichloromethane | 65 | literature | DROP | 8.70 | 3 | (unspecified) |
| glycerol | 65 | literature | DROP | 12.42 | 3 | (unspecified) |
| methylIsobutylKetone | 65 | literature | DROP | 10.02 | 3 | (unspecified) |
| formicAcid | 59 | literature | DROP | 6.29 | 2 | (unspecified) |
| benzaldehyde | 55 | literature | — | — | 0 | (unspecified) |
| carbonDisulfide | 55 | Joback-estimated | PASS | 1.82 | 0 | (unspecified) |
| acetaldehyde | 53 | literature | DROP | 13.58 | 3 | (unspecified) |
| acetamide | 53 | literature | DROP | 5.62 | 3 | (unspecified) |
| acrolein | 53 | literature | DROP | 5.22 | 3 | (unspecified) |
| acrylicAcid | 53 | literature | DROP | 6.34 | 3 | (unspecified) |
| acrylonitrile | 53 | literature | DROP | 12.46 | 3 | (unspecified) |
| adipicAcid | 53 | literature | DROP | 86.91 | 3 | (unspecified) |
| adiponitrile | 53 | literature | DROP | 23.84 | 3 | (unspecified) |
| allylChloride | 53 | literature | DROP | 10.55 | 3 | (unspecified) |
| butylamine | 53 | literature | DROP | 15.99 | 3 | (unspecified) |
| butyricAcid | 53 | literature | DROP | 20.79 | 3 | (unspecified) |
| catechol | 53 | literature | DROP | 21.20 | 3 | (unspecified) |
| chlorobutane1 | 53 | literature | DROP | 9.36 | 3 | (unspecified) |
| cyclohexanol | 53 | literature | DROP | 6.28 | 3 | (unspecified) |
| cyclohexanone | 53 | literature | DROP | 34.55 | 3 | (unspecified) |
| cyclohexene | 53 | literature | DROP | 8.46 | 3 | (unspecified) |
| cyclohexylamine | 53 | literature | DROP | 13.63 | 3 | (unspecified) |
| cyclopentadiene13 | 53 | literature | DROP | 5.64 | 3 | (unspecified) |
| decane | 53 | literature | DROP | 11.62 | 3 | (unspecified) |
| diethanolamine | 53 | literature | DROP | 15.96 | 3 | (unspecified) |
| diethylamine | 53 | literature | DROP | 5.05 | 3 | (unspecified) |
| dimethoxyethane12 | 53 | literature | DROP | 7.40 | 3 | (unspecified) |
| ethylenediamine | 53 | literature | DROP | 42.80 | 3 | (unspecified) |
| hexamethyleneDiamine | 53 | literature | DROP | 20.70 | 3 | (unspecified) |
| isopropylAcetate | 53 | literature | DROP | 10.57 | 3 | (unspecified) |
| mCresol | 53 | literature | DROP | 5.74 | 3 | (unspecified) |
| mesitylene | 53 | literature | DROP | 5.49 | 3 | (unspecified) |
| mesitylOxide | 53 | literature | DROP | 10.97 | 3 | (unspecified) |
| methacrylicAcid | 53 | literature | DROP | 7.54 | 3 | (unspecified) |
| methylamine | 53 | literature | DROP | 7.09 | 3 | (unspecified) |
| methylMethacrylate | 53 | literature | DROP | 17.88 | 3 | (unspecified) |
| nitromethane | 53 | literature | DROP | 7.79 | 3 | (unspecified) |
| nMethylaniline | 53 | literature | DROP | 7.38 | 3 | (unspecified) |
| nnDimethylacetamide | 53 | literature | DROP | 38.21 | 3 | (unspecified) |
| nnDimethylaniline | 53 | literature | DROP | 5.52 | 3 | (unspecified) |
| oCresol | 53 | literature | DROP | 18.85 | 3 | (unspecified) |
| oDichlorobenzene | 53 | literature | DROP | 38.91 | 3 | (unspecified) |
| oToluidine | 53 | literature | DROP | 7.29 | 3 | (unspecified) |
| pCresol | 53 | literature | DROP | 22.65 | 3 | (unspecified) |
| propadiene | 53 | literature | DROP | 37.14 | 3 | (unspecified) |
| propionicAcid | 53 | literature | DROP | 21.61 | 3 | (unspecified) |
| propionitrile | 53 | literature | DROP | 6.84 | 3 | (unspecified) |
| quinoline | 53 | literature | DROP | 6.38 | 3 | (unspecified) |
| tetrachloroethylene | 53 | literature | DROP | 9.81 | 3 | (unspecified) |
| tetradecane | 53 | literature | DROP | 6.49 | 3 | (unspecified) |
| trichloroethane111 | 53 | literature | DROP | 9.48 | 3 | (unspecified) |
| twoEthoxyethanol | 53 | literature | DROP | 19.89 | 3 | (unspecified) |
| sES36 | 51 | unattributed | PASS | 0.16 | 1 | (unspecified) |
| furfural | 47 | literature | DROP | 24.09 | 0 | (unspecified) |
| ethyleneCarbonate | 25 | Joback-estimated | — | — | 0 | (unspecified) |
| formamide | 25 | Joback-estimated | — | — | 0 | (unspecified) |
| propyleneCarbonate | 25 | Joback-estimated | — | — | 0 | (unspecified) |
| sulfolane | 25 | Joback-estimated | — | — | 0 | (unspecified) |
| maleicAnhydride | 5 | Joback-estimated | DROP | 20.56 | 0 | (unspecified) |

### Promotion commands (top of NEW, awaiting GO -- uncomment to run)

```sh
# mv data/proposed/components/hfe143m.dat data/standards/components/
# mv data/proposed/components/R1234zeZ.dat data/standards/components/
# mv data/proposed/components/R236FA.dat data/standards/components/
# mv data/proposed/components/nOctane.dat data/standards/components/
# mv data/proposed/components/nUndecane.dat data/standards/components/
# mv data/proposed/components/R227EA.dat data/standards/components/
# mv data/proposed/components/R40.dat data/standards/components/
# mv data/proposed/components/R1234zeE.dat data/standards/components/
# mv data/proposed/components/R1233zdE.dat data/standards/components/
# mv data/proposed/components/nDodecane.dat data/standards/components/
# mv data/proposed/components/isoButane.dat data/standards/components/
# mv data/proposed/components/R13.dat data/standards/components/
# mv data/proposed/components/R218.dat data/standards/components/
# mv data/proposed/components/nButane.dat data/standards/components/
# mv data/proposed/components/novec649.dat data/standards/components/
# mv data/proposed/components/R1234yf.dat data/standards/components/
# mv data/proposed/components/R124.dat data/standards/components/
# mv data/proposed/components/R13I1.dat data/standards/components/
# mv data/proposed/components/R143a.dat data/standards/components/
# mv data/proposed/components/R115.dat data/standards/components/
# mv data/proposed/components/R141b.dat data/standards/components/
# mv data/proposed/components/R245ca.dat data/standards/components/
# mv data/proposed/components/R123.dat data/standards/components/
# mv data/proposed/components/ethylBenzene.dat data/standards/components/
# mv data/proposed/components/R125.dat data/standards/components/
```

## Track REPLACE -- a frozen standard already exists (side-by-side review first)

Promoting these OVERWRITES a committee-managed standard. Some standards cite excluded sources (e.g. `acetone` cites NIST WebBook + Poling) and a clean CoolProp file is a genuine fix; others may already be good. **Diff each against its standard before deciding.**

| name | score | tier | valid | AAD% | compl | primary citation |
|---|---|---|---|---|---|---|
| acetone | 165 | CoolProp-measured | PASS | 0.47 | 4 | Lemmon-JCED-2006 |
| nHexane | 159 | CoolProp-measured | PASS | 0.17 | 3 | Thol-FPE-2019-alkanes-hexane |
| methanol | 159 | CoolProp-measured | PASS | 0.44 | 3 | deReuck-BOOK-1993 |
| toluene | 159 | CoolProp-measured | PASS | 0.48 | 3 | Lemmon-JCED-2006 |
| propane | 158 | CoolProp-measured | PASS | 0.51 | 3 | Lemmon-JCED-2009 |
| water | 158 | CoolProp-measured | PASS | 0.61 | 3 | CoolProp 7.2.0 reference EOS (citation in COOLPROP-IMPORT.md) |
| N2 | 158 | CoolProp-measured | PASS | 0.71 | 3 | Span-JPCRD-2000 |
| benzene | 158 | CoolProp-measured | PASS | 0.77 | 3 | Thol-HTHP-2012 |
| O2 | 157 | CoolProp-measured | PASS | 0.92 | 3 | Schmidt-FPE-1985,Stewart-JPCRD-1991 |
| ethanol | 157 | CoolProp-measured | PASS | 1.01 | 3 | Schroeder-JPCRD-2014 |
| He | 148 | CoolProp-measured | PASS | 0.08 | 3 | OrtizVega-JPCRD-2019 |
| Ar | 147 | CoolProp-measured | PASS | 0.32 | 3 | Tegeler-JPCRD-1999 |
| H2 | 146 | CoolProp-measured | PASS | 0.52 | 3 | Leachman-JPCRD-2009 |
| H2S | 146 | CoolProp-measured | PASS | 0.54 | 3 | Lemmon-JCED-2006 |
| N2O | 146 | CoolProp-measured | PASS | 0.61 | 3 | Lemmon-JCED-2006 |
| SO2 | 146 | CoolProp-measured | PASS | 0.62 | 3 | Gao-JCED-2016 |
| NH3 | 146 | CoolProp-measured | PASS | 0.66 | 3 | Gao-JPCRD-2020 |
| CO | 146 | CoolProp-measured | PASS | 0.74 | 3 | Lemmon-JCED-2006 |
| HCl | 145 | CoolProp-measured | PASS | 0.86 | 3 | Thol-JCED-2018-HCl |
| CH4 | 145 | CoolProp-measured | PASS | 0.88 | 3 | Setzmann-JPCRD-1991 |
| CO2 | 131 | CoolProp-measured | — | — | 4 | Span-JPCRD-1996 |
