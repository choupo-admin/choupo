# A duty the allocation dropped

*2026-10-10, DEV.md 4c C52.  Vítor, verbatim, on the green-ammonia
converter: "o reator gibbs não devia ter utilidade de calor?!!!"*

Kind: ADR.  Status: built on branch `claude/c52-reactor-duty-utility`; the
golden rows that move wait for Vítor's list.

## 1. What was there

Two readers asked the same question -- *does this unit have a heat duty?* --
with two different key lists.

* The energy report put every `energyItemKpis()` Heat item on the plant
  boundary: `Q_kW`, the column's `Q_reboiler_kW` / `Q_condenser_kW`, the
  TSA's two duties.
* The utility allocation (`allocateUtilities`) read the KPI `Q` in **W** and
  the column's two keys, and nothing else.

Every unit that publishes `Q_kW` alone -- `gibbsReactor`, `cstr`,
`conversionReactor`, `equilibriumReactor`, `pfr`, `crystalliser` -- and the
TSA's two ported duties were therefore priced by the first law and DROPPED by
the allocation: not allocated, not listed unserved, absent from C_UT, from the
economics' "N duties could not be allocated" count, and from the canvas.  The
2026-08-03 rule -- unserved records LISTED, never dropped -- broken one reader
upstream of the list.  Witness: `greenAmmoniaIndustrialN2`, whose Converter
(isothermal at 733.15 K) publishes Q_kW = -30 605 kW.

Found on the way, measured:

* the economics counted a CARRIED row as unpriced, so the FEHE's recovered heat
  was one of the witness's "2 duties that could not be allocated";
* the allocation read each unit's own declarations (work wires, a column
  port's `utility`) from the ROOT dict's `units` list, which a plant whose
  units live in their own folders does not have -- the witness is one such
  plant, and the "sectored plant" warning of 2026-09-08 fired on it;
* the crystalliser publishes its temperature only as `T_op`, so its duty,
  once read, had no temperature to be served at;
* the GUI's pre-run stub for a single duty read `operation.utility`, a key no
  engine reader has ever read.

## 2. One home

`reporting::unitHeatDuties` (src/reporting/BalanceMath.H):

    a boundary heat duty = an energyItemKpis() item of kind Heat
                           that is not an internal-medium duty

plus what only the allocation needs: the PORT each is served on and the KPI
carrying its temperature (`heatDutyPorts()`).  A Heat item with no port row
REFUSES -- skipping it is exactly the defect.  `Q` (W) and `Q_kW` are one
number in two units on four units (heater, heatExchanger, isothermalFlash,
phaseChanger), each computing one from the other; they are CHECKED to agree,
and `Q` is preferred so those units' rows are byte-identical.  The unit
temperature chain is T, T_out, T_op.  `tsaTwinBed` now publishes
`T_regeneration` and `T_adsorption`.  The process-process exchanger rule reads
`isProcessToProcessExchanger`, so the cooling tower's `Q_kW` (water to air) is
CARRIED, not allocated.

The allocation reads `result.unitDicts` -- the dicts the units were BUILT from
(`Flowsheet::unitDicts`) -- so a unit's declarations are read wherever the unit
lives.  The root list remains only as a fallback for a result that carries none.

NOT routed through the home, each with its reason: `PinchPass` asks for a duty
as a STREAM SEGMENT from inlet to outlet temperature (a reactor releases its
heat at its own temperature, and a Gibbs converter heated 380 -> 460 C while
releasing 30 MW would be filed as a cold stream); `UtilitiesReport::dutyOfUnit`
asks for the duty DELIVERED through a unit's utility STREAMS.

## 3. A declared utility, and what it is held to

`utility <name>;` beside `type` declares the utility serving a unit's single
duty; a column port keeps `operation { reboiler { utility <name>; } }`.  The
unit-level key is not in `operation {}` because the unit does not read it, and
`operation {}` is the block a unit's key audit holds to "read by the unit".
It is copied through the flatten for a unit in its own folder.

A declaration is an INSTRUCTION, held to `UtilityCatalogue::canServe` -- the
same rule the auto-pick filters on: the tier matches the sign of the duty, the
record states a positive `dutyPerKg`, the process temperature is known, and
heat can flow across dTmin.  It REFUSES by name when it cannot serve, when the
duty is carried (pricing it would count the heat twice), when the utility is
not in the catalogue, and when the unit publishes no duty on that port.  A
duty under 1 W leaves the declaration idle, said.

## 4. A credit is declared, never picked

The catalogue held only consuming utilities, so the automatic pick sends
30.6 MW released at 460 C to cooling water and CHARGES for it.  A real ammonia
loop raises HP steam in a waste-heat boiler.  `steamGenerationHP` is a cooling
utility with a NEGATIVE cost: HP steam at `steamHP.dat`'s own 41 bar / 525 K,
feedwater taken at saturation (so `dutyPerKg` is that record's latent heat),
valued at -18 EUR/GJ -- the price the plant would pay for the same steam.

* It is CASE-LOCAL (`constant/utilities/` of the witness), not in
  `data/standards/`: its price has no primary source, and a public catalogue
  value without one would be a falsely-sourced record.  The importer does not
  claim it (an authored file) and the sealed run equals the unsealed one.
* It is an UPPER bound on the credit: the steam is worth that only if
  something in the plant uses it, and the case declares no consumer.
* `pickForDuty` skips every record with a negative cost: earning a credit
  means installing a boiler, which the case declares.
* The economics sums credits (never clamps), prints them on their own line
  under C_UT, and publishes `C_UT` and `C_UT_credit`.  Turton's Eq. 8.1
  multiplies the NET utility bill by 1.23, credit included, as the existing
  electricity-generation credit already was.

REJECTED: a public steam-generation record (no source for its price); letting
the auto-pick choose a credit (an equipment decision taken by an allocator);
the declaration inside `operation {}` (the unit's key audit would call it
unread); booking the steam as by-product revenue (the existing generation
credit already lives in C_UT, and two homes for a credit is the arity sin).

## 5. The witness, before and after

| | before | after |
|---|---|---|
| Converter row | absent | steamGenerationHP, -30 605 kW, 17.86 kg/s, -1 983 EUR/h |
| unpriced duties counted | 2 (FEHE, StorageFlash) | 1 (StorageFlash) |
| C_UT | 20 709 976 EUR/yr, LOWER BOUND | 5 074 264 EUR/yr (purchases 20 709 976, credit -15 635 712), LOWER BOUND |
| COM_d | 443 830 961 EUR/yr | 424 599 035 EUR/yr |
| NPV (10 %) | -411 744 455 EUR | -294 646 964 EUR |

The StorageFlash stays unserved: it cools to -35 C and the coldest utility
boils at -33.3 C -- a finding about the design.

## 6. GUI

The reactors and the phase changer get a duty stub (`dutyTypes.ts`, a PRE-RUN
guess by type).  After a run the stub follows the engine
(`case/dutyUtility.ts` `dutyStubFromRun`): no allocation row -> idle and
hidden; a row -> its sign, never the pre-run guess.  The declared utility on
the stub is the unit-level key.

## 7. Gate

`check_unit_duty_allocation`: the source reads duties only through the home;
every published duty over six cases has a row; the witness's credit, its
C_UT_credit and the unserved count; the undeclared witness never picks the
credit; four refusals through the real engine.  Four by-hand sabotages, all
caught (listed in the gate).

## 8. NOT done, said

* A non-isothermal pfr's duty is served at its published `T` (the inlet), not
  along its profile.
* The TSA's two duties are drawn with no canvas stub (two ports, no handle).
* No steam CONSUMER: the credit assumes the steam is used.
* The goldens: rows move corpus-wide and are NOT re-recorded (DEV.md C52).
