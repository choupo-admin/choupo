# `gibbs13_adiabatic_approach_direction` — the sign of an adiabatic approach is read from the answer, never from the seed

**THE CASE.**  One adiabatic `gibbsReactor`: the third bed of a staged
ammonia converter, fed a gas that already carries 16 % NH3 (N2 19, H2 57,
NH3 16, Ar 8 mol%; author-set to be representative of a last bed, not a
plant measurement), entering at 415 °C and 150 bar, with a 10 K approach to
equilibrium (the band US 5,352,428 calls "preferably 1 C. to 10 C."; see
`ammoniaStaged03_approach` for the source).  `operation.T` is the SEED of the
outer Newton on the outlet temperature, and it is set to 495 °C — 80 K
hotter than the answer — on purpose.  The `0/out` file is an initial
estimate of the stream and is NOT that seed; the unit reads its seed from
its own dict.

## 1. The defect this case witnesses (DEV.md §5, 2026-10-01; fixed 2026-10-03)

`temperatureApproach` is declared as a MAGNITUDE and the engine assigns its
sign from the thermicity of the transformation feed → equilibrium (ruled
2026-09-26).  In `mode adiabatic` the physical temperature is the answer of
an outer Newton, and until 2026-10-03 the thermicity was read **at the
seed**.  A feed that already carries product is itself at equilibrium at
some temperature (here about 487 °C).  Seeded hotter than that, the
equilibrium at the seed holds LESS ammonia than the feed, the transformation
reads as decomposition (endothermic), the approach takes T − 10 K, and the
bed ends MORE converted than its own equilibrium outlet — the aid helps
instead of hurting.  A 60 K colder seed on the SAME case took the other
sign.

Measured on this feed with the old rule (dT = 10 K):

| seed | sign | outlet T | y_NH3 |
|---|---|---|---|
| 768.15 K (this case) | − | 734.24 K | 19.32 % |
| 708.15 K | + | 721.05 K | 18.36 % |
| dT = 0, either seed | — | 727.63 K | 18.84 % |

The hot-seeded bed published more ammonia than equilibrium allows at its
own outlet, at exit 0, with the sign announced as if it were a finding about
the chemistry.

## 2. The rule now

The bed is solved **once with no approach** — its own dT = 0 adiabatic
outlet T0, which no seed can move — the thermicity of feed → THAT state
decides the sign (exothermic here: the bed heats from 688 K to T0), the
announcement names T0, the seed the probe started from and the enthalpy
change it read, and the bed is re-solved from T0 with the signed approach.
So this case ends at the same outlet as its cold-seeded twin, 721.05 K and
18.36 % NH3, BELOW its dT = 0 equilibrium in both ammonia and temperature,
which is what a real bed does.  `approachProbeOuterIterations` publishes
the cost of the dT = 0 solve (one extra outer Newton; `outerIterations` is
the re-solve's count, now seeded from T0).

Isothermal mode is untouched: there the physical T is `operation.T` and the
reading was at the answer all along.

## 3. Where the rule is enforced

`check_adiabatic_approach_direction` runs this case under its hot seed and
under a cold seed and requires ONE outlet; runs it at dT = 0 and requires
the approach outlet below it in NH3 and in T; reads T0 off the announcement
and holds it to the dT = 0 run's own temperature.  Record:
`docs/design/the-approach-direction-is-read-from-the-answer.md`.
