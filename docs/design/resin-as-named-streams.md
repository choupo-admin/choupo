# The softener's resin as named streams (C500)

Status: decided and built 2026-11-25.  Rule 4b: a modelling assumption that
moves matter becomes a named stream carrying exactly that matter.

## The defect

`ionExchanger` published one outlet.  Ca, Mg and K left the water for the
resin and Na came off it, so the plant boundary (membrane08) lost 99.99 % of
its calcium and created the sodium; `ElementBalanceReport` named the alarm
RESIN-HOLDUP so that C498 would not fail the run.

## Weighed

(a) Two named streams, both non-negative: `resinOut` (Ca, Mg, K taken up) and
`resinIn` (Na released).  Exchange is equivalent for equivalent, so the
equivalents on the two streams are equal; the unit prints both and refuses a
gap above 1e-6 relative (charge, the third balance, held beside mass and
elements).  `resinIn` is computed by the unit, so it is an INLET of the plant
that no 0/ file can author.  No such stream existed in the tree: utility
circuits carry heat as energy streams (src/streams/UtilityCircuit.cpp), a
storage tank's make-up is authored (src/unitOperations/storage/StorageTank.H:78).
So the one new piece is a declared kind of stream: a unit lists a stream it
PUBLISHES but that enters the plant, `supplies ( resinIn );`, read once where
the flat topology is recorded (Flowsheet.cpp, `FlatUnit::supplies`) and
applied once where the reports derive feeds and products (reporting/Topology.H):
a supplied stream is a feed and an input of its unit, not a product and an
output.  Mass, element and (when it has a datum) energy reports, per unit and
for the plant, then read it right with no change of their own.

(b) Simpler: an authored `resinNa` feed.  Rejected: its flow must equal a
number the unit derives (CEC x dose x water flow, minus what stays), a second
home for a derived number that goes stale when the feed or a sweep moves.
Also (b'): one resin outlet with the net change.  Rejected: Na is negative.

## Ionic streams

A stream of bare cations is not electroneutral; the resin sites carry the
opposite charge.  Streams here are component molar flows with no charge field
(feed itself is declared per ion and its charge imbalance, 0.9 %, is printed by
the speciation), so `resinOut`/`resinIn` are written the same way, liquid,
at the feed's T and P, and their charge is carried as KPIs
(`resin_taken_eq_h`, `resin_released_eq_h`) and held equal by the unit.

## Compatibility

A softener with one output is REFUSED with the remedy (three outputs and
`supplies`), not run with an alarm: its ledger shows matter created, which is
the defect, and a refusal at the unit is earlier and clearer than an element
alarm at the end.  The one shipped case is migrated; the RESIN-HOLDUP name and
the two pins are deleted.

## Not done

Heat of exchange stays a KPI (T held, announced); the GUI canvas draws
`resinIn` as an outlet arrow (the result JSON does not carry `supplies`).
