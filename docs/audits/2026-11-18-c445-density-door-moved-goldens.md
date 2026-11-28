# C445 (2) one density door: every moved golden row (2026-11-19)

70 cases, 633 rows beyond tolerance (the golden "now" column is the recorded value; "golden" is the value before).

Reason for the whole slice, as written in the commit: `liquidProperty::evaluate(.., Property::density, ..)` used to go to `ThermoPackage::density` (the ideal mixing of the records' liquid volumes, Rackett anchored on `Vliq`), while `liquidProperty::density(Request)` went to the resolver (a measurement, a solution law, a reference equation, then the record volumes). Both are now ONE function: every unit that asks for a stream's liquid density gets the same answer by the same method (DEV.md 4c C445 (2); docs/reviews/2026-11-19-architecture-growth/door.md section 1). `pricedDensity::select` asks the door over the whole set before it leaves a component out, so a salt a solution law covers is priced, not dropped.

Three causes account for every row below; each case names which:

* **R (rename)**: the `source.<unit>.liquidDensity` row names the method the door reports now (`idealMixing[...]` of the resolver) instead of `liquidVolume.idealMix[...]` (the wrapper's old label). No number moves by it.
* **W (water)**: pure water, or a mixture carrying water, is priced by the case's selected reference equation IAPWS-95 (`referenceEquation.IAPWS95`, the leaf the pump and the CSTR already used) instead of the record's 25 C volume carried by Rackett. At 25 C the old figure was 996.96 and the equation gives 997.05 (+0.009 %); at 26-30 C the anchored Rackett shape is 0.1-0.15 % low (pipe01: 995.25 -> 996.74 kg/m3 at its state). Every volumetric flow, velocity, head loss and holdup computed from that density moves by the same factor.
* **S (salt)**: a stream carrying NaCl (swro01_campoDalias) is priced by the NaCl-water solution law, as its pumps already were, instead of by the ideal mixing with the salt left out (998.9 % of the stream priced, 996.9 kg/m3). The tanks and headers on seawater now read 1021.8 (feed) and 1040.9 kg/m3 (brine).

A fourth effect is not a number: the cases that now read the Helmholtz records (water by IAPWS-95) carry four new pins in `constant/propertyManifest` (`parameters/Helmholtz/IAPWS95.dat`, `SetzmannWagner1991.dat`, `Span2000.dat`, `SpanWagner1996.dat`), made with `bin/choupo-import --pin`.

`pricedDensity::select` also leaves out, by name, a component below a mole fraction of 1e-6 of the stream when the door refuses the set only because of it (the solver's probe of a zero flow of water in a 250 K liquid, below IAPWS-95's Tmin 251.165 K: ammonia02, ammonia03, economics03); the mass still counts it.


## apalutamide01_tablets  (tutorials/batch/plant/apalutamide01_tablets)
7 rows beyond tolerance (7 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.acetoneTank.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'acetoneTank/tank1'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'recoveredTank/tank1'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.recoveredTank.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.SD.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.storage_'acetoneTank'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.storage_'recoveredTank'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## ctrl12_williams_otto  (tutorials/ctrl/ctrl12_williams_otto)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.plant.liquidDensity` | 'liquidVolume.idealMix[flatVliq]' | 'idealMixing[flatVliq]' | - |

## ctrl13_williams_otto_step  (tutorials/ctrl/ctrl13_williams_otto_step)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.plant.liquidDensity` | 'liquidVolume.idealMix[flatVliq]' | 'idealMixing[flatVliq]' | - |

## ctrl14_williams_otto_pi  (tutorials/ctrl/ctrl14_williams_otto_pi)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.plant.liquidDensity` | 'liquidVolume.idealMix[flatVliq]' | 'idealMixing[flatVliq]' | - |

## ctrl16_williams_otto_optimal  (tutorials/ctrl/ctrl16_williams_otto_optimal)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.plant.liquidDensity` | 'liquidVolume.idealMix[flatVliq]' | 'idealMixing[flatVliq]' | - |

## ctrl21_tank_level_control  (tutorials/ctrl/ctrl21_tank_level_control)
7 rows beyond tolerance (1 `source`, 6 numeric). Causes: W + R.
Largest numeric move: `kpi.tank.density_final` 0.334 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.balance.energy_kJ_final` | -100176244.47 | -99842109.8295 | 0.003335 |
| `kpi.balance.energy_kJ_initial` | -100176247.704 | -99842112.9503 | 0.003335 |
| `kpi.balance.mass_kg_final` | 6292.9101045 | 6271.9203053 | 0.003335 |
| `kpi.balance.mass_kg_initial` | 6292.91030767 | 6271.92050134 | 0.003335 |
| `kpi.tank.density_final` | 1001.5477819 | 998.207150468 | 0.003335 |
| `kpi.tank.n_water_final` | 349.315021066 | 348.149892051 | 0.003335 |
| `source.tank.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |

## ctrl22_reactor_level_and_temperature  (tutorials/ctrl/ctrl22_reactor_level_and_temperature)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.reactor.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## aceticAcid02_plant  (tutorials/plant/aceticAcid02_plant)
8 rows beyond tolerance (8 `source`, 0 numeric). Causes: W + R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.acidTank.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[referenceEquation.IAPWS95+anchoredRackett]' | - |
| `source.inventory_'acidTank/tank1'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[referenceEquation.IAPWS95+anchoredRackett]' | - |
| `source.inventory_'methanolTank/tank1'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.letdown.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[referenceEquation.IAPWS95+anchoredRackett]' | - |
| `source.lightsColumn.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[referenceEquation.IAPWS95+anchoredRackett]' | - |
| `source.methanolTank.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.storage_'acidTank'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[referenceEquation.IAPWS95+anchoredRackett]' | - |
| `source.storage_'methanolTank'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## ChemicalPlantTutorial  (tutorials/plant/ChemicalPlantTutorial)
25 rows beyond tolerance (1 `source`, 24 numeric). Causes: W + R.
Largest numeric move: `kpi.DRYING.SD.rho_liquid` 0.315 %.

| row | golden | now | relative move |
|---|---|---|---|
| `stream.WetPowder.F` | 0.00275138667892 | 0.00275166780568 | 0.0001022 |
| `kpi.DRYING.BD.X_initial` | 0.0342487713882 | 0.0342576483202 | 0.0002592 |
| `kpi.DRYING.BD.exhaust_humidity` | 0.170262111733 | 0.170306697503 | 0.0002619 |
| `kpi.DRYING.BD.water_removed` | 0.0132284336468 | 0.0132334981453 | 0.0003828 |
| `kpi.DRYING.SD.Nu` | 5.39481099032 | 5.39214478508 | 0.0004942 |
| `kpi.DRYING.SD.Re` | 38.9934178721 | 38.9321928852 | 0.00157 |
| `kpi.DRYING.SD.Sh` | 5.16210442299 | 5.15962098005 | 0.0004811 |
| `kpi.DRYING.SD.X_equilibrium` | 0.0275273563912 | 0.0275235514983 | 0.0001382 |
| `kpi.DRYING.SD.X_final` | 0.0342487713882 | 0.0342576483202 | 0.0002592 |
| `kpi.DRYING.SD.d10_micron` | 100.221196705 | 100.168651876 | 0.0005243 |
| `kpi.DRYING.SD.d50_micron` | 215.921291775 | 215.808086708 | 0.0005243 |
| `kpi.DRYING.SD.d90_micron` | 371.144123694 | 370.949537069 | 0.0005243 |
| `kpi.DRYING.SD.d_droplet` | 0.000306517011162 | 0.00030603515378 | 0.001572 |
| `kpi.DRYING.SD.d_droplet_micron` | 306.517011162 | 306.03515378 | 0.001572 |
| `kpi.DRYING.SD.d_particle` | 0.000274508864718 | 0.000274364942856 | 0.0005243 |
| `kpi.DRYING.SD.d_particle_micron` | 274.508864718 | 274.364942856 | 0.0005243 |
| `kpi.DRYING.SD.h` | 546.13580625 | 546.72537169 | 0.00108 |
| `kpi.DRYING.SD.k_c` | 0.721118197925 | 0.72190614054 | 0.001093 |
| `kpi.DRYING.SD.moisture_pct_wb` | 3.31146357972 | 3.31229344794 | 0.0002506 |
| `kpi.DRYING.SD.rho_liquid` | 1403.48318345 | 1407.90627753 | 0.003152 |
| `kpi.DRYING.SD.t_constant_rate` | 0.131385534314 | 0.131450499335 | 0.0004945 |
| `kpi.DRYING.SD.tau_dry_constant` | 0.381273937032 | 0.381462462119 | 0.0004945 |
| `kpi.DRYING.SD.water_activity` | 0.158560647492 | 0.158531323661 | 0.0001849 |
| `kpi.DRYING.SD.water_residual` | 0.0195397297708 | 0.0195447942693 | 0.0002592 |
| `source.DRYING.SD.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'idealMixing[referenceEquation.IAPWS95+flatVliq]' | - |

## ammoniaPEQ02_feasibility150bar  (tutorials/plant/ammoniaPEQ02_feasibility150bar)
6 rows beyond tolerance (6 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.inventory_'LetdownHP'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'NH3Storage/tank1'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'NH3Storage/tank2'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'Separator'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'StorageFlash'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.storage_'NH3Storage'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## ammoniaPEQ02_feasibility50bar  (tutorials/plant/ammoniaPEQ02_feasibility50bar)
6 rows beyond tolerance (6 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.inventory_'LetdownHP'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'NH3Storage/tank1'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'NH3Storage/tank2'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'Separator'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'StorageFlash'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.storage_'NH3Storage'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## ammoniaPEQ03_basicDesign  (tutorials/plant/ammoniaPEQ03_basicDesign)
9 rows beyond tolerance (9 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.inventory_'LetdownHP'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'NH3Storage/tank1'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'NH3Storage/tank2'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'Separator'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'StorageFlash'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.reliefValve_'LetdownHP'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.reliefValve_'Separator'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.reliefValve_'StorageFlash'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.storage_'NH3Storage'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## ammoniaPEQ_baseCase  (tutorials/plant/ammoniaPEQ_baseCase)
9 rows beyond tolerance (9 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.inventory_'LetdownHP'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'NH3Storage/tank1'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'NH3Storage/tank2'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'Separator'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.inventory_'StorageFlash'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.storage_'NH3Storage'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.drum_'LetdownHP'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.drum_'Separator'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.drum_'StorageFlash'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## swro01_campoDalias  (tutorials/plant/swro01_campoDalias)
386 rows beyond tolerance (22 `source`, 364 numeric). Causes: S + W + R (the pumps and the ion-free streams: water by IAPWS-95; the salt-bearing tanks and headers: the NaCl-water law).
Largest numeric move: `equipment.RO1/train6.brine.values.pressureDropPerMetre` 72.8 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.CartridgeFilters.densityPricedFraction` | 0.988868480508 | 1 | 0.01126 |
| `kpi.CartridgeFilters.density_kg_m3` | 996.936833828 | 1021.77319006 | 0.02491 |
| `kpi.CartridgeFilters.holdupVolume_m3` | 81.0636763066 | 79.0932523786 | 0.02431 |
| `kpi.CartridgeFilters.vesselVolume_m3` | 95.3690309489 | 93.0508851513 | 0.02431 |
| `kpi.CartridgeFilters.volumetricFlow_m3_s` | 2.70212254355 | 2.63644174595 | 0.02431 |
| `kpi.MediaFilters.densityPricedFraction` | 0.988868480508 | 1 | 0.01126 |
| `kpi.MediaFilters.density_kg_m3` | 996.936833828 | 1021.77319006 | 0.02491 |
| `kpi.MediaFilters.holdupVolume_m3` | 810.636763066 | 790.932523786 | 0.02431 |
| `kpi.MediaFilters.vesselVolume_m3` | 953.690309489 | 930.508851513 | 0.02431 |
| `kpi.MediaFilters.volumetricFlow_m3_s` | 2.70212254355 | 2.63644174595 | 0.02431 |
| `equipment.RO1/train1.brine.basis` | 'brine_header_on_stream_brine:_Q_=_m_/_rho_/_6_trains_(rho_996.931_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'brine_header_on_stream_brine:_Q_=_m_/_rho_/_6_trains_(rho_1040.9_kg/m3_from_the_case's_package_at_the_stream's_own_s... | - |
| `equipment.RO1/train1.brine.values.density` | 996.931337268 | 1040.9014655 | 0.04411 |
| `equipment.RO1/train1.brine.values.flow` | 927.450219857 | 888.272539314 | 0.04224 |
| `equipment.RO1/train1.brine.values.flowPlant` | 5564.70131914 | 5329.63523588 | 0.04224 |
| `equipment.RO1/train1.brine.values.frictionFactor` | 0.0138581785914 | 0.0138778481169 | 0.001419 |
| `equipment.RO1/train1.brine.values.headerNominalDiameter` | 0.45 | 0.4 | 0.1111 |
| `equipment.RO1/train1.brine.values.nominalInsideDiameter` | 0.45 | 0.4 | 0.1111 |
| `equipment.RO1/train1.brine.values.pressureDropPerMetre` | 40.2786855809 | 69.6160705405 | 0.7284 |
| `equipment.RO1/train1.brine.values.relativeRoughness` | 0.0001 | 0.0001125 | 0.125 |
| `equipment.RO1/train1.brine.values.requiredInsideDiameter` | 0.404980502908 | 0.396334546458 | 0.02135 |
| `equipment.RO1/train1.brine.values.reynolds` | 752270.157772 | 846303.927494 | 0.125 |
| `equipment.RO1/train1.brine.values.velocity` | 1.61984402702 | 1.96351340895 | 0.2122 |
| `equipment.RO1/train1.feed.basis` | 'feed_header_on_stream_roFeed:_Q_=_m_/_rho_/_6_trains_(rho_996.943_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'feed_header_on_stream_roFeed:_Q_=_m_/_rho_/_6_trains_(rho_1020.48_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO1/train1.feed.values.density` | 996.942655754 | 1020.47737702 | 0.02361 |
| `equipment.RO1/train1.feed.values.flow` | 1719.44492147 | 1679.7902874 | 0.02306 |
| `equipment.RO1/train1.feed.values.flowPlant` | 10316.6695288 | 10078.7417244 | 0.02306 |
| `equipment.RO1/train1.feed.values.frictionFactor` | 0.0130652128781 | 0.0130763399766 | 0.0008517 |
| `equipment.RO1/train1.feed.values.headerNominalDiameter` | 0.6 | 0.55 | 0.08333 |
| `equipment.RO1/train1.feed.values.nominalInsideDiameter` | 0.6 | 0.55 | 0.08333 |
| `equipment.RO1/train1.feed.values.pressureDropPerMetre` | 30.9736362885 | 46.7919892918 | 0.5107 |
| `equipment.RO1/train1.feed.values.relativeRoughness` | 7.5e-05 | 8.18181818182e-05 | 0.09091 |
| `equipment.RO1/train1.feed.values.requiredInsideDiameter` | 0.551420547944 | 0.545024900143 | 0.0116 |
| `equipment.RO1/train1.feed.values.reynolds` | 1046014.45989 | 1141106.68352 | 0.09091 |
| `equipment.RO1/train1.feed.values.velocity` | 1.68924789275 | 1.96398110265 | 0.1626 |
| `equipment.RO1/train1.permeate.basis` | 'permeate_header_on_stream_perm1:_Q_=_m_/_rho_/_6_trains_(rho_996.955_kg/m3_from_the_case's_package_at_the_stream's_o... | 'permeate_header_on_stream_perm1:_Q_=_m_/_rho_/_6_trains_(rho_997.062_kg/m3_from_the_case's_package_at_the_stream's_o... | - |
| `equipment.RO1/train1.permeate.values.density` | 996.955091714 | 997.062178627 | 0.0001074 |
| `equipment.RO1/train1.permeate.values.flow` | 791.995351707 | 791.910289472 | 0.0001074 |
| `equipment.RO1/train1.permeate.values.flowPlant` | 4751.97211024 | 4751.46173683 | 0.0001074 |
| `equipment.RO1/train1.permeate.values.pressureDropPerMetre` | 53.7621231397 | 53.7563489563 | 0.0001074 |
| `equipment.RO1/train1.permeate.values.velocity` | 1.75069409903 | 1.75050607021 | 0.0001074 |
| `equipment.RO1/train2.brine.basis` | 'brine_header_on_stream_brine:_Q_=_m_/_rho_/_6_trains_(rho_996.931_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'brine_header_on_stream_brine:_Q_=_m_/_rho_/_6_trains_(rho_1040.9_kg/m3_from_the_case's_package_at_the_stream's_own_s... | - |
| `equipment.RO1/train2.brine.values.density` | 996.931337268 | 1040.9014655 | 0.04411 |
| `equipment.RO1/train2.brine.values.flow` | 927.450219857 | 888.272539314 | 0.04224 |
| `equipment.RO1/train2.brine.values.flowPlant` | 5564.70131914 | 5329.63523588 | 0.04224 |
| `equipment.RO1/train2.brine.values.frictionFactor` | 0.0138581785914 | 0.0138778481169 | 0.001419 |
| `equipment.RO1/train2.brine.values.headerNominalDiameter` | 0.45 | 0.4 | 0.1111 |
| `equipment.RO1/train2.brine.values.nominalInsideDiameter` | 0.45 | 0.4 | 0.1111 |
| `equipment.RO1/train2.brine.values.pressureDropPerMetre` | 40.2786855809 | 69.6160705405 | 0.7284 |
| `equipment.RO1/train2.brine.values.relativeRoughness` | 0.0001 | 0.0001125 | 0.125 |
| `equipment.RO1/train2.brine.values.requiredInsideDiameter` | 0.404980502908 | 0.396334546458 | 0.02135 |
| `equipment.RO1/train2.brine.values.reynolds` | 752270.157772 | 846303.927494 | 0.125 |
| `equipment.RO1/train2.brine.values.velocity` | 1.61984402702 | 1.96351340895 | 0.2122 |
| `equipment.RO1/train2.feed.basis` | 'feed_header_on_stream_roFeed:_Q_=_m_/_rho_/_6_trains_(rho_996.943_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'feed_header_on_stream_roFeed:_Q_=_m_/_rho_/_6_trains_(rho_1020.48_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO1/train2.feed.values.density` | 996.942655754 | 1020.47737702 | 0.02361 |
| `equipment.RO1/train2.feed.values.flow` | 1719.44492147 | 1679.7902874 | 0.02306 |
| `equipment.RO1/train2.feed.values.flowPlant` | 10316.6695288 | 10078.7417244 | 0.02306 |
| `equipment.RO1/train2.feed.values.frictionFactor` | 0.0130652128781 | 0.0130763399766 | 0.0008517 |
| `equipment.RO1/train2.feed.values.headerNominalDiameter` | 0.6 | 0.55 | 0.08333 |
| `equipment.RO1/train2.feed.values.nominalInsideDiameter` | 0.6 | 0.55 | 0.08333 |
| `equipment.RO1/train2.feed.values.pressureDropPerMetre` | 30.9736362885 | 46.7919892918 | 0.5107 |
| `equipment.RO1/train2.feed.values.relativeRoughness` | 7.5e-05 | 8.18181818182e-05 | 0.09091 |
| `equipment.RO1/train2.feed.values.requiredInsideDiameter` | 0.551420547944 | 0.545024900143 | 0.0116 |
| `equipment.RO1/train2.feed.values.reynolds` | 1046014.45989 | 1141106.68352 | 0.09091 |
| `equipment.RO1/train2.feed.values.velocity` | 1.68924789275 | 1.96398110265 | 0.1626 |
| `equipment.RO1/train2.permeate.basis` | 'permeate_header_on_stream_perm1:_Q_=_m_/_rho_/_6_trains_(rho_996.955_kg/m3_from_the_case's_package_at_the_stream's_o... | 'permeate_header_on_stream_perm1:_Q_=_m_/_rho_/_6_trains_(rho_997.062_kg/m3_from_the_case's_package_at_the_stream's_o... | - |
| `equipment.RO1/train2.permeate.values.density` | 996.955091714 | 997.062178627 | 0.0001074 |
| `equipment.RO1/train2.permeate.values.flow` | 791.995351707 | 791.910289472 | 0.0001074 |
| `equipment.RO1/train2.permeate.values.flowPlant` | 4751.97211024 | 4751.46173683 | 0.0001074 |
| `equipment.RO1/train2.permeate.values.pressureDropPerMetre` | 53.7621231397 | 53.7563489563 | 0.0001074 |
| `equipment.RO1/train2.permeate.values.velocity` | 1.75069409903 | 1.75050607021 | 0.0001074 |
| `equipment.RO1/train3.brine.basis` | 'brine_header_on_stream_brine:_Q_=_m_/_rho_/_6_trains_(rho_996.931_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'brine_header_on_stream_brine:_Q_=_m_/_rho_/_6_trains_(rho_1040.9_kg/m3_from_the_case's_package_at_the_stream's_own_s... | - |
| `equipment.RO1/train3.brine.values.density` | 996.931337268 | 1040.9014655 | 0.04411 |
| `equipment.RO1/train3.brine.values.flow` | 927.450219857 | 888.272539314 | 0.04224 |
| `equipment.RO1/train3.brine.values.flowPlant` | 5564.70131914 | 5329.63523588 | 0.04224 |
| `equipment.RO1/train3.brine.values.frictionFactor` | 0.0138581785914 | 0.0138778481169 | 0.001419 |
| `equipment.RO1/train3.brine.values.headerNominalDiameter` | 0.45 | 0.4 | 0.1111 |
| `equipment.RO1/train3.brine.values.nominalInsideDiameter` | 0.45 | 0.4 | 0.1111 |
| `equipment.RO1/train3.brine.values.pressureDropPerMetre` | 40.2786855809 | 69.6160705405 | 0.7284 |
| `equipment.RO1/train3.brine.values.relativeRoughness` | 0.0001 | 0.0001125 | 0.125 |
| `equipment.RO1/train3.brine.values.requiredInsideDiameter` | 0.404980502908 | 0.396334546458 | 0.02135 |
| `equipment.RO1/train3.brine.values.reynolds` | 752270.157772 | 846303.927494 | 0.125 |
| `equipment.RO1/train3.brine.values.velocity` | 1.61984402702 | 1.96351340895 | 0.2122 |
| `equipment.RO1/train3.feed.basis` | 'feed_header_on_stream_roFeed:_Q_=_m_/_rho_/_6_trains_(rho_996.943_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'feed_header_on_stream_roFeed:_Q_=_m_/_rho_/_6_trains_(rho_1020.48_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO1/train3.feed.values.density` | 996.942655754 | 1020.47737702 | 0.02361 |
| `equipment.RO1/train3.feed.values.flow` | 1719.44492147 | 1679.7902874 | 0.02306 |
| `equipment.RO1/train3.feed.values.flowPlant` | 10316.6695288 | 10078.7417244 | 0.02306 |
| `equipment.RO1/train3.feed.values.frictionFactor` | 0.0130652128781 | 0.0130763399766 | 0.0008517 |
| `equipment.RO1/train3.feed.values.headerNominalDiameter` | 0.6 | 0.55 | 0.08333 |
| `equipment.RO1/train3.feed.values.nominalInsideDiameter` | 0.6 | 0.55 | 0.08333 |
| `equipment.RO1/train3.feed.values.pressureDropPerMetre` | 30.9736362885 | 46.7919892918 | 0.5107 |
| `equipment.RO1/train3.feed.values.relativeRoughness` | 7.5e-05 | 8.18181818182e-05 | 0.09091 |
| `equipment.RO1/train3.feed.values.requiredInsideDiameter` | 0.551420547944 | 0.545024900143 | 0.0116 |
| `equipment.RO1/train3.feed.values.reynolds` | 1046014.45989 | 1141106.68352 | 0.09091 |
| `equipment.RO1/train3.feed.values.velocity` | 1.68924789275 | 1.96398110265 | 0.1626 |
| `equipment.RO1/train3.permeate.basis` | 'permeate_header_on_stream_perm1:_Q_=_m_/_rho_/_6_trains_(rho_996.955_kg/m3_from_the_case's_package_at_the_stream's_o... | 'permeate_header_on_stream_perm1:_Q_=_m_/_rho_/_6_trains_(rho_997.062_kg/m3_from_the_case's_package_at_the_stream's_o... | - |
| `equipment.RO1/train3.permeate.values.density` | 996.955091714 | 997.062178627 | 0.0001074 |
| `equipment.RO1/train3.permeate.values.flow` | 791.995351707 | 791.910289472 | 0.0001074 |
| `equipment.RO1/train3.permeate.values.flowPlant` | 4751.97211024 | 4751.46173683 | 0.0001074 |
| `equipment.RO1/train3.permeate.values.pressureDropPerMetre` | 53.7621231397 | 53.7563489563 | 0.0001074 |
| `equipment.RO1/train3.permeate.values.velocity` | 1.75069409903 | 1.75050607021 | 0.0001074 |
| `equipment.RO1/train4.brine.basis` | 'brine_header_on_stream_brine:_Q_=_m_/_rho_/_6_trains_(rho_996.931_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'brine_header_on_stream_brine:_Q_=_m_/_rho_/_6_trains_(rho_1040.9_kg/m3_from_the_case's_package_at_the_stream's_own_s... | - |
| `equipment.RO1/train4.brine.values.density` | 996.931337268 | 1040.9014655 | 0.04411 |
| `equipment.RO1/train4.brine.values.flow` | 927.450219857 | 888.272539314 | 0.04224 |
| `equipment.RO1/train4.brine.values.flowPlant` | 5564.70131914 | 5329.63523588 | 0.04224 |
| `equipment.RO1/train4.brine.values.frictionFactor` | 0.0138581785914 | 0.0138778481169 | 0.001419 |
| `equipment.RO1/train4.brine.values.headerNominalDiameter` | 0.45 | 0.4 | 0.1111 |
| `equipment.RO1/train4.brine.values.nominalInsideDiameter` | 0.45 | 0.4 | 0.1111 |
| `equipment.RO1/train4.brine.values.pressureDropPerMetre` | 40.2786855809 | 69.6160705405 | 0.7284 |
| `equipment.RO1/train4.brine.values.relativeRoughness` | 0.0001 | 0.0001125 | 0.125 |
| `equipment.RO1/train4.brine.values.requiredInsideDiameter` | 0.404980502908 | 0.396334546458 | 0.02135 |
| `equipment.RO1/train4.brine.values.reynolds` | 752270.157772 | 846303.927494 | 0.125 |
| `equipment.RO1/train4.brine.values.velocity` | 1.61984402702 | 1.96351340895 | 0.2122 |
| `equipment.RO1/train4.feed.basis` | 'feed_header_on_stream_roFeed:_Q_=_m_/_rho_/_6_trains_(rho_996.943_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'feed_header_on_stream_roFeed:_Q_=_m_/_rho_/_6_trains_(rho_1020.48_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO1/train4.feed.values.density` | 996.942655754 | 1020.47737702 | 0.02361 |
| `equipment.RO1/train4.feed.values.flow` | 1719.44492147 | 1679.7902874 | 0.02306 |
| `equipment.RO1/train4.feed.values.flowPlant` | 10316.6695288 | 10078.7417244 | 0.02306 |
| `equipment.RO1/train4.feed.values.frictionFactor` | 0.0130652128781 | 0.0130763399766 | 0.0008517 |
| `equipment.RO1/train4.feed.values.headerNominalDiameter` | 0.6 | 0.55 | 0.08333 |
| `equipment.RO1/train4.feed.values.nominalInsideDiameter` | 0.6 | 0.55 | 0.08333 |
| `equipment.RO1/train4.feed.values.pressureDropPerMetre` | 30.9736362885 | 46.7919892918 | 0.5107 |
| `equipment.RO1/train4.feed.values.relativeRoughness` | 7.5e-05 | 8.18181818182e-05 | 0.09091 |
| `equipment.RO1/train4.feed.values.requiredInsideDiameter` | 0.551420547944 | 0.545024900143 | 0.0116 |
| `equipment.RO1/train4.feed.values.reynolds` | 1046014.45989 | 1141106.68352 | 0.09091 |
| `equipment.RO1/train4.feed.values.velocity` | 1.68924789275 | 1.96398110265 | 0.1626 |
| `equipment.RO1/train4.permeate.basis` | 'permeate_header_on_stream_perm1:_Q_=_m_/_rho_/_6_trains_(rho_996.955_kg/m3_from_the_case's_package_at_the_stream's_o... | 'permeate_header_on_stream_perm1:_Q_=_m_/_rho_/_6_trains_(rho_997.062_kg/m3_from_the_case's_package_at_the_stream's_o... | - |
| `equipment.RO1/train4.permeate.values.density` | 996.955091714 | 997.062178627 | 0.0001074 |
| `equipment.RO1/train4.permeate.values.flow` | 791.995351707 | 791.910289472 | 0.0001074 |
| `equipment.RO1/train4.permeate.values.flowPlant` | 4751.97211024 | 4751.46173683 | 0.0001074 |
| `equipment.RO1/train4.permeate.values.pressureDropPerMetre` | 53.7621231397 | 53.7563489563 | 0.0001074 |
| `equipment.RO1/train4.permeate.values.velocity` | 1.75069409903 | 1.75050607021 | 0.0001074 |
| `equipment.RO1/train5.brine.basis` | 'brine_header_on_stream_brine:_Q_=_m_/_rho_/_6_trains_(rho_996.931_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'brine_header_on_stream_brine:_Q_=_m_/_rho_/_6_trains_(rho_1040.9_kg/m3_from_the_case's_package_at_the_stream's_own_s... | - |
| `equipment.RO1/train5.brine.values.density` | 996.931337268 | 1040.9014655 | 0.04411 |
| `equipment.RO1/train5.brine.values.flow` | 927.450219857 | 888.272539314 | 0.04224 |
| `equipment.RO1/train5.brine.values.flowPlant` | 5564.70131914 | 5329.63523588 | 0.04224 |
| `equipment.RO1/train5.brine.values.frictionFactor` | 0.0138581785914 | 0.0138778481169 | 0.001419 |
| `equipment.RO1/train5.brine.values.headerNominalDiameter` | 0.45 | 0.4 | 0.1111 |
| `equipment.RO1/train5.brine.values.nominalInsideDiameter` | 0.45 | 0.4 | 0.1111 |
| `equipment.RO1/train5.brine.values.pressureDropPerMetre` | 40.2786855809 | 69.6160705405 | 0.7284 |
| `equipment.RO1/train5.brine.values.relativeRoughness` | 0.0001 | 0.0001125 | 0.125 |
| `equipment.RO1/train5.brine.values.requiredInsideDiameter` | 0.404980502908 | 0.396334546458 | 0.02135 |
| `equipment.RO1/train5.brine.values.reynolds` | 752270.157772 | 846303.927494 | 0.125 |
| `equipment.RO1/train5.brine.values.velocity` | 1.61984402702 | 1.96351340895 | 0.2122 |
| `equipment.RO1/train5.feed.basis` | 'feed_header_on_stream_roFeed:_Q_=_m_/_rho_/_6_trains_(rho_996.943_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'feed_header_on_stream_roFeed:_Q_=_m_/_rho_/_6_trains_(rho_1020.48_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO1/train5.feed.values.density` | 996.942655754 | 1020.47737702 | 0.02361 |
| `equipment.RO1/train5.feed.values.flow` | 1719.44492147 | 1679.7902874 | 0.02306 |
| `equipment.RO1/train5.feed.values.flowPlant` | 10316.6695288 | 10078.7417244 | 0.02306 |
| `equipment.RO1/train5.feed.values.frictionFactor` | 0.0130652128781 | 0.0130763399766 | 0.0008517 |
| `equipment.RO1/train5.feed.values.headerNominalDiameter` | 0.6 | 0.55 | 0.08333 |
| `equipment.RO1/train5.feed.values.nominalInsideDiameter` | 0.6 | 0.55 | 0.08333 |
| `equipment.RO1/train5.feed.values.pressureDropPerMetre` | 30.9736362885 | 46.7919892918 | 0.5107 |
| `equipment.RO1/train5.feed.values.relativeRoughness` | 7.5e-05 | 8.18181818182e-05 | 0.09091 |
| `equipment.RO1/train5.feed.values.requiredInsideDiameter` | 0.551420547944 | 0.545024900143 | 0.0116 |
| `equipment.RO1/train5.feed.values.reynolds` | 1046014.45989 | 1141106.68352 | 0.09091 |
| `equipment.RO1/train5.feed.values.velocity` | 1.68924789275 | 1.96398110265 | 0.1626 |
| `equipment.RO1/train5.permeate.basis` | 'permeate_header_on_stream_perm1:_Q_=_m_/_rho_/_6_trains_(rho_996.955_kg/m3_from_the_case's_package_at_the_stream's_o... | 'permeate_header_on_stream_perm1:_Q_=_m_/_rho_/_6_trains_(rho_997.062_kg/m3_from_the_case's_package_at_the_stream's_o... | - |
| `equipment.RO1/train5.permeate.values.density` | 996.955091714 | 997.062178627 | 0.0001074 |
| `equipment.RO1/train5.permeate.values.flow` | 791.995351707 | 791.910289472 | 0.0001074 |
| `equipment.RO1/train5.permeate.values.flowPlant` | 4751.97211024 | 4751.46173683 | 0.0001074 |
| `equipment.RO1/train5.permeate.values.pressureDropPerMetre` | 53.7621231397 | 53.7563489563 | 0.0001074 |
| `equipment.RO1/train5.permeate.values.velocity` | 1.75069409903 | 1.75050607021 | 0.0001074 |
| `equipment.RO1/train6.brine.basis` | 'brine_header_on_stream_brine:_Q_=_m_/_rho_/_6_trains_(rho_996.931_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'brine_header_on_stream_brine:_Q_=_m_/_rho_/_6_trains_(rho_1040.9_kg/m3_from_the_case's_package_at_the_stream's_own_s... | - |
| `equipment.RO1/train6.brine.values.density` | 996.931337268 | 1040.9014655 | 0.04411 |
| `equipment.RO1/train6.brine.values.flow` | 927.450219857 | 888.272539314 | 0.04224 |
| `equipment.RO1/train6.brine.values.flowPlant` | 5564.70131914 | 5329.63523588 | 0.04224 |
| `equipment.RO1/train6.brine.values.frictionFactor` | 0.0138581785914 | 0.0138778481169 | 0.001419 |
| `equipment.RO1/train6.brine.values.headerNominalDiameter` | 0.45 | 0.4 | 0.1111 |
| `equipment.RO1/train6.brine.values.nominalInsideDiameter` | 0.45 | 0.4 | 0.1111 |
| `equipment.RO1/train6.brine.values.pressureDropPerMetre` | 40.2786855809 | 69.6160705405 | 0.7284 |
| `equipment.RO1/train6.brine.values.relativeRoughness` | 0.0001 | 0.0001125 | 0.125 |
| `equipment.RO1/train6.brine.values.requiredInsideDiameter` | 0.404980502908 | 0.396334546458 | 0.02135 |
| `equipment.RO1/train6.brine.values.reynolds` | 752270.157772 | 846303.927494 | 0.125 |
| `equipment.RO1/train6.brine.values.velocity` | 1.61984402702 | 1.96351340895 | 0.2122 |
| `equipment.RO1/train6.feed.basis` | 'feed_header_on_stream_roFeed:_Q_=_m_/_rho_/_6_trains_(rho_996.943_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'feed_header_on_stream_roFeed:_Q_=_m_/_rho_/_6_trains_(rho_1020.48_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO1/train6.feed.values.density` | 996.942655754 | 1020.47737702 | 0.02361 |
| `equipment.RO1/train6.feed.values.flow` | 1719.44492147 | 1679.7902874 | 0.02306 |
| `equipment.RO1/train6.feed.values.flowPlant` | 10316.6695288 | 10078.7417244 | 0.02306 |
| `equipment.RO1/train6.feed.values.frictionFactor` | 0.0130652128781 | 0.0130763399766 | 0.0008517 |
| `equipment.RO1/train6.feed.values.headerNominalDiameter` | 0.6 | 0.55 | 0.08333 |
| `equipment.RO1/train6.feed.values.nominalInsideDiameter` | 0.6 | 0.55 | 0.08333 |
| `equipment.RO1/train6.feed.values.pressureDropPerMetre` | 30.9736362885 | 46.7919892918 | 0.5107 |
| `equipment.RO1/train6.feed.values.relativeRoughness` | 7.5e-05 | 8.18181818182e-05 | 0.09091 |
| `equipment.RO1/train6.feed.values.requiredInsideDiameter` | 0.551420547944 | 0.545024900143 | 0.0116 |
| `equipment.RO1/train6.feed.values.reynolds` | 1046014.45989 | 1141106.68352 | 0.09091 |
| `equipment.RO1/train6.feed.values.velocity` | 1.68924789275 | 1.96398110265 | 0.1626 |
| `equipment.RO1/train6.permeate.basis` | 'permeate_header_on_stream_perm1:_Q_=_m_/_rho_/_6_trains_(rho_996.955_kg/m3_from_the_case's_package_at_the_stream's_o... | 'permeate_header_on_stream_perm1:_Q_=_m_/_rho_/_6_trains_(rho_997.062_kg/m3_from_the_case's_package_at_the_stream's_o... | - |
| `equipment.RO1/train6.permeate.values.density` | 996.955091714 | 997.062178627 | 0.0001074 |
| `equipment.RO1/train6.permeate.values.flow` | 791.995351707 | 791.910289472 | 0.0001074 |
| `equipment.RO1/train6.permeate.values.flowPlant` | 4751.97211024 | 4751.46173683 | 0.0001074 |
| `equipment.RO1/train6.permeate.values.pressureDropPerMetre` | 53.7621231397 | 53.7563489563 | 0.0001074 |
| `equipment.RO1/train6.permeate.values.velocity` | 1.75069409903 | 1.75050607021 | 0.0001074 |
| `equipment.RO2a/train1.brine.basis` | 'brine_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_996.899_kg/m3_from_the_case's_package_at_the_stream's_own... | 'brine_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_997.217_kg/m3_from_the_case's_package_at_the_stream's_own... | - |
| `equipment.RO2a/train1.brine.values.density` | 996.898941575 | 997.217311914 | 0.0003194 |
| `equipment.RO2a/train1.brine.values.flow` | 243.769779983 | 243.691954351 | 0.0003193 |
| `equipment.RO2a/train1.brine.values.flowPlant` | 1462.6186799 | 1462.1517261 | 0.0003193 |
| `equipment.RO2a/train1.brine.values.pressureDropPerMetre` | 60.1157632635 | 60.0965707808 | 0.0003193 |
| `equipment.RO2a/train1.brine.values.requiredInsideDiameter` | 0.207624568929 | 0.207591423305 | 0.0001596 |
| `equipment.RO2a/train1.brine.values.velocity` | 1.37945477194 | 1.37901436895 | 0.0003193 |
| `equipment.RO2a/train1.feed.basis` | 'feed_header_on_stream_feed2:_Q_=_m_/_rho_/_6_trains_(rho_996.901_kg/m3_from_the_case's_package_at_the_stream's_own_s... | 'feed_header_on_stream_feed2:_Q_=_m_/_rho_/_6_trains_(rho_997.048_kg/m3_from_the_case's_package_at_the_stream's_own_s... | - |
| `equipment.RO2a/train1.feed.values.density` | 996.901426952 | 997.048112081 | 0.0001471 |
| `equipment.RO2a/train1.feed.values.flow` | 792.037986055 | 791.921461894 | 0.0001471 |
| `equipment.RO2a/train1.feed.values.flowPlant` | 4752.22791633 | 4751.52877137 | 0.0001471 |
| `equipment.RO2a/train1.feed.values.pressureDropPerMetre` | 53.7650172388 | 53.7571073612 | 0.0001471 |
| `equipment.RO2a/train1.feed.values.velocity` | 1.75078834163 | 1.75053076668 | 0.0001471 |
| `equipment.RO2a/train1.permeate.basis` | 'permeate_header_on_stream_perm2a:_Q_=_m_/_rho_/_6_trains_(rho_996.903_kg/m3_from_the_case's_package_at_the_stream's_... | 'permeate_header_on_stream_perm2a:_Q_=_m_/_rho_/_6_trains_(rho_996.973_kg/m3_from_the_case's_package_at_the_stream's_... | - |
| `equipment.RO2a/train2.brine.basis` | 'brine_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_996.899_kg/m3_from_the_case's_package_at_the_stream's_own... | 'brine_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_997.217_kg/m3_from_the_case's_package_at_the_stream's_own... | - |
| `equipment.RO2a/train2.brine.values.density` | 996.898941575 | 997.217311914 | 0.0003194 |
| `equipment.RO2a/train2.brine.values.flow` | 243.769779983 | 243.691954351 | 0.0003193 |
| `equipment.RO2a/train2.brine.values.flowPlant` | 1462.6186799 | 1462.1517261 | 0.0003193 |
| `equipment.RO2a/train2.brine.values.pressureDropPerMetre` | 60.1157632635 | 60.0965707808 | 0.0003193 |
| `equipment.RO2a/train2.brine.values.requiredInsideDiameter` | 0.207624568929 | 0.207591423305 | 0.0001596 |
| `equipment.RO2a/train2.brine.values.velocity` | 1.37945477194 | 1.37901436895 | 0.0003193 |
| `equipment.RO2a/train2.feed.basis` | 'feed_header_on_stream_feed2:_Q_=_m_/_rho_/_6_trains_(rho_996.901_kg/m3_from_the_case's_package_at_the_stream's_own_s... | 'feed_header_on_stream_feed2:_Q_=_m_/_rho_/_6_trains_(rho_997.048_kg/m3_from_the_case's_package_at_the_stream's_own_s... | - |
| `equipment.RO2a/train2.feed.values.density` | 996.901426952 | 997.048112081 | 0.0001471 |
| `equipment.RO2a/train2.feed.values.flow` | 792.037986055 | 791.921461894 | 0.0001471 |
| `equipment.RO2a/train2.feed.values.flowPlant` | 4752.22791633 | 4751.52877137 | 0.0001471 |
| `equipment.RO2a/train2.feed.values.pressureDropPerMetre` | 53.7650172388 | 53.7571073612 | 0.0001471 |
| `equipment.RO2a/train2.feed.values.velocity` | 1.75078834163 | 1.75053076668 | 0.0001471 |
| `equipment.RO2a/train2.permeate.basis` | 'permeate_header_on_stream_perm2a:_Q_=_m_/_rho_/_6_trains_(rho_996.903_kg/m3_from_the_case's_package_at_the_stream's_... | 'permeate_header_on_stream_perm2a:_Q_=_m_/_rho_/_6_trains_(rho_996.973_kg/m3_from_the_case's_package_at_the_stream's_... | - |
| `equipment.RO2a/train3.brine.basis` | 'brine_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_996.899_kg/m3_from_the_case's_package_at_the_stream's_own... | 'brine_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_997.217_kg/m3_from_the_case's_package_at_the_stream's_own... | - |
| `equipment.RO2a/train3.brine.values.density` | 996.898941575 | 997.217311914 | 0.0003194 |
| `equipment.RO2a/train3.brine.values.flow` | 243.769779983 | 243.691954351 | 0.0003193 |
| `equipment.RO2a/train3.brine.values.flowPlant` | 1462.6186799 | 1462.1517261 | 0.0003193 |
| `equipment.RO2a/train3.brine.values.pressureDropPerMetre` | 60.1157632635 | 60.0965707808 | 0.0003193 |
| `equipment.RO2a/train3.brine.values.requiredInsideDiameter` | 0.207624568929 | 0.207591423305 | 0.0001596 |
| `equipment.RO2a/train3.brine.values.velocity` | 1.37945477194 | 1.37901436895 | 0.0003193 |
| `equipment.RO2a/train3.feed.basis` | 'feed_header_on_stream_feed2:_Q_=_m_/_rho_/_6_trains_(rho_996.901_kg/m3_from_the_case's_package_at_the_stream's_own_s... | 'feed_header_on_stream_feed2:_Q_=_m_/_rho_/_6_trains_(rho_997.048_kg/m3_from_the_case's_package_at_the_stream's_own_s... | - |
| `equipment.RO2a/train3.feed.values.density` | 996.901426952 | 997.048112081 | 0.0001471 |
| `equipment.RO2a/train3.feed.values.flow` | 792.037986055 | 791.921461894 | 0.0001471 |
| `equipment.RO2a/train3.feed.values.flowPlant` | 4752.22791633 | 4751.52877137 | 0.0001471 |
| `equipment.RO2a/train3.feed.values.pressureDropPerMetre` | 53.7650172388 | 53.7571073612 | 0.0001471 |
| `equipment.RO2a/train3.feed.values.velocity` | 1.75078834163 | 1.75053076668 | 0.0001471 |
| `equipment.RO2a/train3.permeate.basis` | 'permeate_header_on_stream_perm2a:_Q_=_m_/_rho_/_6_trains_(rho_996.903_kg/m3_from_the_case's_package_at_the_stream's_... | 'permeate_header_on_stream_perm2a:_Q_=_m_/_rho_/_6_trains_(rho_996.973_kg/m3_from_the_case's_package_at_the_stream's_... | - |
| `equipment.RO2a/train4.brine.basis` | 'brine_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_996.899_kg/m3_from_the_case's_package_at_the_stream's_own... | 'brine_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_997.217_kg/m3_from_the_case's_package_at_the_stream's_own... | - |
| `equipment.RO2a/train4.brine.values.density` | 996.898941575 | 997.217311914 | 0.0003194 |
| `equipment.RO2a/train4.brine.values.flow` | 243.769779983 | 243.691954351 | 0.0003193 |
| `equipment.RO2a/train4.brine.values.flowPlant` | 1462.6186799 | 1462.1517261 | 0.0003193 |
| `equipment.RO2a/train4.brine.values.pressureDropPerMetre` | 60.1157632635 | 60.0965707808 | 0.0003193 |
| `equipment.RO2a/train4.brine.values.requiredInsideDiameter` | 0.207624568929 | 0.207591423305 | 0.0001596 |
| `equipment.RO2a/train4.brine.values.velocity` | 1.37945477194 | 1.37901436895 | 0.0003193 |
| `equipment.RO2a/train4.feed.basis` | 'feed_header_on_stream_feed2:_Q_=_m_/_rho_/_6_trains_(rho_996.901_kg/m3_from_the_case's_package_at_the_stream's_own_s... | 'feed_header_on_stream_feed2:_Q_=_m_/_rho_/_6_trains_(rho_997.048_kg/m3_from_the_case's_package_at_the_stream's_own_s... | - |
| `equipment.RO2a/train4.feed.values.density` | 996.901426952 | 997.048112081 | 0.0001471 |
| `equipment.RO2a/train4.feed.values.flow` | 792.037986055 | 791.921461894 | 0.0001471 |
| `equipment.RO2a/train4.feed.values.flowPlant` | 4752.22791633 | 4751.52877137 | 0.0001471 |
| `equipment.RO2a/train4.feed.values.pressureDropPerMetre` | 53.7650172388 | 53.7571073612 | 0.0001471 |
| `equipment.RO2a/train4.feed.values.velocity` | 1.75078834163 | 1.75053076668 | 0.0001471 |
| `equipment.RO2a/train4.permeate.basis` | 'permeate_header_on_stream_perm2a:_Q_=_m_/_rho_/_6_trains_(rho_996.903_kg/m3_from_the_case's_package_at_the_stream's_... | 'permeate_header_on_stream_perm2a:_Q_=_m_/_rho_/_6_trains_(rho_996.973_kg/m3_from_the_case's_package_at_the_stream's_... | - |
| `equipment.RO2a/train5.brine.basis` | 'brine_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_996.899_kg/m3_from_the_case's_package_at_the_stream's_own... | 'brine_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_997.217_kg/m3_from_the_case's_package_at_the_stream's_own... | - |
| `equipment.RO2a/train5.brine.values.density` | 996.898941575 | 997.217311914 | 0.0003194 |
| `equipment.RO2a/train5.brine.values.flow` | 243.769779983 | 243.691954351 | 0.0003193 |
| `equipment.RO2a/train5.brine.values.flowPlant` | 1462.6186799 | 1462.1517261 | 0.0003193 |
| `equipment.RO2a/train5.brine.values.pressureDropPerMetre` | 60.1157632635 | 60.0965707808 | 0.0003193 |
| `equipment.RO2a/train5.brine.values.requiredInsideDiameter` | 0.207624568929 | 0.207591423305 | 0.0001596 |
| `equipment.RO2a/train5.brine.values.velocity` | 1.37945477194 | 1.37901436895 | 0.0003193 |
| `equipment.RO2a/train5.feed.basis` | 'feed_header_on_stream_feed2:_Q_=_m_/_rho_/_6_trains_(rho_996.901_kg/m3_from_the_case's_package_at_the_stream's_own_s... | 'feed_header_on_stream_feed2:_Q_=_m_/_rho_/_6_trains_(rho_997.048_kg/m3_from_the_case's_package_at_the_stream's_own_s... | - |
| `equipment.RO2a/train5.feed.values.density` | 996.901426952 | 997.048112081 | 0.0001471 |
| `equipment.RO2a/train5.feed.values.flow` | 792.037986055 | 791.921461894 | 0.0001471 |
| `equipment.RO2a/train5.feed.values.flowPlant` | 4752.22791633 | 4751.52877137 | 0.0001471 |
| `equipment.RO2a/train5.feed.values.pressureDropPerMetre` | 53.7650172388 | 53.7571073612 | 0.0001471 |
| `equipment.RO2a/train5.feed.values.velocity` | 1.75078834163 | 1.75053076668 | 0.0001471 |
| `equipment.RO2a/train5.permeate.basis` | 'permeate_header_on_stream_perm2a:_Q_=_m_/_rho_/_6_trains_(rho_996.903_kg/m3_from_the_case's_package_at_the_stream's_... | 'permeate_header_on_stream_perm2a:_Q_=_m_/_rho_/_6_trains_(rho_996.973_kg/m3_from_the_case's_package_at_the_stream's_... | - |
| `equipment.RO2a/train6.brine.basis` | 'brine_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_996.899_kg/m3_from_the_case's_package_at_the_stream's_own... | 'brine_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_997.217_kg/m3_from_the_case's_package_at_the_stream's_own... | - |
| `equipment.RO2a/train6.brine.values.density` | 996.898941575 | 997.217311914 | 0.0003194 |
| `equipment.RO2a/train6.brine.values.flow` | 243.769779983 | 243.691954351 | 0.0003193 |
| `equipment.RO2a/train6.brine.values.flowPlant` | 1462.6186799 | 1462.1517261 | 0.0003193 |
| `equipment.RO2a/train6.brine.values.pressureDropPerMetre` | 60.1157632635 | 60.0965707808 | 0.0003193 |
| `equipment.RO2a/train6.brine.values.requiredInsideDiameter` | 0.207624568929 | 0.207591423305 | 0.0001596 |
| `equipment.RO2a/train6.brine.values.velocity` | 1.37945477194 | 1.37901436895 | 0.0003193 |
| `equipment.RO2a/train6.feed.basis` | 'feed_header_on_stream_feed2:_Q_=_m_/_rho_/_6_trains_(rho_996.901_kg/m3_from_the_case's_package_at_the_stream's_own_s... | 'feed_header_on_stream_feed2:_Q_=_m_/_rho_/_6_trains_(rho_997.048_kg/m3_from_the_case's_package_at_the_stream's_own_s... | - |
| `equipment.RO2a/train6.feed.values.density` | 996.901426952 | 997.048112081 | 0.0001471 |
| `equipment.RO2a/train6.feed.values.flow` | 792.037986055 | 791.921461894 | 0.0001471 |
| `equipment.RO2a/train6.feed.values.flowPlant` | 4752.22791633 | 4751.52877137 | 0.0001471 |
| `equipment.RO2a/train6.feed.values.pressureDropPerMetre` | 53.7650172388 | 53.7571073612 | 0.0001471 |
| `equipment.RO2a/train6.feed.values.velocity` | 1.75078834163 | 1.75053076668 | 0.0001471 |
| `equipment.RO2a/train6.permeate.basis` | 'permeate_header_on_stream_perm2a:_Q_=_m_/_rho_/_6_trains_(rho_996.903_kg/m3_from_the_case's_package_at_the_stream's_... | 'permeate_header_on_stream_perm2a:_Q_=_m_/_rho_/_6_trains_(rho_996.973_kg/m3_from_the_case's_package_at_the_stream's_... | - |
| `equipment.RO2b/train1.brine.basis` | 'brine_header_on_stream_conc2:_Q_=_m_/_rho_/_6_trains_(rho_996.895_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'brine_header_on_stream_conc2:_Q_=_m_/_rho_/_6_trains_(rho_997.528_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO2b/train1.brine.values.density` | 996.894502569 | 997.528222983 | 0.0006357 |
| `equipment.RO2b/train1.brine.values.flow` | 106.912503885 | 106.844583364 | 0.0006353 |
| `equipment.RO2b/train1.brine.values.flowPlant` | 641.475023309 | 641.067500186 | 0.0006353 |
| `equipment.RO2b/train1.brine.values.pressureDropPerMetre` | 162.350695723 | 162.247555834 | 0.0006353 |
| `equipment.RO2b/train1.brine.values.requiredInsideDiameter` | 0.137500115037 | 0.137456431825 | 0.0003177 |
| `equipment.RO2b/train1.brine.values.velocity` | 1.68055836757 | 1.67949072445 | 0.0006353 |
| `equipment.RO2b/train1.feed.basis` | 'feed_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_996.899_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'feed_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_997.217_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO2b/train1.feed.values.density` | 996.898941575 | 997.217311914 | 0.0003194 |
| `equipment.RO2b/train1.feed.values.flow` | 243.769779983 | 243.691954351 | 0.0003193 |
| `equipment.RO2b/train1.feed.values.flowPlant` | 1462.6186799 | 1462.1517261 | 0.0003193 |
| `equipment.RO2b/train1.feed.values.pressureDropPerMetre` | 60.1157632635 | 60.0965707808 | 0.0003193 |
| `equipment.RO2b/train1.feed.values.requiredInsideDiameter` | 0.207624568929 | 0.207591423305 | 0.0001596 |
| `equipment.RO2b/train1.feed.values.velocity` | 1.37945477194 | 1.37901436895 | 0.0003193 |
| `equipment.RO2b/train1.permeate.basis` | 'permeate_header_on_stream_perm2b:_Q_=_m_/_rho_/_6_trains_(rho_996.902_kg/m3_from_the_case's_package_at_the_stream's_... | 'permeate_header_on_stream_perm2b:_Q_=_m_/_rho_/_6_trains_(rho_996.975_kg/m3_from_the_case's_package_at_the_stream's_... | - |
| `equipment.RO2b/train2.brine.basis` | 'brine_header_on_stream_conc2:_Q_=_m_/_rho_/_6_trains_(rho_996.895_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'brine_header_on_stream_conc2:_Q_=_m_/_rho_/_6_trains_(rho_997.528_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO2b/train2.brine.values.density` | 996.894502569 | 997.528222983 | 0.0006357 |
| `equipment.RO2b/train2.brine.values.flow` | 106.912503885 | 106.844583364 | 0.0006353 |
| `equipment.RO2b/train2.brine.values.flowPlant` | 641.475023309 | 641.067500186 | 0.0006353 |
| `equipment.RO2b/train2.brine.values.pressureDropPerMetre` | 162.350695723 | 162.247555834 | 0.0006353 |
| `equipment.RO2b/train2.brine.values.requiredInsideDiameter` | 0.137500115037 | 0.137456431825 | 0.0003177 |
| `equipment.RO2b/train2.brine.values.velocity` | 1.68055836757 | 1.67949072445 | 0.0006353 |
| `equipment.RO2b/train2.feed.basis` | 'feed_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_996.899_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'feed_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_997.217_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO2b/train2.feed.values.density` | 996.898941575 | 997.217311914 | 0.0003194 |
| `equipment.RO2b/train2.feed.values.flow` | 243.769779983 | 243.691954351 | 0.0003193 |
| `equipment.RO2b/train2.feed.values.flowPlant` | 1462.6186799 | 1462.1517261 | 0.0003193 |
| `equipment.RO2b/train2.feed.values.pressureDropPerMetre` | 60.1157632635 | 60.0965707808 | 0.0003193 |
| `equipment.RO2b/train2.feed.values.requiredInsideDiameter` | 0.207624568929 | 0.207591423305 | 0.0001596 |
| `equipment.RO2b/train2.feed.values.velocity` | 1.37945477194 | 1.37901436895 | 0.0003193 |
| `equipment.RO2b/train2.permeate.basis` | 'permeate_header_on_stream_perm2b:_Q_=_m_/_rho_/_6_trains_(rho_996.902_kg/m3_from_the_case's_package_at_the_stream's_... | 'permeate_header_on_stream_perm2b:_Q_=_m_/_rho_/_6_trains_(rho_996.975_kg/m3_from_the_case's_package_at_the_stream's_... | - |
| `equipment.RO2b/train3.brine.basis` | 'brine_header_on_stream_conc2:_Q_=_m_/_rho_/_6_trains_(rho_996.895_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'brine_header_on_stream_conc2:_Q_=_m_/_rho_/_6_trains_(rho_997.528_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO2b/train3.brine.values.density` | 996.894502569 | 997.528222983 | 0.0006357 |
| `equipment.RO2b/train3.brine.values.flow` | 106.912503885 | 106.844583364 | 0.0006353 |
| `equipment.RO2b/train3.brine.values.flowPlant` | 641.475023309 | 641.067500186 | 0.0006353 |
| `equipment.RO2b/train3.brine.values.pressureDropPerMetre` | 162.350695723 | 162.247555834 | 0.0006353 |
| `equipment.RO2b/train3.brine.values.requiredInsideDiameter` | 0.137500115037 | 0.137456431825 | 0.0003177 |
| `equipment.RO2b/train3.brine.values.velocity` | 1.68055836757 | 1.67949072445 | 0.0006353 |
| `equipment.RO2b/train3.feed.basis` | 'feed_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_996.899_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'feed_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_997.217_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO2b/train3.feed.values.density` | 996.898941575 | 997.217311914 | 0.0003194 |
| `equipment.RO2b/train3.feed.values.flow` | 243.769779983 | 243.691954351 | 0.0003193 |
| `equipment.RO2b/train3.feed.values.flowPlant` | 1462.6186799 | 1462.1517261 | 0.0003193 |
| `equipment.RO2b/train3.feed.values.pressureDropPerMetre` | 60.1157632635 | 60.0965707808 | 0.0003193 |
| `equipment.RO2b/train3.feed.values.requiredInsideDiameter` | 0.207624568929 | 0.207591423305 | 0.0001596 |
| `equipment.RO2b/train3.feed.values.velocity` | 1.37945477194 | 1.37901436895 | 0.0003193 |
| `equipment.RO2b/train3.permeate.basis` | 'permeate_header_on_stream_perm2b:_Q_=_m_/_rho_/_6_trains_(rho_996.902_kg/m3_from_the_case's_package_at_the_stream's_... | 'permeate_header_on_stream_perm2b:_Q_=_m_/_rho_/_6_trains_(rho_996.975_kg/m3_from_the_case's_package_at_the_stream's_... | - |
| `equipment.RO2b/train4.brine.basis` | 'brine_header_on_stream_conc2:_Q_=_m_/_rho_/_6_trains_(rho_996.895_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'brine_header_on_stream_conc2:_Q_=_m_/_rho_/_6_trains_(rho_997.528_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO2b/train4.brine.values.density` | 996.894502569 | 997.528222983 | 0.0006357 |
| `equipment.RO2b/train4.brine.values.flow` | 106.912503885 | 106.844583364 | 0.0006353 |
| `equipment.RO2b/train4.brine.values.flowPlant` | 641.475023309 | 641.067500186 | 0.0006353 |
| `equipment.RO2b/train4.brine.values.pressureDropPerMetre` | 162.350695723 | 162.247555834 | 0.0006353 |
| `equipment.RO2b/train4.brine.values.requiredInsideDiameter` | 0.137500115037 | 0.137456431825 | 0.0003177 |
| `equipment.RO2b/train4.brine.values.velocity` | 1.68055836757 | 1.67949072445 | 0.0006353 |
| `equipment.RO2b/train4.feed.basis` | 'feed_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_996.899_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'feed_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_997.217_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO2b/train4.feed.values.density` | 996.898941575 | 997.217311914 | 0.0003194 |
| `equipment.RO2b/train4.feed.values.flow` | 243.769779983 | 243.691954351 | 0.0003193 |
| `equipment.RO2b/train4.feed.values.flowPlant` | 1462.6186799 | 1462.1517261 | 0.0003193 |
| `equipment.RO2b/train4.feed.values.pressureDropPerMetre` | 60.1157632635 | 60.0965707808 | 0.0003193 |
| `equipment.RO2b/train4.feed.values.requiredInsideDiameter` | 0.207624568929 | 0.207591423305 | 0.0001596 |
| `equipment.RO2b/train4.feed.values.velocity` | 1.37945477194 | 1.37901436895 | 0.0003193 |
| `equipment.RO2b/train4.permeate.basis` | 'permeate_header_on_stream_perm2b:_Q_=_m_/_rho_/_6_trains_(rho_996.902_kg/m3_from_the_case's_package_at_the_stream's_... | 'permeate_header_on_stream_perm2b:_Q_=_m_/_rho_/_6_trains_(rho_996.975_kg/m3_from_the_case's_package_at_the_stream's_... | - |
| `equipment.RO2b/train5.brine.basis` | 'brine_header_on_stream_conc2:_Q_=_m_/_rho_/_6_trains_(rho_996.895_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'brine_header_on_stream_conc2:_Q_=_m_/_rho_/_6_trains_(rho_997.528_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO2b/train5.brine.values.density` | 996.894502569 | 997.528222983 | 0.0006357 |
| `equipment.RO2b/train5.brine.values.flow` | 106.912503885 | 106.844583364 | 0.0006353 |
| `equipment.RO2b/train5.brine.values.flowPlant` | 641.475023309 | 641.067500186 | 0.0006353 |
| `equipment.RO2b/train5.brine.values.pressureDropPerMetre` | 162.350695723 | 162.247555834 | 0.0006353 |
| `equipment.RO2b/train5.brine.values.requiredInsideDiameter` | 0.137500115037 | 0.137456431825 | 0.0003177 |
| `equipment.RO2b/train5.brine.values.velocity` | 1.68055836757 | 1.67949072445 | 0.0006353 |
| `equipment.RO2b/train5.feed.basis` | 'feed_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_996.899_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'feed_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_997.217_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO2b/train5.feed.values.density` | 996.898941575 | 997.217311914 | 0.0003194 |
| `equipment.RO2b/train5.feed.values.flow` | 243.769779983 | 243.691954351 | 0.0003193 |
| `equipment.RO2b/train5.feed.values.flowPlant` | 1462.6186799 | 1462.1517261 | 0.0003193 |
| `equipment.RO2b/train5.feed.values.pressureDropPerMetre` | 60.1157632635 | 60.0965707808 | 0.0003193 |
| `equipment.RO2b/train5.feed.values.requiredInsideDiameter` | 0.207624568929 | 0.207591423305 | 0.0001596 |
| `equipment.RO2b/train5.feed.values.velocity` | 1.37945477194 | 1.37901436895 | 0.0003193 |
| `equipment.RO2b/train5.permeate.basis` | 'permeate_header_on_stream_perm2b:_Q_=_m_/_rho_/_6_trains_(rho_996.902_kg/m3_from_the_case's_package_at_the_stream's_... | 'permeate_header_on_stream_perm2b:_Q_=_m_/_rho_/_6_trains_(rho_996.975_kg/m3_from_the_case's_package_at_the_stream's_... | - |
| `equipment.RO2b/train6.brine.basis` | 'brine_header_on_stream_conc2:_Q_=_m_/_rho_/_6_trains_(rho_996.895_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'brine_header_on_stream_conc2:_Q_=_m_/_rho_/_6_trains_(rho_997.528_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO2b/train6.brine.values.density` | 996.894502569 | 997.528222983 | 0.0006357 |
| `equipment.RO2b/train6.brine.values.flow` | 106.912503885 | 106.844583364 | 0.0006353 |
| `equipment.RO2b/train6.brine.values.flowPlant` | 641.475023309 | 641.067500186 | 0.0006353 |
| `equipment.RO2b/train6.brine.values.pressureDropPerMetre` | 162.350695723 | 162.247555834 | 0.0006353 |
| `equipment.RO2b/train6.brine.values.requiredInsideDiameter` | 0.137500115037 | 0.137456431825 | 0.0003177 |
| `equipment.RO2b/train6.brine.values.velocity` | 1.68055836757 | 1.67949072445 | 0.0006353 |
| `equipment.RO2b/train6.feed.basis` | 'feed_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_996.899_kg/m3_from_the_case's_package_at_the_stream's_own_... | 'feed_header_on_stream_conc2a:_Q_=_m_/_rho_/_6_trains_(rho_997.217_kg/m3_from_the_case's_package_at_the_stream's_own_... | - |
| `equipment.RO2b/train6.feed.values.density` | 996.898941575 | 997.217311914 | 0.0003194 |
| `equipment.RO2b/train6.feed.values.flow` | 243.769779983 | 243.691954351 | 0.0003193 |
| `equipment.RO2b/train6.feed.values.flowPlant` | 1462.6186799 | 1462.1517261 | 0.0003193 |
| `equipment.RO2b/train6.feed.values.pressureDropPerMetre` | 60.1157632635 | 60.0965707808 | 0.0003193 |
| `equipment.RO2b/train6.feed.values.requiredInsideDiameter` | 0.207624568929 | 0.207591423305 | 0.0001596 |
| `equipment.RO2b/train6.feed.values.velocity` | 1.37945477194 | 1.37901436895 | 0.0003193 |
| `equipment.RO2b/train6.permeate.basis` | 'permeate_header_on_stream_perm2b:_Q_=_m_/_rho_/_6_trains_(rho_996.902_kg/m3_from_the_case's_package_at_the_stream's_... | 'permeate_header_on_stream_perm2b:_Q_=_m_/_rho_/_6_trains_(rho_996.975_kg/m3_from_the_case's_package_at_the_stream's_... | - |
| `source.CartridgeFilters.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.Disinfection.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.inventory_'Disinfection/tank1'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.inventory_'ProductTank/tank1'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.inventory_'ProductTank/tank2'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.inventory_'ProductTank/tank3'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.inventory_'Remineralisation/tank1'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.MediaFilters.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.pipeHeader_'RO1'_brine_header_(stream_brine).liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.pipeHeader_'RO1'_feed_header_(stream_roFeed).liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.pipeHeader_'RO1'_permeate_header_(stream_perm1).liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.pipeHeader_'RO2a'_brine_header_(stream_conc2a).liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.pipeHeader_'RO2a'_feed_header_(stream_feed2).liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.pipeHeader_'RO2a'_permeate_header_(stream_perm2a).liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.pipeHeader_'RO2b'_brine_header_(stream_conc2).liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.pipeHeader_'RO2b'_feed_header_(stream_conc2a).liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.pipeHeader_'RO2b'_permeate_header_(stream_perm2b).liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.ProductTank.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.Remineralisation.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.storage_'Disinfection'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.storage_'ProductTank'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |
| `source.storage_'Remineralisation'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'solutionLaw.NaCl-water' | - |

## column09_tray_hydraulics  (tutorials/steady/distillation/column09_tray_hydraulics)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column09.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## column10_flooding  (tutorials/steady/distillation/column10_flooding)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column10.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## column11_murphree  (tutorials/steady/distillation/column11_murphree)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column11.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## column17_exchanger_design  (tutorials/steady/distillation/column17_exchanger_design)
3 rows beyond tolerance (3 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column17.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.ShellTubeHX:_column_'column17'_condenser_(design).liquidDensity` | 'liquidVolume.idealMix[anchoredRackett],pureFluid.IF97' | 'idealMixing[anchoredRackett],pureFluid.IF97' | - |
| `source.ShellTubeHX:_column_'column17'_reboiler_(design).liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## packing01_schulz_0p10bar  (tutorials/steady/distillation/packing01_schulz_0p10bar)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## packing02_schulz_0p02bar  (tutorials/steady/distillation/packing02_schulz_0p02bar)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## packing03_schulz_delft_0p10bar  (tutorials/steady/distillation/packing03_schulz_delft_0p10bar)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## packing04_schulz_delft_0p02bar  (tutorials/steady/distillation/packing04_schulz_delft_0p02bar)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## packing05_schulz_record_0p10bar  (tutorials/steady/distillation/packing05_schulz_record_0p10bar)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## ratebased01_schulz_0p10bar  (tutorials/steady/distillation/ratebased01_schulz_0p10bar)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## ratebased02_schulz_0p02bar  (tutorials/steady/distillation/ratebased02_schulz_0p02bar)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## ratebased03_schulz_delft_0p10bar  (tutorials/steady/distillation/ratebased03_schulz_delft_0p10bar)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## ratebased04_schulz_delft_0p02bar  (tutorials/steady/distillation/ratebased04_schulz_delft_0p02bar)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## totalReflux01_c6c7_yanagiRun628  (tutorials/steady/distillation/totalReflux01_c6c7_yanagiRun628)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## trayEfficiency01_yanagi14  (tutorials/steady/distillation/trayEfficiency01_yanagi14)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## trayEfficiency02_yanagi08  (tutorials/steady/distillation/trayEfficiency02_yanagi08)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## trayEfficiency03_yanagi14_165kPa  (tutorials/steady/distillation/trayEfficiency03_yanagi14_165kPa)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## trayEfficiency04_yanagi08_165kPa  (tutorials/steady/distillation/trayEfficiency04_yanagi08_165kPa)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## trayEfficiency05_chanFair_yanagi14  (tutorials/steady/distillation/trayEfficiency05_chanFair_yanagi14)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## trayEfficiency06_syedaChuang_yanagi14  (tutorials/steady/distillation/trayEfficiency06_syedaChuang_yanagi14)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## trayEfficiency07_syedaChuang_yanagi08  (tutorials/steady/distillation/trayEfficiency07_syedaChuang_yanagi08)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.column.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## sprayDryer01_sugar  (tutorials/steady/drying/sprayDryer01_sugar)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: W + R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.dryer.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'idealMixing[referenceEquation.IAPWS95+flatVliq]' | - |

## sprayDryer02_residence_sweep  (tutorials/steady/drying/sprayDryer02_residence_sweep)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: W + R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.dryer.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'idealMixing[referenceEquation.IAPWS95+flatVliq]' | - |

## sprayDryer03_pressure_nozzle  (tutorials/steady/drying/sprayDryer03_pressure_nozzle)
14 rows beyond tolerance (1 `source`, 13 numeric). Causes: W + R.
Largest numeric move: `kpi.dryer.Re` 0.134 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.dryer.Re` | 0.239942366707 | 0.240264476504 | 0.001342 |
| `kpi.dryer.d10_micron` | 14.681995497 | 14.6885575842 | 0.0004469 |
| `kpi.dryer.d50_micron` | 31.631586309 | 31.6457239804 | 0.0004469 |
| `kpi.dryer.d90_micron` | 54.3710964545 | 54.3953975025 | 0.0004469 |
| `kpi.dryer.d_particle` | 4.02144261714e-05 | 4.02323999251e-05 | 0.0004469 |
| `kpi.dryer.d_particle_micron` | 40.2144261714 | 40.2323999251 | 0.0004469 |
| `kpi.dryer.residenceTime` | 6.94634503812 | 6.94501517767 | 0.0001914 |
| `kpi.dryer.rho_liquid` | 1177.88742133 | 1179.4674903 | 0.001341 |
| `kpi.dryer.t_constant_rate` | 0.085086673804 | 0.0851940873644 | 0.001262 |
| `kpi.dryer.tau_dry_constant` | 0.0945416606284 | 0.09466101018 | 0.001262 |
| `kpi.dryer.v_particle` | 0.719803000363 | 0.719940831242 | 0.0001915 |
| `kpi.dryer.v_terminal` | 0.102671411005 | 0.102809241884 | 0.001342 |
| `kpi.dryer.atomiserPower` | 134.762023381 | 134.581489968 | 0.00134 |
| `source.dryer.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'idealMixing[referenceEquation.IAPWS95+flatVliq]' | - |

## sprayDryer04_profiles  (tutorials/steady/drying/sprayDryer04_profiles)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: W + R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.dryer.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'idealMixing[referenceEquation.IAPWS95+flatVliq]' | - |

## sprayDryer05_whey  (tutorials/steady/drying/sprayDryer05_whey)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: W + R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.dryer.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'idealMixing[referenceEquation.IAPWS95+flatVliq]' | - |

## sprayDryer06_rea  (tutorials/steady/drying/sprayDryer06_rea)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: W + R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.dryer.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'idealMixing[referenceEquation.IAPWS95+flatVliq]' | - |

## sprayDryer07_design  (tutorials/steady/drying/sprayDryer07_design)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: W + R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.dryer.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'idealMixing[referenceEquation.IAPWS95+flatVliq]' | - |

## economics04_building_royalty_breakeven  (tutorials/steady/economics/economics04_building_royalty_breakeven)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: W + R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.dryer.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'idealMixing[referenceEquation.IAPWS95+flatVliq]' | - |

## flash22_drum_sizing_benzene_toluene  (tutorials/steady/flash/flash22_drum_sizing_benzene_toluene)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.drum_'drum'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## credo01_valve_heater_drum  (tutorials/steady/flowsheets/credo01_valve_heater_drum)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.V1.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## table05_sector_table_pins  (tutorials/steady/flowsheets/table05_sector_table_pins)
14 rows beyond tolerance (2 `source`, 12 numeric). Causes: W + R.
Largest numeric move: `kpi.A.P1.head_loss_m` 0.298 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.A.P1.dP_elevation` | 19520.1545706 | 19549.279243 | 0.001492 |
| `kpi.A.P1.dP_fittings` | 9626.38419279 | 9612.04272872 | 0.00149 |
| `kpi.A.P1.dP_friction` | 7869.3167296 | 7857.59295867 | 0.00149 |
| `kpi.A.P1.density` | 995.250904772 | 996.735849804 | 0.001492 |
| `kpi.A.P1.head_loss_m` | 1.79257811296 | 1.78724089725 | 0.002977 |
| `kpi.A.P1.velocity` | 1.28038123008 | 1.27847370789 | 0.00149 |
| `kpi.B.P1.dP_elevation` | 19520.1545706 | 19549.279243 | 0.001492 |
| `kpi.B.P1.dP_fittings` | 9626.38419279 | 9612.04272872 | 0.00149 |
| `kpi.B.P1.dP_friction` | 7873.53221993 | 7861.80216873 | 0.00149 |
| `kpi.B.P1.density` | 995.250904772 | 996.735849804 | 0.001492 |
| `kpi.B.P1.head_loss_m` | 1.79301002453 | 1.78767152285 | 0.002977 |
| `kpi.B.P1.velocity` | 1.28038123008 | 1.27847370789 | 0.00149 |
| `source.A.P1.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |
| `source.B.P1.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |

## letdown01_ammonia_flashing  (tutorials/steady/hydraulics/letdown01_ammonia_flashing)
2 rows beyond tolerance (2 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.ValveHP.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.ValveLP.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## pipe01_water_line  (tutorials/steady/hydraulics/pipe01_water_line)
7 rows beyond tolerance (1 `source`, 6 numeric). Causes: W + R.
Largest numeric move: `kpi.P1.head_loss_m` 0.298 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.P1.dP_elevation` | 19520.1545706 | 19549.279243 | 0.001492 |
| `kpi.P1.dP_fittings` | 9626.38419279 | 9612.04272872 | 0.00149 |
| `kpi.P1.dP_friction` | 7867.15916089 | 7855.43860432 | 0.00149 |
| `kpi.P1.density` | 995.250904772 | 996.735849804 | 0.001492 |
| `kpi.P1.head_loss_m` | 1.79235705234 | 1.78702049482 | 0.002977 |
| `kpi.P1.velocity` | 1.28038123008 | 1.27847370789 | 0.00149 |
| `source.P1.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |

## pipe02_airwater_twophase  (tutorials/steady/hydraulics/pipe02_airwater_twophase)
3 rows beyond tolerance (1 `source`, 2 numeric). Causes: W + R.
Largest numeric move: `kpi.P1.rho_L` 0.0136 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.P1.jL` | 0.511171181109 | 0.511101527873 | 0.0001363 |
| `kpi.P1.rho_L` | 996.956281129 | 997.092146955 | 0.0001363 |
| `source.P1.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |

## pipe03_sucrose_syrup_measured  (tutorials/steady/hydraulics/pipe03_sucrose_syrup_measured)
8 rows beyond tolerance (1 `source`, 7 numeric). Causes: W + R.
Largest numeric move: `kpi.L1.head_loss_m` 0.394 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.L1.P_out` | 257487.669679 | 257571.453135 | 0.0003254 |
| `kpi.L1.dP_fittings` | 7309.72180741 | 7295.31578085 | 0.001971 |
| `kpi.L1.dP_friction` | 35202.6085138 | 35133.2310837 | 0.001971 |
| `kpi.L1.deltaP` | 42512.3303212 | 42428.5468645 | 0.001971 |
| `kpi.L1.density` | 1044.55017402 | 1046.61284245 | 0.001975 |
| `kpi.L1.head_loss_m` | 4.15016085949 | 4.13381867449 | 0.003938 |
| `kpi.L1.velocity` | 2.78846062847 | 2.78296512002 | 0.001971 |
| `source.L1.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett+flatVliq]' | 'idealMixing[referenceEquation.IAPWS95+flatVliq]' | - |

## pipe04_powerlaw_polymer_solution  (tutorials/steady/hydraulics/pipe04_powerlaw_polymer_solution)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.L1.liquidDensity` | 'liquidVolume.idealMix[flatVliq]' | 'idealMixing[flatVliq]' | - |

## pipe05_herschelbulkley_clay_slurry  (tutorials/steady/hydraulics/pipe05_herschelbulkley_clay_slurry)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.L1.liquidDensity` | 'liquidVolume.idealMix[flatVliq]' | 'idealMixing[flatVliq]' | - |

## pipe06_turbulent_dodge_metzner  (tutorials/steady/hydraulics/pipe06_turbulent_dodge_metzner)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.L1.liquidDensity` | 'liquidVolume.idealMix[flatVliq]' | 'idealMixing[flatVliq]' | - |

## pumpSystem01_operating_point  (tutorials/steady/hydraulics/pumpSystem01_operating_point)
8 rows beyond tolerance (1 `source`, 7 numeric). Causes: W + R.
Largest numeric move: `kpi.P1.head_loss_m` 0.044 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.P1.dP_elevation` | 19553.4351728 | 19557.7415678 | 0.0002202 |
| `kpi.P1.dP_fittings` | 31136.3992358 | 31129.5433505 | 0.0002202 |
| `kpi.P1.dP_friction` | 24154.9845033 | 24149.6658471 | 0.0002202 |
| `kpi.P1.deltaP` | 74844.818912 | 74836.9507655 | 0.0001051 |
| `kpi.P1.density` | 996.947743257 | 997.167308295 | 0.0002202 |
| `kpi.P1.head_loss_m` | 5.65541381864 | 5.65292357567 | 0.0004403 |
| `kpi.P1.velocity` | 2.30076356093 | 2.30025695865 | 0.0002202 |
| `source.P1.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |

## centrifuge01_tubularBowl_geankoplis  (tutorials/steady/solids/centrifuge01_tubularBowl_geankoplis)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.bowl.liquidDensity` | 'liquidVolume.idealMix[flatVliq]' | 'idealMixing[flatVliq]' | - |

## centrifuge02_discStack_sigmaIdentity  (tutorials/steady/solids/centrifuge02_discStack_sigmaIdentity)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: W + R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.stack.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |

## filter01_caco3_rotaryDrum  (tutorials/steady/solids/filter01_caco3_rotaryDrum)
5 rows beyond tolerance (1 `source`, 4 numeric). Causes: W + R.
Largest numeric move: `kpi.drum.Kp_s_m6` 0.025 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.drum.Kp_s_m6` | 11349.5827054 | 11352.4190955 | 0.0002499 |
| `kpi.drum.cS_eq24_2_10_kg_m3` | 308.106562087 | 308.145059353 | 0.0001249 |
| `kpi.drum.filtratePerCycle_m3` | 0.12057354369 | 0.120558480162 | 0.0001249 |
| `kpi.drum.rho_liquid` | 996.910236552 | 997.034798385 | 0.0001249 |
| `source.drum.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |

## filter02_caco3_pressWashing  (tutorials/steady/solids/filter02_caco3_pressWashing)
8 rows beyond tolerance (1 `source`, 7 numeric). Causes: W + R.
Largest numeric move: `kpi.press.cS_kg_m3` 0.0125 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.press.cS_eq24_2_10_kg_m3` | 23.4702408789 | 23.4731734361 | 0.0001249 |
| `kpi.press.cS_kg_m3` | 23.4702408789 | 23.4731734361 | 0.0001249 |
| `kpi.press.cakeSolidsPerArea_kg_m2` | 4.53005222004 | 4.53061824052 | 0.0001249 |
| `kpi.press.filtrate_m3_s` | 0.00202546303409 | 0.00202520998836 | 0.0001249 |
| `kpi.press.filtrationFlux_m_s` | 0.00011600590115 | 0.000115991408268 | 0.0001249 |
| `kpi.press.rho_liquid` | 996.910236552 | 997.034798385 | 0.0001249 |
| `kpi.press.wash_m3_s` | 0.000202546303629 | 0.000202520999057 | 0.0001249 |
| `source.press.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |

## filter03_drum_area_medium_tabulatedWash  (tutorials/steady/solids/filter03_drum_area_medium_tabulatedWash)
12 rows beyond tolerance (1 `source`, 11 numeric). Causes: W + R.
Largest numeric move: `kpi.drum.washTime_s` 0.0131 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.drum.cycleTime_s` | 197.330866947 | 197.35634639 | 0.0001291 |
| `kpi.drum.filtrationTime_s` | 65.1191860927 | 65.1275943088 | 0.0001291 |
| `kpi.drum.Kp_s_m6` | 13914.2215059 | 13915.9600585 | 0.0001249 |
| `kpi.drum.washTime_s` | 53.2990814119 | 53.3060727812 | 0.0001312 |
| `kpi.drum.cS_eq24_2_10_kg_m3` | 308.106562087 | 308.145059353 | 0.0001249 |
| `kpi.drum.cS_kg_m3` | 308.106562087 | 308.145059353 | 0.0001249 |
| `kpi.drum.cakeSolidsPerArea_kg_m2` | 4.88716203105 | 4.88779306343 | 0.0001291 |
| `kpi.drum.filtrate_m3_s` | 0.000482294174759 | 0.000482233920646 | 0.0001249 |
| `kpi.drum.filtrationFlux_m_s` | 8.03823624598e-05 | 8.03723201077e-05 | 0.0001249 |
| `kpi.drum.rho_liquid` | 996.910236552 | 997.034798385 | 0.0001249 |
| `kpi.drum.wash_m3_s` | 0.000200616749605 | 0.000200591686097 | 0.0001249 |
| `source.drum.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |

## filter04_leafFilter_sameAsFiltrateWash  (tutorials/steady/solids/filter04_leafFilter_sameAsFiltrateWash)
13 rows beyond tolerance (1 `source`, 12 numeric). Causes: W + R.
Largest numeric move: `kpi.leaf.cS_kg_m3` 0.0125 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.leaf.Kp_s_m6` | 37.7186910595 | 37.7234039305 | 0.0001249 |
| `kpi.leaf.filtrationTime_s` | 268.13893969 | 268.165701492 | 9.981e-05 |
| `kpi.leaf.washTime_s` | 48.2322641462 | 48.2376165067 | 0.000111 |
| `kpi.leaf.cycleTime_s` | 1516.37120384 | 1516.403318 | 2.118e-05 |
| `kpi.leaf.pressesRequired` | 0.911380955288 | 0.911286393472 | 0.0001038 |
| `kpi.leaf.cS_eq24_2_10_kg_m3` | 23.4702408789 | 23.4731734361 | 0.0001249 |
| `kpi.leaf.cS_kg_m3` | 23.4702408789 | 23.4731734361 | 0.0001249 |
| `kpi.leaf.cakeSolidsPerArea_kg_m2` | 4.53005222004 | 4.53061824052 | 0.0001249 |
| `kpi.leaf.filtrate_m3_s` | 0.00202546303409 | 0.00202520998836 | 0.0001249 |
| `kpi.leaf.filtrationFlux_m_s` | 0.00011600590115 | 0.000115991408268 | 0.0001249 |
| `kpi.leaf.rho_liquid` | 996.910236552 | 997.034798385 | 0.0001249 |
| `kpi.leaf.wash_m3_s` | 0.000202546303629 | 0.000202520999057 | 0.0001249 |
| `source.leaf.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |

## filter05_calciumSilicate_measuredTest  (tutorials/steady/solids/filter05_calciumSilicate_measuredTest)
8 rows beyond tolerance (1 `source`, 7 numeric). Causes: W + R.
Largest numeric move: `kpi.press.Kp_s_m6` 0.0125 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.press.Kp_s_m6` | 3086793.67221 | 3087179.36058 | 0.0001249 |
| `kpi.press.cS_eq24_2_10_kg_m3` | 59.3515601168 | 59.3589759692 | 0.0001249 |
| `kpi.press.cS_kg_m3` | 59.3515601168 | 59.3589759692 | 0.0001249 |
| `kpi.press.cakeSolidsPerArea_kg_m2` | 15.2183487479 | 15.2202502485 | 0.0001249 |
| `kpi.press.filtrate_m3_s` | 8.42437838223e-06 | 8.42332590541e-06 | 0.0001249 |
| `kpi.press.filtrationFlux_m_s` | 0.000196372456462 | 0.000196347923203 | 0.0001249 |
| `kpi.press.rho_liquid` | 996.910236552 | 997.034798385 | 0.0001249 |
| `source.press.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |

## hydrocyclone01_quartz_willsTable91  (tutorials/steady/solids/hydrocyclone01_quartz_willsTable91)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: W + R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.cyclone.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |

## thickener01_settlingTest_talmageFitch  (tutorials/steady/solids/thickener01_settlingTest_talmageFitch)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: W + R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.thickener.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |

## variants01_ethanol_water_line  (tutorials/steady/thermo/variants01_ethanol_water_line)
6 rows beyond tolerance (1 `source`, 5 numeric). Causes: W + R.
Largest numeric move: `kpi.line.head_loss_m` 0.155 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.line.dP_friction` | 3953.35817975 | 3950.30092088 | 0.0007733 |
| `kpi.line.deltaP` | 3953.35817975 | 3950.30092088 | 0.0007733 |
| `kpi.line.density` | 901.28574127 | 901.983273911 | 0.0007739 |
| `kpi.line.head_loss_m` | 0.44728361351 | 0.446592083431 | 0.001546 |
| `kpi.line.velocity` | 0.927110800917 | 0.926393836353 | 0.0007733 |
| `source.line.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[referenceEquation.IAPWS95+anchoredRackett]' | - |

## unsteady05_tank_valve_drain  (tutorials/unsteady/unsteady05_tank_valve_drain)
12 rows beyond tolerance (1 `source`, 11 numeric). Causes: W + R.
Largest numeric move: `kpi.tank.level_final` 0.67 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.balance.energy_kJ_final` | -112451371.957 | -112827507.345 | 0.003345 |
| `kpi.balance.energy_kJ_initial` | -50088123.8522 | -49921056.4751 | 0.003335 |
| `kpi.balance.energy_kJ_out_cum` | -2002446075.7 | -2001902872.02 | 0.0002713 |
| `kpi.balance.mass_kg_final` | 7064.01381482 | 7087.64203323 | 0.003345 |
| `kpi.balance.mass_kg_initial` | 3146.45515384 | 3135.96025067 | 0.003335 |
| `kpi.balance.mass_kg_out_cum` | 125790.432753 | 125756.309574 | 0.0002713 |
| `kpi.balance.mass_residual_kg` | -0.00858572145398 (band abs:8.586e-07) | -0.00864316994193 | - |
| `kpi.tank.density_final` | 1001.5477819 | 998.207150468 | 0.003335 |
| `kpi.tank.level_final` | 2.24507055383 | 2.26011858145 | 0.006703 |
| `kpi.tank.n_water_final` | 392.118446562 | 393.430032375 | 0.003345 |
| `kpi.tank.volume_final` | 7.0530971587 | 7.10037193172 | 0.006703 |
| `source.tank.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'referenceEquation.IAPWS95' | - |

## unsteady06_reactor_fill_and_react  (tutorials/unsteady/unsteady06_reactor_fill_and_react)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.reactor.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## unsteady08_fast_tank_reduced  (tutorials/unsteady/unsteady08_fast_tank_reduced)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.FAST.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## ammonia02_full_plant  (tutorials/plant/ammonia02_full_plant)
2 rows beyond tolerance (2 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.liquefied_gas_store_'T201'.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |
| `source.T201.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## economics03_startup_years  (tutorials/steady/economics/economics03_startup_years)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.T201.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## ammonia03_quench_converter  (tutorials/steady/reactors/ammonia03_quench_converter)
1 rows beyond tolerance (1 `source`, 0 numeric). Causes: R.

| row | golden | now | relative move |
|---|---|---|---|
| `source.T201.liquidDensity` | 'liquidVolume.idealMix[anchoredRackett]' | 'idealMixing[anchoredRackett]' | - |

## swro01_campoDalias: the tank volumes by hand

The feed to the cartridge filters is a seawater of NaCl mass fraction w with a mass flow m = 2693.8 kg/s (the golden: Q = 2.70212 m3/s at 996.937 kg/m3).  Before, the tank priced the stream over the water alone (`densityPricedFraction 0.988868`: the NaCl, 1.1 % of the moles, has no pure liquid volume, so it was left out and the water carried the mass): rho = 996.94, V_holdup = m tau / rho.  Now the door resolves {NaCl, water} to `solutionLaw.NaCl-water` (the pumps' method) and the tank prices the whole stream: rho = 1021.773 kg/m3.  By hand: Q = 2693.8 / 1021.773 = 2.6364 m3/s, which is the printed 2.63644, and the holdup falls by the same ratio 996.937 / 1021.773 = 0.97569 (CartridgeFilters 81.06 -> 79.09 m3, MediaFilters 810.64 -> 790.93 m3, vessels 95.37 -> 93.05 and 953.69 -> 930.51 m3).  1021.8 kg/m3 is the density of a 3.0-3.1 wt % NaCl solution at 25 C (the law's own anchor), so a tank sized on 996.9 was 2.4 % too large in volume.  The RO1 header sheets move the same way (feed 996.9 -> 1020.5, brine 996.9 -> 1040.9 kg/m3): the brine header's nominal diameter steps from 0.45 to 0.40 m and the feed header's from 0.60 to 0.55 m because the required inside diameter (sqrt(4Q/(pi v_max)) with Q = m/rho/6) falls by sqrt(996.9/1040.9) = 0.979 for the brine.

## Rows appended, not moved

`--record` appended two rows to 18 of the 70 goldens (ChemicalPlantTutorial, the ammoniaPEQ02/03/PEQ plants, swro01_campoDalias, column09 to column11, the economics cases and others; the record log prints each): `boundary global noBoundary` and `boundary global residual_denom_kW`, which the golden writer emits now and the golden of the day did not carry (the same rows the C421 door slices appended).  They are not moves of any number.  Rows that moved inside their own tolerance (below 1e-4 relative, e.g. swro01's `layout unbundedLiquid` values, 3e-5) are in the files and not listed above.
