# `data/proposed/` component VLE validation — Psat(Tb) self-check

Deterministic check by `bin/curate/validate_components.py`. The anchor needs no external data: a corresponding-states vapour-pressure model **must reproduce the compound's own normal boiling point** — at `Tb` the saturation pressure is 1 atm by definition. We compute `Psat(Tb)` with the same Ambrose-Walton formula the C++ op uses (`AmbroseWalton.cpp`, replicated bit-for-bit) from each file's own `Tc/Pc/omega`, and report

```
AAD% = |Psat(Tb) − 1 atm| / 1 atm × 100
```

**PASS** if `AAD ≤ 5%` (the Tc/Pc/omega/Tb quartet is internally consistent); **DROP** otherwise (inconsistent — not promotable; never guessed/patched). Antoine-model files use their own fit (a weaker self-check) and are listed `skip`; solids without a boiling point are `no-Tb`.

## Summary

| metric | value |
|---|---|
| files validated (AW + Antoine self-check) | 261 |
| — PASS (AAD ≤ 5%) | 208 |
| — DROP (AAD > 5%) | 53 |
| total files scanned | 359 |

## VP self-check candidates (AAD-ranked)

`model` = `AW` (Ambrose-Walton corresponding-states, from Tc/Pc/omega) or `Antoine` (the file's own live CoolProp-fitted Antoine coefficients).

| component | model | status | AAD % | Tb (K) | Psat(Tb)/atm |
|-----------|-------|--------|-------|--------|--------------|
| `onePropanol` | AW | PASS | 0.00 | 370.37 | 1.0000 |
| `butene1` | Antoine | PASS | 0.00 | 266.84 | 1.0000 |
| `dichloroethane12` | Antoine | PASS | 0.02 | 356.65 | 0.9998 |
| `indane` | AW | PASS | 0.04 | 449.15 | 0.9996 |
| `propylAcetate` | AW | PASS | 0.06 | 374.82 | 1.0006 |
| `nonadecane` | AW | PASS | 0.07 | 603.10 | 0.9993 |
| `hfe143m` | Antoine | PASS | 0.07 | 249.57 | 1.0007 |
| `octamethylcyclotetrasiloxane` | Antoine | PASS | 0.07 | 448.89 | 0.9993 |
| `He` | Antoine | PASS | 0.08 | 4.22 | 1.0008 |
| `butyne1` | AW | PASS | 0.10 | 281.23 | 1.0010 |
| `R1234zeZ` | Antoine | PASS | 0.11 | 282.88 | 1.0011 |
| `R1336mzzE` | Antoine | PASS | 0.14 | 281.02 | 0.9986 |
| `R236FA` | Antoine | PASS | 0.14 | 271.66 | 0.9986 |
| `sES36` | Antoine | PASS | 0.16 | 308.87 | 0.9984 |
| `nHexane` | Antoine | PASS | 0.17 | 341.87 | 0.9983 |
| `cumene` | AW | PASS | 0.18 | 425.37 | 0.9982 |
| `hexamethyldisiloxane` | Antoine | PASS | 0.18 | 373.66 | 0.9982 |
| `chloroform` | AW | PASS | 0.19 | 334.82 | 1.0019 |
| `twoButanol` | AW | PASS | 0.20 | 372.59 | 1.0020 |
| `nOctane` | Antoine | PASS | 0.20 | 398.79 | 0.9980 |
| `dimethylSulfoxide` | AW | PASS | 0.20 | 462.15 | 0.9980 |
| `twoPentanone` | AW | PASS | 0.20 | 374.82 | 0.9980 |
| `morpholine` | AW | PASS | 0.21 | 402.04 | 0.9979 |
| `nHeptane` | Antoine | PASS | 0.21 | 371.53 | 0.9979 |
| `isohexane` | Antoine | PASS | 0.23 | 333.36 | 0.9977 |
| `neon` | Antoine | PASS | 0.23 | 27.10 | 0.9977 |
| `mXylene` | Antoine | PASS | 0.23 | 412.21 | 0.9977 |
| `nUndecane` | Antoine | PASS | 0.23 | 468.93 | 0.9977 |
| `R227EA` | Antoine | PASS | 0.24 | 256.81 | 0.9976 |
| `nPentane` | Antoine | PASS | 0.25 | 309.21 | 0.9975 |
| `R40` | Antoine | PASS | 0.27 | 249.17 | 0.9973 |
| `nNonane` | Antoine | PASS | 0.29 | 423.91 | 0.9971 |
| `nDecane` | Antoine | PASS | 0.31 | 447.27 | 0.9969 |
| `alphaMethylStyrene` | AW | PASS | 0.31 | 438.71 | 1.0031 |
| `R1234zeE` | Antoine | PASS | 0.32 | 254.18 | 0.9968 |
| `Ar` | Antoine | PASS | 0.32 | 87.30 | 1.0032 |
| `butadiene13` | AW | PASS | 0.33 | 268.71 | 0.9967 |
| `dodecamethylcyclohexasiloxane` | Antoine | PASS | 0.33 | 518.11 | 1.0033 |
| `R1233zdE` | Antoine | PASS | 0.33 | 291.41 | 0.9967 |
| `nDodecane` | Antoine | PASS | 0.34 | 489.44 | 0.9966 |
| `isoButane` | Antoine | PASS | 0.35 | 261.40 | 0.9965 |
| `R13` | Antoine | PASS | 0.35 | 191.74 | 0.9965 |
| `R218` | Antoine | PASS | 0.35 | 236.36 | 0.9965 |
| `neopentane` | Antoine | PASS | 0.36 | 282.65 | 0.9964 |
| `isopentane` | Antoine | PASS | 0.36 | 300.98 | 0.9964 |
| `novec649` | Antoine | PASS | 0.36 | 322.20 | 0.9964 |
| `nButane` | Antoine | PASS | 0.36 | 272.66 | 0.9964 |
| `R1234yf` | Antoine | PASS | 0.37 | 243.66 | 0.9963 |
| `twoMethylpentane` | AW | PASS | 0.37 | 333.43 | 1.0037 |
| `R124` | Antoine | PASS | 0.37 | 261.19 | 0.9963 |
| `naphthalene` | AW | PASS | 0.38 | 490.93 | 0.9962 |
| `R143a` | Antoine | PASS | 0.38 | 225.91 | 0.9962 |
| `R13I1` | Antoine | PASS | 0.38 | 251.29 | 0.9962 |
| `R141b` | Antoine | PASS | 0.39 | 305.20 | 0.9961 |
| `R245ca` | Antoine | PASS | 0.39 | 298.41 | 0.9961 |
| `R115` | Antoine | PASS | 0.39 | 233.93 | 0.9961 |
| `nonane` | AW | PASS | 0.40 | 423.71 | 0.9960 |
| `R123` | Antoine | PASS | 0.40 | 300.97 | 0.9960 |
| `ethylBenzene` | Antoine | PASS | 0.41 | 409.31 | 0.9959 |
| `RC318` | Antoine | PASS | 0.42 | 267.18 | 0.9958 |
| `R125` | Antoine | PASS | 0.42 | 225.06 | 0.9958 |
| `trans2Butene` | Antoine | PASS | 0.42 | 274.03 | 0.9958 |
| `pXylene` | Antoine | PASS | 0.42 | 411.47 | 0.9958 |
| `R142b` | Antoine | PASS | 0.43 | 264.03 | 0.9957 |
| `R1243zf` | Antoine | PASS | 0.43 | 247.73 | 0.9957 |
| `methanol` | Antoine | PASS | 0.44 | 337.63 | 0.9956 |
| `R11` | Antoine | PASS | 0.44 | 296.86 | 0.9956 |
| `R134a` | Antoine | PASS | 0.44 | 247.08 | 0.9956 |
| `MD4M` | Antoine | PASS | 0.45 | 532.85 | 0.9955 |
| `R113` | Antoine | PASS | 0.45 | 320.74 | 0.9955 |
| `krypton` | Antoine | PASS | 0.46 | 119.73 | 1.0046 |
| `R365MFC` | Antoine | PASS | 0.46 | 313.34 | 0.9954 |
| `oXylene` | Antoine | PASS | 0.46 | 417.52 | 0.9954 |
| `R116` | Antoine | PASS | 0.46 | 195.06 | 0.9954 |
| `R114` | Antoine | PASS | 0.46 | 276.74 | 1.0046 |
| `R152a` | Antoine | PASS | 0.46 | 249.13 | 0.9954 |
| `R161` | Antoine | PASS | 0.46 | 235.60 | 0.9954 |
| `cis2Butene` | Antoine | PASS | 0.47 | 276.87 | 0.9953 |
| `acetone` | Antoine | PASS | 0.47 | 329.22 | 0.9953 |
| `R12` | Antoine | PASS | 0.47 | 243.40 | 0.9953 |
| `MD3M` | Antoine | PASS | 0.48 | 503.02 | 0.9952 |
| `toluene` | Antoine | PASS | 0.48 | 383.75 | 0.9952 |
| `diethylEther` | Antoine | PASS | 0.51 | 307.60 | 0.9949 |
| `propane` | Antoine | PASS | 0.51 | 231.04 | 0.9949 |
| `propylbenzene` | AW | PASS | 0.51 | 432.15 | 0.9949 |
| `H2` | Antoine | PASS | 0.52 | 20.37 | 0.9948 |
| `ParaHydrogen` | Antoine | PASS | 0.52 | 20.27 | 0.9948 |
| `Propylene` | Antoine | PASS | 0.52 | 225.53 | 0.9948 |
| `R23` | Antoine | PASS | 0.52 | 191.13 | 0.9948 |
| `R22` | Antoine | PASS | 0.53 | 232.34 | 0.9947 |
| `R245fa` | Antoine | PASS | 0.53 | 288.20 | 0.9947 |
| `cyclopentane` | Antoine | PASS | 0.53 | 322.40 | 0.9947 |
| `dimethylEther` | Antoine | PASS | 0.53 | 248.37 | 0.9947 |
| `chlorobenzene` | AW | PASS | 0.53 | 405.37 | 1.0053 |
| `isoButene` | Antoine | PASS | 0.53 | 266.15 | 0.9947 |
| `Dichloroethane` | Antoine | PASS | 0.54 | 356.65 | 0.9946 |
| `H2S` | Antoine | PASS | 0.54 | 212.85 | 0.9946 |
| `piperidine` | AW | PASS | 0.55 | 379.15 | 0.9945 |
| `undecane` | AW | PASS | 0.55 | 469.05 | 1.0055 |
| `vinylChloride` | AW | PASS | 0.55 | 259.26 | 0.9945 |
| `1Butene` | Antoine | PASS | 0.55 | 266.84 | 0.9945 |
| `Xe` | Antoine | PASS | 0.56 | 165.05 | 1.0056 |
| `R21` | Antoine | PASS | 0.56 | 282.01 | 0.9944 |
| `R32` | Antoine | PASS | 0.56 | 221.50 | 0.9944 |
| `heavyWater` | Antoine | PASS | 0.57 | 374.55 | 0.9943 |
| `R236EA` | Antoine | PASS | 0.57 | 279.32 | 0.9943 |
| `OrthoHydrogen` | Antoine | PASS | 0.59 | 20.38 | 0.9941 |
| `cyclohexane` | Antoine | PASS | 0.60 | 353.86 | 0.9940 |
| `water` | Antoine | PASS | 0.61 | 373.12 | 0.9939 |
| `N2O` | Antoine | PASS | 0.61 | 184.68 | 1.0061 |
| `styrene` | AW | PASS | 0.61 | 418.15 | 0.9939 |
| `SO2` | Antoine | PASS | 0.62 | 263.14 | 0.9938 |
| `methylLinoleate` | Antoine | PASS | 0.64 | 628.84 | 1.0064 |
| `R14` | Antoine | PASS | 0.65 | 145.10 | 0.9935 |
| `NH3` | Antoine | PASS | 0.66 | 239.83 | 0.9934 |
| `isooctane` | AW | PASS | 0.66 | 372.45 | 1.0066 |
| `decamethylcyclopentasiloxane` | Antoine | PASS | 0.67 | 484.10 | 0.9933 |
| `MDM` | Antoine | PASS | 0.68 | 425.63 | 0.9932 |
| `N2` | Antoine | PASS | 0.71 | 77.36 | 0.9929 |
| `nitrobenzene` | AW | PASS | 0.71 | 483.71 | 0.9929 |
| `MD2M` | Antoine | PASS | 0.73 | 467.59 | 0.9927 |
| `mtbe` | AW | PASS | 0.73 | 328.35 | 1.0073 |
| `CO` | Antoine | PASS | 0.74 | 81.64 | 0.9926 |
| `carbonTetrachloride` | AW | PASS | 0.74 | 349.82 | 0.9926 |
| `ethane` | Antoine | PASS | 0.75 | 184.57 | 0.9925 |
| `carbonylSulfide` | Antoine | PASS | 0.77 | 222.99 | 0.9923 |
| `benzene` | Antoine | PASS | 0.77 | 353.22 | 0.9923 |
| `fluorine` | Antoine | PASS | 0.77 | 85.04 | 0.9923 |
| `dimethylCarbonate` | Antoine | PASS | 0.77 | 363.26 | 0.9923 |
| `heptane` | AW | PASS | 0.77 | 371.48 | 1.0077 |
| `ethyleneOxide` | Antoine | PASS | 0.78 | 283.66 | 0.9922 |
| `D2` | Antoine | PASS | 0.79 | 23.66 | 0.9921 |
| `OrthoDeuterium` | Antoine | PASS | 0.79 | 23.66 | 0.9921 |
| `ParaDeuterium` | Antoine | PASS | 0.79 | 23.66 | 0.9921 |
| `Ethylene` | Antoine | PASS | 0.79 | 169.38 | 0.9921 |
| `R41` | Antoine | PASS | 0.80 | 194.79 | 0.9920 |
| `heptadecane` | AW | PASS | 0.83 | 574.95 | 0.9917 |
| `dimethylPhthalate` | AW | PASS | 0.84 | 557.04 | 0.9916 |
| `HCl` | Antoine | PASS | 0.86 | 188.17 | 0.9914 |
| `CH4` | Antoine | PASS | 0.88 | 111.67 | 0.9912 |
| `O2` | Antoine | PASS | 0.92 | 90.19 | 0.9908 |
| `butylAcetate` | AW | PASS | 0.94 | 398.71 | 1.0094 |
| `hydroquinone` | AW | PASS | 1.00 | 558.15 | 0.9900 |
| `ethanol` | Antoine | PASS | 1.01 | 351.57 | 0.9899 |
| `acetophenone` | AW | PASS | 1.03 | 475.25 | 1.0103 |
| `threeMethylpentane` | AW | PASS | 1.04 | 336.43 | 0.9896 |
| `tridecane` | AW | PASS | 1.12 | 508.55 | 0.9888 |
| `methylPalmitate` | Antoine | PASS | 1.14 | 602.27 | 1.0114 |
| `ethylFormate` | AW | PASS | 1.15 | 327.59 | 1.0115 |
| `methylOleate` | Antoine | PASS | 1.18 | 627.18 | 1.0118 |
| `resorcinol` | AW | PASS | 1.30 | 550.37 | 1.0130 |
| `onePropanethiol` | AW | PASS | 1.32 | 340.37 | 0.9868 |
| `aceticAnhydride` | AW | PASS | 1.39 | 412.04 | 1.0139 |
| `pentanal` | AW | PASS | 1.42 | 375.93 | 1.0142 |
| `allylAlcohol` | AW | PASS | 1.48 | 370.05 | 1.0148 |
| `methylLinolenate` | Antoine | PASS | 1.59 | 629.13 | 1.0159 |
| `pentan3one` | AW | PASS | 1.59 | 374.82 | 0.9841 |
| `decalin` | AW | PASS | 1.61 | 468.95 | 0.9839 |
| `pentadecane` | AW | PASS | 1.64 | 543.75 | 0.9836 |
| `ethylamine` | AW | PASS | 1.67 | 289.75 | 1.0167 |
| `methylStearate` | Antoine | PASS | 1.68 | 629.56 | 1.0168 |
| `octadecane` | AW | PASS | 1.73 | 590.00 | 1.0173 |
| `methylFormate` | AW | PASS | 1.74 | 304.82 | 1.0174 |
| `ethanethiol` | AW | PASS | 1.77 | 308.15 | 1.0177 |
| `carbonDisulfide` | AW | PASS | 1.82 | 319.82 | 0.9818 |
| `benzylChloride` | AW | PASS | 1.85 | 452.04 | 1.0185 |
| `tertButanol` | AW | PASS | 1.86 | 355.37 | 0.9814 |
| `triethylamine` | AW | PASS | 2.01 | 362.59 | 0.9799 |
| `ethyleneGlycol` | AW | PASS | 2.02 | 470.93 | 0.9798 |
| `methanethiol` | AW | PASS | 2.07 | 279.26 | 1.0207 |
| `twoPropanol` | AW | PASS | 2.14 | 355.93 | 1.0214 |
| `pyridine` | AW | PASS | 2.19 | 388.71 | 1.0219 |
| `biphenyl` | AW | PASS | 2.21 | 527.04 | 0.9779 |
| `trimethylamine` | AW | PASS | 2.21 | 275.93 | 1.0221 |
| `tetralin` | AW | PASS | 2.25 | 480.15 | 1.0225 |
| `pyrrolidine` | AW | PASS | 2.26 | 360.15 | 1.0226 |
| `dodecane` | AW | PASS | 2.28 | 489.35 | 1.0228 |
| `isobutylAcetate` | AW | PASS | 2.37 | 390.37 | 1.0237 |
| `isobutanol` | AW | PASS | 2.39 | 381.48 | 1.0239 |
| `acetonitrile` | AW | PASS | 2.43 | 354.82 | 1.0243 |
| `methylcyclohexane` | AW | PASS | 2.45 | 374.26 | 0.9755 |
| `vinylAcetate` | AW | PASS | 2.52 | 345.37 | 0.9748 |
| `methylEthylKetone` | AW | PASS | 2.75 | 352.59 | 0.9725 |
| `onePentene` | AW | PASS | 2.75 | 303.10 | 0.9725 |
| `ethylAcrylate` | AW | PASS | 2.76 | 372.59 | 0.9724 |
| `tetrahydrofuran` | AW | PASS | 2.88 | 339.26 | 1.0288 |
| `propyleneOxide` | AW | PASS | 2.92 | 307.59 | 0.9708 |
| `twoMethoxyethanol` | AW | PASS | 2.93 | 397.59 | 1.0293 |
| `anisole` | AW | PASS | 3.52 | 426.75 | 1.0352 |
| `benzylAlcohol` | AW | PASS | 3.53 | 478.15 | 1.0353 |
| `indene` | AW | PASS | 3.72 | 454.82 | 1.0372 |
| `methylAcrylate` | AW | PASS | 3.78 | 353.15 | 0.9622 |
| `epichlorohydrin` | AW | PASS | 3.82 | 389.82 | 1.0382 |
| `methylAcetate` | AW | PASS | 3.89 | 330.37 | 1.0389 |
| `dimethylamine` | AW | PASS | 3.92 | 279.82 | 1.0392 |
| `dichloroethane11` | AW | PASS | 3.96 | 330.37 | 0.9604 |
| `dichloropropane12` | AW | PASS | 3.99 | 369.82 | 1.0399 |
| `propyleneGlycol` | AW | PASS | 4.06 | 460.55 | 1.0406 |
| `dimethylFormamide` | AW | PASS | 4.17 | 425.93 | 1.0417 |
| `nitroethane` | AW | PASS | 4.19 | 387.04 | 1.0419 |
| `benzoicAcid` | AW | PASS | 4.25 | 523.35 | 0.9575 |
| `amylAcetate` | AW | PASS | 4.27 | 422.59 | 1.0427 |
| `phenol` | AW | PASS | 4.31 | 454.82 | 0.9569 |
| `eicosane` | AW | PASS | 4.34 | 617.25 | 0.9566 |
| `diisopropylEther` | AW | PASS | 4.34 | 340.93 | 0.9566 |
| `trichloroethylene` | AW | PASS | 4.76 | 360.37 | 1.0476 |
| `hexadecane` | AW | PASS | 4.78 | 559.94 | 0.9522 |
| `dioxane14` | AW | PASS | 4.80 | 374.26 | 0.9520 |
| `diethylamine` | AW | DROP | 5.05 | 328.71 | 0.9495 |
| `aniline` | AW | DROP | 5.10 | 457.04 | 0.9490 |
| `acrolein` | AW | DROP | 5.22 | 325.93 | 0.9478 |
| `mesitylene` | AW | DROP | 5.49 | 438.15 | 1.0549 |
| `nnDimethylaniline` | AW | DROP | 5.52 | 465.37 | 0.9448 |
| `acetamide` | AW | DROP | 5.62 | 495.16 | 0.9438 |
| `cyclopentadiene13` | AW | DROP | 5.64 | 314.82 | 1.0564 |
| `mCresol` | AW | DROP | 5.74 | 475.93 | 0.9426 |
| `cyclohexanol` | AW | DROP | 6.28 | 434.26 | 1.0628 |
| `formicAcid` | AW | DROP | 6.29 | 373.85 | 0.9371 |
| `acrylicAcid` | AW | DROP | 6.34 | 414.26 | 0.9366 |
| `quinoline` | AW | DROP | 6.38 | 510.25 | 1.0638 |
| `tetradecane` | AW | DROP | 6.49 | 526.67 | 0.9351 |
| `propionitrile` | AW | DROP | 6.84 | 370.37 | 1.0684 |
| `methylamine` | AW | DROP | 7.09 | 267.04 | 1.0709 |
| `oToluidine` | AW | DROP | 7.29 | 473.15 | 0.9271 |
| `nMethylaniline` | AW | DROP | 7.38 | 468.71 | 1.0738 |
| `dimethoxyethane12` | AW | DROP | 7.40 | 358.35 | 1.0740 |
| `methacrylicAcid` | AW | DROP | 7.54 | 435.93 | 1.0754 |
| `nitromethane` | AW | DROP | 7.79 | 374.26 | 0.9221 |
| `cyclohexene` | AW | DROP | 8.46 | 355.93 | 0.9154 |
| `dichloromethane` | AW | DROP | 8.70 | 313.15 | 1.0870 |
| `chlorobutane1` | AW | DROP | 9.36 | 351.65 | 1.0936 |
| `trichloroethane111` | AW | DROP | 9.48 | 347.04 | 0.9052 |
| `tetrachloroethylene` | AW | DROP | 9.81 | 394.26 | 1.0981 |
| `methylIsobutylKetone` | AW | DROP | 10.02 | 389.82 | 0.8998 |
| `allylChloride` | AW | DROP | 10.55 | 318.15 | 1.1055 |
| `isopropylAcetate` | AW | DROP | 10.57 | 363.15 | 1.1057 |
| `mesitylOxide` | AW | DROP | 10.97 | 403.15 | 0.8903 |
| `decane` | AW | DROP | 11.62 | 447.25 | 1.1162 |
| `glycerol` | AW | DROP | 12.42 | 563.15 | 1.1242 |
| `acrylonitrile` | AW | DROP | 12.46 | 350.37 | 0.8754 |
| `acetaldehyde` | AW | DROP | 13.58 | 293.71 | 0.8642 |
| `cyclohexylamine` | AW | DROP | 13.63 | 407.59 | 1.1363 |
| `diethanolamine` | AW | DROP | 15.96 | 541.23 | 0.8404 |
| `butylamine` | AW | DROP | 15.99 | 350.93 | 0.8401 |
| `methylMethacrylate` | AW | DROP | 17.88 | 374.26 | 1.1788 |
| `oCresol` | AW | DROP | 18.85 | 464.26 | 0.8115 |
| `twoEthoxyethanol` | AW | DROP | 19.89 | 408.15 | 1.1989 |
| `maleicAnhydride` | AW | DROP | 20.56 | 475.37 | 1.2056 |
| `hexamethyleneDiamine` | AW | DROP | 20.70 | 478.15 | 0.7930 |
| `butyricAcid` | AW | DROP | 20.79 | 436.15 | 1.2079 |
| `catechol` | AW | DROP | 21.20 | 518.71 | 1.2120 |
| `propionicAcid` | AW | DROP | 21.61 | 414.26 | 1.2161 |
| `pCresol` | AW | DROP | 22.65 | 475.37 | 0.7735 |
| `adiponitrile` | AW | DROP | 23.84 | 568.15 | 1.2384 |
| `furfural` | AW | DROP | 24.09 | 434.82 | 0.7591 |
| `cyclohexanone` | AW | DROP | 34.55 | 428.71 | 1.3455 |
| `propadiene` | AW | DROP | 37.14 | 240.87 | 1.3714 |
| `nnDimethylacetamide` | AW | DROP | 38.21 | 438.15 | 1.3821 |
| `oDichlorobenzene` | AW | DROP | 38.91 | 453.71 | 0.6109 |
| `ethylenediamine` | AW | DROP | 42.80 | 389.25 | 0.5720 |
| `adipicAcid` | AW | DROP | 86.91 | 538.15 | 0.1309 |

## Non-AW / skipped files

| component | status | note |
|-----------|--------|------|
| `Al2O3` | no-Tb | solid / no boiling point |
| `CO2` | no-Tb | solid / no boiling point |
| `CaCO3` | no-Tb | solid / no boiling point |
| `CaO` | no-Tb | solid / no boiling point |
| `CaOH2` | no-Tb | solid / no boiling point |
| `Fe2O3` | no-Tb | solid / no boiling point |
| `KCl` | no-Tb | solid / no boiling point |
| `MgO` | no-Tb | solid / no boiling point |
| `Na2CO3` | no-Tb | solid / no boiling point |
| `SF6` | no-Tb | solid / no boiling point |
| `TiO2` | no-Tb | solid / no boiling point |
| `aluminumhydroxide` | no-Tb | solid / no boiling point |
| `ammoniumchloride` | no-Tb | solid / no boiling point |
| `ammoniumnitrate` | no-Tb | solid / no boiling point |
| `ammoniumsulfate` | no-Tb | solid / no boiling point |
| `anthracene` | no-Tb | solid / no boiling point |
| `bariumcarbonate` | no-Tb | solid / no boiling point |
| `bariumsulfate` | no-Tb | solid / no boiling point |
| `benzaldehyde` | no-Tb | solid / no boiling point |
| `benzonitrile` | no-Tb | solid / no boiling point |
| `boricacid` | no-Tb | solid / no boiling point |
| `butanal` | no-Tb | solid / no boiling point |
| `butanediol14` | no-Tb | solid / no boiling point |
| `calciumchloride` | no-Tb | solid / no boiling point |
| `calciumphosphate` | no-Tb | solid / no boiling point |
| `calciumsulfate` | no-Tb | solid / no boiling point |
| `caproicAcid` | no-Tb | solid / no boiling point |
| `citricacid` | no-Tb | solid / no boiling point |
| `copper2oxide` | no-Tb | solid / no boiling point |
| `cyclopentanone` | no-Tb | solid / no boiling point |
| `cyclopentene` | no-Tb | solid / no boiling point |
| `cyclopropane` | no-Tb | solid / no boiling point |
| `decene1` | no-Tb | solid / no boiling point |
| `diacetyl` | no-Tb | solid / no boiling point |
| `diethylSulfide` | no-Tb | solid / no boiling point |
| `diethyleneGlycol` | no-Tb | solid / no boiling point |
| `diketene` | no-Tb | solid / no boiling point |
| `dimethylDisulfide` | no-Tb | solid / no boiling point |
| `dimethylSulfide` | no-Tb | solid / no boiling point |
| `diphenylmethane` | no-Tb | solid / no boiling point |
| `ethylTertButylEther` | no-Tb | solid / no boiling point |
| `ethylcyclohexane` | no-Tb | solid / no boiling point |
| `ethyleneCarbonate` | no-Tb | solid / no boiling point |
| `formamide` | no-Tb | solid / no boiling point |
| `furan` | no-Tb | solid / no boiling point |
| `gammaButyrolactone` | no-Tb | solid / no boiling point |
| `guaiacol` | no-Tb | solid / no boiling point |
| `heptanol1` | no-Tb | solid / no boiling point |
| `heptene1` | no-Tb | solid / no boiling point |
| `hexanal` | no-Tb | solid / no boiling point |
| `hexanol1` | no-Tb | solid / no boiling point |
| `hexene1` | no-Tb | solid / no boiling point |
| `hexyne1` | no-Tb | solid / no boiling point |
| `iron2oxide` | no-Tb | solid / no boiling point |
| `isoprene` | no-Tb | solid / no boiling point |
| `lacticAcid` | no-Tb | solid / no boiling point |
| `lithiumcarbonate` | no-Tb | solid / no boiling point |
| `magnesiumcarbonate` | no-Tb | solid / no boiling point |
| `magnesiumhydroxide` | no-Tb | solid / no boiling point |
| `malonicAcid` | no-Tb | solid / no boiling point |
| `methylBenzoate` | no-Tb | solid / no boiling point |
| `nMethylpyrrolidone` | no-Tb | solid / no boiling point |
| `oneNonene` | no-Tb | solid / no boiling point |
| `oneOctanol` | no-Tb | solid / no boiling point |
| `oneOctene` | no-Tb | solid / no boiling point |
| `onePentanol` | no-Tb | solid / no boiling point |
| `onePentyne` | no-Tb | solid / no boiling point |
| `oxalicacid` | no-Tb | solid / no boiling point |
| `pentadiene13` | no-Tb | solid / no boiling point |
| `phosphoricacid` | no-Tb | solid / no boiling point |
| `piperazine` | no-Tb | solid / no boiling point |
| `potassiumcarbonate` | no-Tb | solid / no boiling point |
| `potassiumhydroxide` | no-Tb | solid / no boiling point |
| `potassiumnitrate` | no-Tb | solid / no boiling point |
| `potassiumsulfate` | no-Tb | solid / no boiling point |
| `propanal` | no-Tb | solid / no boiling point |
| `propanediol13` | no-Tb | solid / no boiling point |
| `propylamine` | no-Tb | solid / no boiling point |
| `propyleneCarbonate` | no-Tb | solid / no boiling point |
| `propyne` | no-Tb | solid / no boiling point |
| `sodiumbicarbonate` | no-Tb | solid / no boiling point |
| `sodiumnitrate` | no-Tb | solid / no boiling point |
| `sodiumphosphate` | no-Tb | solid / no boiling point |
| `sodiumsulfate` | no-Tb | solid / no boiling point |
| `sulfolane` | no-Tb | solid / no boiling point |
| `sulfurSolid` | no-Tb | solid / no boiling point |
| `tetrahydropyran` | no-Tb | solid / no boiling point |
| `thiophene` | no-Tb | solid / no boiling point |
| `triethanolamine` | no-Tb | solid / no boiling point |
| `triethyleneGlycol` | no-Tb | solid / no boiling point |
| `twoEthylhexanoicAcid` | no-Tb | solid / no boiling point |
| `twoEthylhexanol` | no-Tb | solid / no boiling point |
| `twoMethylTwoButene` | no-Tb | solid / no boiling point |
| `twoMethylfuran` | no-Tb | solid / no boiling point |
| `twoMethyltetrahydrofuran` | no-Tb | solid / no boiling point |
| `twoPicoline` | no-Tb | solid / no boiling point |
| `valericAcid` | no-Tb | solid / no boiling point |
| `zincoxide` | no-Tb | solid / no boiling point |
