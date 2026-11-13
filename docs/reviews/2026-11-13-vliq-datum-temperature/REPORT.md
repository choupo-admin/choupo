# Review by measurement: the temperature of a liquid-volume datum (C378 `VliqT`)

Reviewed: branch `c378-vliqT` at 38ab75bd05 (a working branch, stacked on the
door), with its decision record `docs/design/liquid-volume-datum-temperature.md`
and its evidence under `data/curation/batches/vliq_datum_temperature/`.  The
branch gives a component record the key `VliqT`, the temperature its stored
liquid molar volume belongs to, and assigns it on twenty records whose value
the engine read as a volume at 25 C.

What this review adds to the branch's own evidence: MEASURED liquid volumes.
The branch cross-checked with a handbook's appendix and with the engine's
reference equations; this review used the local mirror of the ThermoML archive
(open measured data, located by article DOI; every value below carries its DOI
and the status `transcribedNotCheckedAgainstArticle`).  Pulled by the reviewing
session because the branch is step 0 of the density pilot and moves cases; the
rows are on a working branch and do not count against the pull limit.

## 1. Verdict

**The assignments hold wherever measurement can test them, and none is
contradicted.**  The mirror holds pure-liquid volumes for only three of the
twenty assigned records; all three agree within 1.5 % at the assigned
temperature and within 4.5 K of it.  The engine does what the branch says at
every point tried.  No shipped golden row moves (the cases read sealed copies
of the records, as the branch's own note says).  There is no S1.

**The mirror resolves two of the six records the branch left unresolved:**
propane's stored volume is a volume at 276.65 K, and propylene's is a volume
of the boiling-point class (the engine prints propylene's liquid density at
25 C 22 % too high today).  For H2O2, HCHO, HCN and NO2 the mirror holds no
pure-liquid volume.

**One defect of the reader (VT-01, S2):** `VliqT` is read without a check of
its dimensions; `VliqT 50 Pa;` is taken as 50 K in silence.

## 2. The assigned temperatures against measurement (`measured_vs_stored.tsv`)

The measured molar volume is interpolated (ln V linear in T) between the two
bracketing measured points, never extrapolated.

| record | stored Vliq, cm3/mol | assigned VliqT, K | measured V there | stored against measured | T where measured equals stored | points, DOI |
|---|---|---|---|---|---|---|
| CH4 | 37.4 | 111.66 | 37.968 | -1.50 % | 107.17 K (4.5 K below) | 105 K and 115 K, compressed at 0.19-0.48 MPa (pressure effect at most 0.11 %); 10.1016/j.jct.2015.09.034 |
| CO2 | 47.0 | 273.15 | 47.472 | -0.99 % | 271.44 K (1.7 K below) | saturated, 263.32 K and 273.55 K; 10.1021/je0497496 |
| nButane | 96.2 | 272.65 | 96.670 | -0.49 % | 269.92 K (2.7 K below) | saturated, 270 K and 275 K; 10.1016/j.jct.2004.07.017, 10.1021/je049672l |

Ethane is supported indirectly (its measured curve starts at 225 K, above the
assigned 184.55 K): the branch's anchored Rackett matches measured compressed
liquid at 230 K and 260 K within +0.15 % and +0.37 %.  For the other sixteen
(CO, H2, N2, NO, O2, hitecSalt, Ar, He, O3, ethylene, acetylene, N2O, HCl, Cl2,
H2S, SO2) the mirror holds no liquid volumetric data: not tested here.

## 3. The six unresolved records (`unresolved_six.tsv`)

| record | the stored value equals the measured volume at | engine at 298.15 K today | measured at 298.15 K | engine against measured |
|---|---|---|---|---|
| propane | 276.65 K (its Tb is 231.02 K) | 523.71 kg/m3 | 492.27 kg/m3 | +6.39 % |
| propylene | 219.12 K (its Tb is 225.46 K; the stored value is 1.27 % below the measured volume at Tb) | 617.93 kg/m3 | 506.15 kg/m3 | +22.08 % |

Sources: 10.1016/j.jct.2004.07.017 and, for propane, also 10.1021/je049672l.
A case-local `VliqT 276.65;` on propane makes the engine print 491.99 kg/m3 at
298.15 K (-0.06 %).  For propylene, `VliqT` at its Tb would give +1.62 % and at
219.12 K +0.36 %.  The branch's own Rackett estimate for propane (282.9 K) is
6.3 K from the measurement.  These are evidence for a curation act, not a
change made here.

## 4. The engine, before and after (`engine_before_after.tsv`)

At the assigned temperature the engine prints M/Vliq to round-off; at 30 points
it reproduces an independently written anchored-Rackett script.  Against
measurement: nButane at 298.15 K was +5.42 % too dense and is +0.35 %; CO2 from
about +30 % to +0.7..+1.7 % (253-293 K); CH4 +1.35..+1.54 % over 105-135 K.
Liquid N2 at 80 K and CH4 at 115 K now have a density (797.54 and 423.91 kg/m3)
where the parent rule is not finite; both still refuse above their critical
temperature.  The change of the engine's own 25 C density is +11.38 % (Cl2),
+21.32 % (H2S), +6.71 % (SO2), +5.06 % (nButane), +71.25 % (ethane): the
record's "+13, +19, +7, +4 %" are relative to a handbook-carried value (VT-03).

## 5. Nothing else moved; the reader's refusals (`reader_probes.tsv`)

Exactly twenty records gained the key.  Ten cases that use none of them and six
that the evidence says they reach pass their goldens with no moved row (428 of
437 reach pairs read a sealed copy).  The reader refuses `VliqT` without
`Vliq`, at or above Tc, negative or zero, or a word; converts K, degC and
bracket temperature dimensions; and accepts in silence a pressure unit (VT-01)
and 1 mK (VT-02).

## 6. Findings (`findings.tsv`)

| id | sev. | statement |
|---|---|---|
| VT-01 | S2 | `VliqT` is read without a dimension check: `VliqT 50 Pa;` is used as 50 K |
| VT-02 | S3 | no lower bound: 1 mK is accepted as a datum temperature |
| VT-03 | S3 | the record's four percentages are relative to a handbook value, not the engine's own change |
| VT-04 | S3 | the evidence puts nButane's datum at "about 276 K"; measurement says 269.9 K (the assigned 272.65 K still holds) |
| VT-05 | S3 | the mirror resolves propane: the stored value belongs to 276.65 K |
| VT-06 | S3 | the mirror resolves propylene as a boiling-point-class volume; the engine is 22 % too dense at 25 C today |
| VT-07 | S3 | "21 records" in the record's opening against 20 that carry the key; sucrose is explained only late |

## 7. Not examined

Sixteen of the twenty assignments (no measured data in the mirror); readers of
the liquid volume other than the density route (Poynting, Wilson, the
solubility parameter, Wilke-Chang); the archive's values against their
articles; the parent line by a build (its numbers come from the formula); the
GUI and lesson changes on the branch.
