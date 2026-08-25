# Correlations as first-class objects — the friction-factor family

*Record of the 2026-08-25 slice.  Engine:
`unitOperations/hydraulics/friction/FrictionFactorCorrelation`,
`propertyOps/FrictionBench`, `unitOperations/hydraulics/Pipe`.  Witness:
`tutorials/props/hydraulics/moody01_friction_correlations`.  Gate:
`bin/curate/check_friction_correlations.py`.*

---

## 1  The pattern existed, and had been applied once

`HeatTransferCorrelation` has, since it was written, a shape worth naming:

* a **declared validity window**, returned as text for the report;
* a `verify()` **pinned to a published anchor**, whose result carries the
  anchor's own description;
* a bench (`choupoProps heatTransferBench`) that runs every registered
  correlation and prints the deviation **beside the source**.

Its own header states the reason: *"an unwired self-check is itself a
no-silent-crutch violation — this op is the wire."*

That discipline covered exactly one family.  Everywhere else, Choupo's
correlations were free functions inside the unit operation that used them.

## 2  What that cost, measured

`Pipe.cpp` held Blasius, Colebrook-White, Haaland and Churchill.  They were
correct, and each carried its citation **in a comment**.  A student could
not name one, could not evaluate it without building a pipe around it,
could not see where each stops being valid, and had no way to discover
that **they disagree**.

It also held the model dispatch **twice** — an `if`-chain in the
single-phase path and a second one in the two-phase lambda, three hundred
lines apart, in one file.  One decision, two transcriptions, free to drift
the moment a fifth correlation was added to only one of them.

## 3  What was built

The four moved into a registered family with the heat pattern's three
properties, plus one the heat family did not need: `citation()`.  *A
correlation whose source is a comment is one the reader cannot check* —
the 2026-08-05 rule (*a field the engine cannot see is a comment*) applied
to a formula instead of a datum.

`frictionBench` does two things, and the second is the point:

**VERIFY.** Every correlation reproduces its own anchor.  The anchors are
deliberately of **different kinds**, because what can be checked differs:

| correlation | anchor | what it actually tests |
|---|---|---|
| Blasius | its own closed form at Re = 1e4 | the **arithmetic**, and the output says so — a 0.000 % deviation must not read as a validation |
| Colebrook | the fully-rough von Kármán limit, where the implicit equation has a closed form | that the **fixed-point iteration** reaches the answer it must |
| Haaland | **Colebrook at the same point** | Haaland's own published claim is agreement within ~2 %; anchoring him to anything else would check a claim nobody made |
| Churchill | the **exact** laminar law f = 64/Re, which his single expression contains as its own limit | the strongest of the four — a mis-typed exponent fails here while the turbulent branch still looks plausible |

**COMPARE.** All four are asked the same question and the spread is
published.

## 4  The finding the witness makes visible

At Re = 1e5, eps/D = 1e-3 — an ordinary turbulent water line in commercial
steel:

```
  Blasius     f = 0.017770   <-- OUTSIDE ITS WINDOW  (no roughness term)
  Churchill   f = 0.022343
  Colebrook   f = 0.022175
  Haaland     f = 0.021966

  spread over ALL 4                        = 25.74 %
  spread over the 3 INSIDE their window    =  1.72 %
```

**The two spreads are reported apart, and that is the whole design.**  A
single headline number would say *"the correlations disagree by 26 %"* when
the truth is *"three agree within 2 % and one was asked a question it was
never fitted for"*.  Those are different lessons, both worth having, and
collapsing them is the kind of true-sounding statement this project exists
to refuse.

Note what Blasius does: it **answers**, confidently, and is 20 % low.
Nothing about the number looks wrong.  Only the window stands between that
answer and a reader — which is what a validity window is *for*, stated in
the one way that teaches it.

The bench never says which correlation is right.  That depends on the pipe,
and ranking them would hide the choice the engineer has to make — which is
precisely what a silent default does in every tool that has one.

## 5  What did NOT change

`Pipe` computes the same numbers, through the factory instead of two
`if`-chains.  All three hydraulics goldens are byte-identical.  **A refactor
that moves an answer is not a refactor**, and that is checked rather than
asserted: the correlations substitute the exact laminar law below Re = 2300
exactly as the old chain did.

## 6  Four sabotages, and a defect they found in the gate

All four were caught.

**S1** — Churchill's `(8/Re)^12` exponent changed to 11.  The turbulent
branch still looked entirely plausible; the **laminar anchor** caught it at
12.5 % deviation.  That is why that anchor was chosen.

**S2** — Blasius's out-of-window flag suppressed.  Arm (d) fired, and arm
(c) went with it: with nothing outside the window the two spreads collapse
into one, which is exactly the conflation the bench exists to prevent.

**S3** — the citation dropped from the output, the window kept.  A window
with no source is half a claim: the reader can see where it stops being
valid but not who said so.

**S4** — `Pipe.cpp` given back a private `f_churchill` while the factory
call stayed.  **The goldens did not move**, because both computed the same
thing, so the corpus was silent.  Arm (e) caught it by reading the source —
the only thing that can see a second home that happens to agree.

**AND A DEFECT IN THE GATE ITSELF.**  Three of the four sabotages also
reported *"pipe01_water_line no longer reproduces its golden"* while
touching nothing the pipe computes — S3 changed only a printed line.  The
cause was arm (f): `bin/runTests` **refuses outright** while a destructive
session's journal is open, so it never printed a PASS line, and the arm
read that absence as a moved answer.

*A check that cannot run must not pass — and must not fail with a false
reason either.*  Diagnosing a cause the evidence does not establish is
worse than reporting nothing, because it sends the next reader to the wrong
file.  Arm (f) distinguishes the two now and says which one it is.

## 7  What this does NOT establish, said plainly

**No correlation here is checked against experimental data.**  Two anchors
are self-consistency by construction, and Haaland's is agreement with
Colebrook — the claim he published, not an independent measurement.  Only
Colebrook's fully-rough limit tests an iteration against a closed form the
equation itself provides.  The corpus holds no friction measurements at
all, and the gate's OK line says so rather than letting four PASSes imply
validation.

Also outside this slice: the transition band (2300 < Re < 4000), where the
physics is not single-valued and nothing was regressed; and Ergun (packed
beds) and the two-phase multipliers, which remain unit-op-private.

## 8  The generalisation

Choupo implements about twenty named correlations.  One family has the
discipline; the rest are free functions with citations in comments —
Wilke-Chang and Chilton-Colburn in mass transfer, Thiele and Weisz in
reaction, Joback, Lee-Kesler, Rackett and Watson in estimation.

Each is a slice of this shape, and none needs new architecture.  What they
need is what this one got: an object, a window, a citation, an anchor, and
a bench that asks all of them the same question so a student can see them
disagree.
