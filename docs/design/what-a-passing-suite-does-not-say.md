# What a passing suite does not say

*2026-09-08.  Vítor: «Como foi possível teres andado a dizer que a suite corria
bem com violações graves de balanços energéticos?!»*

The question is the record's subject.  The answer is not "too few tests ran".

---

## 1. The rule

**A SUITE'S PASS COVERS WHAT ITS GATES ASSERT, AND NOTHING ELSE.**  Before
quoting a PASS as reassurance about a class of defect, name the gate that
would have failed.  If you cannot name it, the PASS says nothing about it.

`bin/runTests` says this itself, in its own verdict line — *"A PASS means the
answer has not moved from a self-recorded golden, NOT that it is right"* — and
it was still read as a guarantee, by me, repeatedly, in front of the person
who has to hand this to students.

---

## 2. Why energy could be violated at exit 0, with the suite green

Four mechanisms, each individually reasonable, together a hole:

1. **A golden pins what a run PRINTS.**  A stable wrong residual passes by
   construction.  This is the 2026-09-04 spray-dryer lesson, written into
   `CLAUDE.md`, and it was not applied to energy.
2. **`check_energy_boundary_pinned` requires the residual to be PUBLISHED and
   PINNED — never that it be SMALL.**  Its own header says so.  A 16 %
   violation satisfies it, gets written into the golden, and satisfies it
   for ever after.  *A gate that pins a number is not a gate that judges it.*
3. **The per-unit closure alarm prints to stderr and returns exit 0.**
4. **`energy-T1/T2:plant` DOES hold the right rule** — the global boundary
   residual under 1 % — **and holds it on ONE case** out of the whole steady
   corpus.  The same shape as `check_element_balance`, which asserts atom
   closure at 0.01 % on one case (`conversion01_hda`).

`check_mass_closure`, built 2026-09-04, NAMED energy closure as the gap it was
leaving open, in its own "WHAT THIS DOES NOT CHECK" section.  The gap stayed
open for four days.  **An absence that is named and not scheduled is an
absence.**

Coverage map, measured that day:

| law | gate that FAILS | real scope |
|---|---|---|
| mass, global | `check_mass_closure` | whole steady corpus |
| mass, per unit | none | — |
| atoms / elements | `check_element_balance` | one case |
| energy, global | `check_energy_closure` (built that day) | whole steady corpus |
| energy, per unit | none | — |
| charge | not measured — do not repeat this row as fact | — |

---

## 3. What the new gate found, once it could look

Of the 89 steady cases that HAVE a global first law to check, **32 fail it**.
The list is MEASURED (`--seed`), never typed, and it RATCHETS: a pinned debt
that grows fails; one that starts closing fails, naming the pin to remove; one
that is neither closing nor pinned fails.  Every entry is a plant that
violates the first law — a ledger of work owed, not a set of exemptions.

---

## 4. The physics underneath, verified in the source

One family, three units, one sentence: **a unit solves its energy equation on
one enthalpy surface while its streams are priced on another.**

* **`HeatExchanger` (ε-NTU).**  `streamCp` returns `cpIdealGas` for any stream
  with `vf >= 0.5` — no pressure, no departure function.  The model forms
  `C = n·Cp_ig`, takes `Q = ε·Cmin·ΔT_max`, and WRITES `T_out = T_in ∓ Q/C`.
  The temperature lands on the stream; its enthalpy is then priced by the
  package, which may be SRK.  `H(T_out) − H(T_in)` is not `Q`.
  Measured on `ammonia02` at 200 bar: waterCooler 8.03 % apart (−4581.73 kW),
  FEHE 2.39 % (+744.17 kW as the unit's net).  A THIRD mechanism the Cp story
  does not cover: the outlet copies the inlet's `vf` unchanged, so an
  exchanger may drive a stream ACROSS its dew point and charge zero latent
  heat (`chilledEffluent`: labelled `vf = 1` at 298 K/200 bar where its own
  equilibrium is V/F = 0.9722).  A "real" Cp does not fix that; only closing
  on H does.
* **`GibbsReactor`, adiabatic mode.**  `H_in` and the outlet enthalpy are both
  `h_pure_ig`; the adiabatic T is the root of their difference.  No SRK
  residual anywhere, while the streams carry it.  The published residual is
  therefore exactly `R_out − R_in`: −938.21 kW on ammonia02's converter, on a
  unit whose correct residual is zero.  The ISOTHERMAL mode of the same unit
  uses `H_stream_formation`, so one unit runs two enthalpy surfaces depending
  on its mode.
* **`DistillationColumn`.**  `column01_benzene_toluene`: reboiler +1279.30 kW,
  condenser −1281.04 kW, net −1.74 kW declared, against a dH of −633.69 kW.
  **631.96 kW unaccounted, 24.68 % of the energy the column exchanges.**  The
  whole family follows.  Cause not yet established.

The instrument that separates "the model does not close in H" from "a duty is
not being counted" is the same in every case: **the unit measures its own gap
against the package's own H and publishes it.**  `HeatExchanger` does
(`H_closure_gap_kW`).  The others do not yet.

---

## 5. Three defects introduced the same day, by the fix

Recorded because the pattern is the lesson, not the code.

* **The floor is not a scale.**  `max(exchanged, |Qext|, 1e-9)` returns the
  FLOOR for a plant that declares no duty and carries no boundary heat, and
  the `noBoundary` guard does not catch it because such a plant HAS feeds and
  products.  `evaporator02_triple_effect_sugar` published a real −6162.5 kW
  residual as **−6.16e14 %**.  A percentage of nothing is not a large
  percentage; it is not a percentage.  Absent a scale, the kW stands and the
  ratio is UNAVAILABLE — empty CSV cell, `null` in the JSON, withheld in the
  GUI.
* **A comment that described an arithmetic the code did not do.**  The scale
  accumulator summed the declared energy items ALGEBRAICALLY while the
  sentence beside it said *"MAGNITUDES (so a duty in and a duty out do not
  cancel)"*.  A column boiling 1279 kW and condensing 1281 kW was recorded as
  exchanging 1.74 kW.  Comment and code written the same morning.
* **A basis changed without checking who reads it.**  Moving the denominator
  from absolute stream enthalpy to exchanged energy took
  `ChemicalPlantTutorial` from 0.163 % to 3.17 % on an unchanged 34.41 kW
  residual, and pushed `energy-T2:plant` — the one energy gate that existed —
  from PASS to FAIL, unnoticed for hours because the full sweep was not run.
  **When you change what a number MEANS, find every check that reads it.**

The old basis was not innocent: it was the absolute enthalpy of the boundary
streams, dominated by whatever carries the most moles.  On `ammonia02` that
was the COOLING WATER — halving its flow would have doubled the reported
percentage with nothing changed in the process.  0.163 % was a flattering
number, not a physical one.  The band that guarded it was calibrated against
the flattery.

---

## 6. What was NOT done

No physics was fixed.  The exchanger still closes in Q, the Gibbs reactor
still solves in ideal gas, the column still loses 631.96 kW, `DRYING.SD` still
carries −70.85 kW unexplained.  Each of those moves goldens, and the list goes
to Vítor before any of them moves.

`DRYING.SD` publishes `duty = 342 831` in WATTS under the key `duty`, which is
in neither the accepted-items list nor the internal-medium exclusion list of
`BalanceMath.H` — so it is read by nothing.  Whether those 342.83 kW belong in
the balance is not established here.  `DRYING.BD` publishes no energy KPI at
all.

---

## 7. Records

* `bin/curate/check_energy_closure.py` — the gate, its band, its pin list and
  its stated blind spots.
* `docs/design/a-dryer-that-ended-wetter-than-it-started.md` — the mass half,
  2026-09-04, whose named gap this closes.
