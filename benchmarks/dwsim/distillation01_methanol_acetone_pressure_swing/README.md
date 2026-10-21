# Benchmark B -- methanol + acetone pressure-swing distillation

The reference simulator's sample **"Extractive Distillation"** (its file
`PlatformFiles/Common/samples/Extractive Distillation.dwxmz`, read at
commit `1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766` of
github.com/DanWBR/dwsim; the file itself says BuildVersion 8.8.0.0, SavedOn
2024-07-09T11:06:09-03:00).  Despite its name the sample has **no
entrainer**: it is a pressure-swing distillation -- a 40-stage column at
1 atm and a 20-stage column at 6 atm, a pump between them and the HP
azeotrope recycled to the LP column.

What is here, under `benchmarks/README.md`'s rules:

| file | what it is |
|---|---|
| `system/`, `constant/`, `0/` | the problem written as a Choupo case -- the sample's feeds, stages and specifications, Choupo's own properties |
| `reference` | the sample's stored solved state, written by `../read_sample.py` (no parameter of the sample is read) |
| `variants/unifac/` | the same case on Choupo's predictive UNIFAC instead of the regressed NRTL pair |
| `../compare.py` | runs both in scratch copies and prints them beside `reference` |

```
make all
python3 -I benchmarks/dwsim/compare.py distillation01_methanol_acetone_pressure_swing
```

## Properties (all Choupo's own)

* **NRTL**: the acetone-methanol pair Choupo regressed in
  `tutorials/props/curation/curate05_nrtl_acetone_methanol` (bubble
  temperatures at 101.3 kPa, 327.96-337.05 K; held out on a second study;
  verdict **notValidated** -- held-out AAD 0.096 % against a band of
  0.047 %), used case-locally as Vitor ruled (DEV.md 4c C123).
  `constant/parameters/NRTL/acetone-methanol.dat` is a byte copy of that
  record; `compare.py` refuses to run if the two differ, so the pair keeps
  one home.
* **What that means at 6 atm.**  The HP column runs at 387-393 K, about
  50-56 K above the pair's evidence and 31-37 K above methanol's Antoine window
  (288-356 K); the liquid heat capacities are extrapolated too, and the
  vapour is ideal gas at 6 atm.  Every run announces the extrapolations
  (`[pair-span]`, `[psat]`, `[cp]`).  The HP numbers are a prediction of
  this model outside its evidence, and the most model-sensitive one is the
  6-atm azeotrope (below): NRTL puts it at x_MeOH 0.465, UNIFAC at 0.524.
* **UNIFAC** (`variants/unifac`): the original VLE parameterisation, nothing
  fitted to this pair at either pressure.

## Three things the case does differently, each stated where it is done

1. **Specifications.**  The sample fixes each column by reflux ratio (35,
   40) and **bottoms** flow (0.5 mol/s each); Choupo's column takes a
   reflux ratio and a **distillate** rate.  The sample's two bottoms
   specifications have no steady state (finding R1 below), so each product
   here takes what the feed brings, 0.499301 mol/s: LP distillate
   2.361749 mol/s (the sample's stored value), HP distillate 1.862448 mol/s.
2. **The recycle enters the LP column on stage 2, not on the condenser.**
   The sample attaches it to the condenser (stage 1); Choupo's MESH column
   accepts a stage-1 feed and then drops its composition from the
   condenser balance (finding C1).
3. **A letdown valve** is written out between the 6-atm HP distillate and
   the 1-atm LP column, so the column reads the flashed state the recycle
   arrives in (21 % vapour) rather than the saturated liquid its producer
   published at 6 atm.

`model fullMESH` (per-stage energy balances) in both columns -- the sample's
column carries them too (its LP liquid traffic falls from 82.7 to
72.9 mol/s down the column).

## The comparison (measured 2026-10-20, this tree)

```
                                           reference   Choupo NRTL  Choupo UNIFAC    NRTL - ref
azeotrope 1 atm  x_MeOH (model)                   --        0.2222         0.2247            --
azeotrope 1 atm  T [K]  (model)                   --      327.9691       328.5236            --
azeotrope 6 atm  x_MeOH (model)                   --        0.4651         0.5236            --
azeotrope 6 atm  T [K]  (model)                   --      386.5212       386.8016            --
LP distillate  x_MeOH                         0.2412        0.2243         0.2290       -0.0169
LP distillate  T [K]                        326.5843      327.9691       328.5239        1.3848
LP condenser stage  T [K]                   328.5640      327.9692       328.5240       -0.5948
HP distillate  x_MeOH                         0.3066        0.2844         0.2904       -0.0223
HP distillate  T [K]                        388.2676      387.0940       387.6877       -1.1736
recycle  F [mol/s] (as attached to LP)        1.8891        1.8624         1.8624       -0.0267
HP distillate  F [mol/s] (as produced)        1.8617        1.8624         1.8624    6.9916e-04
methanol product  F [mol/s]                   0.5000        0.4993         0.4993   -6.9900e-04
methanol product  x_MeOH                      1.0000        1.0000         0.9999   -9.4024e-06
methanol product  T [K]                     337.9007      337.6989       337.6966       -0.2018
acetone product  F [mol/s]                    0.5000        0.4993         0.4993   -6.9900e-04
acetone product  x_acetone                    0.9999        1.0000         0.9999    5.5685e-05
acetone product  T [K]                      394.9475      392.8930       392.8911       -2.0545
LP condenser duty [kW] (removed)           2575.5016     2609.9411      2609.6345       34.4395
LP reboiler duty  [kW]                     2563.3239     2600.8247      2600.5736       37.5008
HP condenser duty [kW] (removed)           2054.6571     2041.5565      2040.1549      -13.1005
HP reboiler duty  [kW]                     2076.5223     2057.9689      2056.5116      -18.5534
pump power [kW]                               0.1094        0.1055         0.1053       -0.0038
```

Stage profiles (stage 1 = condenser, NRTL - reference): LP max |dT|
9.86 K at stage 20 and max |dx_MeOH| 0.746 at stage 18; HP max |dT| 2.06 K
(stage 16) and max |dx_MeOH| 0.085 (stage 2).  Both runs exit 0, converge,
carry no NaN, close every unit's mass balance and the plant first law to
+0.079 kW (0.0009 % of the energy exchanged; UNIFAC +0.079 kW).

### What agrees, what does not, and why

* **The sample stores no azeotrope.**  Its streams "LP Azeotrope" and "HP
  Azeotrope" are the two DISTILLATES, and with these specifications their
  composition is set by the material balance, not by the vapour-liquid
  equilibrium: the HP top is not pinched (the model azeotrope at 6 atm is at
  x_MeOH 0.465-0.524, the HP distillate at 0.284-0.307).  So the brief's
  "azeotropes 0.2412 at 326.58 K and 0.3067 at 388.27 K" are distillate
  states; the model azeotropes are computed separately by `compare.py`
  (a bubble-point scan of the case's own system, root of y - x).
* **Distillate compositions** differ by 0.017 (LP) and 0.022 (HP), and both
  follow from the flows: the sample's recycle as attached to the LP column
  carries 0.0273 mol/s more than the stream its own HP column produced
  (R2), and its methanol product carries more methanol than the plant is fed
  (R1).  Choupo's flows close; the reference's do not, by more than these
  differences.
* **Duties** agree to +1.3 / +1.5 % (LP) and -0.6 / -0.9 % (HP) -- the
  reference's own first law closes to 1.47 kW of ~4640 kW exchanged, so the
  comparison can resolve about 0.03 %; the differences are real and are
  the two models' latent heats and liquid enthalpies.
* **The HP bottoms temperature** differs by -2.05 K on PURE acetone at
  6 atm (no activity model involved): it is the two vapour-pressure
  correlations, nothing else.  Methanol's normal boiling point differs by
  -0.20 K the same way.
* **The LP profile** is where the models part most: the reference moves
  from the azeotrope to methanol in the RECTIFYING section (stages 5-15,
  above the feed), Choupo in the STRIPPING section (stages 21-30).  At a
  reflux ratio of 35 both sections are pinched and the position of the
  front is set by the products' trace impurities (the reference's methanol
  product carries 3e-11 acetone, Choupo's 9e-6).  Not a modelling error on
  either side by itself; it is the observable that moves most for the least
  physics.  The HP profile is within 2.1 K; its top differs by 0.085 in x
  because of C2.
* **NRTL vs UNIFAC** agree with each other to 0.006 in every distillate and
  1.5 kW in every duty at these specifications; they part on the 6-atm
  azeotrope (0.465 vs 0.524), which no stream of this plant reaches.

## Findings on the reference side (its stored state, measured on its own numbers)

* **R1. The two bottoms specifications have no steady state.**  The feed is
  0.998602 mol/s (declared by mass), 0.499301 mol/s of each component; two
  products of 0.5 mol/s each are 1.000000 mol/s out (+0.140 %), and the
  stored methanol product carries 0.500033 mol/s of methanol against
  0.499301 fed.
* **R2. The recycle is not the stream it copies.**  "Recycled HP Azeotrope"
  stores 1.889121 mol/s; its source "HP Azeotrope" 1.861749 mol/s, at the
  same composition and the same mass flow (0.093265 kg/s, which at that
  composition IS 1.8616 mol/s).  The recycle block reports converged after
  one iteration with stored errors equal to the full values (T 388.27 K,
  mass 0.0933 kg/s) against its tolerances (1 K, 0.01 kg/s).
* **R3. The LP distillate stream sits 1.98 K below its own condenser
  stage** at the same composition (326.584 K vs 328.564 K).
* **R4.** Its first law on its stored numbers closes to +1.466 kW.
* **R5.** Its property package lists the acetone-methanol NRTL interaction
  twice, once in each component order, with different values (a fact about
  the file; which entry the program reads was not determined here, and no
  value is reproduced).

## Findings on Choupo's side

* **C1. A feed on stage 1 is accepted and then lost.**  The multi-feed
  reader admits `stage 1`
  (`src/unitOperations/distillation/DistillationColumn.cpp:1515-1517`), but
  the condenser row of the component balance carries no feed term (the
  `j == 0` rows at `DistillationColumn.cpp:1941-1942` (CMO) and `:2257-2258`
  (full MESH)), while the bottoms are computed from the total feed.  With
  the recycle on stage 1 the LP column published a 109.27 % mass closure and
  an element balance off by 50 %, converged, at exit 0 (the plant's balance
  reports warned).  The single-feed form refuses stage 1 by name; the
  multi-feed form should too, or carry the term.  Engine change -- not made
  here.
* **C2. The "total condenser" is an equilibrium stage.**  The distillate is
  published at `x_D = K_1 x_1` (`DistillationColumn.cpp:2315-2320`) while the
  reflux leaves at `x_1`: on the HP column, x_1 = 0.2224 and x_D = 0.2844.  A
  true total condenser has x_D = x_1 (the reference's: 0.306650 both).  So a
  Choupo column of N stages carries one more equilibrium contact than a
  total-condenser column of N stages, while `docs/ai/unit-ops.md` calls
  stage 1 "the total condenser".  Which one is meant is Vitor's call.
* **C3.** A distillate-rate specification inside a recycle is fragile: the
  LP column failed on the first pass from a recycle seed carrying 0.56 mol/s
  of methanol (more than the LP bottoms can take), and runs from a seed
  carrying about the feed's methanol (`0/recycle`).
  `distillateRecovery` would be the robust specification, and is refused
  for a multi-feed column (documented, `docs/ai/unit-ops.md`).

## Tolerances

There is no pass/fail band: the reference's stored state does not close
(R1, R2), so it cannot judge a flow to better than about 0.14 % (the plant
balance) or a recycle to better than 1.5 % (R2), a distillate temperature to
better than about 2 K (R3), or a duty to better than about 0.03 % (R4).
Differences inside those are not findings about either model.
