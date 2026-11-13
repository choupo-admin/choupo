# The temperature of a liquid-volume datum (C378, TR-12)

Kind: ADR.  Status: BUILT (2026-11-13, branch `c378-vliqT`; section 7 says what
was done and what was not).  Proposed on `origin/main` 3e6c37270.
Evidence: [`data/curation/batches/vliq_datum_temperature/`](../../data/curation/batches/vliq_datum_temperature/README.md)
(`evidence.tsv` one row per record; the scripts that re-derive it).  It closes the
class that
[`thermophysical-slice0-plan.md`](thermophysical-slice0-plan.md) section 1.7 and
[`thermophysical-property-routes.md`](thermophysical-property-routes.md) row TR-12
named, and widens it: the census finds 21 records of one kind, not 17 -- 20 that gain
`VliqT`, and sucrose, the 21st, whose `Vliq` is not a pure-liquid volume and is not
this slice's (section 4).

## 0. The architect's ruling on this evidence (2026-11-13)

1. **THE CORRECTION ASSIGNS A TEMPERATURE; IT DOES NOT REPLACE A VALUE.**
   The evidence shows that each affected record's stored volume IS a
   volume at that record's normal boiling point (within 2.1 % on all
   eighteen that could be cross-checked).  So the correction keeps every
   record's own value, with the provenance it already has, and states the
   temperature it belongs to: `VliqT` = the record's own `Tb` for the
   classes A1, A3, A4 and A6; 273.15 K for CO2; 465 K for hitecSalt.
2. **THE HANDBOOK'S APPENDIX IS A CROSS-CHECK, NOT A VALUE'S HOME.**  Its
   liquid volumes are printed with the permission of a data centre; the
   numbers in `evidence.tsv` are there to show the comparison and are NOT
   entered into any record.  Where a better datum is wanted later it comes
   from a primary measurement or from a reference equation the engine
   already carries (N2, CH4, CO2, water), origin word `derived`.
3. **TWENTY-ONE RECORDS, not seventeen: twenty gain `VliqT`, the twenty-first is
   sucrose (section 4)** (Cl2, H2S, SO2 and nButane store a
   boiling-point volume and say nothing), and six UNRESOLVED (propane,
   propylene, H2O2, HCHO, HCN, NO2): those six are pinned by name as known
   debt until a measured liquid density with its temperature is read for
   each; none is changed on a guess.
4. **hitecSalt's molar mass** (87.4, a mass-fraction mean of molar masses;
   the mole-fraction mean of its own stated composition is 84.29) is a
   separate defect with its own commit and its own list of moved rows.
5. **sucrose's value leaves the component** for a solution record when the
   solution slice is built; until then the record says what the number is.
6. **ORDER:** the grammar (`VliqT`, default 298.15 K, every existing record
   reading as today) and the reader change land AFTER the door (the same
   engine files), as one commit that moves numbers, with the bench naming
   every block it moves and the cases re-recorded from a list.

## 1. The defect

A component record's `Vliq` is read as the liquid molar volume AT 298.15 K
(`src/thermo/ThermoPackage.cpp:2428` `Tref_Vliq`, `:2437-2446` the anchored Rackett,
`V(T) = Vliq * Rackett(T) / Rackett(298.15 K)`).  The record has nowhere to say that
its number belongs to another temperature, so it is silently read as if it were at 25 C:

| class | records | what the evidence shows |
|---|---|---|
| volume at Tb, stated | CH4, CO, H2, N2, NO, O2 | the comment says "at Tb"; Poling's point carried to Tb agrees within 2.1 % |
| another stated T | CO2 (273 K), hitecSalt (465 K) | the reference equation gives 47.45 cm3/mol at 273.15 K against 47.0 stored; Janz & Tomkins, 1.941 g/cm3 at 470 K |
| no T, Tc < 298.15 K | Ar, He, O3, ethylene | also a volume at Tb (within 1.5 %) |
| no T, Tc 298-330 K | ethane, acetylene, N2O, HCl | also a volume at Tb (within 0.7 %) |
| found here: no T, Tc far above 298 K | Cl2, H2S, SO2, nButane | a volume at Tb or near it; the engine's 25 C density was +13 %, +19 %, +7 %, +4 % above a handbook value carried to 25 C; the correction's own change of the engine's 25 C density (former over new, measured on the branch) is +11.38 %, +21.32 %, +6.71 %, +5.06 % (review VT-03).  n-butane's stored volume equals the measured saturated volume at 269.92 K, 2.7 K below Tb (VT-04) |
| not a pure-liquid volume | sucrose | an apparent molar volume in solution, no T, no source |
| unresolved, no source in hand | propane, propylene, H2O2, HCHO, HCN, NO2 | listed in `evidence.tsv`, class A7 |

Consequences already measured by the review (TR-12): CO2 liquid density +31.8 % at 298.15 K,
ethane +71 %, HCl +45 %; liquid N2 and CH4 REFUSED because `Rackett(298.15)` is not a finite
number below Tc (`ThermoPackage.cpp:2440-2444`).  The other readers of the raw value are exposed
too: the Poynting factor `exp(Vliq (P - Psat) / R T)` (`phase/SaturatedVapour.cpp:148-153`), the
Wilson volumes (`activityCoefficient/Wilson.cpp:111`, a ratio of volumes at DIFFERENT temperatures
for a mixed record set), the Hansen volume-fraction rule (`propertyOps/HansenMixture.cpp:205`), the
Hildebrand parameter derived from `HvapTb` and `Vliq`, and the Wilke-Chang solute volume
(`transport/WilkeChang.cpp:45`, whose correlation is defined at Tb -- the one reader for which a
volume at Tb is the CORRECT datum).

## 2. The grammar (five lines)

```
Vliq    3.554e-5;      // m^3/mol
VliqT   90.68;         // K -- the temperature Vliq belongs to; absent means 298.15
```

1. `VliqT` is an optional scalar key beside `Vliq`, in kelvin like `Tb` and `Tc`; absent, it is 298.15,
   so every existing record reads, and prints, exactly as today.
2. A record that carries `VliqT` states its origin and citation in the existing
   `provenance { Vliq { ... } }` block (as glucose already does); the key is the number the engine
   reads, the block is the reader's evidence, and neither repeats the other.
3. `VliqT >= Tc` (when Tc is declared) is REFUSED at load, by name, with the remedy: a datum at or above
   the critical temperature is not a saturated-liquid volume.
4. `VliqT` without `Vliq` is refused at load (a temperature of nothing).
5. A record with no meaningful `Vliq` at all (sucrose) has no `VliqT` either; see section 4.

## 3. What the engine must then do

* **The anchor.**  `liquidMolarVolumeOf` replaces `Tref_Vliq` (`ThermoPackage.cpp:2428`) by
  `c.VliqT()`: `V(T) = Vliq * Rackett(T) / Rackett(VliqT)`.  The announcement at `:2449` says
  "the record's own Vliq at <VliqT> K".  The "cannot anchor" refusal (`:2443`) then concerns only a
  `VliqT` the Rackett closure cannot evaluate, which point 3 above already refused at load.
  Liquid N2, CH4, O2, CO, H2, Ar and He stop being refused below their Tc.
* **Above Tc.**  Unchanged: a request at `T >= Tc` is refused at that state, by name
  (`ThermoPackage.cpp:2502`).  The datum's temperature never moves that boundary.
* **Component.**  One more accessor, `Component::VliqT()`, parsed at the two sites that parse
  `Vliq` (`Component.cpp:129` and `:300`).  Nothing is estimated at run time: the number is the
  record's.
* **The other readers of the raw `Vliq`** (section 1) must go through
  `liquidMolarVolumeOf(i, T)` at the temperature they mean (298.15 K for Poynting, Wilson and
  Hansen, Tb for Wilke-Chang), or declare that they read the datum as stored.  Today they all
  read it as a 25 C volume.  For a cryogen that has no liquid at 25 C the honest answer at
  298.15 K is a named refusal, which is the right behaviour for Wilson and Hansen and a change
  from the silent number they use now: that change is the reach of the correction commit, not of the
  grammar.  This is the part of the future slice that moves goldens, and the cases it moves are listed in
  section 5.
* **Gate.**  A gate reads every record's `Vliq` comment for a temperature word and requires `VliqT`
  to agree with it; and refuses a record with `VliqT` and no `provenance { Vliq { origin ... } }`.

## 4. What it fixes and what it leaves

It fixes, by giving each datum its own temperature (pairs in `evidence.tsv`): the six "at Tb"
records, CO2, hitecSalt, the four unstated cryogens, the four unstated near-critical records and the
four found here (Cl2, H2S, SO2; nButane needs no key: Poling prints its 298.15 K value).  hitecSalt's
molar mass (87.4 against 84.29 from its own mole fractions) is a separate error the key does not fix.

It leaves **sucrose** (and states glucose's honest form): an apparent or partial molar volume is a
property of the solute IN a solvent, so the value belongs in a solution record (the
`thermophysical-property-routes.md` solution-record format), not in the component.  Until that exists,
the component keeps the number, `VliqT` is not written, and the sucrose class stays an announced
limitation.  It also leaves the six unresolved records, which wait for a source
(`evidence.tsv`, last column), and the near-critical records' 25 C volume: ethane at 25 C has
`T/Tc = 0.977`, where Rackett is not trusted and no source in hand gives a value; with `VliqT` the
anchored Rackett still returns a number there (an extrapolation along a saturation line that ends
4 K above), which the reach below shows no shipped case asks for.

**Rejected alternatives.**
(a) `Vliq (3.554e-5 90.68);` a pair-valued key: every reader of the scalar `Vliq` (listed in
section 1, plus the importer and the curation writers) would change grammar at once, and the
amplifier rule asks for the smallest change, a key whose absence means today.
(b) The temperature only in the provenance block: a number the engine reads would live in prose that
the solver ignores by contract, and the two could disagree with no gate able to say which wins
(the arity sin).
(c) Convert every datum to 298.15 K at curation time with Rackett: it turns a measurement into an
estimate, and for the ten records with Tc < 298.15 K or a Tc within a few kelvin of it there is no
saturated liquid at 25 C to convert to.
(d) Delete `Vliq` from the cryogens and rely on bare Rackett: the measured anchor is lost and the
engine announces an estimate where a measurement exists.
(e) Read the temperature out of the record's comment ("at Tb"): a comment is not a contract; this
is the error class this record exists to remove.

## 5. The reach: shipped cases that name each component

Screen by `data/curation/batches/vliq_datum_temperature/reach.py` (`reach.tsv`, one line per
case and component).  A case NAMES a component when it is in its `thermoPhysPropDict` `components`
list.  The class is read from the stream temperatures in the case's `0/` (or its `system/` dicts):
LIQUID-CANDIDATE if any stream carrying the component is below its Tc, GAS-ONLY if all are at or
above it, `?` if no temperature was found.  It is a screen, not a run: it says where a liquid
volume CAN be asked for.

| component | names it | liquid candidate | gas only | not determined |
|---|---|---|---|---|
| N2 | 90 | 0 | 66 | 24 |
| H2 | 68 | 0 | 41 | 27 |
| CO2 | 81 | 8 | 31 | 42 |
| O2 | 37 | 0 | 24 | 13 |
| CO | 33 | 0 | 22 | 11 |
| CH4 | 31 | 1 | 20 | 10 |
| Ar | 19 | 0 | 17 | 2 |
| He | 17 | 0 | 2 | 15 |
| NO | 6 | 0 | 2 | 4 |
| ethane | 2 | 0 | 1 | 1 |
| N2O, HCl, SO2, hitecSalt | 1 each | 0 | 0 | 1 each |
| Cl2 | 1 | 1 | 0 | 0 |
| H2S | 3 | 3 | 0 | 0 |
| nButane | 11 | 7 | 0 | 4 |
| propane | 10 | 7 | 0 | 3 |
| sucrose | 24 | -- | -- | -- (solute in every case) |
| O3, ethylene, acetylene | 0 | | | |

Where the component is actually a LIQUID constituent (read by hand from the case, not the screen):

* **nButane and propane** (LPG components, liquid in the columns): `column07_naphtaliSandholm`
  (nButane), `column08_radfrac_multidraw`, `column14_klemola_c4_splitter`, `column15_klemola_ideal_trays`,
  `column19_mtbe_reactive_mesh`, `column20_mtbe_kinetic_mesh`, `flowsheets/cavett01_recycle_train`
  (both), and `flash10_ch4propane_pcsaft` (propane).  nButane's stored value is 4.3 % low against
  Poling at 25 C, propane's has no origin (unresolved): these are the cases a corrected value MOVES,
  through Poynting and tray hydraulics.
* **H2S**: `stripper02_sour_water_h2s` (dissolved in water at 360 K), `cavett01_recycle_train`,
  `claus01_thermal_stage` (gas stage; screen only).  Stored 34.9 against 41.55 at 25 C.
* **Cl2**: `chlorophenol01_chlorination` (stream at 298.15 K).  Stored 45.0 against 50.65 at 25 C.
* **CH4**: `flash09_n2ch4_stryjek` (liquid CH4 at 149.8 K): today REFUSED by `:2443`; with `VliqT`
  it runs and its result changes from an error to a number.
* **CO2**: `absorption01_CO2_water`, `flash08_co2_water_package` (CO2 at 298.15 K, 6 K below its Tc,
  dissolved gas), `proxy01_gas_loop` (245 K), `tsa01_co2_twin_bed`, `tsa02_refused_capacity`,
  `mixrules01_natural_gas`, `ppr78Kij01_ch4_co2_h2`, `transport02_chapman_enskog`: the CO2 correction
  (47.0 to 47.45 at 273 K, and the anchor moved from 298.15 to 273.15 K) moves every one that asks for a
  liquid density with CO2 in the liquid.
* **hitecSalt**: `utility02_hitec_csp_heater` (756.9 K): the datum's temperature is irrelevant to the
  result only if `VliqT` is added with the MW corrected in the same commit; the corrected MW moves it by 3.7 %.
* **sucrose**: 24 cases, a solute in water in each; nothing changes until the solution record exists.
* **Gas-only** components (N2, H2, O2, CO, Ar and most CO2 and CH4 cases): no liquid volume exists at
  their stream temperatures, so the stored datum cannot reach a number except through a refusal
  (Wilson and Hansen at 298.15 K; Poynting is `exp(0)` away from saturation); the correction changes
  what those readers say, not what the cases print.  Cases with no stream temperature (most of the
  `props/` and adsorber `batch/` cases) need a run before the correction commit, not a screen.

The correction commit's own validation, per the plan section 1.7: run the cases above (the
LIQUID-CANDIDATE rows and the by-hand list) before and after, list every moved row, and re-record
only those; the full sweep is not warranted by this reach.

## 6. Order of work

1. This record and the evidence batch (landed together, no engine change).
2. The engine slice: `VliqT` parsed, the anchor, the load refusals and the gate (waits for the other
   slice in progress on `ThermoPackage.cpp`).
3. The record slice: the pairs of `evidence.tsv` written as `Vliq` + `VliqT` + `provenance`, one commit,
   the moved rows listed.  Documentation (Theory Guide section, the Tutorials Guide, `docs/ai`) in the
   same slice, per rule 4d.
4. The solution record for sucrose and glucose (with the routes study).

## 7. What was built (2026-11-13)

* **Grammar.**  `VliqT` (kelvin) beside `Vliq`, read by `Component::readVliqT`
  at both sites that read `Vliq`; absent = 298.15 K.  Refused at load, by name:
  `VliqT` without `Vliq`; `VliqT` at or above `Tc`.  A local or overlay record
  that writes its own `Vliq` and no `VliqT` does not inherit the base record's
  `VliqT` (`Database.cpp`).
* **The anchor.**  `ThermoPackage::liquidMolarVolumeOf` anchors Rackett at
  `c.VliqT()`; a record that states it is announced once with its temperature;
  the door's label names the datum's temperature ("each component's molar
  volume at 111.66 K scaled to temperature by Rackett").  A request at `T >= Tc`
  is refused as before.  `liquidMolarVolumeOf` is now public.
* **The other readers** -- each decided, and only the ones whose present read is
  wrong for a `VliqT` record changed: the solubility parameter asks the volume at
  its own T; Hansen's volume-fraction rule at the triples' Tref; Wilson refuses a
  parametrised pair over a record whose `VliqT` is not 298.15 K (no catalogue
  Wilson pair names one); Wilke-Chang keeps the stored datum (the correlation
  wants the volume at Tb, which these records store); the Poynting factor keeps
  its constant-volume form; the seven unit-level flat reads (ratchet debt) are
  unchanged and read the datum at whatever temperature it belongs to.  A record
  without `VliqT` gives the same bits in every reader.  (This departs from
  section 3's "298.15 K for Poynting, Wilson and Hansen, Tb for Wilke-Chang" for
  Poynting and Wilson: the Poynting factor is evaluated at the system
  temperature, where a volume at 25 C is no better a constant than the stored
  one, and a cryogen has no liquid at 25 C to give it; Wilson refuses rather
  than mixing the two temperatures in one ratio.)
* **Records.**  Twenty records carry `VliqT` with a line saying how it was
  established, no value changed: CH4, CO, H2, N2, NO, O2 (their own "at Tb");
  CO2 273.15 K and hitecSalt 465 K (their own statement); Ar, He, O3, ethylene,
  ethane, acetylene, N2O, HCl, Cl2, H2S, SO2, nButane (`Tb`, from this batch).
  The census's "21" counted sucrose, which is not this slice.  The six
  unresolved are pinned in `bin/curate/vliq_datum_debt.tsv`, read by the gate
  `check_vliq_datum`.
* **Reach measured.**  The property-route bench moved 24 blocks (the commit
  lists them).  No shipped case row moved: every case names these records
  through a sealed copy, and even with `VliqT` written into those copies no
  pinned row moved (`docs/reviews/2026-11-13-c378-vliqT-moved-rows.md`).
  Section 5's expected moves did not occur.

