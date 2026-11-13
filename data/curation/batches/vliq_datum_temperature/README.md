# vliq_datum_temperature -- which temperature does each `Vliq` belong to? (C378, TR-12)

Evidence slice.  No record under `data/standards/` is changed and no engine file is
touched.  The grammar that lets a record carry the temperature of its liquid-volume
datum, and the cases the correction reaches, are in
[`docs/design/liquid-volume-datum-temperature.md`](../../../../docs/design/liquid-volume-datum-temperature.md).

The engine reads a record's `Vliq` as the liquid molar volume AT 298.15 K
(`src/thermo/ThermoPackage.cpp:2428` `Tref_Vliq`, `:2437-2446` the anchored Rackett
`V(T) = Vliq * R(T) / R(298.15)`).  Seventeen records named in the plan store
something else; the census below re-derives that list and finds four more of the
same kind and six it cannot resolve.

**Ruling (2026-11-13, in the design note's section 0):** the correction keeps each record's
own stored value and assigns the temperature it belongs to; the handbook values in
`evidence.tsv` are a CROSS-CHECK and enter no record.

## Files

| file | what it is |
|---|---|
| `census.py` | the census: every `Vliq` line whose comment states a temperature other than 25 C, a quantity that is not a pure-liquid volume, or whose Tc is below 330 K; prints one TSV row per flagged record |
| `poling_crosscheck.py` | every record whose `Vliq` claims 25 C compared with the liquid volume Poling et al. print at 298.15 K, matched by CAS (175 records; four differ by more than 2 %) |
| `derive.py` | for the flagged records, Poling's point (V liq, T liq) carried to the record's Tb and to 298.15 K by Poling's own Eq. 4-11.4b; the "stored over it" column is the test of "this value is a volume at Tb" |
| `eos_scan.py`, `eos_saturation.tsv` | saturated-liquid volumes of CO2, N2, CH4 and water from the engine's reference equations (`choupoProps` `referenceEoS`, on a scratch copy of refEoS01) |
| `reach.py`, `reach.tsv` | every shipped case naming an affected component, with the class of its streams (screen, not a run) |
| `evidence.tsv` | one row per record: what is stored, what the record says, the temperature it belongs to and how that is known, the proposed (value, temperature) pair with its origin word and citation, the page read, and what could not be sourced |
| `sources.tsv` | the citation keys used in `evidence.tsv` |

Re-derive: `python3 data/curation/batches/vliq_datum_temperature/census.py` (and the others;
`poling_crosscheck.py` and `derive.py` read the PDF in `~/Choupo-Literature`, `eos_scan.py` runs
`choupoProps`).  No gate reads this batch: registering one means editing `bin/runTests`, which this
slice may not touch.

## Census (31 records read)

`census.py` flags 19 records.  17 are the plan's list; two more are flagged and are sound:
SF6 (states `@298K`, Tc 318.7 K, agrees with Poling's point carried to 298.15 K within 0.7 %) and
glucose (a declared partial molar volume of the solute in water at 298.15 K, with its provenance).
`poling_crosscheck.py` and `derive.py` then add what a comment-reading census cannot see: records
that state NO temperature, have Tc far above 298 K, and still store a volume at the boiling point.

| class | records | what is stored | evidence |
|---|---|---|---|
| A1 volume at Tb (stated) | CH4, CO, H2, N2, NO, O2 | a volume at the normal boiling point, as the comment says | Poling's own point carried to Tb agrees to 2.1 % or better in all six; for CH4 and N2 the engine's reference equation agrees to 1.5 % and 0.4 % at Tb |
| A2 another stated T | CO2 (273 K), hitecSalt (465 K) | a volume at the stated temperature | CO2: reference equation 47.45 at 273.15 K against 47.0 stored (-0.9 %), 61.94 at 298.15 K (the engine's 25 C value is 31.8 % too dense, as the plan measured); hitecSalt: Janz & Tomkins Table 148.2, 1.941 g/cm3 at 470 K |
| A3 no T, Tc < 298.15 K | Ar, He, O3, ethylene | also a volume at Tb (stored within 1.5 % of Poling's point carried to Tb) | Poling Section B |
| A4 no T, Tc 298-330 K | ethane, acetylene, N2O, HCl | also a volume at Tb (within 0.7 %) | Poling Section B; HCl carried to 25 C is 45.94 against 30.5 stored |
| A5 not a pure-liquid volume | sucrose | an apparent molar volume in solution, no temperature, no source | nothing in hand |
| **A6 found here**: no T, Tc well above 298 K, value at Tb | Cl2, H2S, SO2, nButane | a volume at Tb or near it (within 1.9 %) | Poling Section B; at 25 C the engine's density was about +13 % (Cl2), +19 % (H2S), +7 % (SO2), +4 % (nButane, Poling prints 100.48 at 298.15 K) above the HANDBOOK-carried value; the correction itself lowers the engine's own 25 C density by factors of 1/1.1138, 1/1.2132, 1/1.0671, 1/1.0506 (the former is +11.38 %, +21.32 %, +6.71 %, +5.06 % above the new; review VT-03) |
| **A7 found here**: unresolved | propane, propylene, H2O2, HCHO, HCN, NO2 | no temperature, no source; propane matches no Tb value | see the table below |

The finding behind A3, A4 and A6: of the 18 records that store a volume at a stated or unstated
low temperature, **every one with a Poling point that is not a volume at 25 C stores a volume at its
Tb** to within 2.1 %, which is a systematic origin (a boiling-point volume table), and the comments
that said "at Tb" on six of them were the only record of it.

Secondary findings, not changed here:

* hitecSalt `MW 87.4` weights molar masses with MASS fractions (0.07/0.40/0.53) while the record's
  mole fractions are 7/49/44; the mole-fraction mean is 84.29 g/mol (Janz & Tomkins' own eutectic is
  48.9/6.9/44.2 mol %).  The stored volume is 3.7 % high for that reason alone.
* `poling_crosscheck.py`: dichloromethane (-5.3 % against Poling at 298.15 K), mesitylene (-2.4 %) and
  2233Tetramethylbutane (+14.4 %, a solid at 25 C: Poling's liquid point is a supercooled one) state 25 C
  and differ from the one compilation in hand.  Not temperature defects; recorded for the curator.
* NO2: Poling lists dinitrogen tetroxide only (63.59 cm3/mol at 293.15 K, 31.80 per NO2); the record's
  37.9 matches neither reading.

## Which records can be corrected from sources in hand

"Pair" = a (V, T) pair that the future `VliqT` key would carry; origin word from `core/Origin.H`
(`literature` = from a cited table; `derived` = computed from a named equation).

| record | correctable now | pair | origin | waits for |
|---|---|---|---|---|
| CH4 | yes | 35.54 cm3/mol at 90.68 K (Poling), equation agrees 35.57 at 91 K | literature | |
| CO | yes | 34.88 at 81.00 K | literature | |
| H2 | yes | 28.39 at 20.00 K | literature | Poling row is hydrogen of unspecified spin; record's Tb is normal H2's |
| N2 | yes | 34.84 at 78.00 K (equation 34.88) | literature | |
| NO | yes | 23.44 at 121.00 K | literature | |
| O2 | yes | 27.85 at 90.00 K | literature | |
| CO2 | yes | 47.45 at 273.15 K from the Span-Wagner equation | derived | a measured liquid volume of CO2 (Poling prints none) |
| hitecSalt | the temperature yes | 43.43 cm3/mol at 470 K (M = 84.29, rho 1.941) | literature | the record's MW, which is a separate error; the 470 K lower limit of the data |
| Ar | yes | 29.10 at 90.00 K | literature | |
| He | yes | 32.54 at 4.30 K | literature | |
| O3 | yes | 35.40 at 161.00 K | literature | |
| ethylene | yes | 51.07 at 183.15 K | literature | |
| ethane | yes | 46.15 at 90.36 K | literature | the 298.15 K saturated volume (Tr 0.977): a reference equation, Buecker & Wagner 2006, doi:10.1063/1.1859286 |
| acetylene | yes | 43.47 at 203.15 K | literature | |
| N2O | yes | 35.90 at 184.00 K | literature | |
| HCl | yes | 30.28 at 183.15 K | literature | |
| Cl2, H2S, SO2 | yes | 45.36 at 239.00 K; 34.32 at 214.00 K; 44.03 at 263.15 K | literature | |
| nButane | yes | 100.48 at 298.15 K (a 25 C datum, no `VliqT` needed) | literature | |
| sucrose | no | -- | -- | a measured partial molar volume at infinite dilution with its temperature (candidates found in Crossref, not read: doi:10.1039/9781782627043-00246, doi:10.1016/S0016-7037(99)00322-1) |
| propane | partly | 74.87 at 233.15 K (Poling); the stored 84.2 has no origin | literature | a propane reference equation (Lemmon 2009, doi:10.1021/je900217v) or the origin of 84.2 |
| propylene, H2O2, HCHO, HCN | no | -- | -- | a measured liquid density with a temperature, for each |
| NO2 | no | 31.80 per NO2 at 293.15 K if the record means NO2 | literature | the architect's reading of NO2 / N2O4 |

Not used as a value source, deliberately: the handbook's table of liquid densities (Perry 9th ed.
Table 2-32), whose own note attributes it to an evaluated compilation reproduced under licence; the
protocol (`docs/ai/curation-protocol.md` section 5) bars entering such numbers even when cited.  It
would have given 25 C values for ethane, acetylene, N2O and HCl; those four wait for a reference
equation or a primary measurement instead.

Poling's Appendix A is published "with permission of" the compiling data centre; whether its numbers
may be entered as a value's origin under `check_source_licence` is the architect's reading (the
numbers here are written in `evidence.tsv` as proposals, and no record has changed).  Fallback if the
answer is no: the six cryogens and CO2, N2, CH4 can be carried by the engine's own reference equations
(N2, CH4, CO2) or left as `[estimate]` Rackett (no `Vliq` at all), which is announced.

## How "the temperature" was established

1. The record's comment or provenance, where it states one.
2. A tabulated point at a stated temperature (Poling Section B), each cell read from the page image
   (pages named in `evidence.tsv`; ethane, propane and butane rows checked on A.22 and A.24).
3. For N2, CH4 and CO2 the engine's own reference equation at the stored temperature, and the
   temperature at which the equation reproduces the stored digits (CO2 271.6 K, N2 76.5 K, CH4 107 K).
4. The Rackett equation anchored on Poling's point (Poling Eq. 4-11.4b, Zc from Section A), carried to
   Tb: where the stored value equals it within about 2 %, the stored value is a volume at Tb.  This is a
   `derived` cross-check, not a datum, and it is not used above T/Tc = 0.95.
