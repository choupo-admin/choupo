# A negative pressure is refused

*Kind: ADR.  Status: BUILT 2026-11-02 (DEV.md 4c C186 item 5b, found by the
general who built item 5; see `a-tear-has-a-pressure.md` section 5).  Gate:
`check_negative_pressure`.*

---

## 1. The defect, reproduced before it was fixed

`Flowsheet.cpp` `runUnit` registered every produced stream with
`if (s.P <= 0.0) s.P = P_inherit;`, `P_inherit` being the FIRST input's
pressure.  The `pipe` publishes a NEGATIVE outlet pressure when its drop
exceeds its inlet, and warns on stderr; the line then replaced it.

| repro (water, 300 K, 5 bar in, D 0.04 m, L 500 m, 1000 kmol/h) | main answered |
|---|---|
| pipe, then a splitter | pipe computed -16.8034 bar; stream table: `downstream P = 5.000 bar`; exit 0 |
| the same pipe in a mixer -> pipe -> splitter recycle, Wegstein | pipe computed -43.0, -59.9, -79.4 bar; "Recycle converged in 3 Wegstein iteration(s)"; `P = 5.000 bar` everywhere; exit 0 |
| the same under Newton | "Recycle converged in 1 Newton iteration(s)"; `P = 5.000 bar`; exit 0 |

The published answer is the INLET pressure, a number no unit computed, and a
loop with a large drop sits on that spurious fixed point and is called
converged.

## 2. Corpus reach (measured 2026-11-02)

The line was instrumented (an environment-guarded print, removed before the
commit) and every choupoSolve case was run to completion with the engine
unchanged otherwise: 292 case directories (the 260-odd steady cases, the
plant cases, the outerDict cases, and the sector sub-directories), 285 exit
0; the 7 non-zero exits (two sector sub-folders, flash15 and tsa02 which
are deliberate refusals, three userOps cases that need a compiler) print no
clamp line, and the instrument only prints.

**28 cases reach the clamp.  Every one of them with P == 0 exactly; none
with a negative P, on a trial or on an accepted pass.**  The units are
the `cstr` (the large majority) and the `pfr`: they publish no pressure by design and rely on the inheritance.  The
plants that do reach it with many trial hits are
`steady/reactors/ammoniaReactor04_kineticSizing` (converter, pfr, 616 hits),
`steady/economics/sugarPlantEconomicsSweep` and `plant/ChemicalPlantTutorial`
(Fermentor, cstr), `steady/flowsheets/process03_recycle`,
`recycle_autoinit_tear` and `process05_isomerization_recycle` (reactor, cstr);
the others are one hit on an accepted pass (the reactor of a flash flowsheet,
the cstr and pfr tutorials, optim02 and optim05).  Full list in the commit
message of this slice.  No pipe case, no recycle with a pipe, reaches a
negative pressure.

## 3. The decision

**P == 0 and P < 0 are two different facts and are separated.**

* `P == 0` is the sentinel "this unit did not set a pressure".  28 corpus
  cases rely on it, deliberately.  It keeps inheriting the first inlet's
  pressure, as before.  (The brief proposed refusing "negative or zero";
  zero cannot be refused without breaking every cstr and pfr, and cannot be
  told apart from a unit that left the field unset.  A unit that wants an
  explicit pressure sets it.)
* `P < 0` can only be a computed number (a drop larger than the inlet).  On
  an ACCEPTED pass it is a refusal by name: unit, type, outlet stream, the
  negative P, the inlet P, and the remedy (a smaller drop, or a pump / a
  valve to a fixed pressure).  Exit 2, like any unit that cannot produce a
  state.
* On a TRIAL sweep it is handled as before (the inlet pressure stands in) and
  **counted**; the recycle solve announces `trial pressure clamped N time(s)`
  once, with the first occurrence, on stdout, in the caveat block and in the
  result JSON (`category pressure`).  Never silent.

**How the flowsheet knows it is in a trial.**  `runUnit` already takes
`quiet`: `true` for every sweep the recycle solvers run while iterating (the
Wegstein iterates, the Newton function evaluations and the finite-difference
Jacobian probes, the line-search trials), `false` for the single pass of a
tear-free flowsheet and for the ONE final full-logging pass after a recycle
converges.  `quiet` is therefore the accepted/trial distinction; no new flag
was added (one home for the fact).

**Why the refusal lands on the final pass, not earlier.**  A Newton step may
visit a negative pressure and recover, so refusing on a trial would refuse
loops that converge.  The spurious fixed point of section 1 survives its
iterations by construction (the clamp makes it consistent) and meets the
refusal on the final pass: the loop in the table above now exits 2 naming
`P1` and -79.3668 bar.

## 4. Found, not fixed

* The refusal on the final pass reports the first negative stream of that
  pass only; a loop with several negative pipes is told one at a time.
* A trial that visits a negative pressure and whose accepted pass also
  would is refused, but the trial count announcement is lost with the
  thrown error (the refusal message does not repeat it).
* Units that read a received pressure of exactly 0 (the sentinel
  inherited) are not audited here.

## 5. The gate

`check_negative_pressure` builds its fixtures from text: a feed-forward
pipe (D 0.04 m refuses, D 0.1 m runs), the same pipe in a torn recycle under
Newton and Wegstein (refuse), a mixer -> pipe -> pump -> splitter loop
seeded so that only the first sweeps drive the pipe negative (exit 0,
`trial pressure clamped` announced on stdout and in the caveat block, the
wider-pipe twin announces nothing), the cstr01 sentinel (runs), and a source
arm on `runUnit`'s guard, the counter's reset and the announcement.
Sabotages, observed, in the gate's docstring.
