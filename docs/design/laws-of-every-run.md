# The laws of every run: what each run writes, judges and refuses

Status: DESIGN, 2026-11-25 (C532).  Nothing here is built.  Asked by Vitor the same day, after an external
review found a vapour at 638.8 K leaving a reboiler heated at 393 K, at exit 0 with the energy balance closed.

## 1. The rule

Every run, steady first, writes a verdict for every unit, every sector and the plant, recomputed from the streams
and utilities it PUBLISHES, never from a unit's own residual.  Nothing is opt-in and nothing is declared: the laws are
the same for every case, they live in the engine once, and no case can weaken them.  What a case owns is its
declared specifications; the run checks that the published outlet meets them.

A file of rules inside each case folder was considered and rejected: six hundred copies of one law drift, and a
case that may edit the second law can pass it.  The case receives the VERDICT (`reports/laws/`), not the rule.

## 2. The laws

| law | unit | sector | plant | independent input |
|---|---|---|---|---|
| mass, elements, energy | exists (C258, C498) | sums | exists | streams, heat and work |
| no outlet beyond what heats or cools it | T_out between the bounds its inlets, utilities, work and reaction allow | -- | -- | stream T, utility T in and out, declared co/counter-current |
| phase availability | the duty on a phase change does not exceed what that phase holds; the outlet state is the package's state at its T, P, H | -- | -- | H(T, P, z) of the package at the ends |
| second law | S_gen >= -tolerance | sum | sum | S of every stream from the package, Q/T of each heat at its own source |
| exergy | destroyed T0 S_gen >= 0; efficiency | sum | minimum work, efficiency | T0 declared once, 298.15 K by default, printed |
| declared specification met | the value asked is the value published | -- | -- | flowsheetDict `operation` and the outlet |
| local energy | each segment of a published profile conserves energy on both sides | -- | -- | the profile's own rows |

## 3. Three outcomes, never two

HOLDS, VIOLATES, NOT JUDGED with the reason by name.  The 2026-11-24 measurement on 753 unit rows gave 429 / 22 /
302: 141 rows have no elements-datum enthalpy, 46 a precipitated solid with no entropy rung, 37 a dissolved or
electrolyte liquid the entropy rung refuses.  A law that cannot be judged must say so in the run, in the GUI and in
the count, so a missing rung is visible work and never a silent pass.

## 4. Severity

GROSS: the run is not converged and exits 1, naming unit, law, numbers and the two streams, exactly as a broken mass
balance does today.  ALARM: printed, counted, in the result, exit unchanged.  A law enters as ALARM and is promoted to
GROSS only when the shipped corpus has zero violations left unexplained by name.  Temperature crossing and phase
exhaustion enter as GROSS at once (nothing legitimate does them; heat pumped by work or released by reaction are the
stated exceptions and are judged by the second law instead).  The second law enters as ALARM.

## 5. The 22 violations, before promotion

(a) Specifications that break it (cavett01's drums, ammoniaRoutes01's two splits): the case header declares it and
the run prints it as a declared violation of a benchmark; no unit is excused in the engine.  (b) Engine candidates
(flash13, stripper01/02, process05, recycle02, screen01): each read and fixed or named.  (c) Artefacts (solver noise at 1e-6
relative, recombine mixer, undeclared residuals): the tolerance is stated from the throughput, the mixer fixed.
The opt-in ledger of 3063ad718a is the starting point; it was to land with C492 and did not.

## 6. What is NOT claimed

No accuracy of any number; a closed second law does not prove a design is right; a law on a published profile checks
the profile, not the unit's internal path; batch and dynamic runs are a second slice with their own accumulation terms.
