# NASA-TM-4513 gibbsFormation import (public domain)

Source: McBride, Gordon & Reno, NASA TM-4513 (1993) -- US-gov public domain (cantera nasa_gas.yaml). dHf0_298 = H0(298.15) referenced to elements; s_298 = S0(298.15). Anchor verify worst = 0.050 kJ/mol (CO2/H2O/NH3/benzene/CO).

Isomer guard: each mapping carries an expected dHf; a NASA value off by >5 kJ/mol is REFUSED (the C3H6O=propylene-oxide-not-acetone trap). Acetone, nHexane, nNonane, nDecane, neopentane, isohexane, o/m/p-xylene, diethylEther, 1,2-dichloroethane and ortho/para spin isomers have NO clean NASA match -> NOT imported (gap kept honest).

## standards/ refit (Joback estimate -> NASA measured)

| name | dHf_298 kJ/mol | s_298 J/mol/K | NASA species |
|---|---|---|---|
| cyclohexane | -123.3 | 297.39 | C6H12,cyclo- |
| isopentane | -153.8 | 343.74 | C5H12,i-pentane |
| nHeptane | -187.8 | 428.09 | C7H16,n-heptane |
| nPentane | -146.8 | 349.49 | C5H12,n-pentane |

## proposed/ filled or replaced

| name | dHf_298 kJ/mol | s_298 J/mol/K | NASA species |
|---|---|---|---|
| 1Butene | -0.5 | 307.86 | C4H8,1-butene |
| Ar | -0.0 | 154.85 | Ar |
| CH4 | -74.6 | 186.37 | CH4 |
| CO | -110.5 | 197.66 | CO |
| CO2 | -393.5 | 213.79 | CO2 |
| D2 | 0.0 | 144.96 | D2 |
| Ethylene | 52.5 | 219.32 | C2H4 |
| H2 | 0.0 | 130.68 | H2 |
| H2S | -20.5 | 205.77 | H2S |
| HCl | -92.3 | 186.90 | HCL |
| He | -0.0 | 126.15 | He |
| N2 | 0.0 | 191.61 | N2 |
| N2O | 81.6 | 220.01 | N2O |
| NH3 | -45.9 | 192.77 | NH3 |
| O2 | 0.0 | 205.15 | O2 |
| Propylene | 19.7 | 266.67 | C3H6,propylene |
| SO2 | -296.8 | 248.20 | SO2 |
| benzene | 82.9 | 269.17 | C6H6 |
| ethane | -83.9 | 229.22 | C2H6 |
| ethanol | -234.9 | 280.59 | C2H5OH |
| methanol | -200.9 | 239.81 | CH3OH |
| nButane | -125.8 | 309.88 | C4H10,n-butane |
| nOctane | -208.7 | 467.35 | C8H18,n-octane |
| neon | -0.0 | 146.33 | Ne |
| propane | -104.7 | 270.32 | C3H8 |
| toluene | 50.2 | 320.19 | C7H8 |

## standards left untouched (curated non-estimate gibbs)
- methanol: standard has a curated (non-estimate) gibbs -- left untouched
- ethanol: standard has a curated (non-estimate) gibbs -- left untouched
- toluene: standard has a curated (non-estimate) gibbs -- left untouched
- benzene: standard has a curated (non-estimate) gibbs -- left untouched
- propane: standard has a curated (non-estimate) gibbs -- left untouched
- N2: standard has a curated (non-estimate) gibbs -- left untouched
- O2: standard has a curated (non-estimate) gibbs -- left untouched
- H2: standard has a curated (non-estimate) gibbs -- left untouched
- Ar: standard has a curated (non-estimate) gibbs -- left untouched
- He: standard has a curated (non-estimate) gibbs -- left untouched
- CO2: standard has a curated (non-estimate) gibbs -- left untouched
- CO: standard has a curated (non-estimate) gibbs -- left untouched
- CH4: standard has a curated (non-estimate) gibbs -- left untouched
- NH3: standard has a curated (non-estimate) gibbs -- left untouched
- H2S: standard has a curated (non-estimate) gibbs -- left untouched
- SO2: standard has a curated (non-estimate) gibbs -- left untouched
- N2O: standard has a curated (non-estimate) gibbs -- left untouched
- HCl: standard has a curated (non-estimate) gibbs -- left untouched
