# Dynamic unit-to-unit routing (tanks-in-series) — one-page proposal

*2026-08-23.  DRAFT for the architect's ruling — not built, not authorised.
One page on purpose (the Gall rule).*

## The gap, observed

`choupoCtrl` units each read their own declared feed (`0/streamFaces`); the
driver never routes one unit's outlet into the next unit's inlet within a
step.  Measured consequence: the RTD/frequency tools shipped 2026-08-23 can
witness a single vessel only — the tanks-in-series half of the RTD lesson
(E(t) sharpening with N, σ²/t̄² = 1/N) cannot run.  `choupoBatch` already
routes (`routeDischarges`), so the continuous path is the odd one out.

## The smallest design that serves it

At each accepted step, AFTER the units advance: for every flowsheetDict
connection `a/outPort -> b/inPort`, write `a->outletStream()` onto `b`'s
inlet face for the NEXT step (explicit in time, one-step transport delay of
the numerical grid, announced once).  No new grammar: the connections block
already declares the topology; today the ctrl driver simply ignores it.
Refusals: a connection naming a unit without an inlet face; two connections
into one inlet.  The declared `0/streamFaces` stays the t = 0 state and the
faces of unconnected inlets.

## What it deliberately does not do

No implicit-in-time coupling (that is a DAE architecture question), no
back-pressure, no flow networks — series/parallel forward routing only.

## Cost and evidence

Driver-only change (~60 lines) plus one witness: three equal tanks in
series, pulse tracer, anchors σ²/t̄² = 1/3 and the Erlang-3 E(t) peak
location (closed forms).  Existing single-vessel cases untouched — an
unconnected case is byte-identical by construction.

## The question for the architect

Is one-step-explicit forward routing an acceptable semantic for the ctrl
path, or must inter-unit coupling wait for an implicit formulation?  The
first is small and honest-if-announced; the second is a different project.
