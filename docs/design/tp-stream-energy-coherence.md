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

1. **Rung slice (R-E3/R-E4)**: the two `h_formation` legs + the flash
   H_out solid term + gate arms (closed-form fusion-heat check on flash21;
   flash19 closure → 100 % assertion); goldens re-recorded with reasons.
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
