# C440 audit -- greenAmmoniaPEQ_baseCase, origin/main (3eb8ab8554)

Read: tutorials/plant/greenAmmoniaPEQ_baseCase/{system/flowsheetDict,postDict,layoutDict,expected,<unit>/system/flowsheetDict},
src/postProcessing/sizing/*, src/io/DesignSheetWriter.H, gui/src/case/{equipmentListSheet,reportSections}.ts, ~/Choupo-Literature/INDEX.md and the Towler contents list.
Costs and sizes are the `expected` golden rows (Turton, CEPCI 820, EUR). Book references are to chapter/section TITLES read in the contents list; no number comes from memory.

Sheet mechanism (all items): DesignSheetWriter writes design/<unit>/<tag> = header, inlets{}, outlets{}, sizing{} (whatever the sizer set), cost{}; the GUI draws the generic equipment list (equipmentListSheet.ts: tag, item, size, dimensions, design P, material, purchased, bare module). Only TWO equipment kinds have a dedicated printable datasheet: shell-and-tube exchangers (HeatExchangerDatasheet, TEMA sheet + scheme) and columns (ColumnDatasheet). Vessels, compressors, tanks, stores have NO dedicated sheet: the file + one row of the list.

## Table (one row per unit; 17 flowsheet units + 2 attached stores)

| unit | type | sizer | sized today | detailed design adds (book) | sheet | cost (purchased / bare module / total module, EUR) |
|---|---|---|---|---|---|---|
| N2Boost | compressor | CompressorSize | pass-through of W_shaft (2110 kW), ratio, P_out, pressureDesign (33 bar g); no geometry, no stages | stages and intercooling, driver and speed, discharge T, surge/turndown, casing/seal, driver sizing: Towler & Sinnott ch.5 "Pumps and Compressors" (5.5) and ch.10 equipment selection; Perry 9th (compressor section, not opened); NO compressor monograph in the folder | generic only | 903,529 / 2,439,530 / 2,878,645 |
| N2Cooler | shellTubeHX (phaseChanger in flowsheet) | ShellTubeHX (Kern, Gnielinski tube film) | A 84.6 m2, U 415, 174 tubes, shell ID 0.555 m, passes 2, baffles, both dP, film coefficients, fouling, cooling-water flow, weight | TEMA type/designation, tubesheet and flange mechanical design, nozzles, vibration check, Bell-Delaware shell side instead of Kern: Towler ch.12 (12.5 construction details, 12.8-12.9 tube/shell side, 12.7 general considerations) and ch.13 (13.10 tube plates, 13.9 flanged joints); Serth & Lestina 2ed (rules of thumb, TEMA); Kern; Hewitt (djvu, not opened) | DEDICATED HX datasheet (TEMA sheet + scheme) | 42,323 / 148,973 / 175,789 |
| Intercooler | shellTubeHX | ShellTubeHX | A 185.8 m2, U 645, 382 tubes, shell ID 0.778 m | as N2Cooler | dedicated HX | 57,186 / 216,319 / 255,257 |
| Aftercooler | shellTubeHX | ShellTubeHX | A 192.6 m2, U 642, 396 tubes, shell ID 0.790 m | as N2Cooler (at 166 bar g the tubesheet/flange rules matter most) | dedicated HX | 58,101 / 244,735 / 288,787 |
| WaterCooler | shellTubeHX (partial condensation) | ShellTubeHX | A 629 m2, U 567, 1294 tubes, shell ID 1.32 m; gas film only, condensate film NOT credited, dP as all-gas | condensing film and two-phase dP, desuperheat/condense zoning: Towler 12.10 Condensers; Serth (condensers) | dedicated HX | 108,526 / 457,137 / 539,422 |
| Chiller | shellTubeHX (kettle, NH3 boils) | ShellTubeHX | A 1115 m2, U 534, 2292 tubes, shell ID 1.62 m; boiling film 2500 W/m2/K TYPED, no utility-side dP | kettle/vaporiser design (disengagement, CHF, bundle height, refrigerant inventory); NH3 refrigeration cycle itself outside battery limit: Towler 12.11 Reboilers and Vaporizers; Serth | dedicated HX | 157,572 / 1,208,963 / 1,426,576 |
| FEHE | shellTubeHX (heatExchanger, rated 2000 m2) | ShellTubeHX | designed A 1821 m2 (rated 2000 on the unit), U 474, 936 tubes, shell ID 1.07 m, 4 shells in series, shell dP 155.7 (published unit), 733 K SS316; costed as ONE item | thermal-stress/expansion, tubesheet at 150 bar and 733 K, hydrogen-service materials; shell-side Kern is crude at this dP: Towler ch.12 + ch.13 (13.10); Serth | dedicated HX | 225,195 / 2,140,671 / 2,525,992 |
| MakeupComp1 | compressor | CompressorSize | as N2Boost (5200 kW, 73 bar g) | as N2Boost | generic only | 1,605,501 / 4,334,853 / 5,115,126 |
| MakeupComp2 | compressor | CompressorSize | as N2Boost (5510 kW, 166 bar g) | as N2Boost | generic only | 1,661,738 / 4,486,692 / 5,294,297 |
| RecycleComp | compressor | CompressorSize | as N2Boost (850 kW, 166 bar g, SS304) | as N2Boost | generic only | 470,298 / 1,269,805 / 1,498,369 |
| Converter | gibbsReactor, sized as `vessel` | VesselSize (spaceVelocity 20000 1/h, normal basis, ASSUMED) | catalyst V 21.9 m3, D 1.67 m, H 10.0 m (L/D 6), wall t (ASME thin wall), weight 46.7 t, 166 bar g, SS316; inventory 0.40 voidage. NOT used: CatalystBedSize and ConverterShellSize exist in src but are not wired in postDict | beds count and inlet T per bed, quench/interchange, catalyst volume from a rate law, internal basket, hydrogen attack / nitriding material limits, thick-wall shell at 166 bar and 733 K: Towler ch.10 (Reactors) and ch.13 (13.4 thin-walled, 13.16 High-Pressure Vessels, 13.5 openings, 13.8 supports); no ammonia-converter text in the folder (Dyson-Simon and Gillespie are articles; ammoniaReactor04_kineticSizing is the in-repo route) | generic only | 37,222 / 3,736,499 / 4,409,069 |
| Separator | isothermalFlash, sized as `vessel` | VesselSize (residenceTime 45 s of VAPOUR, ideal gas, L/D 3) | V 25.7 m3, D 2.22 m, H 6.66 m, weight 54.5 t, 166 bar g, SS304 | THE C318 SCOPE: Souders-Brown/terminal velocity, orientation, liquid levels (LLL/NLL/HLL), demister, inlet device, nozzles: Towler ch.10 "Gas-Liquid Separators"; ch.13 for shell/openings/supports; liquid holdup needs a liquid density | generic only | 41,941 / 4,261,906 / 5,029,049 |
| LetdownHP | isothermalFlash, `vessel` | VesselSize (60 s vapour, declared a LOWER BOUND; 98-99 % of the moles leave as liquid) | V 0.223 m3, D 0.456 m, H 1.37 m, 21 bar g; below the cost correlation's range | C318 (liquid drum, holdup basis) | generic only | 3,385 / 22,830 / 26,940 |
| StorageFlash | isothermalFlash, `vessel` | VesselSize (60 s vapour, LOWER BOUND) | V 10.3 m3, D 1.64 m, H 4.91 m, 2 bar g, SS304 | C318; plus relief/vacuum protection for a refrigerated vessel: Towler 13.15 Pressure-Relief Devices (ReliefValveSize exists, not used here) | generic only | 21,980 / 143,063 / 168,815 |
| LoopMix | mixer | NONE (declared in postDict as not equipment) | nothing | a tee/header: line sizing only (item C207) | none | none |
| MakeupMix | mixer | NONE | nothing | as LoopMix | none | none |
| PurgeSplit | splitter | NONE | nothing | as LoopMix; the purge control valve is not a unit in the case | none | none |
| NH3Storage (attached to ProductNH3) | storage tank, 2 tanks | StorageTankSize | V 20,279 m3 each, 21 days, 90 % fill, 238 K; cost LOWER BOUND (atmospheric API fixed-roof row, not a refrigerated double-containment tank); density may be ~12 % high per the case header | refrigeration/boil-off duty and vapour handling, foundation, insulation, bund (layout holds bunds), relief: Towler 13.17 Liquid Storage Tanks, Peters ch. on costs | generic only | 1,256,312 / 1,381,943 / 1,630,693 each |
| H2Buffer (attached to H2Feed) | gas store, 10 vessels | GasStoreSize | 10 x 362 m3, D 5.36 m, H 16.07 m, 426 t each, Pmax 100 bar, 2 h autonomy; cost by steel mass at 8 EUR/kg (placeholder) | charging compressor (30 -> 100 bar) NOT sized or priced, so the cost is a lower bound; hydrogen service materials; relief; Towler ch.13 (13.4, 13.16) | generic only | 3,411,303 / 3,411,303 / 4,025,338 each (~34 M EUR purchased for the ten) |

Outside the battery limit by decision: electrolysers, ASU, cooling water, refrigeration cycle, steam system (so there are no pumps in this plant: C441 centrifugal pumps does not reach any unit here; Gulich, 4th ed., would serve the cooling-water and any liquid NH3 transfer only if they were added).


## The lines (C207)

- Routed pipes in the golden: 36 -- 24 process-stream pipes (the 24 connections of flowsheetDict, boundary streams included) plus 12 tank branches (10 H2Buffer vessels, 2 NH3 tanks). Each carries only `from`, `to`, `length` (golden rows `layout pipe:<name> from/to/length`).
- Declared utility lines: 13 (layoutDict `utilityLines`: 8 cooling water supply/return, the chiller refrigerant, 3 flare), routed on the rack and marked `sizeState unsized` in the golden.
- Per-line sizing: NONE for the plant's 36 lines or 13 utility lines. Their length is the only computed property; no velocity, diameter, dP, schedule, wall or material. The layout header says "EVERY LINE IS UNSIZED". The only pipe sizer in src is `pipeHeader` (PipeHeaderSize.cpp): membrane-train feed/concentrate/permeate headers from a declared velocity window, not wired into the plant's routed pipes. C207 is OPEN (BACKLOG row, "nothing built: no line sheet, no per-line sizing, no piping cost").
- Textbook: Towler & Sinnott ch.5 "Pipe Size Selection" (5.7) and "Mechanical Design of Piping Systems" (5.6); friction-factor machinery already in src/unitOperations/hydraulics/friction. Piping is also absent from the cost build-up (no pipe line cost).

## Who is building what

- C318 (flash drums and separators: Souders-Brown, terminal velocity, orientation, levels, demister, nozzles, sheet): OPEN, "general working", priority 0. Hits Separator, LetdownHP, StorageFlash (the three flash drums). No ramp-up branch found on origin besides a backup; confirm with the commander before assuming a branch name.
- C441 (centrifugal pumps, generic pump + manufacturer curve): OPEN, priority 4, not started; no pump in this plant.
- C207 line sheets: OPEN, ranked second behind C318 by the C440 ruling; not started.
- C440 itself: this audit (item 3 of its ruling); item 4, isometrics, last.

## Ranked gaps (largest value first, for a colleague reading the plant's documents)

1. **Lines: no sizing at all (C207).** 49 lines, 0 sized. Every colleague asks velocity and dP of the 150-bar loop; the answer today is "not computed". Highest visibility, and the routed pipes already exist, so it is the cheapest large gain.
2. **Flash drums on a vapour-residence basis (C318).** Separator (the heart of the loop, 54.5 t, 4.3 M bare) is sized as a knock-out by a typed 45 s; the two let-down drums are admitted lower bounds on a LIQUID duty, one below the cost range. In hand by C318.
3. **Converter has no mechanical or internal design.** The most expensive process item (4.4 M total) rests on an ASSUMED space velocity; no beds, no quench, no catalyst-from-kinetics (CatalystBedSize and ConverterShellSize exist in src, unwired), no 166 bar / 733 K hydrogen-service check, no sheet. A reviewer opens it first.
4. **Compressors: four machines, 14.7 MW, ~13.6 M bare module, sized only as a power number.** No stages, discharge T, driver, speed or sheet; no compressor monograph in the folder, so a source must be found before building (Towler 5.5 is the only in-folder text, and thin).
5. **Heat exchangers: strong already, but with named weaknesses.** Chiller boiling film typed (2500) with no utility dP; WaterCooler/Chiller condensing film not credited; FEHE shell dP 155.7 flagged; dilute-gas properties at 150 bar; Gnielinski window warnings. No mechanical design (tubesheet, nozzles) for 166 bar. This is the only family with a dedicated sheet, so it reads best; the work here is closing the declared simplifications.
6. **No dedicated sheet for vessels, compressors, tanks or stores.** Only a generic file and one list row; a vessel sheet (nozzle schedule, levels, MDMT, weight, internals) rides on C318, compressor and tank sheets are new.
7. **Storage: NH3 tanks and H2 buffer are lower bounds.** Refrigerated-tank cost row is atmospheric API; H2 buffer lacks its charging compressor and uses a placeholder 8 EUR/kg.
8. **Mixers and splitter are not sized** (by decision, correct): they only need line sizes, covered by item 1.
9. **No relief devices in the plant case though ReliefValveSize exists** (Towler 13.15); and no piping, instrumentation or valves in the cost.
