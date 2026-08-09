# TP-stream energy coherence — the inlet state, the enthalpy rungs, and the duty

**Status: RATIFIED 2026-08-09 (Vítor), R-E1..R-E5 + O1, with ONE PRECISION
on R-E3/R-E4 — folded into the text below and binding on the
implementation:**

> A substance has ONE thermochemical definition; liquid, vapour and solid
> enthalpies are consistent VIEWS of it, not separately curated energies.
> If the required fusion/vaporisation data are absent, refuse rather than
> manufacture a crossing.

The "crossing table" wording in the original proposal is therefore to be read as
the CALLABLE TRANSITIONS of one canonical construction — the record's
single datum (`standardThermochemistry` on its declared reference state)
plus its declared transition data (Hvap model, `sublimation.Hfus`,
per-phase Cp) deriving `h(T, phase)` — never as independently authored
pairwise routes.  `h_formation` stays that one construction's single
implementation home; adding a reachable phase means adding a VIEW derived
from declared data, with a named refusal where the data is absent.

Further ratified with O1: the authored inlet and the resolved inlet stay
conceptually distinct — `0/feed` is what the user DECLARED, `converged/feed`
is what that declaration RESOLVES TO physically; the resolved snapshot's
report-only decomposition describes the equilibrium state, and `0/feed` is
never modified to make that happen.  Two executable invariants ride along:
**reflash idempotency** (identical (T,P,z,world) re-flashed prices Q = 0)
and **report-only neutrality** (deleting a report-only decomposition may
not change the calculation; regenerating it must reproduce the resolved
state the calculation used).

Implementation order confirmed: (1) canonical solid rung, (2) TP
inlet-state resolution for energy, (3) report/stream-H coherence.  The
Q-golden blast radius is MEASURED before anything is re-recorded, and
every moved golden cites this record as a semantic correction, never
routine churn.  Papers stay parked throughout.

The finding this record answers (diagnosed 2026-08-09, reported in-session):
`flash19_organic_and_precipitate` reports **Q = +13.34 kW** across an
isothermal flash whose operating (T, P) equal the feed's authored (T, P).
The trace showed the duty prices a transformation the case never declares —
from a hypothetical single-phase liquid (the `vf = 0.0` default standing in
for an undeclared phase) to the equilibrium multiphase state.  Three
incoherences, one root:

1. **The energy balance reads the banned decorative pin.**  The stream-state
   constitution says an unpinned TP stream's phase is a RESULT of
   equilibrium, and its resolver layer 2 (TP-flash in the consuming unit's
   world) is named-but-deferred.  In the gap, `ProcessStream.vf = 0.0` (the
   struct default) acts as an implicit `phase liquid;` pin — exactly the
   "decorative vaporFraction 0" the constitution bans from files, smuggled
   in as a code default.  The MATERIAL answer honours the constitution (the
   flash equilibrates); the ENERGY answer does not (H_in prices the
   unresolved representation).
2. **Two enthalpy surfaces price one crystal.**  The flash duty prices the
   precipitate as apparent dissolved salt (inside `sol.x`, the aqueous
   rung); the balance report prices the same crystal on the solid formation
   rung (`solidH_elements`).  The 101.17 % closure on flash19 IS that rung
   difference (0.156 kW / 29.3 kJ·mol⁻¹ on the 0.0191 kmol/h of calcite).
3. **The SLE freezer has no duty at all** (withheld as a named gap, S4b):
   `h_formation` has no gas-natural → solid leg, and its liquid-natural →
   solid leg silently omits the fusion heat ("melts back as liquid").

## Proposed semantics (the ruling asked for)

**R-E1 — An unpinned TP boundary stream MEANS the equilibrium state of
(T, P, z) in the consuming unit's thermo world**, for energy exactly as for
material.  H_in is priced on that resolved state.  Implementation shape:
the machinery already exists as the duty code's `feedSplit` re-flash; the
change is its GATE — it runs when the feed is *unpinned* (constitutional),
not only when an authored `vaporFraction q` pin exists.  This is the
constitution's deferred resolver layer 2, landing first where it was
missed.  Consequence: flash19's Q → 0 (the flash at the feed's own T, P is
the identity operation), and the reflash-idempotency principle becomes an
executable property.

**R-E2 — A pinned stream keeps its declared reading, and the price of the
declaration becomes visible.**  `phase liquid;` (or `gas`) on a feed =
"this boundary delivers a constrained/metastable single phase"; H_in prices
that phase, and a non-zero duty at identical (T, P) is then DECLARED
physics (the relaxation heat of a metastable inlet), announced as such.
`vaporFraction q` keeps its saturation-split meaning.  Absence of a pin is
never a pin.

**R-E3 — ONE solid rung everywhere.**  A crystal in a stream (`s[]`) is
priced on the solid formation rung by BOTH the unit duty and the balance
report — the flash's H_out gains the same `h_formation(T,"solid")` term
`solidH_elements` already carries, and the apparent-liquid pricing of a
precipitated share ends.  The report and the unit then agree by
construction on solids.

**R-E4 — `h_formation` completes its crossing table, opt-in by data, no
special cases.**  gas-natural → solid: `Hf − Hvap(298) − Hfus + ∫cp_solid`
(requires declared Hfus; refuses otherwise, naming the remedy).
liquid-natural → solid: `Hf − Hfus + ∫cp_solid` when the record opts into
melting data (the existing (b)-discriminator: real `solidHeatCapacity{}` +
real `Hfus`); the dissolved-solute default (Hfus ≈ 0) stays for records
that declare neither — an absence keeps meaning what it meant.  The
298 K-transition convention stays (documented approximation, same posture
as the ΔCp omission).  The SLE freezer duty then falls out of the general
machinery — sensible + fusion, no freezer-specific treatment — closing the
S4b named gap.

**R-E5 — One stream-H convention on every surface.**  `streamH_elements`
(report) and the unit duty price a given stream identically: resolved
state for unpinned, declared state for pinned, solid rung for `s[]`.  The
existing vf∈(0,1) re-split in `streamH_elements` becomes a case of the
general rule instead of a special one.

## What moves (to be measured before implementation, per the golden rule)

* Any case whose FEED is not single-phase at its own (T, P) and carries no
  pin: its Q KPI moves toward the coherent value (flash19: 13.34 → ~0).
  The sweep enumerating these is implementation slice 1's first artefact —
  every moved golden re-recorded with this record as the reason.
* Any case with a precipitating unit whose duty priced the crystal on the
  aqueous rung (flash16/19, crystallisers on the flash path): Q moves by
  the rung difference; the report's closure % correspondingly tightens
  toward 100.
* Cases with melting-opt-in records crossing liquid → solid gain the fusion
  term (none known to consume that leg with Hfus declared today — to be
  verified in the sweep, not asserted).
* flash21 gains its real duty (currently withheld); the witness case will
  additionally feed WARM liquor (298 K) so the tutorial shows the freezer
  duty as sensible + fusion, not 0.

## Implementation slices (after ratification, one per beat)

1. **Rung slice (R-E3/R-E4)** — **SHIPPED 2026-08-09**: the two
   `h_formation` legs (gas-natural → solid refusing without a declared
   `sublimation { Hfus }`; liquid-natural → solid gaining −Hfus + ∫cp_solid
   behind the existing (b)-discriminator, dissolved solutes byte-identical)
   + the flash duty's solid-rung term (every crystallised mole re-priced
   from the liquid formation rung onto `h_formation(T,"solid")`, chemistry
   route and SLE branch alike) + gate arms (`check_solid_service` A10:
   flash21's published negative duty beside the closed-form identity; A11:
   flash19's live `energy_closure_pct` within 100 ± 0.5).  As measured, NO
   existing golden moved; flash21 gained its first duty golden (Q −167.4 kW
   = sensible + fusion on a 298.15 K feed, re-recorded and resealed with
   this record as the reason; its solidFraction 0.475994623251 unchanged —
   the split depends on the operating T only).  flash19's reported Q is now
   13.4913 kW against the report's dH 13.4913 (closure 100.00 %, was
   101.17 %).
2. **Inlet-resolution slice (R-E1/R-E2)**: the unpinned-feed re-flash in
   the duty path + the `phase` pin honoured in pricing + the announced
   metastable-inlet duty; idempotency gate (a converged outlet re-fed at
   identical T, P prices Q = 0); golden sweep.
3. **Report-coherence slice (R-E5)**: `streamH_elements` generalised;
   `energy_closure_pct` on the multiphase corpus pinned near 100.

## Open points for the ruling

* **O1 — scope of the inlet re-flash**: duty pricing only (cheap, one extra
  flash per unit solve), or also the post-solve inlet `speciation{}` block
  (flash19's `converged/feed` today publishes the METASTABLE one-liquid
  reading, pH 4.66 beside the outlet's 6.11 — coherent would be the
  equilibrium decomposition, with `phases{}`)?  The block is report-only;
  recommending BOTH for coherence, stated separately because the second
  changes converged/ artefacts, not KPIs.
* **O2 — `water-dissociation` second datum**: unrelated to this ruling's
  mechanics but adjacent (the reference-rung record names it); NOT folded
  in here.
* **O3 — pure-component TP degeneracy**: a pure feed ON its coexistence
  manifold stays the constitution's named FATAL (no silent split); the
  re-flash must preserve that refusal.

## Blast radius, MEASURED (2026-08-09, pre-implementation — the sweep the ruling required)

Sweep: all 44 flash-bearing cases with an `expected` file, classified by
(feed T,P vs operating T,P) × (Q golden present) × (solid outputs) ×
(class-3 records in the catalogue).

**Definite Q-golden movers (class 1 — the flash19 signature: Q ≠ 0 at
identical feed/operating conditions, which R-E1 prices to ~0):**
`flash09_nh3_water_reactive` (196.1 kW) · `flash10_ch4propane_pcsaft`
(0.63) · `flash13_acetic_ethanol_vacuum_flash` (669.3) ·
`flash17_two_liquids_reactive` (288.1) · `flash20_ethanol_water_pcsaft`
(733) · `basis01_two_unit_chain` (40, first unit) — six goldens, each to be
re-recorded citing this record.

**Stay-zero (no move):** `flash08`, `flash09_n2ch4`, `flash10_acetic`,
`flash12`, `model5_nrtl_flash` — Q = 0 goldens on single-phase-at-feed
cases; R-E1 reprices nothing.

**Needs-probe at implementation (operating ≠ feed conditions — moves only
if the feed is multiphase at its OWN conditions):** `cavett01` (multi-unit,
per-unit conditions), `hda`, `polycaprolactonePlant`, `ammonia01/02`,
`process02` (×2), `proxy01_gas_loop`, `recycle_autoinit_tear`,
`optim02/05`, `column13`.  Slice 2 lands with a comparison probe that
reports each feed's own-condition split before goldens move.

**Class 2 (solid rung): ZERO golden movers** — flash16 and flash19 pin no
Q KPI (verified), crystalliser duties price through the shared
`CrystallisationHeat` (ion-derived, not the flash rung), and
`energy_closure_pct` lives in report CSVs, not goldens.  The rung fix
moves REPORTED numbers (flash19's JSON Q and its 101.17 % closure), not
recorded ones.  **Class 3: ZERO records** carry
pureLiquid-reference + Hfus + solidHeatCapacity together, so the
liquid→solid fusion view has no silent consumer to move.

Net: SIX golden re-records, all class 1, all semantic corrections; the
rung slice (1) moves no golden at all; `flash21` gains its first real duty
golden when slice 1 lands.

## Needs-probe cases, RESOLVED (2026-08-09, parallel probe survey — full report + probe cases in the session scratchpad)

Every flash-feed in the twelve multi-condition cases was mapped and, where
not single-phase by construction, probed with a minimal single-flash case at
the stream's own recorded (T,P,z) under the case's own `constant/`.  17
flash-feed rows: 8 multiphase, 9 single-phase, 0 undecidable.  **Slice 2
should expect FIVE of the twelve to move:** `cavett01_recycle_train` (FL2
V/F 0.954, FL3 0.885 at their feeds' own state), `polycaprolactonePlant`
(devolatiliser feed V/F 0.540), `ammonia02_full_plant` (separator feed V/F
0.973), `proxy01_gas_loop` (feed split ≡ unit split — the flash19
signature; Q −2.195 → ~0), `optim05_reactor_npv` (plus a flagged cascade
into its `economics.*` goldens through the utility-cost pass).  NOT moving,
each for a verified reason: hda + ammonia01 (single-phase feeds),
recycle_autoinit_tear (subcooled), process02 ×2 + optim02 (multiphase feeds
but NO pinned flash-Q golden), column13 (single-phase vapour at its own
recorded state).

Three caveats binding on the slice-2 build: **(C1)** ammonia02/proxy01
feeds carry a producer-written `phase gas` that is HX vf pass-through, not
an authored pin (both 0/ trees are pin-free) — pin detection must
distinguish AUTHORED pins from carried state or those two movers silently
drop off.  **(C2)** column13's recorded stage-mix state (483 K,
liquid-priced) REFUSES to re-flash under the reactive package today — the
inlet resolution will hit that refusal on a currently-green case and must
surface it honestly, never crash or silently skip.  **(C3)** the
"single-phase ⇒ no move" reading holds only where carried vf matches the
resolved phase — verified row by row; column13 is the one mismatch.

**Slice 1 is SHIPPED (2026-08-09, suite 442/0):** the rung views live in
`h_formation` per the one-construction precision, the flash prices every
crystallised mole on the solid rung on BOTH routes, flash19's duty equals
its report (closure 100.00 %, was 101.17), flash21 carries the first real
freezer duty golden (−167.4 kW = sensible + fusion), and exactly one
golden moved — the measured blast radius held live.  One more
permanently-green-gate specimen fell on the way: the old A10 withhold arm's
parse could never have seen a published Q (recorded in the gate).

## Slices 2 and 3 SHIPPED (2026-08-09) — what was measured, not predicted

**Slice 2 (R-E1/R-E2).**  The flash re-flashes every UNPINNED feed at its
own (T, P, z) through the same `solveCore` the unit uses and prices H_in on
that resolved state; a PINNED feed keeps its declared reading and, where
that costs energy at unchanged (T, P), the duty is ANNOUNCED as the price
of the pin.  `ProcessStream::phasePinned` carries the authored-vs-carried
distinction (caveat C1) — set by the file reader alone, never by a
producing unit.

**Slice 3 (R-E5).**  `streamH_elements` obtains H the way the duty does.
Two things the measurement forced, neither in the plan: a stream whose own
equilibrium the package REFUSES to resolve is priced on the state it
carries and says so (flash19's vapour outlet has no Ca, and the first
version turned a 101 % closure into a REFUSED balance); and the resolved
state's crystals needed the solid rung too — the third time that same
asymmetry appeared in this campaign, each occurrence visible only once the
previous fix removed the noise hiding it.

**flash19, the case that started this**: `H_in = H_out = −7953.9193 kW`,
`dH = 0.0000`, closure **100.00 %**, unit `Q = 0`.  The identity operation
costs nothing, on every surface.

**The blast radius, measured: ONLY DUTIES MOVED.**  Across 442 cases not
one composition, vapour fraction, pH or material flow changed; the three
non-duty rows are optim05's NPV/COM/payback, computed from a duty.  Ten
goldens re-recorded, each with its old→new value in the commit.  Two
corrections to the earlier prediction, both from measurement: **flash13
does NOT move** (my sweep compared feed vs operating TEMPERATURE only, and
flash13 is a vacuum flash — 1 atm feed, 0.65 atm operation — so its 669 kW
is genuine pressure-drop duty), and **column13 does NOT move** (the duty
now prices a carried state and announces it, matching the report, instead
of withholding itself).

**cavett01 CHANGED SIGN**: FL2 +125 080 → −237 665 kW, FL3 +45 785 →
−150 873 kW.  Their feeds are 95 % and 89 % vapour at their own recorded
states and the old duty priced them as liquid, so the case asserted those
drums must be HEATED when the physics says COOLED.  The published anchor
(Rosen & Pauls) is on COMPOSITIONS, none of which moved.

**A defect the coherence exposed, and FIXED the same day on Vítor's ruling**
(it was first recorded here as out of scope — a unit's physics is not a
reporting slice's business — and the ruling was: fix it).

The finding: `process02`'s heater declares Q = 0.40 kW and writes an outlet
at 362 K which, resolved at its own (T, P, z), is TWO-PHASE and costs
3.31 kW — **827.62 % closure**.  It heated sensibly straight past the
bubble point; pricing that outlet as liquid had hidden it.

**The fix is R-E5 applied to an INVERSION rather than to a pricing.**  The
outlet of a Q-specified heater is not "the temperature a sensible Cp
relation reaches with that much heat" — it is *the state whose enthalpy is
H_in + Q*, on the same elements-datum-over-the-resolved-state surface the
balance report reads.  Where the stream reaches saturation the temperature
STOPS and the vapour fraction RISES, and both now fall out of the same
Newton: `vf_out` is published beside `T_out` as the other half of one
result.  The saturation-dome guard — which used to refuse the crossing and
point at `phaseChanger` — stays only on the sensible fall-back path, where
it is the only thing standing between that path and heat it never spent.

**One home, not a fourth copy.**  R-E5 was implemented twice (the flash's
duty block, `reporting/BalanceMath.H`); the heater would have been a third,
and the day after the first two agreed they were found disagreeing with it.
The resolve-and-price pair now lives in
`src/unitOperations/flash/StreamEquilibrium.H` — `equilibriumAt` (the
constitution's unpinned reading, R-E1/R-E2) and `hOfState` (the phase blend
plus the solid rung, R-E3) — read by the report and by the heater.  A rule
enforced by repetition has an arity equal to the number of its copies.

**What moved, measured on all 19 corpus cases carrying a `heater`:**
seven heater outlet states, and nothing else.  process02 and
process02_with_design 361.95 → 359.28 K (vf 0 → 0.0090), optim02
364.86 → 358.40 K (vf 0.022), optim05 364.27 → 356.55 K, economics01
367.79 → 358.09 K, economics02 367.72 → 357.33 K, basis01 332.23 →
330.81 K.  Every one of them is the same correction: the old temperature
was bought with latent heat the case never paid.  Twelve heaters moved
only in their last digits or not at all, because their outlets are
genuinely single-phase.

**AND A DERIVATIVE THAT STRADDLED THE KINK MOVED AN OPTIMISER.**  The first
version of this fix kept the Newton's existing 0.5 K central difference.
dH/dT jumps from 120 to 4300 J·mol⁻¹·K⁻¹ across the bubble point, so a step
that wide returns the average of two regimes — a slope belonging to neither.
Newton then converges LINEARLY, oscillating either side of the answer with a
ratio near 0.73: 27 iterations on process02 to reach a root it had bracketed
by the third, ending 1.3e-2 J/mol out instead of 2e-6.  That was visible as
slow convergence and dismissed as cost.  It was not only cost: `optim02`'s
Nelder-Mead read the last-digit wobble as landscape and reported a NEW
interior optimum (V_R 0.007011, Q 285.83 W, objective 1.370023e+06) which
does not exist — the case header was rewritten to explain it before the
cause was found.  A 0.01 K step, which stays inside one phase and is still
1e5 times a converged flash's noise, gives 7 iterations, quadratic
termination, and puts optim02 back on its original optimum (V_R 0.008070,
Q 500 W at its upper bound, 9.346728e+05 EUR) with only its outlet state
changed.  **A derivative evaluated across a discontinuity in the derivative
does not merely converge slowly; it can move an optimiser sitting above
it.**

**And a SECOND defect fell out of it, which is the part worth remembering.**
`economics01`'s heater had exactly the same disease and its closure read
**100.00 %**.  Its outlet at 367.79 K is not two-phase — it is *entirely
vapour*, and `streamSplit` returns nothing for a single-phase resolution, so
the report fell back to pricing the stream on the `vf = 0` it CARRIED: a
subcooled liquid at 367.79 K.  Two wrongs read as one right.  The louder
case (process02, 33 % vapour) was the only one visible, and it was visible
only because its resolution happened to land *between* the two phases.
The residual asymmetry is named here rather than fixed: `streamSplit` still
prices a single-phase resolution on the carried `vf`.  It no longer bites
through a heater, because the heater now writes the vapour fraction it
resolved — but a producer that writes a `vf` its own state contradicts
would reopen it.

**A THIRD thing it uncovered, NAMED and not fixed: the balance report has no
notion of a per-unit thermo world.**  R-E1 says an unpinned stream means the
equilibrium of (T, P, z) *in the consuming unit's* world, and the heater now
obeys that — so `basis01_two_unit_chain`'s transporter, which declares a
local molecular-ideal `thermo {}`, finds its brine 1.3 % vapour near 331 K
and reaches 330.81 K on 40 kW.  The global electrolyte package holds the same
volatiles as ions, finds essentially no vapour, and the same 40 kW reaches
332.23 K — verified by deleting the local block, which reproduces the old
number exactly.  Same enthalpy, two temperatures: the settled rule that H is
the conserved truth and T is the model-dependent readout, working as
designed.  But `unitEnergyBalance` prices EVERY stream in `ctx.thermo`, the
global package, so that legitimate difference lands in this unit's closure —
**92.54 %, announced in RED as "an UNEXPLAINED first-law residual"**, which
is precisely what it is not.  Before the fix the sensible inversion happened
to track the global datum closely enough that the same gap read 100.00 %;
that was luck, not agreement, and every unit carrying a `thermo {}` override
has been mispriced by the report for as long as the override has existed.
The remedy is a model-boundary line in the energy report (the settled
`ModelBoundaryAudit` shape: print ΔH at fixed (T, P, z) and sum it into a
model-inconsistency row) rather than anything in the heater, and it is an
architecture change needing its own ruling.  It is pinned here and in
`basis01`'s own header; nothing has been suppressed to make the number look
better.

Gate: `check_duty_inversion` (witness process02 with the dome-crossing arm,
the second publication path, the single-phase no-overreach control, and the
sensible path's named gap), sabotage-verified against the reverted fix at
the 827.62 % signature.

**Also on this day, from Vítor's own run of flash21**: the per-unit MASS
surface used FLUID mass, so crystalliser01 had been losing two tonnes an
hour of its own sugar product, silently, in a green suite, for as long as
the case existed (`F_massTotal`, `check_mass_closure`); and the three
conservation laws now fail in RED from one home
(`src/reporting/BalanceAlarm.H`), TTY-guarded, advisory-backed, each
branch watched firing before being trusted.
