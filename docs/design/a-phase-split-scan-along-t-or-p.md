# A phase split scanned along T or P — one flash per grid point, nothing re-derived

> **KIND: SLICE RECORD · STATUS: BUILT 2026-10-20** (DEV.md 4c C118, stage 1
> of three; the Explorer lens is stage 2, the excipient records stage 3).
> Vítor's request, verbatim in the DEV.md entry: *"uma tool de execução em que
> posso mexer em T ou P, mantendo um constante.  Eu dou a composição dos
> vários compostos, e ele faz-me a especiação V L1 L2 S1 S2 ... baixava a
> temperatura de 0 até −20 e via o pH a variar, gelo a formar e eventualmente
> excipiente a solidificar."*

---

## 1. The rule

**A scan publishes what the flash unit would publish at each state, through
the flash unit's own solver, and writes no equilibrium of its own.**

`phaseSplitScan` (`src/propertyOps/PhaseSplitScan.{H,cpp}`, registered in
`PropertyOperation::registerBuiltins`) sweeps T at fixed P or P at fixed T
over a declared grid at ONE fixed overall composition, and at every point
calls `IsothermalFlash::solveCore` with the options
`IsothermalFlash::readOptions` parses from a synthetic `operation {}` — so
`phaseSet VL | LL | VLLE | auto`, `alphaRich`, `betaRich` are the unit's own
words, read by the unit's own reader, and `auto` is decided per grid point by
the same tangent-plane test the unit runs.  Every path the unit serves is
served here by construction: vapour-liquid (Rachford-Rice), two liquids
(Gibbs), VLLE, the LIQUID+SOLID branch on a declared crystallising
`SolidPhase` (flash21's ice, `solidEq::equilibrate`), and the reactive
electrolyte package with its speciation, pH, second liquid and owned
precipitate (flash16's calcite, flash19's four phases at once).

The gate's strongest arm is the consequence: a single-point scan on a COPY
of each steady witness's sealed `constant/`, at that unit's operating state,
reproduces the unit's golden — flash21's `solidFraction` 0.475994623251 and
`a_water` 0.857434120931, flash16's pH 6.02023176857 and V/F 0.0212148279253,
flash19's pH 6.10723545836 and V/F 0.0283360913124 — to 1e-6, and in fact to
every printed digit.  A scan that solved a different equilibrium from the
unit would be a second flash under another name, which is the arity sin one
band up.

## 2. What is published, and how it is read

Per grid point: the amount (mol per mol of feed) of every phase present —
`V`, `L1`, `L2`, each solid BY NAME (the declared `SolidPhase`'s name, `ice`;
the mineral that owns a precipitate, `calcite`; `<component>(s)` only when no
single mineral does) — with the package's own labels (`liquor`, `aqueous`,
`organic`); each phase's composition; the flash's own observables (`pH`,
`solidFraction`, the crystal's activity `a_<c>` beside its closed-form
saturation value `aEq_<c>`, the reactive partial pressures); the solved
species flows where the package speciates; and every record-level
announcement at the FIRST point that raised it (the advisory log
deduplicates, so an entry new after a point was raised there and nowhere
earlier).  Between consecutive solved points every appearance and
disappearance is announced, between the two grid values it lies between,
and a `phaseSet auto` answer changing along the scan is an event too.

Two channels, one vector: `freeze.csv` (the swept variable first, then
`solved`, `nPhases`, one amount column per phase, `x_<phase>_<comp>`, the
observables, `n_<species>`) for the plotter and the `csv` golden kind, and a
top-level result block `phaseSplitScans` (points, events, refusals,
first-raised announcements, `notModelled`) for the Explorer lens.  The block
needed a door that did not exist: `PropertyOperation::resultBlock()` returns
`{blockName, jsonObject}` and `choupoProps` main groups every op's object
under `"<blockName>": [ ... ]` beside `operationResults`.  **No new golden
kind was added, and the reason was measured, not assumed:** every number in
the block is a CSV cell (read by `csv`) or a diagnostic (read by `diag` —
`n_points`, `n_solved`, `n_refused`, `n_events`, `n_announcements`, per
phase `points_<p>` / `first_<p>` / `last_<p>`, the grid values); the block's
remaining content is words.  A `scan` kind reading the block would have been
a second home for numbers the CSV already pins, which is the 2026-09-20
campaign-ledger lesson applied before the kind existed rather than after.

## 3. A refused point is a published fact

Where the flash cannot find a phase set for a point, the point is recorded
`solved 0` with the refusal verbatim (the flash's own sentence), its CSV row
carries `nan` amounts, the refusal rides the advisory log, and the scan
continues.  **Nothing is substituted** — not the previous point's phases, not
a single-phase guess.  The gate's probe is pure water under flash21's
LIQUID+SOLID declaration: below the triple point there is no state with both
phases (forming ice cannot change a pure liquid's activity, so the solver's
own consistency guard refuses — *"does not relax its own saturation"* — the
whole feed would freeze, which that phase set does not contain), every point
above solves, the run exits 0.  Only a scan with NO solved point exits 1.

## 4. The witness, and the identity it holds

`tutorials/props/thermo/phaseSplit01_freeze_water_ethanol` — flash21's
`constant/` copied verbatim, the 90/10 water/ethanol liquor cooled 273.15 →
253.15 K one kelvin at a time.  Ice appears between 265.15 and 264.15 K
(0.032 mol/mol at 264.15), the liquor concentrates to x_ethanol 0.19 at
258.15 K (flash21's point) and 0.27 at 253.15 K, where 63 % of the feed is
ice.  At every ice-present point `a_water` equals
exp(−ΔH_fus (1 − T/T_t)/(R T)) from `water.dat`'s own Hfus and triple point
to 1e-10 (the gate recomputes it from the record, never from a typed
literal); at every ice-absent point it lies BELOW that value (lnSI ≤ 0, the
crystal subsaturated).  The announcements land where they should: the NRTL
pair's span and the solid's missing-dCp term at the first point, both
Antoine extrapolations at 272.15 K — the first point below the fits' window.

## 5. What the scan does NOT model, said on every run

* Nucleation and supercooling — every point is the equilibrium ceiling.
* A solid no record declares.  A crystal needs the component's `Hfus` and
  triple point; `sucrose.dat` has NO `Hfus` (it decomposes before melting),
  so an excipient like it cannot crystallise here until it carries a
  solubility solid like halite's `solidPhases {}`; mannitol, glycine,
  trehalose, lactose are not in the catalogue at all — stage 3, the C117
  curation workflow's first real job.
* Solute inclusion in a crystal (ice is pure); the liquid/solid
  heat-capacity term of ΔG_fus (the record's own announcement).
* No measured freezing point anchors the witness; it is structural, as
  flash21 is.

## 6. Gate and sabotages

`bin/curate/check_phase_split_scan.py`, eight arms: (a) one home — the three
steady witnesses reproduced at their operating point; (b) the identity
recomputed from `water.dat` at every point, both sides of the crossing; (c)
the appearance event between its grid values, on the console and as
`first_ice`; (d) the pure-water refusal by name, continued, in the log; (e)
the Psat/dCp announcements at their first point; (f) four grammar refusals
(the swept axis declared in `state`, a composition variable, an empty
composition, an unknown `phaseSet` word — refused by the flash's own
reader); (g) closure to 1e-9 at every point; (h) a source arm — the op calls
`solveCore`/`readOptions` and carries no `solidEq::`, `Kvec`, `equilibrate(`
or TPD of its own, because no output arm can tell a correct answer from a
correctly-copied one.  The by-hand sabotages and what caught each are in the
gate's docstring.  **Two findings of the first run were the gate's, not the
engine's:** the subsaturation inequality was written the wrong way round
(a_w ABOVE the saturation value — it is below, lnSI ≤ 0), and "the grid value
before the ice point" had been computed as the farthest one rather than the
nearest.  Both were caught by the engine disagreeing with the gate, which is
the right direction for a gate to be wrong in.

## 7. What the Explorer lens (stage 2) reads

`phaseSplitScans[k]`: `variable` and `held` (the axes), `feed`, `phaseNames`
in plot order (V, L1, L2, then the solids as met) with `phaseLabels`,
`points[]` (`T`, `P`, `solved`, `phaseSet`, `regime`, `phases{name:
{amount, x{}}}`, `observables{}` — pH among them where the package
speciates — `species{}`, `firstRaised[]`, `reason` on a refused point),
`events[]` (`kind`, `phase`, `from`, `to`, `index`, `acrossRefused`) to mark
the boundaries, `refused` through the points' `solved`, and `notModelled[]`
to print under the plot.  The stacked amounts sum to 1 at every solved point
(arm (g)), so a stacked-area plot against the swept variable needs no
normalisation; a refused point is a gap, never a zero.

## 8. Related

`ice-as-a-solid-phase-of-the-solvent.md` · `solid-equilibrium-spike.md` ·
`which-result-blocks-a-golden-can-read.md` · `flash21_freeze_concentration`,
`flash16_calcite_precipitation`, `flash19_organic_and_precipitate` (the three
units this scan is held to) · `freezingPoint` (the freezing CURVE of one salt,
a different question).
