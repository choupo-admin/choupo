# The limiting current that falls while you watch

*Batch (recirculating) electrodialysis, stacks in series, and feed-and-bleed.
Built 2026-09-16, the same day as
[`a-stack-is-a-record-and-its-limiting-current-is-predicted.md`](a-stack-is-a-record-and-its-limiting-current-is-predicted.md),
whose §9 named all three as "the next slice".*

---

## 1. Why this slice earns its place

The morning's slice made the limiting current a **prediction**: the linearised
Nernst-Planck film of Geraldes & Afonso, *J. Membr. Sci.* **360** (2010)
499-508 gives the limiting transport numbers from the ion diffusivities and the
**diluate composition**, and `i_lim` in closed form, with no fitted parameter
and no declared transport number.

In a steady case that composition is fixed.  The prediction is evaluated once,
and to a student it is a better number than the one it replaced — worth having,
but not visibly worth the machinery behind it.

**In a batch desalination the diluate depletes, so `i_lim` falls while the run
proceeds.**  Hold the current constant and `i` does not move at all; the two
must cross, and the crossing is the entire pedagogy of batch electrodialysis.
It cannot be shown by a model that reads a transport number measured in another
solution, because that model's `i_lim` does not move either.

This is where the morning's slice pays for itself, and the slice was designed
around making the crossing the thing a student SEES.

---

## 2. The two-tank decision, and why (b)

A batch ED rig has **two** recirculating tanks — diluate and concentrate — and
`BatchUnitOperation` carries **one** `BatchState`.  Two shapes were weighed.

**(a) The diluate is the state; the concentrate leaves through
`takeContinuousDischarge` into a `batchAccumulator`, wired by `dischargeTo`.**
Cheap, reuses everything already built, and **wrong on two counts.**  The unit
would then be unable to SEE the concentrate composition — which is exactly what
the Nernst membrane potential is a function of, and therefore what sets the
stack voltage, the power and (at constant voltage) the current itself.  And a
recirculating tank is not a discharge: nothing leaves the rig, so routing salt
through a hand-off would describe a flow that does not exist and put the
concentrate's inventory in a unit that could not be asked about it.

**(b) The unit holds BOTH tanks.**  `state()` is the diluate, because it is the
product a student cares about; the concentrate is internal state the unit
publishes in full (`n_conc_<comp>`, `m_conc_<ion>`, `kappa_conc`); and
`materialInventory()` and `cycleState()` are overridden to return the **sum**,
so the campaign mass balance sees every mole.

**(b) was taken**, and it needs no architecture: the base class already invites
exactly this (`materialInventory`'s own comment says *"a vessel holding material
OUTSIDE state_.n (the crystalliser's crystal magma) overrides and ADDS it — the
campaign mass balance must never miss a phase"*).  The crystalliser had already
made this shape a precedent.

**What falls out of it.**  The rig is CLOSED — no boundary flow at all — so the
campaign material closure is exact by construction, and the derivative writes
ONE number with two signs (`d[dil] = -r`, `d[conc] = +r`), which every linear
combination of RK stages preserves to round-off.  Measured: mass closure
1.4e-15, worst element 8.5e-14.  Neither ledger record nor boundary hook is
needed, because nothing crosses a boundary.

---

## 3. What the unit is, in one paragraph

`batchElectrodialysis` (`src/unitOperations/batch/BatchElectrodialysis.{H,cpp}`)
adds **no architecture**, on the `BatchDiafilter` precedent whose header says
the same of itself.  It asks `edCell::predictiveLimitingCurrent` — the same
assembly of Eqs. A13/12/13/15/16 the steady `electrodialysisStack` asks — once
per instant instead of once per pass, plus the same Nernst, ohmic and Faraday
relations.  Its packed ODE state is `[n_diluate…, n_concentrate…, W_electric]`;
the electrical work is an **integrated state row**, not a quadrature taken
afterwards (the diafilter's permeated-volume lesson: *a ledger built by
re-integrating a rate disagrees with the state the integrator accepted, at
O(dt)*).

Two ways to drive it, exactly one declared:

* `current <I> A;` — `i` is fixed while `i_lim` falls.  They cross.
* `voltage <U> V;` — `I` is solved from `U = N(E_mem + I R_pair) +
  E_electrodes` at every instant and **decays**, because the diluate loses
  conductivity and the Nernst back-EMF grows.  `i` and `i_lim` then fall
  together and the crossing never happens.

---

## 4. ONE HOME: the extraction that came first

`IEMSpec`/`readIEMPair`, `ChannelState`/`buildChannel`, the mean activity ratio,
the solution resistance and the whole `GeraldesAfonso2010` assembly lived in an
**anonymous namespace inside `ElectrodialysisStack.cpp`**, which was right while
that file was their only caller.  The batch rig is the second caller, so they
moved to `src/unitOperations/electrochem/EDCell.{H,cpp}` — **verbatim**, with
the refusal messages carrying the caller's own type word so nothing the steady
unit says has changed.  (The precedent is `BulkConversion.H`: a helper leaves an
anonymous namespace the day the second caller arrives.)

What is deliberately NOT shared: the Faraday transfer itself, the stack-record
clash refusals and the operating-mode grammar.  Those differ between the two
units — a flowing stack reads its flow off an inlet stream and may be given a
`targetDemin`; a batch rig declares a recirculation rate and may be given a
voltage — and folding two different questions into one function is how a shared
home becomes a switchboard.

**The extraction is proved twice.**  Numerically: the batch rig's `t = 0`
`D_eff` equals `ed03_stack_record`'s to 1e-12 and its `i_lim`, `u`, `k_c,eff`,
`Re` and `Sh` to 1e-8 (the two cases declare the same flow through different
grammars, so they agree only to the digits their files carry).  On the source:
`ElectrodialysisStack.cpp` must CALL `edCell::` for all five and define none of
them.  Every `ed01`…`ed05` golden is byte-identical after the move.

---

## 5. The over-limiting plateau: a claim, with no new parameter

At `i = i_lim` the counter-ion concentration vanishes at the diluate/membrane
interface and the film can deliver no more of it.  A larger current must
therefore be carried by something else, and what is available is H+ and OH-
from water dissociation at the depleted interface.  Freezing the counter-ion
transfer at its limiting value is the first-order statement of that:

```
xi_eff = xi * min(1, i_lim / i)
```

It follows from the definition of the limiting current rather than from a fit,
and it introduces **no new parameter** — Vítor's ruling of 2026-09-15, *"não se
pode andar a aumentar o número de parâmetros porque o modelo fica melhor mas
depois não há dados"*, applied to the regime rather than to the transport law.

It is nevertheless a model of a REGIME, so it is **opt-in**:
`overLimiting { model saltFluxPlateau; }`.  The DEFAULT is `none` — the current
efficiency stays at `xi`, the run WARNS that the answer past the crossing is an
EXTRAPOLATION of a model outside its validity, and it does **not clamp the
current**, which is the steady stack's own posture.

**What the plateau does to the shape of the answer, and why it is the lesson.**
For a single salt at a declared flow, `D_eff` is composition-independent and
`Sh`, `Re`, `Sc`, `k_c,eff` are constants of the run, so Eq. (15) makes `i_lim`
exactly proportional to the diluate concentration.  Combine that with the
plateau and past the crossing `dn/dt ∝ -n`: the depletion stops being linear and
becomes exponential.  **The straight line reaches zero at a finite time and the
tank never does.**

---

## 6. What the run is compared against, and why it cannot be arranged

The hand calculation for a batch electrodialysis is Faraday's law at the
**initial** current:

```
n(t) = n(0) - xi * I(0) * N * t / (z F)
```

The unit publishes it as `demin_ideal`, evaluated from **this run's own**
`I_initial`, own initial inventory and own declared `xi` — computed, never
declared, exactly as `BatchDiafilter` publishes `washoutIdeal` from its own
initial rejection *"so a student cannot be shown a gap that was arranged"*.

And where the two part, the run NAMES the reason at the instant it happens:

| | `edbatch01_constant_current` | `edbatch02_constant_voltage` |
|---|---|---|
| i | 175.00 A/m2, flat | 218 → 100.9 A/m2 |
| i_lim | 643.04 → 88.26 A/m2 | 643.04 → 246.99 A/m2 |
| i/i_lim | 0.272 → 1.983, **crosses at t = 1593 s** | 0.339 → 0.409, never |
| I | 3.5 A, flat | 4.365 → 2.018 A |
| xi_eff | 0.900 → 0.4539 | 0.9 throughout |
| demineralisation | **86.27 %** actual, 91.41 % ideal | **61.59 %** actual, 85.51 % ideal |
| the straight line empties the tank at | 2188 s | 1754 s |
| specific energy | 1.946 kWh/m3 | 1.048 kWh/m3 |

Two cases, the same hand calculation, two entirely different reasons for its
failure — and only one of them has anything to do with the limiting current.

**Under `overLimiting { model none; }` the two curves coincide to the
integrator's own precision**, and that is a RESULT rather than a
disappointment: the gap a student can see is only as large as the physics in
the model, and that model then contains nothing that could open one.  The gate
holds it as the NEGATIVE that shows the gap in the shipped witness is the
declared plateau and not an arrangement.

---

## 7. The network witnesses, which needed no new code

The morning's record wrote, before either case existed:

> An electrical **stage** is a set of cell pairs served by ONE electrode pair
> fed by its own rectifier.  Stages in series therefore each carry their own
> current and their own voltage — there is no shared electrical node to model
> — so a stack with several electrical stages inside it is simply **several
> units in series**. … a real plant runs successive stages at **decreasing
> current density**, because the limiting current falls as the diluate
> depletes — and this slice's model now *predicts* that fall.

`ed06_stages_in_series` is that sentence, measured.  Four `electrodialysisStack`
units, four `electricLoad` rectifiers, the diluate passing from one to the next
and a co-current concentrate loop through all four; each asked for
`targetDemin 0.6`, so the ENGINE solves the current each needs:

| stage | I [A] | i [A/m2] | i_lim [A/m2] | i/i_lim |
|---|---|---|---|---|
| 1 | 26.80 | 53.60 | 338.88 | 0.158 |
| 2 | 10.72 | 21.44 | 135.55 | 0.158 |
| 3 | 4.29 | 8.58 | 54.22 | 0.158 |
| 4 | 1.72 | 3.43 | 21.69 | 0.158 |

overall demineralisation 97.44 %.  The limiting current falls **15.6-fold**
along the train, so the current must fall with it: stage 1's 53.60 A/m2 applied
at stage 4 would be **2.47 times its limiting current**.  *The plant holds the
margin, not the current.*

`ed07_feed_and_bleed` is the recycle, and it carries a trap worth meeting before
a design sheet is written.  Fresh feed joins four fifths of the stack's own
product; the bleed that leaves equals the fresh feed.  A student sizes the
rectifier from the FEED analysis, 0.050 mol/kg — and **the stack never sees
0.050 mol/kg.**  It sees the mixed loop:

| | mol/kg | |
|---|---|---|
| fresh feed | 0.050000 | at 0.6 m3/h |
| what the STACK sees | 0.018667 | at 3.0 m3/h |
| product (the bleed) | 0.010831 | at 0.6 m3/h |

so `i_lim` in the loop is 126.52 A/m2 against the 338.88 the SAME stack reaches
at the feed concentration in `ed05` — **2.68 times lower** — and the per-pass
duty is 41.98 % where the plant delivers 78.34 %.  Both errors point the same
way, towards an under-designed stack run too hard.

A third reading of the same trap is on the printed sheet: the unit's
`specific_energy_kWh_per_m3` is 0.0460, taken on what passes THROUGH the stack,
while the plant's is 0.1379 kW / 0.6 m3/h = 0.230 — **a per-pass figure of merit
is not a plant figure of merit whenever there is a recycle.**

---

## 8. Two things fixed on the way

**A mixer priced inlets it was never going to read.**  `Mixer.cpp` summed
`Hin_total` in its inlet loop unconditionally, and that sum feeds exactly one
thing: `h_req`, the target of the ADIABATIC Newton in T.  An ISOTHERMAL mixer
(`operation { T … }`) never reads it — and the mixer publishes no duty either
— so a case declaring its outlet temperature was being REFUSED over an
arithmetic the run does not perform.  Found building `ed07`, whose ionic
components carry no liquid heat capacity: the refusal is correct for the
adiabatic balance (*"a nonvolatile's enthalpy must not route through the
ideal-gas reference"*) and meaningless here.  `operation.T` is now read BEFORE
the loop and the accumulation is skipped.  **No number moves** — where the
pricing succeeds the sum is still taken — and all 18 mixer-bearing cases in
the corpus pass unchanged.  The schema's claim that "the duty is the result" was also FALSE and
had always been: the mixer publishes `F_out`, `T_out`, `P_out`, `vf`, `n_in`
and no duty at all.

**The `check_ed_stack` docstring said no batch electrodialysis exists.**  It
said so in its blind-spot list and in its own claim line, which is where a
reader goes to find out what the project checks.  Corrected in the same commit
that made it false — CLAUDE.md §10's rule, applied to a gate.

---

## 9. What is NOT modelled, said plainly

Each of these is REFUSED or ANNOUNCED, never assumed:

* **More than one cation or one anion — REFUSED by name.**  How the counter-ion
  current divides between two counter-ions is set by the MEMBRANES' selectivity
  between them, and no `kind IEM` record in this tree carries that.  The
  limiting transport numbers of Eqs. 12/13 describe the FILM at the limiting
  current and are a different quantity; using them as a split would invent
  exactly the parameter the 2010 model exists to remove.  The steady unit keeps
  its multi-ionic feed, because its `i_lim` PREDICTION needs no such split.
* **Back-diffusion** of salt from the concentrate.  It is real and it is what
  stops a rig concentrating indefinitely, but it needs a membrane salt
  permeability that no record carries — a new declared parameter with no
  measurement anywhere in the tree to set it.
* **Water transport**, osmotic or electro-osmotic.  Both tanks keep their water.
* **A falling current efficiency from co-ion leakage** as the concentrate
  strengthens: `xi` is a declared constant apart from the opt-in plateau.
* **Any temperature transient.**  The rig is isothermal and the Joule heat is
  removed by no modelled duty — see below.
* **The pumps** (two recirculation loops, no shaft work anywhere) and **the
  electrode reactions** (lumped into `E_electrodes`, no Butler-Volmer).

**Energy: the work is integrated, the first law is NOT claimed.**  The
electrical work is known exactly (an integrated state row, published as
`energy_electric_kJ`).  What is missing is its destination: almost all of it
becomes Joule heat, and holding both tanks at the declared temperature needs a
cooling duty this rig does not have.  Setting that duty equal to the electrical
work would close the balance BY CONSTRUCTION and measure nothing — the PLUG
this project refuses (the `column01` lesson: `Q_reboiler = dH - Q_cond` closes a
column's own balance by construction and can emit no residual).  So
`energyLedgerGap()` names it and the campaign energy balance reports
UNAVAILABLE, on the `BatchDiafilter` precedent.

---

## 10. The gate, and what building it found

`bin/curate/check_ed_batch.py`, nine arms, wired into `bin/runTests`.  Its full
account of itself — including the eleven by-hand sabotages, **two of which did
not do what was predicted** — is in its own docstring, which is the one home for
that record.  Three things it taught are worth carrying beyond it:

* **A probe that cannot reach the state it claims to test proves the opposite of
  what it says.**  The `noConcentrate` probe deleted the block by searching for
  the word `concentrate`, and the first occurrence in the file is in its own
  header, which explains the block in prose — so it cut a comment, ran the
  unmodified case, exited 0 and reported "the refusal is not there" about a
  refusal that was working perfectly.
* **Prose is not a call, again.**  Commenting OUT
  `EDStackRegistry::loadFrom(...)` left the string in the file and the source
  arm went on passing.  Every source arm strips both comment forms first now.
  (The `topLevelSector` trap of 2026-09-06, met by a different road.)
* **A source arm placed after an early return is an arm that does not run.**
  With the registry dropped both witnesses die, the gate returned early, and
  the arm that names the RULE never executed — only the symptom was reported.
  The source arms are taken BEFORE any run now.  *A check placed after an
  exiting one is a check that does not run*, which is `release_inventory`'s own
  recorded lesson, found again here.

---

## 11. RESERVED, and open

**Vítor's.**  A multi-ionic BATCH feed needs a rule for how the counter-ion
current divides between two counter-ions.  The candidate that costs no new
parameter is to use the limiting transport numbers of Eqs. 12/13 as the split —
but those describe the film AT the limiting current, not the membrane's
selectivity below it, so adopting them is a modelling claim and his to make.
Until then the unit refuses by name.

**Found and NOT fixed (a finding, not this slice's to take).**  The steady
`electrodialysisStack`'s Faraday transfer gives EVERY ion `xi I N / (z_i F)`,
which is charge-balanced for a 1:1 salt and is **not** for a feed of mixed
valence.  Measured on `ed04_limiting_current_multiionic` (Mg2+ / Cl- / SO4 2-):
the ED1 diluate outlet carries a net charge of **+1.306e-8 kmol/h against
7.164e-7 equivalents — 1.8 %** — and the concentrate outlet the mirror of it.
The arithmetic is direct: the diluate loses `2 x (xi I N / 2F) = xi I N / F`
cation equivalents against `xi I N / F + 2 x (xi I N / 2F) = 2 xi I N / F`
anion equivalents.  Fixing it is a PHYSICS change that moves `ed04`'s golden
and requires the same split rule reserved above, so it is named here and left.
The new batch unit cannot inherit it, because it refuses a multi-ionic feed.

**Also not done, named rather than implied.**  No batch case uses a stack
record other than `EUR2C-7P18`, the `leveque` correlation branch, or a record
that names no membrane pair.  `t_overLimiting_s` is the first accepted STEP at
which `i` exceeds `i_lim`, so it carries the time step as its resolution
(1593 s at deltaT 1, 1592.5 s at deltaT 0.25) while every other published
number is converged to ~1e-8; the case header says so.  And **nothing here is
validated against a measured batch electrodialysis** — no run of a
recirculating rig is transcribed anywhere in this tree, so every number above
is the model's own, the `saltFluxPlateau` claim included.

---

## 12. Files

| | |
|---|---|
| engine | `src/unitOperations/batch/BatchElectrodialysis.{H,cpp}` |
| extracted one home | `src/unitOperations/electrochem/EDCell.{H,cpp}` |
| registration | `src/unitOperations/batch/BatchUnitOperation.cpp`, `src/applications/choupoBatch/main.cpp` (`EDStackRegistry::loadFrom`) |
| fixed on the way | `src/unitOperations/mixer/Mixer.cpp` |
| schema | `gui/schemas/operations/batchElectrodialysis.schema.json` |
| witnesses | `tutorials/batch/electrodialysis/edbatch01_constant_current`, `edbatch02_constant_voltage`, `tutorials/steady/electrodialysis/ed06_stages_in_series`, `ed07_feed_and_bleed` |
| gate | `bin/curate/check_ed_batch.py` |
| docs | `docs/ai/unit-ops.md`, `docs/tutorials-catalogue.md`, `docs/userGuide.tex`, `docs/theoryGuide.tex` (§ the limiting current in TIME and in SPACE) |
