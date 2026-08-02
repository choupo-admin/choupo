# A5 thermal: the non-isothermal fixed bed — design before code

Status: **T1, T1.5 AND T2 ALL SHIPPED 2026-08-01**, same day as this
design (T2: batch22_wall_cooled — the containment bracketing holds,
t_50 856 s between 806 and 3036, Q_wall a state row read by the
`wallHeat` record, energy claimed at 2.7e-4; the wall/ledger desync
sabotage is caught by the witness golden).  Originally: T1 and T1.5
(T1: batch20_thermal_breakthrough — energy CLAIMED at 5.7e-5, t_50
806 s vs the isothermal 3042 s; T1.5: batch21_tsa_hot_purge — feed.T as
the hot-purge control, the WHOLE commitment re-declared OUT at T_old /
IN at T_new, ~97 % regenerated, energy claimed across the swing at
1.6e-4; gate check_thermal_bed, both slices sabotage-verified).  One
wording correction earned by the first run: DT_ad is announced as the
all-heat-retained BOUND, because u_th < u_sh makes the heat LAG the
front and the observed rise sits well below it.  T2 = wall heat
exchange stays named and deferred.  Original design below, written
2026-08-01 ahead of implementation (the A-series pattern: spec first,
stencil audited, anchors named before the run).

## 1. Scope decisions (each one refuses out loud)

* **Thermal REQUIRES `flowModel ergun`.**  The A3 constant-(u, P, T)
  closure holds c_tot = P/(RT) constant BY DECLARATION; a temperature
  field makes c_tot vary per cell, so thermal + constantVelocity is a
  contradiction of declared constants — REFUSED by name (A3 stays the
  isothermal teaching model).  Ergun mode already integrates every
  species and takes P per cell from ideal gas — it extends naturally to
  T per cell.
* **One temperature per cell** (local gas–solid thermal equilibrium).
  The two-temperature model (gas/solid film resistance) is a LATER
  refinement; the assumption is DECLARED in the run header.
* **Adiabatic in T1.**  The wall term −(4h_w/d)(T−T_w) is T2; asking for
  `wallHeatTransfer{}` in T1 refuses, named.
* **Adsorbed-phase heat capacity neglected, DECLARED** (the standard
  teaching simplification; stated in the header beside the solid cp).
* **k_LDF stays the declared constant** (its own T-dependence is sample
  data the case may some day declare; not fabricated here).

## 2. The energy balance (per cell j)

    [ eps*c_tot,j*cpg_j + rho_b*cp_s ] dT_j/dt =
        - (u*c_tot*cpg)|face * dT/dz                (advected enthalpy)
        + rho_b * Sum_i (-dH_ads,i) * dq_ij/dt      (adsorption release)

with cpg the MIXTURE molar ideal-gas heat capacity from the components'
own declared idealGasHeatCapacity models (no new data), and dH_ads the
SAME isosteric datum the van't Hoff b(T) and the energy ledger already
consume — one datum, three readers, no second home.  Axial thermal
dispersion defaults to 0 (declared), same posture as Dax.

The isotherm becomes T-dependent PER CELL: `Adsorbent::loading(p, T_j)`
— the van't Hoff machinery already exists; the change is passing the
cell's T instead of the declared constant.

State layout: one extra row block `T_j (N)` appended to the packed Y
(after the ledger rows), positivity-guarded in Kelvin.

## 3. New datum: the solid heat capacity `cp_s`

The adsorbent identity record carries no cp today.  HONESTY RULE: no
invented literature pin.  T1 reads `operation.solidHeatCapacity` from
the CASE (sample/equipment data, the kLDF pattern), with `scope` and
`source` strings REQUIRED — a teaching value declares itself as one.
Curating a primary-cited cp onto `assets/zeolite13X.dat` is a separate
curation act (Vítor's), after which the case value becomes an override.
A thermal run without a declared cp_s refuses, named.

## 4. Validation anchors (equilibrium theory — printed BEFORE the run)

For a single adsorbate + inert carrier, adiabatic:

* **Thermal-wave velocity** (no adsorption coupling limit):
      u_th = u * c_tot*cpg / (eps*c_tot*cpg + rho_b*cp_s)
  printed beside the concentration front's u_sh; the run's temperature
  front must travel at the coupled speed between these bounds.
* **Adiabatic temperature rise** of the combined front (energy over the
  breakthrough): DT = q*(c_in)*(-dH_ads) / (cp_s + eps*c_tot*cpg/rho_b)
  per kg basis — the plateau the outlet T must reach while the front
  loads, decaying back after saturation.
* **The isothermal limit IS the regression**: cp_s -> infinity (or a
  declared huge value) must reproduce batch18's breakthrough to golden
  tolerance — the thermal model must CONTAIN the isothermal one.
* The energy LEDGER stays an exact state difference; in thermal mode
  the vessel enthalpy prices each cell at ITS OWN T (the per-cell
  extension of today's ergun-mode vesselEnthalpy).

Witness case: `batch20_thermal_breakthrough` (ergun, CO2/He on 13X,
declared cp_s, adiabatic; golden pins the outlet T plateau against the
anchor + the crossings against the isothermal-limit shift).  Gate:
extend or sibling `check_feed_switch` with the thermal refusals
(thermal+A3, missing cp_s, wallHeatTransfer in T1).

## 5. Interactions with today's A5 feed switch

The feed switch composes: a thermal bed switched to hot clean carrier
IS the TSA regeneration step — but T of the FEED is a new control
(`feed.T` today refuses).  T1 keeps that refusal (feed enters at the
initial declared T); lifting it is the natural T1.5 once the energy
balance exists, and the refusal text will say so.

## 6. T2 — wall heat exchange (designed 2026-08-01, after T1/T1.5 shipped)

Grammar: `energyBalance wallCooled;` + a REQUIRED
`wallHeatTransfer { h [W/(m2 K)]; T_wall [K]; dBed [m]; }` block.
One-knob discipline, each refusing out loud: `adiabatic` WITH a
wallHeatTransfer block is a contradiction; `wallCooled` without one is
incomplete; h <= 0 is refused (`adiabatic` is the way to SAY zero).
dBed is DECLARED, never derived from the cross-section by a silent
circle assumption; the engine announces a_w = 4/dBed and the wall
NTU = h a_w L / (u c_feed cpg).

Physics: the T1 energy row gains  - h a_w (T_j - T_wall)  in its
numerator (per bed volume).  The LEDGER is the design point: the
removed heat is carried as ONE MORE STATE ROW of the same ODE,

    dQ_wall/dt = Sum_j h a_w (T_j - T_wall) A dz      [W]

-- the M_in/M_out ledger-row pattern (gate G3) and the Williams-Otto
objective-integral pattern, never a posterior quadrature.
energyRecords() then READS A STATE: kind `wallHeat`,
E = -Q_wall (heat ADDED is negative when the wall cools),
T_service = T_wall; the campaign balance closes
dH_vessels = Q_ledger + H_external with every term a state function.

Containment anchors (the thermal model must CONTAIN its limits):
h -> 0 recovers batch20's adiabatic run; h large drives the bed toward
the isothermal batch18 (t_50 -> 2768 s at N = 25, T_max -> T_wall).
The witness (batch22_wall_cooled) sits between the two and the golden
pins the bracketing:

    t_50(adiabatic) < t_50(wallCooled) < t_50(isothermal)
    T_wall < T_max(wallCooled) < T_max(adiabatic)

Gate: check_thermal_bed extends with the wallCooled positive + the
three declaration refusals; the old blanket "wallHeatTransfer is T2,
not built" refusal retires WITH this slice.

## 7. A6 — cyclic steady state (BUILT 2026-08-02)

**Status: shipped.**  Vítor's ruling was "faz como achares melhor" and
then "Avança!", so items 1-3 below are built; item 4 (`repeat untilCSS;`)
stays the named next step.  What the BUILD added to the design:

* **The accumulator trap.**  A unit's packed state also holds MONOTONE
  ACCUMULATORS — the bed's `M_in`/`M_out` ledger rows and its `Q_wall`
  row — which grow every cycle by construction.  Comparing the whole
  state vector could never converge and would report a perfectly cyclic
  bed as never settling.  So `cycleState()` is a virtual each unit
  overrides to return only what genuinely repeats; the bed cuts at
  `inOffset_()`, the layout's own boundary, so the cut cannot drift from
  it.  The design had said "records its packed state" — that would have
  been wrong.
* **Two distinct UNAVAILABLE reasons**, both named: fewer than two
  completed boundaries to compare, or no `cssTolerance` declared.  The
  engine never invents the tolerance — whether a bed has converged is a
  modelling judgement, not a default.
* **Equivalence is the contract, and it is gated.**  The declared form
  reproduces the hand-unrolled recipe on all 51 KPIs of batch23's
  golden; that is what let the hand-written event list be retired.
  `check_cycle_css` re-proves it on every run, and the sabotage (drop
  the k·period offset) breaks it by 7e-1.

Original proposal below, kept as the record of what was asked for.

## 7b. A6 — the original proposal (2026-08-01)

What exists TODAY (batch23_tsa_cycles, no new grammar): N hand-declared
TSA cycles in one recipe, ending exactly on a cycle boundary so the
final KPIs are end-of-cycle values; the qbar trajectory shows the
approach to the cyclic steady state, and every switch is ledgered.

What a first-class A6 needs, and why it is an ARCHITECTURE decision
(proposal-first, per the standing rule):

1. **Declared cycles.**  A `cycle { period; steps ( ... ); repeat N; }`
   recipe grammar -- repetition becomes structure instead of a
   hand-unrolled event list.  This touches the recipe grammar every
   batch case reads: Vítor's call.
2. **Per-cycle state snapshots.**  The bed (or the driver) records its
   packed state at each declared cycle boundary -- the cycle-k ledger
   the CSS verdict compares.  New unit/driver surface.
3. **The CSS verdict, tri-state and declared.**  CONVERGED when
   ||state_k - state_{k-1}|| / ||state_k|| falls below a tolerance the
   CASE declares (never a silent default); NOT-CONVERGED-YET with the
   measured trend otherwise; UNAVAILABLE when cycles are not declared.
   The norm and its components (c, q, T rows) stated in the verdict.
4. **Stop-at-CSS (optional, later).**  `repeat untilCSS;` -- run until
   the verdict converges or a declared cycle cap refuses.  Touches the
   time loop's exit condition; strictly after 1-3.

Estimated shape: (1)+(2)+(3) is one contained slice over choupoBatch's
recipe reader + a `cycleSnapshots()` hook; (4) is separate.  Decision
requested before any of it is built.
## 8. P-swing — blowdown / repressurisation (PROPOSAL, no code)

The standing refusals say "pressure swing needs transient c_tot" and
"flow transients need transient Ergun".  The T1/T1.5 machinery changes
the honest decomposition: in ERGUN mode every interior and outlet
velocity is ALREADY algebraic from the pressure field -- only the inlet
is an imposed flux.  So:

* **P1 -- outlet-pressure switch** (`setParameter P_out`, ergun+thermal
  only).  A declared P_out(t) step is the T1.5 pattern applied to the
  downstream boundary: the existing face machinery drains the bed, the
  vented gas already flows through the M_out ledger rows (telescopic),
  and no boundary changes KIND.  Contained.
* **P2 -- feed-valve closure** (`setParameter u = 0`, ergun only).  In
  ergun mode u_ is nothing but the imposed inlet flux, so closing the
  valve does not re-pose any interior problem; the remaining feed
  commitment retires through the SAME DatumAmendment machinery the
  T1.5 hot purge uses (one OUT package, whole commitment).  The frozen
  pre-run claims (t_st, atol scales) keep their announced values.
  Contained -- the old "transient Ergun" refusal was written for A3
  and over-reaches in ergun mode; the refusal text should say so.
* **P3 -- countercurrent steps** (blowdown/purge through the FEED end,
  flow reversal).  The inlet boundary changes KIND (imposed flux ->
  pressure boundary).  This is the real architecture step; stays
  refused, named.

THE PHYSICS COST, named before any code: the T1 energy equation was
written at constant pressure -- the expansion-work term vanished.  A
depressurising cell cools, and without that term the energy CLAIM
would survive numerically while lying physically.  P1/P2 therefore
REQUIRE adding the ideal-gas expansion term (+ eps dP_j/dt in the
energy-row numerator, the U-vs-H bookkeeping difference), and the
witness must SHOW blowdown cooling.  Anchors: the ideal-gas inventory
ratio n_end/n_0 = P_end/P_0 for an inert isothermal bed; the energy
closure with the new term; the vented-gas ledger closing against the
inventory drop.

Decision requested: P1+P2 (with the dP/dt term) as one slice --
together with T1.5 they complete a co-current Skarstrom cycle minus
the countercurrent purge -- and P3's refusal text updated to name
exactly the boundary-kind change it waits for.

## 9. The expansion term, DERIVED (2026-08-02) — and what it costs

Section 8 said P1/P2 "require adding `+ eps dP/dt`".  Doing the algebra
before the code changed the shape of the answer, so the derivation is
recorded here rather than discovered mid-implementation.

Energy balance on a cell of fixed volume, gas + solid, internal-energy
basis (the only correct basis when the volume is fixed and P moves):

    d/dt[ eps c_tot u_g + rho_b u_s ]
        = -(1/dz) d/dz[ u_sup c_tot h_g ]
          + rho_b Sum_i (-dH_ads,i) dq_i/dt
          - h a_w (T - T_wall)

For an ideal gas `u_g = h_g - RT`, so `eps c_tot u_g = eps c_tot h_g -
eps P`, and the accumulation carries `- eps dP/dt`.  Moving it to the
right gives the `+ eps dP/dt` of section 8 — but that form is IMPLICIT,
because `P_j = R T_j c_tot,j` contains `dT/dt`.  Substituting and
collecting:

    [ eps c_tot (cpg - R) + rho_b cp_s ] dT/dt
        = advection + adsorption - wall + eps R T dc_tot/dt

and `cpg - R = cvg`.  So the correct general form is **cv in the
accumulation, plus an explicit `eps R T dc_tot/dt` source** — fully
explicit, with `dc_tot/dt` already available as the sum of the species
rows the material equations just computed.  No implicit solve, no new
datum.

**What it costs, stated before it is built.**  The shipped T1/T2 form
uses `cpg` in the accumulation and no source term.  That is the
CONSTANT-PRESSURE form, and it is correct for what those cases declare
(P pinned, Ergun drop ~1e-3 of P).  The general form is not a bug fix —
it is a widening — but it is NOT numerically inert: `cp` vs `cv` moves
the gas accumulation by 28 %, which is **0.023 % of the total** because
`rho_b cp_s` dominates by three orders of magnitude.  Small, but not
zero: batch20, batch21, batch22 and batch23 would all need re-recording.

**Therefore the sequencing is:** the widening is its own slice, with its
own re-recorded goldens and a stated reason, and P1/P2 land on top of
it.  Bundling them would hide a corpus-wide numerical change inside a
feature commit, and the four goldens would move for a reason the diff
does not show.  The containment anchors survive the widening unchanged
(h -> 0 still recovers adiabatic; large h still approaches isothermal),
and they are the check that the widening did not break the model.

Recommended to Vítor rather than done at 06:20 with nobody awake: moving
four thermal goldens is a judgement about the corpus, and "faz como
achares melhor" is not a licence to make a physics-visible change
invisible.
