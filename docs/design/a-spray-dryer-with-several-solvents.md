# A spray dryer with several solvents

**2026-10-20.  Kind: ADR.  Status: BUILT (DEV.md 4c C111, general G10).**

Vítor, testing the engine for his pharmaceutical students: *"o modelo de
spray dryer não aceita correntes com vários solventes.  Eu preciso disso
para o projeto de indústria farmacêutica."*  Spray-dried dispersions are
routinely atomised from MIXED solvents -- acetone/water, ethanol/water,
dichloromethane/methanol -- so a dryer that takes one is a dryer a
pharmaceutical project cannot use.

Every number below was produced by a command on this branch; "before" is the
binary built from the parent commit.

---

## 1. What the unit did with two solvents (the reproduction)

`SprayDryer.cpp` chose ONE volatile solvent -- `iSolv`, the LAST feed
component with a vapour pressure -- and every later step read that index:
the surface-tension liquid, the "ALL feed solvent -> vapour" mass balance,
the humidity in kg solvent / kg dry gas, the wet bulb, the Lewis check, the
outlet streams.  A second solvent was in the feed and in NO outlet.

The probe: `sprayDryer01_sugar` copied, unsealed, `acetone` added from the
standards, the feed's 60 kg/h of water split into 30 kg/h of acetone and
30 kg/h of water (`components ( acetone water air sucrose )`, so `iSolv`
is water), sucrose's `sorption {}` removed.  Before:

| probe (sprayDryer01 copy, 50 kmol/h air at 473.15 K) | exit | unit material closure | element balance | `water_evaporated` | T_out | unit energy row |
|---|---|---|---|---|---|---|
| acetone 30 + water 30 kg/h | 0 | 98.0620 % (-30.0001 kg/h) | worst element off by 52.49 % | 8.333e-3 kg/s (the water only) | 333.45 K | 0.0000 kW |
| ethanol 30 + water 30 kg/h | 0 | 98.0620 % (-30.0001 kg/h) | off by 48.15 % | 5.044e-3 kg/s, 3.289e-3 kg/s of WATER left in the powder | 318.05 K = T_wb, "ENERGY-LIMITED" | 0.0000 kW |

The energy row reads zero on BOTH, and that is the part worth keeping: the
unit solves T_out from `H(out) = H(in)` with the lost solvent in `H(in)` and
in no outlet, so its formation enthalpy is absorbed into the exhaust
TEMPERATURE.  Acetone's enthalpy is less negative than water's: the exhaust
ran 68 K hotter than the fixed engine finds.  Ethanol's is more negative: the
dryer fell to its wet-bulb floor and left 11.84 kg/h of water in the powder
that the air could have carried.  An energy arm alone cannot see this
defect; the material arm can, and `check_mass_closure` would have on a
shipped case -- no shipped case feeds two solvents, which is why the
reproduction had to be built.  (A dissolved `role radical;` component with
no vapour pressure went the same way: 3.42 kg/h lost, closure 97.8456 %.)

It did NOT refuse.  It ran to exit 0, evaporated the water, and lost the
acetone: no stream carries it, the material summary of the case says so, and
the unit's energy row carries the acetone's missing enthalpy as an
unattributed remainder.  The ethanol/water probe is the same shape.  Which
solvent was kept depended on the ORDER of the `components` list.

## 2. The rule now

With ONE volatile solvent the unit takes every line it took before, so a
single-solvent feed is byte-identical (§5).  With SEVERAL:

**(a) Mass -- the outlet is the package's equilibrium.**  The air and every
solvent the feed brings are flashed by the case's own package at
(T, P_air) (`flashState::equilibriumAt`, the reader every unit and the report
resolve a stream through).  A single vapour phase means everything
evaporated and the exhaust is unsaturated.  A split means the air cannot
carry it all: the vapour IS the exhaust and the liquid stays on the powder,
at the composition the package's K-values give it.  The liquid is taken from
the flash's `x`, the exhaust by SUBTRACTION from the material (the CLAUDE.md
rule: one side stored, the other derived), so the two close exactly,
component by component.  No solvent can be lost: every solvent enters
`nFluid` and leaves in one of the two.

**(b) Energy -- through the one pricing home.**  T_out closes
`H(powder) + H(exhaust) = H(feed) + H(air)`, every term
`flashState::priceState` (+ `priceSolids`) on the stream AS IT IS PUBLISHED
-- the call the energy report makes on the same streams -- so the unit's row
is zero by construction (the 2026-09-27 rule, `three-units-and-the-flagship-
first-law.md`).  The equilibrium enthalpy of a fixed overall composition is
monotone increasing in T (a positive heat capacity, latent heat included),
so the root is BRACKETED (Illinois) between a cold end searched down from
the wet bulb and the air's own temperature; the switch from one phase to two
is continuous in H but not smooth, so no derivative is taken across it.

**(c) The exhaust cannot supersaturate.**  This falls out of (a) rather than
being a separate limit: a supersaturated gas is not an equilibrium, and the
outlet IS the equilibrium.  When the air cannot carry every solvent the
exhaust leaves on its own dew point -- never a fog published as vf = 1 --
and the run ANNOUNCES it, naming the kilograms of each solvent that stay.
No per-component Raoult sum is written in the unit: the package decides.

**(d) The droplet kinetics -- a declared pseudo-solvent, and two refusals.**
A multicomponent droplet evaporates SELECTIVELY (the more volatile first, as
far as its internal mixing allows); that is a droplet model this engine does
not have.  So:

* the `marshall` (lumped) chamber RUNS: its mass and energy do not depend on
  the droplet's history (they are (a)-(b));
* the droplet's size, wet bulb and drying-time KPIs are computed for a
  PSEUDO-SOLVENT -- the solvent liquid at its feed composition: molar mass
  and latent heat the mole-fraction means, molar volumes additive (ideal
  mixing, a few per cent off for acetone/water, beneath d32's cube-root
  sensitivity), the PACKAGE's surface tension and bubble pressure of that
  liquid (`BubblePoint::pressure`), the solvents' gas diffusivities
  averaged.  It is ANNOUNCED once per run (`[sprayDryer]`, into the caveat
  block).  These KPIs decide no mass and no energy;
* `langrishKockel` / `distributed` and `chen` integrate the moisture of a
  droplet of ONE solvent, so they REFUSE a mixed-solvent feed by name,
  naming `model marshall;` as the remedy.

**(e) The residual-moisture isotherm REFUSES.**  A GAB `sorption {}` block is
the equilibrium moisture of ONE sorbate per kg of dry solid, and the record
does not say which solvent it was measured with.  Applying it to the sum of
the solvents, or to whichever one the unit picks, would be a guess presented
as a material property.  With several solvents and an isotherm on any solid
the unit refuses, naming the remedy (remove the block, or dry from one
solvent).  The C97 refusal of an isotherm on a MIXED POWDER is the same
argument one axis over.

**And one more absence, closed on the way.**  A dissolved feed component
with neither `role nonvolatile` (powder) nor a vapour pressure (exhaust) had
no outlet and vanished.  It is REFUSED by name now.  Measured: no corpus
spray dryer feeds one (§5).

## 3. KPIs

`water_evaporated` keeps its key -- `SprayDryerSize` reads it as the
evaporation duty -- and holds EVERY solvent evaporated, by mass;
`water_residual` the liquid on the powder.  New on a mixed-solvent run only:
`evaporated_<solvent>`, `residual_<solvent>` (kg/s), `solventsInFeed`,
`exhaustSaturated` (0/1).  A single-solvent run publishes none of them.

## 4. Measured, after

| probe | T_out | T_wb (pseudo-solvent) | evaporated | residual on the powder | unit material | unit energy row | plant residual |
|---|---|---|---|---|---|---|---|
| acetone + water, 50 kmol/h air | 402.005 K | 304.20 K | acetone 30.0001 kg/h, water 29.9998 kg/h (all) | none; exhaust unsaturated (Raoult dew sum 0.014) | 100.0000 % | -0.0000 kW | 5.7e-14 kW |
| ethanol + water, 50 kmol/h air (gate arm (b)) | -- | -- | all | none | closes to 1e-9 | <= 1e-4 kW | -- |
| acetone + water, 8 kmol/h air (STARVED) | 310.875 K | -- | acetone 23.6054 kg/h, water 9.5752 kg/h | acetone 6.3947 kg/h (21.3 % of fed), water 20.4246 kg/h (68.1 %); exhaust ON its dew point (Raoult sum 1 to 1e-6), `[drying]` WARNING | 100.0000 % | -0.0000 kW | -- |

The starved row is the pedagogy: the residual is RICHER in water than the
feed's solvent (68 % of the water stays against 21 % of the acetone), which
is the package's K-values at 310.9 K choosing -- nothing in the unit knows
which solvent is "more volatile".  The droplet KPIs moved as the pseudo-
solvent says they should: rho_L 996.96 -> 881.62 kg/m3, d32 60.40 ->
62.95 um, the constant-rate drying time 0.0810 -> 0.0445 s (a lower latent
heat), Sc 0.603 -> 0.698.  The `[sprayDryer]` info line names every one of
those as a pseudo-solvent number.  11 flash evaluations to a microwatt.

The ethanol probe needs one thing the standards record does not carry: a
Fuller `diffusionVolume` (the case declares Fuller diffusivity, and a
declared model that cannot price REFUSES, which is right).  The gate adds
it probe-locally from the FSG increments acetone's own record states, and
says so; NOT a change to `ethanol.dat`.

## 5. Byte-identity of every single-solvent case

Every corpus case with a `sprayDryer` -- `sprayDryer01..07`, the flagship
`ChemicalPlantTutorial` (DRYING.SD), `sugarPlantEconomicsSweep`,
`apalutamide01_tablets` (G1's case, run from a copy, not edited) -- was run
from a clean copy under a binary built from the parent commit and under this
one, and every written file plus stdout/stderr compared byte for byte
(`cmp.py` over the run trees):

    IDENTICAL  apalutamide01_tablets         (153 files)
    IDENTICAL  sprayDryer01_sugar             (36 files)
    IDENTICAL  sprayDryer02_residence_sweep   (22 files)
    IDENTICAL  sprayDryer03_pressure_nozzle   (36 files)
    IDENTICAL  sprayDryer04_profiles          (37 files)
    IDENTICAL  sprayDryer05_whey              (36 files)
    IDENTICAL  sprayDryer06_rea               (37 files)
    IDENTICAL  sprayDryer07_design            (39 files)
    IDENTICAL  sugarPlantEconomicsSweep       (72 files)
    ChemicalPlantTutorial (286 files): differs ONLY in the wall-clock
    `written:` stamps of `iterations/` and `solution.log`; with those lines
    masked, zero files differ.

The sweep was taken twice (once before and once after the sabotage cycle,
on the restored source) because the box was being OOM-killed that
afternoon; both agree.  No golden row moves; none was re-recorded.  The
parent binary was the primary checkout's own build, whose `src/` was
verified identical to this branch's parent by `diff -rq` before it was
trusted (the box could not finish a second full build).

## 6. Rejected alternatives

* **A frozen-composition residual** (the droplet's "diffusion limit": what
  stays has the feed's solvent ratio).  Simple, and it is a real limit of
  droplet theory -- but it needs a separate rule to stop the exhaust
  supersaturating, and in the regime where it applies (air too scarce) the
  equilibrium is the state the exhaust is actually in contact with.  The
  equilibrium needs no rule of its own and cannot fog.
* **Per-solvent Raoult arithmetic in the unit** for the saturation test.
  That is a second home for the package's K-values, and it would part from
  the package the day a case declares NRTL for acetone/water.
* **Picking one solvent and refusing the rest.**  It answers Vítor with a
  refusal; the lumped dryer's mass and energy do not need a droplet model.
* **Applying the isotherm to the water alone.**  The record does not say it
  was measured in water; a sugar's GAB constants in an acetone-rich powder
  would be a number no reader could check.

## 7. Found, NOT changed

* `data/standards/components/ethanol.dat` carries no Fuller
  `diffusionVolume`, so a case declaring Fuller diffusivity cannot price
  ethanol's gas diffusion and refuses (correctly).  A curation item, not
  this slice's; the FSG increment sum the gate uses (2C + 6H + O = 51.77)
  is written there as a probe-local line and nowhere else.
* The wet-bulb balance was written for a single solvent with `Ysat` from
  one Antoine; it now reads the pseudo-solvent's bubble pressure AND the
  latent heat of the vapour that surface emits (the first draft paired the
  bubble pressure with the feed-mean latent heat and put T_wb at 290.8 K,
  below the feed; the consistent pair gives 304.2 K).  Single-solvent: the
  same arithmetic, byte-identical.
* No corpus spray dryer feeds a dissolved component with neither a role nor
  a vapour pressure, so the new refusal fires on no shipped case.
* The three-way route (`langrishKockel`, `chen`) stays single-solvent by
  refusal; a multicomponent droplet model (selective evaporation, Stefan
  flow of two vapours, a mixture CDC) is new physics and is Vítor's to
  commission.

## 8. Gate

`bin/curate/check_spray_dryer_solvents.py` -- seven arms on probes copied
from `sprayDryer01_sugar` into a temporary directory, the material
recomputed component by component from the published streams, the dew point
recomputed with Raoult and each record's own Antoine (the probes declare an
ideal package: an arithmetic independent of the engine's flash), the unit's
energy row held to 1e-4 kW; by-hand sabotages in its docstring.
