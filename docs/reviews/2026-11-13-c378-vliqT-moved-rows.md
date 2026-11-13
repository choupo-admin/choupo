# C378 `VliqT` -- the rows it moves (2026-11-13)

Branch `c378-vliqT` (stacked on the liquid-property door, `c378-slice0`).  The
slice gives a component record's `Vliq` the temperature it belongs to (`VliqT`,
absent = 298.15 K) and writes it on twenty catalogue records, no value changed
(docs/design/liquid-volume-datum-temperature.md, section 0, the architect's
ruling).  This file lists what that moves in the shipped cases, and judges it.

## The answer: no shipped case row moves, and none can until a seal is refreshed

**Scope run.**  The cases of `data/curation/batches/vliq_datum_temperature/reach.tsv`
whose class is LIQUID-CANDIDATE or not determined (NO-STREAMS, NO-TC), filtered
to directories holding a `.cho` and `system/controlDict`: **102 cases**.
`bin/runTests --scope <the 102>` on this branch: 97 PASS, 5 EXPECTED-FAIL (the
deliberate refusals batch12_adsorber_refused_P, ignition01_h2o2_eulersi,
ignition01_h2o2_rk4, isotherm03_fit_refusals, tsa02_refused_capacity, as on
main), **FAIL 0**; the scoped conservation gates (mass, element, solute and
claimed energy closures) held.

**Why nothing moves.**  Every one of the 102 cases names each of the twenty
components through a **sealed case-local copy** (`constant/components/<name>.dat`,
owned and hashed by `constant/propertyManifest`): 202 (case, component) pairs,
202 sealed, 0 read from `data/standards/`.  The same holds for the gas-only rows
of the screen.  A sealed copy does not carry `VliqT`, so it reads, bit for bit,
as before (the property-route bench proves a record without `VliqT` gives the
same bits: with the twenty records reverted, the new engine answers all 4975
pinned blocks unchanged).

**What a reseal would move -- measured, not assumed.**  The 243 sealed copies of
the twenty records inside the 102 cases were given the catalogue's `VliqT` line
(an experiment in the working tree, reverted afterwards; the seals then report
`diverged` and the runs continue, `onDivergence announce`), and the same
`--scope` was run: again 97 PASS, 5 EXPECTED-FAIL, **FAIL 0**, no golden row
moved.  By hand, `column14_klemola_c4_splitter` run with and without `VliqT` on
its n-butane prints the same output line for line apart from the case path.
None of these cases prices a liquid volume of one of the twenty components in a
pinned output: the column cases read no liquid density of n-butane (no tray
hydraulics block), the Poynting factor and Wilke-Chang read the stored datum
unchanged by this slice, and the CO2/N2/CH4 cases ask for no liquid density of
those components.

## Lists the brief asked for

| list | entries |
|---|---|
| a case that now REFUSES where it ran | none |
| a case that now RUNS where it was refused | none in the shipped corpus.  `flash09_n2ch4_stryjek` (named in the design note as refused) runs at exit 0 on this branch, with its sealed copies as they are and in the experiment with `VliqT` added: it asks for no liquid density.  Liquid N2 at 90 K and CH4 at 120 K are now priced in the property-route bench (748.82 and 416.17 kg/m3) where they were refused |
| moved rows (case, row, old, new, relative) | none |

## Judgement

Explained by the datum's temperature: nothing to explain in the cases.  The
design note's section 5 expected moves "through Poynting and tray hydraulics"
in the n-butane/propane columns and in the CO2 cases: measured, there are none,
because (a) every case reads a sealed copy and (b) even with `VliqT` in those
copies, no pinned row reads the anchored volume of one of the twenty.  The
correction's reach today is the catalogue (the property-route bench: 24 blocks
moved, listed in the commit) and any NEW case or re-import; refreshing a seal
is the act that brings it into a shipped case, and that act is not taken here.
