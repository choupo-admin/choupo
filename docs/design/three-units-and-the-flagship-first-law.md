# Three units and the flagship's first law

**2026-09-27.**  `energy-T2:plant` -- the flagship plant's boundary first law,
`tutorials/plant/ChemicalPlantTutorial`, required below 1 % of the energy the
plant exchanges -- had been red since 2026-09-08.  DEV.md D-ET2 diagnosed it
on 2026-09-25 as additive: the boundary residual equals the sum of the
per-unit remainders, and the spray dryer was the largest term.  This record
takes each term to the line, fixes the three that are one family, and names
the one that is not.

Every number below was produced by a command on this branch, and "before"
means a binary built from the parent commit (`git archive HEAD` into a scratch
tree, `make all`).  Goldens were NOT re-recorded; the moved rows are listed in
§6 for Vítor.

---

## 1. The report was not the defect

DEV.md asked for one thing to be settled first: the spray dryer's row read
`energy_items_kW == dH_kW` AND `raw_imbalance_kW == dH_kW`, while the
crystalliser's row read `items == dH` and `raw == 0`.  It is the report's
deliberate shape, not a defect.  `src/reporting/EnergyBalanceReport.cpp`
(the `declares` branch, around lines 336-372): a unit that DECLARES no energy
item gets `items = dH` -- its IMPLIED net duty, a fact about the unit -- no
closure (an empty `energy_closure_pct`, the 2026-09-08 ruling that a quantity
with nothing to reconcile against has no closure), and
`raw_imbalance_kW = dH`.  The crystalliser declares `Q_kW`, so it gets a
closure and a raw imbalance of `dH - Q`.  For an ADIABATIC unit that declares
nothing, the whole enthalpy change across its streams is unattributed, which
is exactly what an adiabatic balance forbids: it must be zero.

## 2. The measurement, before

`choupoSolve tutorials/plant/ChemicalPlantTutorial`,
`postProcessing/energyBalance/0/`:

| unit | dH (kW) | declared items (kW) | remaining (kW) |
|---|---:|---:|---:|
| CONCENTRATION.Evap1 | 661.9483 | 672.3663 | -10.4180 |
| CONCENTRATION.Evap2 | -0.3773 | (none) | -0.3773 |
| DRYING.SD | -70.8516 | (none) | **-70.8516** |
| DRYING.BD | +10.2352 | (none) | **+10.2352** |
| FERMENTATION.Mixer | 0.0003 | (none) | 0.0003 |
| FERMENTATION.Fermentor | -168.7729 | -205.7716 | **+36.9987** |
| every other unit | | | 0.0000 |

Plant: residual **+34.412646 kW**, 3.1709 % of 1085.2476 kW exchanged.  The
remainders sum to -34.4127 kW: the D-ET2 identity holds (the report's sign
convention is inputs minus outputs at the boundary, outputs minus inputs per
unit).

## 3. Root causes, to the line

### 3a. `DRYING.SD` -- the spray dryer's energy balance was a hand formula

`src/unitOperations/heatTransfer/SprayDryer.cpp`, parent commit, the block
headed *"Adiabatic energy balance -> outlet air T_out"*:

    Q     = n_solv_feed * 1000 * (Hvap_latent(T_wb) + cpL_w * (T_wb - T_feed))
    T_out = T_air - Q / (F_air * 1000 * cp_air_molar(T_air))

Each term is on a surface the published streams are not priced on, and the
formula omits what the streams carry:

* it charges the latent heat of **all** the feed water (`n_solv_feed`), but
  with a sorption isotherm the powder keeps `X_final * m_solid` of it -- on the
  flagship 0.0343 kg/s, whose latent heat (about 82 kW, hand arithmetic from
  the printed KPIs) was paid by the air and never delivered to any stream;
* it prices the air with a constant `Cp(T_air)` and the water with a Watson
  latent heat, where the report prices both on the package's
  `H_stream_formation` after resolving each stream;
* it omits the powder solid and its moisture heated from `T_feed` to `T_out`,
  the vapour superheated from `T_wb` to `T_out`, and -- the one no formula of
  this shape can see -- the heat of crystallisation of every dissolved mole of
  sucrose that leaves as powder (4.7236 kmol/h on the flagship: the magma's
  liquor carries it dissolved, the powder carries it in `s[]`).

The hand arithmetic of those terms reproduces the measured -70.85 kW to about
2 %; it is recorded as arithmetic, not as a measurement.  What IS measured is
that the fix below takes the row to 0.0000 kW.

The kinetics read the same wrong state: the residence time and the powder's
water activity were evaluated at that `T_out`, and at the humidity of a
"phase-1, everything evaporates" exhaust, *"not iterated"*.  Neither is the
state the `Exhaust` stream carries.

### 3b. `DRYING.BD` -- the solid dryer evaporated water no heat paid for

`src/unitOperations/heatTransfer/SolidDryer.cpp`, parent commit: the same
constant-Cp / Watson balance, bisected for `T_out` in `[T_w, T_air]`, and

    if (fEner(T_w) < 0.0) T_out = T_w;   // "honest floor (warned below)"

followed by publishing the FULL isotherm evaporation.  When the air cannot pay
for it even with the solid leaving at its feed temperature, the floor pins
`T_out` and the water evaporates anyway: the heat comes from nowhere.  On the
flagship: 150 kmol/h of air at 380 K cooled 46.3 K supplies about 56 kW; the
0.0281 kg/s the isotherm removes needs about 66 kW; the row read +10.2352 kW.
The only announcement was a console line.

### 3c. `FERMENTATION.Fermentor` -- the CSTR's duty was a quality blend

`src/unitOperations/reactor/CSTR.cpp`, both duty sites (single-reaction and
multi-reaction):

    H_in  = F_in * H_stream_formation(T, P, vf_in, z_in)
    H_out = sum s.F * H_stream_formation(s.T, P, s.vf, s.z)     // s.vf = vf_in

A quality blend at the overall `z`, carrying the inlet's vapour fraction onto
the outlet, where the report resolves each unpinned stream at its own
`(T, P, z)` and prices the equilibrium phases.  The fermentor's outlet at
310 K carries 12.2 kmol/h of CO2; the report resolves a split, the unit priced
the blend, and the declared `Q_kW = -205.7716` sat against `dH = -168.7729`.
This is `conversionReactor`'s 2026-09-25 defect in the other reactor.

All three are the family CLAUDE.md 6 names: **the state a unit computes with
is not the state its streams carry.**

## 4. The fix, at one home

`src/unitOperations/flash/StreamEquilibrium.H` gains two functions:

* `flashState::priceState(T, P, z, F, pinned, vfCarried, thermo, locus,
  notes)` -- moved VERBATIM from `ConversionReactor.cpp`'s anonymous
  namespace, where it was written on 2026-09-25.  It is the `streamH_elements`
  rule of `reporting/BalanceMath.H`: resolve (`twoPhaseSplit`), price the
  equilibrium phases (`hOfState`) when it is a split, else
  `H_stream_formation` at the carried vapour fraction.  Four callers now
  (`conversionReactor`, `cstr`, `sprayDryer`, `solidDryer`); four copies would
  have been the arity sin.
* `flashState::priceSolids(s, T, thermo)` -- the crystalline leg the report
  adds to every stream (`solidH_elements`).

`reporting/BalanceMath.H` was NOT changed to call them: that is a report every
case reaches, and routing it through the new home is a refactor with a
full-sweep reach and no numerical content.  Named, not done.

**Spray dryer.**  The hand balance survives only as the SEED of a search.  The
unit now solves

    H(powder, T_out) + H(exhaust, T_out) = H(feed) + H(drying air)

with every term priced as published (unpinned, the carried vapour fraction),
and the kinetics are evaluated AT THAT EXHAUST (`dryingAt(T_ex, n_evap_ex)`:
residence time, water activity, profile).  The two are coupled, so the unknown
is the evaporation `nev`: the energy balance gives `T(nev)` (falling as `nev`
rises), the kinetics at that exhaust give `nevKin(nev)`, and
`R(nev) = nevKin - nev` falls strictly (a cooler, wetter exhaust leaves more
water in the powder), so the root is BRACKETED on `[0, nevCap]`, where
`nevCap` is the most the air can evaporate with the exhaust at its wet bulb.
Illinois regula falsi with a bisection guard.

A plain successive substitution was tried first and **cycled with period two**
on `sugarPlantEconomicsSweep` (exhaust 318 K / 410 K, water activity 0 /
0.99): near saturation the GAB isotherm makes the kinetics far steeper than
the energy balance.  A bracketed root cannot cycle.  ENERGY-LIMITED drying
keeps its meaning (the air cannot cool below its wet bulb) and is now decided
on the same surface.  The `duty` KPI becomes the heat the air gives up on the
package's surface -- NOT an energy item; the dryer is adiabatic.

**Solid dryer.**  The same balance on the same surface, `T_out` solved in
`[T_w, T_air]`.  When the air cannot pay, the solid still leaves at `T_w` --
this model's declared floor, unchanged -- and the evaporation is what the air
CAN pay for: the powder leaves wetter than the isotherm allows, announced on
`AdvisoryLog` with both evaporations and both moistures.  Whether the outlet
should instead fall below the feed temperature toward the air's
adiabatic-saturation temperature (which would dry further) is a change to this
model's domain and is NOT taken.

**CSTR.**  Both duty sites call one helper, `cstrDutyKW`, which prices the
inlet (its declared pin and carried vf) and each outlet (unpinned) through
`priceState`.  The console's `Temperature:` line and `Kp(T)` now print the
reactor's temperature, not the feed's -- the 2026-09-04 fix to the kinetics
had left the banner describing a temperature nothing ran at.

## 5. After

Flagship, same command:

| unit | remaining before (kW) | after (kW) |
|---|---:|---:|
| DRYING.SD | -70.8516 | **0.0000** |
| DRYING.BD | +10.2352 | **0.0000** |
| FERMENTATION.Fermentor | +36.9987 | **0.0000** (closure 82.02 % -> 100.00 %) |
| CONCENTRATION.Evap1 | -10.4180 | -10.4180 |
| CONCENTRATION.Evap2 | -0.3773 | -0.3773 |
| FERMENTATION.Mixer | +0.0003 | +0.0003 |

Plant: residual **+10.794918 kW, 1.0298 %** of 1048.2489 kW exchanged (the
denominator moved because the fermentor's declared duty did).

**`energy-T2:plant` stays red, by 0.03 percentage points, and that is the
honest result.**  What remains is the two evaporators, which is the defect
CLAUDE.md 6 already names and RESERVES for Vítor: the evaporator's Watson
`Hvap_latent` against `H_stream_formation`, 3.30 % apart on water.  It is not
this family's to fix in this slice and it was not touched.  The gate was not
widened; the threshold was not re-derived.

Standalone cases, the same measurement:

| case | residual before (kW) | after (kW) |
|---|---:|---:|
| sprayDryer01/03/04/06/07 | -2.6584 | 0.0000 |
| sprayDryer05_whey | -18.3191 | 0.0000 |
| solidDryer01_sugar | +372.6562 | 0.0000 |
| cstr07_lhhw_methylAcetate | -0.7958 (37.98 %) | 0.0000 |

**`solidDryer01`'s 372.66 kW was mostly NOT the engine.**  Its `0/hotAir`
declares no phase and carries water, so the permanent-gas screen does not
apply and the stream defaults to `vf = 0`, unpinned -- and the report priced
420 K humid air as a LIQUID.  With the unit now pricing exactly as the report
does, the unit would have reproduced that mistake and published a 393.65 K
exhaust.  The case now declares `phase gas;` on `0/hotAir` (the
`acetone02/03` precedent of 2026-09-25).  Measured separately, on the parent
binary with only that line added: the residual is +6.8764 kW -- so 365.78 kW
was the undeclared phase and 6.88 kW the unit's surface.  With both: 0.0000,
and `T_out` 346.66 K against the old 347.51 K.

**What the fix does NOT close, enumerated per the 2026-09-25 rule** (units
that still compute an energy equation on a surface of their own; none is in
the flagship, none was touched): `evaporator` (Watson latent, RESERVED);
`evaporativeDryer` (constant-Cp air, Watson latent -- its two cases close
within the 1 kW band today); `coolingTower` (pinned -14.5302 kW);
`absorber`/`stripper` (pinned -27.9838 / +19.8710 kW); the CSTR's ADIABATIC
and JACKETED temperature solves, which still price the blend (their duty is
now resolved, so a disagreement would show as a nonzero remainder --
`cstr04_adiabatic` and `cstr06_jacketed` show none); `pfr` (pinned 18.34 %);
`phaseChanger`, `mixer`, `adiabaticFlash`.  And `reporting/BalanceMath.H`
still carries its own copy of the rule `priceState` now carries.

## 6. Moved golden rows (NOT re-recorded -- for Vítor)

`bin/runTests` over every case that runs one of the four changed units (38
cases: `grep -rlE "type\s+(sprayDryer|solidDryer|cstr|conversionReactor)\s*;"`
over the flowsheetDicts).  28 pass unchanged, including all nine
`conversionReactor` cases (the move of `priceState` is byte-identical) and
cstr01-06.  Ten move; the reasons:

* **ChemicalPlantTutorial** -- the spray dryer's exhaust is now 344.4636 K
  (was 333.6549): the air is no longer charged the latent heat of water that
  stays in the powder, so it leaves hotter, drier, and the powder dries
  further (`WetPowder.F` 0.003568 -> 0.002790 kmol/s, `W_evap` 0.10624 ->
  0.12026 kg/s).  Downstream the cyclone streams follow the exhaust
  (`Exhaust`, `ExhaustClean`, `Stack`, `Dust`, `RecoveredDust` T and F), the
  solid dryer receives a drier powder and is no longer energy-limited
  (`DryPowder`/`Powder`/`DryerVapour` T 333.65 -> 349.68 K, `DryerVapour.F`
  down), the spray dryer's Guthrie cost follows `W_evap` (purchased
  347 545 -> 374 381), and the boundary rows move to the closed units
  (`Q_boundary` -263.2964 -> -226.2976 kW, the fermentor's duty;
  `residual` 34.4126 -> 10.7949 kW).
* **sprayDryer01/02/03/04/06/07** -- `T_out` 372.03 -> 366.29 K: the new
  balance pays for the solid and moisture heated to the exhaust temperature,
  the vapour's superheat and the crystallisation; the exhaust is cooler and,
  read at the humidity it actually carries, wetter, so the water activity
  rises (0.0626 -> 0.0767), the equilibrium moisture rises (X_eq 0.01328 ->
  0.01569) and the powder keeps a little more water (`water_residual`
  1.475e-4 -> 1.744e-4 kg/s).  Residence time and gas velocity follow the
  exhaust temperature.  `duty` moves because it is now the heat the air gives
  up on the package surface.  The boundary residual goes to zero.  (02 is the
  residence sweep and carries no boundary row; 07's sizing follows `W_evap`.)
* **sprayDryer05_whey** -- the same mechanism, `T_out` 382.78 -> ~378 K
  (exact rows in the list).
* **solidDryer01_sugar** -- `T_out` 347.51 -> 346.66 K (the unit's surface),
  `H_feeds` moves by 380 kW (the hot air now priced as the gas it is), and
  the boundary residual 372.66 -> 0.
* **cstr07_lhhw_methylAcetate** -- `Q_kW` -2.0951 -> -1.2994 kW: the duty is
  now priced on the resolved outlet, the state the report prices; the
  boundary residual -0.7958 -> 0.

The exact rows (case, kind, key, old, new) are in the general's report to the
commander; they are not transcribed here, because a second copy of a golden
diff is the arity sin in a document.

## 7. The gate

`bin/curate/check_energy_closure.py` gains a UNIT ARM: for every case it runs,
an adiabatic `sprayDryer`/`solidDryer`, and a `cstr`/`conversionReactor` that
published `Q_kW`, must leave no more than 1e-4 kW unattributed in the engine's
own `energyClosures` ledger.  Five named witnesses must be READ whenever their
case is in scope, so the arm cannot go green by reading nothing.  Sabotages in
the gate's docstring (U1-U4, all caught).

**U2 is the one worth reading twice.**  Restoring the old solid dryer, and
nothing else, takes the flagship to **0.9900 %** -- inside the band,
`energy-T2:plant` GREEN.  The old solid dryer's own error on the new, drier
powder (+0.4128 kW) happens to cancel part of the evaporators' -10.80 kW.  A
plant-level gate would have scored the regression as the fix.  This is the
2026-09-08 negative result (`combined02`) seen from the other side: unifying a
surface while another pair still disagrees moves which pair does -- and so
does UN-unifying one.  The unit arm is what tells the two apart.

The pins: the eight kW pins and `cstr07`'s percentage pin that now close were
REMOVED (a stale pin is a claim about the engine that stopped being true); the
flagship's percentage pin was RE-MEASURED from 3.1710 to 1.0298 with `--seed`.
