# C421 door slice (electrochem + membrane family): every moved golden row (2026-11-18)

Slice: `electrodialysisStack` and `batchElectrodialysis` stop pricing a liquid property themselves.  Before: the
channel solution was 1000 kg/m3 (`liquidSource::diluteCarrierDensity`) for the molality-to-concentration factor, the
diluate's volumetric flow (water mass over 1000) and the tank volume, and the kinematic viscosity was
mu_solvent/1000 (or a fixed 1e-6 m2/s in ed01, ed02 and ed10, which declared no viscosity model).  Now: each channel's
solution density is asked of the property door (`liquidProperty::density`, the kernel's methods) at the channel's
(T, P, composition); the molality-to-concentration factor is `rhoCarrier` = w_solvent x rho_solution (kg of solvent per
m3 of solution); the diluate's flow is mass flow over rho_solution; tank volumes are mass over rho_solution; the
kinematic viscosity is the door's pure-solvent viscosity over the door's pure-solvent density; a case with no
liquid-viscosity model is REFUSED by name.  The dissolved ions have no liquid volume, so each case declares
`approximations { massWithoutVolume { ... } }` (rho = rho_water(T) (1 + w_ions)); largest ion mass fraction reached
0.033 (batch concentrate) against the declared bound 0.06.  `Polarisation.cpp` and `DSPM_DE.cpp` ask the Stokes-Einstein
factor through the door (`liquidProperty::ionDiffusivityFactor`, same arithmetic): the 41 membrane / swro / optimisation /
unsteady cases of the scope are BYTE-IDENTICAL (41 PASS / 0 FAIL, no row moved).

THE ONE CAUSE of every moved row below: water at 298.15 K, 1.5 bar from IAPWS95 is 997.07 kg/m3, not 1000
(-0.293 %).  C_ion = m x rhoCarrier falls by that factor (ed03: 100.000 -> 99.707 mol/m3); the diluate flow Q = mass / rho_solution
rises accordingly (u_superficial +0.29 %); nu = mu / rho_water rises 0.29 % (Sc +0.29 %, ed03 553.717 -> 555.344).
Downstream rows (i_lim, k_c, film thickness, R_pair, voltage, power, specific energy, trajectories) follow through
the unit's own equations.  Cases with extra spread: ed10 adds benzene (passThrough) to the solution density (largest move
0.571 %); the batch rigs also use rho of the concentrating tanks (up to 1031 kg/m3 for the concentrate) in tank volumes (0.34-0.42 %).
ed01, ed02 and ed10 declared no viscosity model: they had nu = 1e-6 m2/s (CowanBrown, where Re x Sc = v d_h / D
cancels nu, so only the density factor moved the KPIs; the case now declares `viscosity { model Vogel; }`).
Each `expected` file: the 13 cases were re-recorded one by one after the scoped run listed these rows; the retired
`source <unit> liquidKinematicViscosity` rows were deleted by hand (the unit no longer publishes that word; the
door publishes `liquidViscosity`), and the `liquidDensity` source row changed from `constant.diluteCarrier` to
`idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95`.  NO anchor row moved beyond the
cases above; closures: element_balance PASS, mass_closure 10 steady cases within 0.5 % of 100 (global closure 100.000 %),
campaign_closure 3 time-integrated cases within 0.001.  The `energyBalance gap` lines (Na has no liquidHeatCapacity) existed before.

ROWS THAT ARE NOT THIS SLICE'S: `kpi <unit> D_ion_HTart` (+11.7 %, ed08 and ed09), `D_ion_Tart` (+6.4 %, ed09) and
`D_ion_SO4` (+0.94 %, ed04 ED1-ED6) moved too.  `D_ion_<ion>` is the species record's D0 times the Stokes-Einstein factor
(1 at 298.15 K); no property of this slice enters it.  The new values ARE the catalogue's records
(`data/standards/species/HTart.dat`: D0 8.455e-10 m2/s, read at the page by C403 r3, 2026-11-15), the old goldens held an
earlier D0 (7.568e-10).  The rows were refreshed by this re-recording because `--record` rewrites every row; they are
reported here, not claimed.  The element-closure rows of the batch cases moved at the 1e-15 level (round-off).

Rows below: the 10 largest per case of the DIFFERENCE between the golden at the parent commit and the re-recorded one (524 numeric rows moved in all; every row is in the same range or smaller).

### ed01_nacl_desalination

13 numeric rows moved; largest relative move 0.294 %.

| row | old | new | rel. change |
|---|---|---|---|
| kpi edStack i_over_ilim | 0.304465 | 0.305359 | 0.294 % |
| kpi edStack i_lim | 131.378 | 130.993 | 0.293 % |
| kpi edStack specific_energy_kWh_per_m3 | 0.334442 | 0.333606 | 0.25 % |
| kpi edStack R_pair | 0.00507753 | 0.00508452 | 0.138 % |
| kpi edStack U | 13.5078 | 13.5134 | 0.0414 % |
| kpi rectifier W_shaft_kW | 0.108062 | 0.108107 | 0.0414 % |
| kpi rectifier W_electric_kW | 0.108062 | 0.108107 | 0.0414 % |
| kpi edStack W_electric_kW | 0.108062 | 0.108107 | 0.0414 % |
| kpi rectifier W_shaft | 108.062 | 108.107 | 0.0414 % |
| kpi rectifier W_electric | 108.062 | 108.107 | 0.0414 % |

- `source edStack liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source edStack liquidKinematicViscosity` (was constant.waterKinematic1e-6)
- row added: `source edStack liquidViscosity` = Vogel/GrunbergNissan

### ed02_over_limiting_current

13 numeric rows moved; largest relative move 0.294 %.

| row | old | new | rel. change |
|---|---|---|---|
| kpi edStack i_over_ilim | 1.78983 | 1.79509 | 0.294 % |
| kpi edStack i_lim | 15.3646 | 15.3196 | 0.293 % |
| kpi edStack specific_energy_kWh_per_m3 | 0.0257238 | 0.0256629 | 0.237 % |
| kpi edStack R_pair | 0.0130039 | 0.0130342 | 0.233 % |
| utility rectifier power.electricity_(generated).eur_h | -0.0033369 | -0.00333873 | 0.0549 % |
| utility rectifier power.electricity_(generated).duty_kW | 0.0333423 | 0.0333606 | 0.0549 % |
| kpi edStack U | 6.06224 | 6.06557 | 0.0549 % |
| kpi rectifier W_shaft | 33.3423 | 33.3606 | 0.0549 % |
| kpi rectifier W_electric | 33.3423 | 33.3606 | 0.0549 % |
| kpi edStack W_electric | 33.3423 | 33.3606 | 0.0549 % |

- `source edStack liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source edStack liquidKinematicViscosity` (was constant.waterKinematic1e-6)
- row added: `source edStack liquidViscosity` = Vogel/GrunbergNissan

### ed03_stack_record

25 numeric rows moved; largest relative move 0.294 %.

| row | old | new | rel. change |
|---|---|---|---|
| kpi edStack Sc | 553.717 | 555.344 | 0.294 % |
| kpi edStack C_ion_Na | 100 | 99.707 | 0.293 % |
| kpi edStack C_ion_Cl | 100 | 99.707 | 0.293 % |
| kpi edStack u_interstitial | 0.0879021 | 0.088159 | 0.292 % |
| kpi edStack u_superficial | 0.0791119 | 0.0793431 | 0.292 % |
| kpi edStack specific_energy_kWh_per_m3 | 0.0336767 | 0.0335958 | 0.24 % |
| kpi edStack i_over_ilim | 0.155511 | 0.155819 | 0.198 % |
| kpi edStack i_lim_eq16 | 643.041 | 641.772 | 0.197 % |
| kpi edStack i_lim_cem | 643.041 | 641.772 | 0.197 % |
| kpi edStack i_lim | 643.041 | 641.772 | 0.197 % |

- `source edStack liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source edStack liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)

### ed04_limiting_current_multiionic

138 numeric rows moved; largest relative move 0.943 %.

| row | old | new | rel. change |
|---|---|---|---|
| kpi ED6 D_ion_SO4 | 9.26462e-10 | 9.35202e-10 | 0.943 % |
| kpi ED5 D_ion_SO4 | 9.26462e-10 | 9.35202e-10 | 0.943 % |
| kpi ED4 D_ion_SO4 | 9.26462e-10 | 9.35202e-10 | 0.943 % |
| kpi ED3 D_ion_SO4 | 9.26462e-10 | 9.35202e-10 | 0.943 % |
| kpi ED2 D_ion_SO4 | 9.26462e-10 | 9.35202e-10 | 0.943 % |
| kpi ED1 D_ion_SO4 | 9.26462e-10 | 9.35202e-10 | 0.943 % |
| kpi ED6 Sc | 1095.08 | 1097.03 | 0.177 % |
| kpi ED5 Sc | 1095.08 | 1097.03 | 0.177 % |
| kpi ED4 Sc | 1095.08 | 1097.03 | 0.177 % |
| kpi ED3 Sc | 1095.08 | 1097.03 | 0.177 % |

- `source ED1 liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source ED1 liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)
- `source ED2 liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source ED2 liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)
- `source ED3 liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source ED3 liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)
- `source ED4 liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source ED4 liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)
- `source ED5 liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source ED5 liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)
- `source ED6 liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source ED6 liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)

### ed05_industrial_stack

25 numeric rows moved; largest relative move 0.289 %.

| row | old | new | rel. change |
|---|---|---|---|
| kpi edStack Sc | 553.717 | 555.319 | 0.289 % |
| kpi edStack C_ion_Na | 50 | 49.8557 | 0.289 % |
| kpi edStack C_ion_Cl | 50 | 49.8557 | 0.289 % |
| kpi edStack u_superficial | 0.0798977 | 0.0801276 | 0.288 % |
| kpi edStack u_interstitial | 0.0887753 | 0.0890307 | 0.288 % |
| kpi edStack R_pair | 0.00374285 | 0.00375055 | 0.206 % |
| kpi edStack i_over_ilim | 0.131812 | 0.132069 | 0.195 % |
| kpi edStack i_lim_eq16 | 338.884 | 338.226 | 0.194 % |
| kpi edStack i_lim_cem | 338.884 | 338.226 | 0.194 % |
| kpi edStack i_lim | 338.884 | 338.226 | 0.194 % |

- `source edStack liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source edStack liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)

### ed06_stages_in_series

100 numeric rows moved; largest relative move 0.289 %.

| row | old | new | rel. change |
|---|---|---|---|
| kpi ST4 Sc | 553.717 | 555.319 | 0.289 % |
| kpi ST3 Sc | 553.717 | 555.319 | 0.289 % |
| kpi ST2 Sc | 553.717 | 555.319 | 0.289 % |
| kpi ST1 Sc | 553.717 | 555.319 | 0.289 % |
| kpi ST2 C_ion_Na | 20 | 19.9423 | 0.289 % |
| kpi ST2 C_ion_Cl | 20 | 19.9423 | 0.289 % |
| kpi ST3 C_ion_Na | 8 | 7.97692 | 0.289 % |
| kpi ST3 C_ion_Cl | 8 | 7.97692 | 0.289 % |
| kpi ST1 C_ion_Na | 50 | 49.8557 | 0.289 % |
| kpi ST1 C_ion_Cl | 50 | 49.8557 | 0.289 % |

- `source ST1 liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source ST1 liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)
- `source ST2 liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source ST2 liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)
- `source ST3 liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source ST3 liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)
- `source ST4 liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source ST4 liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)

### ed07_feed_and_bleed

25 numeric rows moved; largest relative move 0.289 %.

| row | old | new | rel. change |
|---|---|---|---|
| kpi ED Sc | 553.717 | 555.319 | 0.289 % |
| kpi ED C_ion_Na | 18.6667 | 18.6128 | 0.289 % |
| kpi ED C_ion_Cl | 18.6667 | 18.6128 | 0.289 % |
| kpi ED u_superficial | 0.0798977 | 0.0801276 | 0.288 % |
| kpi ED u_interstitial | 0.0887753 | 0.0890307 | 0.288 % |
| kpi ED R_pair | 0.00746767 | 0.00748615 | 0.248 % |
| kpi ED specific_energy_kWh_per_m3 | 0.0459505 | 0.0458488 | 0.221 % |
| kpi ED i_over_ilim | 0.110657 | 0.110873 | 0.195 % |
| kpi ED i_lim_aem | -193.104 | -192.729 | 0.194 % |
| kpi ED i_lim_eq16 | 126.517 | 126.271 | 0.194 % |

- `source ED liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source ED liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)

### ed08_wine_kht_model_solution

28 numeric rows moved; largest relative move 11.7 %.

| row | old | new | rel. change |
|---|---|---|---|
| kpi edStack D_ion_HTart | 7.568e-10 | 8.455e-10 | 11.7 % |
| kpi edStack Sc | 753.246 | 755.425 | 0.289 % |
| kpi edStack kappa_dil_in_S_m | 0.158036 | 0.15758 | 0.289 % |
| kpi edStack C_ion_K | 15 | 14.9567 | 0.289 % |
| kpi edStack C_ion_HTart | 15 | 14.9567 | 0.289 % |
| kpi edStack kappa_dil_out_S_m | 0.126429 | 0.126064 | 0.289 % |
| kpi edStack u_superficial | 0.0798977 | 0.0801276 | 0.288 % |
| kpi edStack u_interstitial | 0.0887753 | 0.0890307 | 0.288 % |
| kpi edStack R_pair | 0.0165828 | 0.0166277 | 0.271 % |
| kpi edStack i_over_ilim | 0.0749291 | 0.0750749 | 0.195 % |

- `source edStack liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source edStack liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)

### ed09_wine_multiionic

49 numeric rows moved; largest relative move 11.7 %.

| row | old | new | rel. change |
|---|---|---|---|
| kpi edStack D_ion_HTart | 7.568e-10 | 8.455e-10 | 11.7 % |
| kpi edStack D_ion_Tart | 7.568e-10 | 8.054e-10 | 6.42 % |
| kpi edStack Sc | 722.811 | 724.902 | 0.289 % |
| kpi edStack C_ion_Cl | 1.1 | 1.09683 | 0.289 % |
| kpi edStack kappa_dil_in_S_m | 0.478315 | 0.476935 | 0.289 % |
| kpi edStack kappa_dil_out_S_m | 0.382652 | 0.381548 | 0.289 % |
| kpi edStack C_ion_SO4 | 6.025 | 6.00762 | 0.289 % |
| kpi edStack C_ion_Mal | 0.05 | 0.0498557 | 0.289 % |
| kpi edStack C_ion_Tart | 1.5 | 1.49567 | 0.289 % |
| kpi edStack C_ion_Na | 5 | 4.98557 | 0.289 % |

- `source edStack liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source edStack liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)

### ed10_passthrough_benzene

13 numeric rows moved; largest relative move 0.294 %.

| row | old | new | rel. change |
|---|---|---|---|
| kpi edStack i_over_ilim | 0.304465 | 0.305359 | 0.294 % |
| kpi edStack i_lim | 131.378 | 130.993 | 0.293 % |
| kpi edStack specific_energy_kWh_per_m3 | 0.334442 | 0.333606 | 0.25 % |
| kpi edStack R_pair | 0.00507753 | 0.00508452 | 0.138 % |
| kpi edStack U | 13.5078 | 13.5134 | 0.0414 % |
| utility rectifier power.electricity_(generated).eur_h | -0.0108149 | -0.0108193 | 0.0414 % |
| utility rectifier power.electricity_(generated).duty_kW | 0.108062 | 0.108107 | 0.0414 % |
| kpi rectifier W_shaft_kW | 0.108062 | 0.108107 | 0.0414 % |
| kpi rectifier W_electric_kW | 0.108062 | 0.108107 | 0.0414 % |
| kpi edStack W_electric_kW | 0.108062 | 0.108107 | 0.0414 % |

- `source edStack liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source edStack liquidKinematicViscosity` (was constant.waterKinematic1e-6)
- row added: `source edStack liquidViscosity` = Vogel/GrunbergNissan

### edbatch01_constant_current

46 numeric rows moved; largest relative move 1.02 %.

| row | old | new | rel. change |
|---|---|---|---|
| kpi campaign element_worst_closure_rel | 8.52906e-14 | 8.44232e-14 | 1.02 % |
| kpi campaign element_Na_closure_rel | 8.52906e-14 | 8.44232e-14 | 1.02 % |
| kpi campaign element_Cl_closure_rel | 8.52906e-14 | 8.44232e-14 | 1.02 % |
| kpi rig i_over_ilim_initial | 0.272145 | 0.273081 | 0.344 % |
| panel element:overLimiting min | 0.272145 | 0.273081 | 0.344 % |
| panel element:overLimiting first | 0.272145 | 0.273081 | 0.344 % |
| kpi rig i_lim_initial | 643.041 | 640.837 | 0.343 % |
| kpi rig kappa_conc_final | 7.39765 | 7.37556 | 0.299 % |
| kpi rig Sc | 553.717 | 555.344 | 0.294 % |
| kpi rig Re | 68.4552 | 68.2546 | 0.293 % |

- `source rig liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source rig liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)
- row added: `panel alarmsActive first` = 1600
- row added: `panel alarmsActive count` = 9
- row added: `source rig liquidViscosity` = Vogel/GrunbergNissan

### edbatch02_constant_voltage

30 numeric rows moved; largest relative move 57.1 %.

| row | old | new | rel. change |
|---|---|---|---|
| kpi campaign element_worst_closure_rel | 3.03577e-15 | 1.30104e-15 | 57.1 % |
| kpi campaign element_Na_closure_rel | 3.03577e-15 | 1.30104e-15 | 57.1 % |
| kpi campaign element_Cl_closure_rel | 3.03577e-15 | 1.30104e-15 | 57.1 % |
| kpi rig specificEnergy_kWh_per_m3 | 1.04808 | 1.04372 | 0.417 % |
| kpi rig i_lim_initial | 643.041 | 640.837 | 0.343 % |
| kpi rig kappa_conc_final | 7.08619 | 7.06445 | 0.307 % |
| kpi rig Sc | 553.717 | 555.344 | 0.294 % |
| kpi rig Re | 68.4552 | 68.2546 | 0.293 % |
| kpi rig m_dil_final | 0.0384091 | 0.0384864 | 0.201 % |
| kpi rig n_Na_final | 0.000192045 | 0.000192432 | 0.201 % |

- `source rig liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source rig liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)
- row added: `source rig liquidViscosity` = Vogel/GrunbergNissan

### edbatch03_multiionic_split

19 numeric rows moved; largest relative move 143 %.

| row | old | new | rel. change |
|---|---|---|---|
| kpi campaign element_Cl_closure_rel | 1.01192e-15 | 2.45752e-15 | 143 % |
| kpi campaign element_worst_closure_rel | 1.4456e-15 | 2.45752e-15 | 70 % |
| kpi campaign element_S_closure_rel | 1.01192e-15 | 5.78241e-16 | 42.9 % |
| kpi rig i_over_ilim_initial | 0.143577 | 0.14407 | 0.344 % |
| kpi rig i_over_ilim_final | 0.409269 | 0.410677 | 0.344 % |
| kpi rig i_lim_initial | 696.492 | 694.105 | 0.343 % |
| kpi rig i_lim_final | 244.338 | 243.5 | 0.343 % |
| kpi rig Sc | 590.88 | 592.616 | 0.294 % |
| kpi rig kappa_conc_final | 7.88781 | 7.86469 | 0.293 % |
| kpi rig kappa_dil_final | 0.516726 | 0.515212 | 0.293 % |

- `source rig liquidDensity`: constant.diluteCarrier -> idealMixing[referenceEquation.IAPWS95+massWithoutVolume],referenceEquation.IAPWS95
- row retired: `source rig liquidKinematicViscosity` (was kernel.solventViscosity.StokesEinstein)
- row added: `source rig liquidViscosity` = Vogel/GrunbergNissan
