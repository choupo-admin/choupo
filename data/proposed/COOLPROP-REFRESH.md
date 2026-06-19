# CoolProp collision refresh -- proposal tier (STAGE-ONLY)

- **86 UPGRADED**: CoolProp-anchored constants/VP/Cp merged over the existing proposal file, PRESERVING fields CoolProp cannot supply (gibbsFormation, groups, diffusionVolume, curated sublimation).
- **19 NEW-ALT**: a clean CoolProp alternative staged for a name that previously existed ONLY as a frozen standard (shadowed by the standard at run time).
- `_coolprop_review/` kept as the pristine pre-merge CoolProp record. NOTHING committed; NOTHING written to data/standards/.

## Upgraded (merge over existing proposal)

| name | preserved from prior |
|---|---|
| CO2 | sublimation(curated Hsub) |
| MD2M | (none -- CoolProp superset) |
| MD3M | (none -- CoolProp superset) |
| MD4M | (none -- CoolProp superset) |
| MDM | (none -- CoolProp superset) |
| R11 | gibbsFormation, groups |
| R113 | gibbsFormation, groups |
| R114 | gibbsFormation, groups |
| R115 | gibbsFormation, groups |
| R116 | gibbsFormation, groups |
| R12 | gibbsFormation, groups |
| R123 | gibbsFormation, groups |
| R1233zdE | gibbsFormation, groups |
| R1234yf | gibbsFormation, groups |
| R1234zeE | gibbsFormation, groups |
| R1234zeZ | gibbsFormation, groups |
| R124 | gibbsFormation, groups |
| R1243zf | gibbsFormation, groups |
| R125 | gibbsFormation, groups |
| R13 | gibbsFormation, groups |
| R1336mzzE | (none -- CoolProp superset) |
| R134a | gibbsFormation, groups |
| R13I1 | gibbsFormation, groups |
| R14 | gibbsFormation, groups |
| R141b | gibbsFormation, groups |
| R142b | gibbsFormation, groups |
| R143a | gibbsFormation, groups |
| R152a | gibbsFormation, groups |
| R161 | gibbsFormation, groups |
| R21 | gibbsFormation, groups |
| R218 | gibbsFormation, groups |
| R22 | gibbsFormation, groups |
| R227EA | gibbsFormation, groups |
| R23 | gibbsFormation, groups |
| R236EA | gibbsFormation, groups |
| R236FA | gibbsFormation, groups |
| R245ca | gibbsFormation, groups |
| R245fa | gibbsFormation, groups |
| R32 | gibbsFormation, groups |
| R365MFC | gibbsFormation, groups |
| R40 | gibbsFormation, groups |
| R41 | gibbsFormation, groups |
| RC318 | gibbsFormation, groups |
| SF6 | (none -- CoolProp superset) |
| Xe | (none -- CoolProp superset) |
| carbonylSulfide | (none -- CoolProp superset) |
| cis2Butene | gibbsFormation, groups |
| cyclohexane | gibbsFormation, groups |
| cyclopentane | gibbsFormation, groups |
| cyclopropane | gibbsFormation, groups |
| decamethylcyclopentasiloxane | (none -- CoolProp superset) |
| diethylEther | gibbsFormation, groups |
| dimethylCarbonate | (none -- CoolProp superset) |
| dimethylEther | gibbsFormation, groups |
| dodecamethylcyclohexasiloxane | (none -- CoolProp superset) |
| ethylBenzene | gibbsFormation, groups |
| ethyleneOxide | gibbsFormation, groups |
| fluorine | gibbsFormation, groups |
| heavyWater | (none -- CoolProp superset) |
| hexamethyldisiloxane | (none -- CoolProp superset) |
| hfe143m | gibbsFormation, groups |
| isoButane | gibbsFormation, groups |
| isoButene | gibbsFormation, groups |
| isohexane | gibbsFormation, groups |
| isopentane | gibbsFormation, groups |
| krypton | (none -- CoolProp superset) |
| mXylene | gibbsFormation, groups |
| methylLinoleate | gibbsFormation, groups |
| methylLinolenate | gibbsFormation, groups |
| methylOleate | gibbsFormation, groups |
| methylPalmitate | gibbsFormation, groups |
| methylStearate | gibbsFormation, groups |
| nDecane | gibbsFormation, groups |
| nDodecane | gibbsFormation, groups |
| nHeptane | gibbsFormation, groups |
| nNonane | gibbsFormation, groups |
| nPentane | gibbsFormation, groups |
| nUndecane | gibbsFormation, groups |
| neopentane | gibbsFormation, groups |
| novec649 | gibbsFormation, groups |
| oXylene | gibbsFormation, groups |
| octamethylcyclotetrasiloxane | (none -- CoolProp superset) |
| pXylene | gibbsFormation, groups |
| propyne | gibbsFormation, groups |
| trans2Butene | gibbsFormation, groups |
| water | sublimation(curated Hsub) |

## New CoolProp alternatives to a standard

Ar, CH4, CO, H2, H2S, HCl, He, N2, N2O, NH3, O2, SO2, acetone, benzene, ethanol, methanol, nHexane, propane, toluene
