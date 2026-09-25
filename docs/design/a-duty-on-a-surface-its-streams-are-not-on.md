# A duty on a surface its streams are not on

**2026-09-25.**  `conversionReactor` priced both terms of its duty with
`h_pure_ig` -- ideal gas -- while the stream it publishes is priced by the
package, which may be a cubic equation of state.  This is the SUBSET of the
2026-09-08 family that `docs/design/what-a-passing-suite-does-not-say.md`
named, that `GibbsReactor` was taken off the same day (Vitor's `1298dc0d5`),
and that CLAUDE.md then called CLOSED while this unit was still in it.

Every number below was produced by a command, and the command is named.  The
engine measured is the one built from this commit's source unless stated.

---

## 1. What was wrong, in one sentence

`src/unitOperations/reactor/ConversionReactor.cpp` summed
`thermo.comp(i).h_pure_ig(T)` for the reaction term AND for the sensible term,
so the unit's declared `Q_kW` and the energy report's `dH` across the same
reactor were computed on two different enthalpy surfaces.  The difference is
whatever the package adds to the ideal gas: a departure function under an EoS,
or a latent term whenever a stream's state is not all-vapour.

---

## 2. The witness, and the proof that it is the surface and nothing else

`tutorials/plant/ammoniaStaged01_yield` (a case on branch
`claude/choupo-simulator-new-session-s494v2`, not on `main`; run from a copy
outside the tree).  Its converter runs at 200 bar with `fugacityModel SRK`.

    unit 'converter'   dH = 53257.785726 kW  vs declared 50979.639980 kW
                       (104.468736 % closure)
    globalEnergyBoundary  residual -2278.139364 kW   (-1.3316 %)

`53257.785726 - 50979.639980 = 2278.145746`, and the plant's whole residual is
`-2278.139364`.  **The reactor's surface gap WAS the plant's first law**, to
five decimal places.

The control that rules everything else out was run by the general who found
it and reproduced here: the SAME case with `fugacityModel idealGas` closes the
converter at 100.00 % and the plant at 0.0000 kW.  Nothing but the departure
function is in that 2278 kW.

After the fix, unchanged case, SRK:

    globalEnergyBoundary  residual +0.006382 kW  (3.68e-06 %)

and the remaining 6.4 W is the separator's own pre-existing -0.0064 kW.

---

## 3. What was changed

`src/unitOperations/reactor/ConversionReactor.cpp` -- one file, one new
anonymous-namespace helper used by BOTH reaction paths (single-reaction and
`reactions ( ... )`), so the rule has one home:

    Q_kW          = H(outlet state) - H(inlet state)
    Q_sensible_kW = H(feed composition at T_out) - H(inlet)
    Q_reaction_kW = H(outlet) - H(feed composition at T_out)

The middle state cancels, so the Hess split stays EXACT -- the promise
`ConversionReactor.H` has carried since 2026-08-13 -- rather than becoming an
apportionment.  When `T_feed == T` the middle state IS the inlet by
construction and the sensible term is identically zero, which is the other
invariant that header states.

**Every H is obtained through `flashState::twoPhaseSplit` + `hOfState`, else
`ThermoPackage::H_stream_formation` on the state the stream carries.**  That
is not `GibbsReactor`'s call, and the difference is deliberate: a third
surface has been written since 2026-09-08.  `reporting/BalanceMath.H::
streamH_elements` does NOT price a two-phase stream with
`H_stream_formation(T, P, vf, z)` -- that is a quality blend at the overall
composition `z`, exact only for a pure fluid, the 5.509232 kW `column01` paid
for on 2026-09-12.  It resolves the state and prices the equilibrium phases.
A duty built on the blend would agree with the report on every single-phase
stream and disagree on every two-phase one.  Asking the SAME question through
the SAME call is what makes the two unable to part.

`dH_rxn` is NOT changed and is deliberately a different number: the heat of
reaction is `SUM nu_i h_i(T)` on the elements/formation datum (CLAUDE.md §5,
ONE enthalpy base).  `Q_reaction_kW / extent` equals it under an ideal gas and
does not otherwise, and the console now prints them as two lines rather than
one sentence.  Its KPI is gated on its own flag (`haveRxnHeat`), not on the
duty's, because the two can now fail independently.

The advisory `twoPhaseSplit` may raise is taken through `deferTo` and printed
with the unit's console block instead of reaching `AdvisoryLog`.  The reason
is this unit's own, and it is the comment the `[rating]` line used to carry: a
recycle solves each unit against states it does not end on, so an advisory
raised here reaches the result JSON of a converged run describing an inlet
that run does not have.  The report raises the same note about the same stream
at the answer, where it is true.

**The `[rating]` line is DELETED.**  It said the duty was priced on the
ideal-gas rung and that the per-unit ledger would differ from `Q` by the
inlet's latent heat.  That sentence is now false of the engine, and a warning
that is false is worse than no warning.  Its guard
(`haveDuty && T_feed != T && vf_in < 1.0`) also fired only for a two-phase or
liquid inlet, so a single-phase vapour priced by a cubic EoS -- the
ammoniaStaged01 converter, the whole of that plant's residual -- was silent.
Nothing replaces it: there is no longer a gap to announce.

---

## 4. What moved, measured

Ten corpus cases carry a `conversionReactor`.  The table below was produced by
building the PRE-CHANGE binary from this branch's parent, running all ten from
copies outside the tree, rebuilding, and running them again -- so it covers
every published number, including the ones no golden pins.

**Six are unchanged, every reactor KPI and every boundary value, to 1e-12
relative.**  Three of them publish a duty and it does not move --
`acetonePlant` (828.050933 kW), `conversion01_hda` (-1007.673921 kW),
`equil01_reforming` (59.642465 kW) -- and the reason is checkable rather than
lucky: all three declare `fugacityModel idealGas` and hand the reactor an
all-vapour stream, and `H_stream_formation` at `vf >= 1` with no EoS returns
`H_ig(T, z)`, which IS the sum the old code performed.  On the first two the
identity is exact in the published numbers: `Q_reaction_kW` equals
`extent x dH_rxn` to the last recorded digit.  The other three --
`tartaricAcid`, `conversion02_parallel_selectivity`,
`chlorophenol01_chlorination` -- publish NO duty at all, before or after
(a present species has no enthalpy route, so `haveDuty` is false), and the
suite therefore says nothing about their duty either way.

`conversion01_hda`'s boundary residual moved from 1.82e-12 kW to exactly 0.
That is below the 1e-3 kW floor `bin/runTests` uses to decide a
`boundary residual_kW` row is a number at all, so it pins nothing and the case
passes.

Four move.  MEASURED, old -> new:

| case | quantity | before | after | change |
|---|---|---:|---:|---:|
| `acetone02_luyben_reactor` | `reactor.Q_kW` | 840.263235 | 1051.833460 | +25.179 % |
| | `reactor.Q_reaction_kW` | 470.487528 | 247.477646 | -47.400 % |
| | `reactor.Q_sensible_kW` | 369.775707 | 804.355814 | +117.525 % |
| | `boundary.Q_boundary_kW` | 840.263235 | 1051.833460 | +25.179 % |
| | `boundary.residual_kW` | -211.570225 | **0** | closed |
| `acetone03_luyben_reaction_section` | `reactor.Q_kW` | 840.263235 | 1051.833460 | +25.179 % |
| | `reactor.Q_reaction_kW` | 470.487528 | 247.477646 | -47.400 % |
| | `reactor.Q_sensible_kW` | 369.775707 | 804.355814 | +117.525 % |
| | `boundary.Q_boundary_kW` | -127.349716 | 84.220509 | -166.133 % |
| | `boundary.residual_kW` | -602.175944 | -390.605719 | -35.134 % |
| `hda` | `Reactor.Q_kW` | 18723.475604 | 20083.479473 | +7.264 % |
| | `Reactor.Q_sensible_kW` | 20061.857255 | 21421.861124 | +6.779 % |
| | `boundary.Q_boundary_kW` | -2636.979739 | -1276.975871 | -51.574 % |
| | `boundary.residual_kW` | -1701.911212 | -341.907343 | -79.910 % |
| `greenAmmoniaIndustrialN2` | `PURIFICATION.Deoxo.Q_kW` | -348.742980 | -349.759536 | +0.292 % |
| | `PURIFICATION.Deoxo.Q_reaction_kW` | -348.742980 | -349.759536 | +0.292 % |
| | `boundary.Q_boundary_kW` | -4350.182351 | -4351.198907 | +0.023 % |
| | `boundary.residual_kW` | -12.699223 | **-13.715779** | +8.005 % |

Not one published KPI key was ADDED or REMOVED on any of the ten, which is the
measurement that settles the one thing this change could have done by
accident: the duty and the heat of reaction are gated on separate flags now
(`haveDuty`, `haveRxnHeat`), and no case reaches a state where they differ.

`hda`'s reaction term did not move at all -- only its sensible term, and by
exactly the change in its duty (1360.004 kW) -- because its inlet is what was
mispriced, not its chemistry.  `greenAmmoniaIndustrialN2` is the opposite:
its Deoxo takes no `T`, so `T_feed == T` and the sensible term is identically
zero on both sides; what moved is the REACTION term, at 30 bar under SRK.

**And the green-ammonia row got WORSE, which is the honest result rather than
a regression.**  Its `PURIFICATION.Deoxo` now closes at 100.00 % / 0.0000 kW
and did not before; the 1.0166 kW it used to carry was CANCELLING part of a
residual that lives elsewhere in that plant.  This is the same negative result
CLAUDE.md records for `combined02` on 2026-09-08 -- *unifying a surface while
another pair still disagrees merely moves which pair does.*  It stays well
inside the gate's 1 % band (-0.0611 %) and is not pinned.

**What this fix localised and did not fix**, both now single named units where
they were plant-wide smears: `acetone03`'s `separator` (-390.61 kW, closure
59.63 %) and `hda`'s `Mixer` (+341.70 kW).  §5 shows the acetone one.

## 5. What the fix then MADE VISIBLE, and it is a case gap, not an engine one

Neither `acetone02` nor `acetone03` runs an EoS: both are
`fugacityModel idealGas`.  Their gap was the other half of the same
disagreement -- **neither case declares the phase of its streams.**  `0/Rin`
carries no `vaporFraction` and no `phase`, so `ProcessStream::vf` defaults to
0.0, UNPINNED, and the energy report has always priced both the 389 K feed and
the 623 K effluent on the LIQUID leg.  A 623 K acetone/hydrogen stream is not
a liquid.

MEASURED, on copies of both cases outside the tree, ONE line added to `0/Rin`
(`phase gas;`) and nothing else:

| | `acetone02` Q_kW | Q_reaction | Q_sensible | plant residual |
|---|---:|---:|---:|---:|
| as shipped | 1051.833460 | 247.477646 | 804.355814 | 0.000000 kW |
| + `phase gas;` | **840.263235** | **470.487528** | **369.775707** | 4.5e-13 kW |

The second row reproduces this case's shipped duty goldens **to the last
recorded digit**.

`acetone03` is stronger still: with the same one line its reactor AND its
separator both close at 100.00 %, and the plant's first law goes from
-602.175944 kW to **0.0000 kW**.  The 390.61 kW that this fix left sitting on
the separator was never the separator's physics -- it was the same undeclared
phase, read three different ways.

So for these two cases the surface fix does not choose the answer; it removes
the unit's private answer so the CASE becomes the thing that decides.
`docs/ai/pitfalls.md` already carries the rule -- *any feed that is not a
liquid at its (T, P) needs its phase pinned* -- and these two cases do not
follow it.

**The one-line case fix is NOT made here.**  It moves further golden rows, and
re-recording is the architect's act.

---

## 6. What was NOT done, named rather than implied

* **NO GOLDEN IS RE-RECORDED.**  Four cases FAIL `bin/runTests` until the
  architect acts, and the complete row list was delivered with this work.
* **`check_energy_closure.KNOWN_OPEN` is NOT edited.**  On the measurements
  above, `acetone02` (25.179 %) and `hda` (4.246 %) should LEAVE it -- the
  first closes exactly, the second at 0.825 % is inside the 1.0 % band -- and
  `acetone03` should be re-pinned from 33.308 % to 19.342 %.  All three FAIL
  the gate until then, two of them for improving, which is the ratchet working.
* **The separator gap in `acetone03` (-390.61 kW)** and the **Mixer gap in
  `hda` (+341.70 kW)** are what this fix localised and did not fix.  Both are
  now a single named unit rather than a plant-wide smear; §5 shows the acetone
  one is the phase declaration.
* **`ConversionReactor` still does not call `reactionHeat()`**, the ONE home
  CLAUDE.md §5 names for `dH_rxn`; it inlines the same sum.  Untouched,
  because routing it there is a separate change with its own announcements.
* **No other unit was examined.**  This is one member of the family, not the
  family.

---

## 7. Gate

None added, and that is a deliberate report rather than an omission.  The
invariant this fix establishes -- *the unit's duty equals the report's dH* --
is exactly what `check_energy_closure` already measures, case by case, and it
is the gate that will hold the four moved cases to their new numbers once they
are pinned.  A second gate asserting the same thing from the source side would
be a second home for one claim.

What has NO gate, and is stated rather than implied: nothing checks that a
unit's duty is computed through the report's own pricing call.  A future unit
can reintroduce this defect and only `check_energy_closure` on a case that
exercises it will notice.
