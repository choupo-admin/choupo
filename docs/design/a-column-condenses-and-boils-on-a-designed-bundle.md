# A column condenses and boils on a designed bundle

*2026-10-20, DEV.md 4c C124 item 1, approved by Vítor the same day.  Kind:
ADR.  Status: BUILT.*

## 1. What was there

Measured on `main` before anything was built:

* `ColumnSize` builds the column's condenser and reboiler through
  `ShellTubeHX::sizeFromDuty` -- A = Q/(U LMTD) with U, the LMTD and the
  design pressure TYPED in the column's `designRules { condenser {...}
  reboiler {...} }`; the duty is the column's own `Q_condenser_kW` /
  `Q_reboiler_kW` KPI.  `column09_tray_hydraulics` is the one corpus case
  that sizes a column this way (and `aceticAcid02_plant`).
* The C48 Kern design route (`design {}`: the bundle declared, the tube
  count solved, U computed from the films, the wall and the fouling) was
  reachable from a flowsheet exchanger only -- `design::run` needs the
  unit's ports, and the column's condenser and reboiler have none: the
  overhead vapour and the boiling pool are inside the unit.
* The route refuses a process side that boils or condenses totally, and
  designs a partial condenser on the GAS film of the vapour that leaves
  (C48, the safe side).  Neither is a column condenser or a reboiler.
* Nusselt, Rohsenow and Zuber were in `htc/PhaseChangeHTC`, used by the
  `phaseChanger` unit alone.

## 2. One route, a second door

`ShellTubeHX::designPhaseChange` is a second DOOR onto the SAME
`design::run`, not a second design.  The column states its process side as
data -- a `PhaseChangeProcess`: condensing or boiling, between which
temperatures, at which pressure and composition, and a sentence saying where
those were read -- and `design::run` takes it in place of the ports.  The
bundle, the fouling, the utility side, the LMTD and its correction, the
tube-count search, the pressure drops, the validity announcements and the
record are the route's own, unchanged.  The refusal of a typed `U`/`LMTD`
beside `design {}` has ONE sentence, `ShellTubeHX::typedBesideDesign`, which
the flowsheet route and the column's two items both throw.

Absent a `design {}` block, route 1 runs exactly as before.  MEASURED, not
argued: every distillation case, every case that sizes a column or any
`shellTubeHX`, and every case whose flowsheet carries a column -- 46 cases,
2655 output files (stdout, stderr, exit code, `design/`, `reports/`,
`converged/`) -- byte-identical against a build of the parent commit.

The column catches a design that refuses and turns it into a NAMED item that
was not sized (`[not sized] the reboiler of column '...' was NOT sized:
...`), as it already did for a missing input: the shell, the trays and the
drum are still sized.  A refusal from the shared route therefore costs the
item, never the column.

## 3. The process side is the column's, never typed

* **Condenser**: the overhead enters at the column's `T_top` KPI -- with a
  total condenser the vapour leaving the top tray has the distillate's
  composition and is at its DEW point -- and leaves as the distillate at ITS
  bubble point (the distillate stream's own T, which `makeDistillate`
  solves).  Pressure and composition are the distillate's.
* **Reboiler**: a pool at the bottoms' bubble point.  The stage list's last
  stage IS the reboiler, so the bottoms stream's T, P and composition are
  the pool's; T_in = T_out (a kettle's pool is well mixed at its outlet
  state, and the sensible heating of the liquid arriving from the last tray
  is not separated out -- said in the source).

The products are the column's first two outputs (side draws follow them).
The sheet lists `Q_kW`, `T_process_in` and `T_process_out` under
`fromUnit`, beside `declared` and `fromRecord`, so a student reads which
numbers the case chose, which the column gave and which a data record held;
every other number is the engine's.

## 4. The phase-change film

The coefficient of a condensate film or of a boiling surface depends on the
temperature drop ACROSS THAT FILM, which depends on everything in series
with it.  So for every tube count N the film is the root of one equation at
the exchanger's mean flux:

    q_film(dT) / (A_film / A_o)  =  (F LMTD - dT) U_rest

U_rest the overall coefficient of everything but the film (the other side's
film, the wall, both foulings) on the outside area.  The left side grows
with dT (Nusselt as dT^3/4, Rohsenow as dT^3), the right side falls, so the
root is unique and is BRACKETED in (0, F LMTD): bisection to 1e-12 of the
span.  One wall temperature for the whole exchanger -- the mean-condition
posture of every Kern film here, no local integration.

* **Condensation, Nusselt (1916)**, `condensation { model NusseltFilm;
  orientation verticalTube | horizontalTube; }`.  On vertical tubes the
  height is the tube length, either side.  On the OUTSIDE of horizontal
  tubes the condensate of one tube falls on the next: Nusselt's own result
  for a vertical tier of N tubes, h_N = h_1 N^-1/4 (Incropera & DeWitt,
  Ch. 10), evaluated at the bundle's DEEPEST tier, N_rows = D_b over the
  vertical pitch (the pitch for a square layout, sqrt(3) x the pitch for a
  triangular one), D_b = shell ID - 12 mm.  The shorter outer tiers condense
  better, so the design errs on the safe side.  Film properties at T_film =
  T_sat - dT/2, T_sat the mean of the dew and bubble points; h_fg the
  package's vapour-minus-liquid enthalpy at T_sat and the condensate's
  composition; Nusselt adds the subcooling himself (0.68 cp dT).
  Condensation INSIDE horizontal tubes is a stratified or annular two-phase
  flow, not a falling film, and is refused by name.
* **Boiling, Rohsenow (1952)**, `boiling { model Rohsenow; Csf; s;
  citation; }`, nucleate POOL boiling on the outside of the bundle -- a
  kettle -- with the saturated liquid's properties at the pool temperature.
  None of the three is defaulted: C_sf is surface-finish laboratory data and
  the flux goes as C_sf^-3 (+/-100 %).  In-tube boiling is flow boiling and
  is refused by name.
* **The ceiling, Zuber (1959).**  The design flux is compared with the Zuber
  critical heat flux at the pool, and a design at or above it is REFUSED.
  WHY REFUSE AND NOT ANNOUNCE: above the critical flux the bubbles leaving
  the surface merge into a vapour blanket, the liquid no longer reaches the
  wall, the wall temperature jumps by hundreds of kelvin and the kettle is
  not a reboiler any more.  That is not a qualified answer (the case for an
  announcement, as for a correlation outside its window) but an impossible
  one, and this project refuses an impossible design (an overlap on a plot
  plan refuses; a short distance is announced).  It is also the
  `phaseChanger`'s rule for the same physics, so one ceiling has one
  posture.  The message names the remedy and the pedagogy: **the flux is U F
  LMTD, set by the temperatures and the resistances, NOT by the area, so
  adding tubes does not lower it -- a colder steam level does.**  The Zuber
  figure is a flat-plate ceiling; a tube bundle's is LOWER and is not
  modelled, so `fluxOverCHF` near 1 is not a margin, and the basis says so.

Properties come from the case's package (`thermoForPost`): liquid density
on its liquid route, heat capacity the derivative of its liquid enthalpy,
viscosity and conductivity from its declared LIQUID transport models, the
vapour density, the surface tension.  A missing model REFUSES by name; none
is substituted.  Four unit spellings were added, in `core/Units.cpp` and its
GUI mirror in the same commit, because the sheet carries values in them:
`J/kg`, `J/kg/K`, `N/m`, `W/m2` (with a `heatFlux` dimension).

A MIXTURE is announced on both films (a validity warning on the console,
the caveat block and the basis): a mixture's vapour-side resistance
(sensible cooling and diffusion through the vapour) and a mixture's lower
nucleate flux are NOT credited, so on a mixture neither design is on the
safe side.

The process side's regime words on the sheet are `filmCondensation` and
`nucleateBoiling`, deliberately NOT C48's `condensing`: that word means a
PARTIAL condenser designed on the gas film, and the GUI datasheet keys on it
(it would have drawn a Nusselt film under a "designed on the gas film"
banner).

## 5. Findings on the way

1. **The column's condenser duty is priced on a different latent heat from
   the one its streams carry.**  `Q_condenser_kW = -V1 (Hvapour -
   Hliquid)(T_top)` is the Watson rung (`Component::Hvap_pure` /
   `Hliq_pure`), while the streams and every report price on
   `H_stream_formation`.  On this witness the two latent heats differ by
   **1.96 %** (30 790 against 31 394 J/mol for the distillate), and since
   `Q_reboiler_kW = dH - Q_cond` CLOSES the balance, the reboiler absorbs
   the difference: the plant's first law closes either way, so no
   conservation gate can see it.  The same family as the evaporator's Watson
   latent closed on 2026-10-05.  NOT fixed here: it moves the two duties of
   every column in the corpus, and their goldens; recorded for Vítor.  It is
   why arm (x)'s cross-check of h_fg against the column's own vapour traffic
   is held at 3 % and not at round-off.
2. **`bin/choupo-import`'s agreement check does not read `equipment`
   rows.**  The first seal of the witness, taken before its golden existed,
   passed while the condenser was NOT sized in the sealed run (the utility
   records and `water.dat` were not in the seal); only the exit code was
   checked, and an item that is not sized exits 0.  Once the golden carried
   `utility` rows, the importer mirrored the utilities, learned `water.dat`
   from the ledger, and the sealed run reproduced the golden -- but a seal
   that changed a DESIGN would still pass its own agreement check.
   `bin/runTests` does compare the rows, and the witness passes it sealed.
3. `htc/PhaseChangeHTC.H` still describes itself as "v1 is FILM
   CONDENSATION ONLY ... boiling is deferred", while `Rohsenow` and
   `ZuberCHF` are registered beside `NusseltFilm`.  Pre-existing; left as
   found (a header comment edit rebuilds every heat-transfer file).

## 6. The witness

`tutorials/steady/distillation/column17_exchanger_design`: `column09`'s
column, flowsheet identical, its package plus `liquid { viscosity { model
Andrade; } thermalConductivity { model SatoRiedel; } }`, its postDict with
both exchangers on `design {}`.  Sealed (Choupo-2608).

| item | N (per pass x passes) | shell ID m | h_tube / h_shell W/m2K | U (clean) | F | LMTD K | A req / inst m2 | film |
|---|---|---|---|---|---|---|---|---|
| condenser | 142 (71 x 2) | 0.350 | 10293 (water) / 1012 | 600.6 (875.8) | 0.999 | 51.70 | 41.36 / 41.45 | Nusselt, 8 tubes per tier, dT_film 30.6 K, Re_film 25.2 |
| reboiler | 134 (67 x 2) | 0.497 | 8000 (declared steam) / 1005 | 661.7 (839.4) | 1 | 18.79 | 52.06 / 52.15 | Rohsenow, dT_excess 12.4 K, q 12.4 kW/m2 = 3.8 % of q_CHF 331 kW/m2 |

Against `column09`'s typed estimates (U 500 / LMTD 48 -> 53.5 m2; U 800 /
LMTD 17 -> 47.6 m2): the designed condenser is smaller (the typed LMTD was
low), the designed reboiler larger (the typed U was high).  On MP steam the
same kettle needs 7.0 m2 and runs at 30 % of its critical flux; on a clean
HP steam film (the gate's probe) it would run at 4.3 x the ceiling and is
refused.

The Rohsenow constant is the case's: C_sf 0.0101, s 1.7, benzene on
chromium from Incropera & DeWitt Table 10.1 -- a SURROGATE (a toluene pool
on carbon steel is not in that table), transcribed and NOT read back from a
copy in this tree, which the case says on the line that declares it.  The
steam film (8000 W/m2/K) and the fouling are author-set, said.

The golden was recorded on the new case only (`--record`, 197 rows: 150
`equipment`, 27 `kpi`, 8 `utility`, 6 `stream`, 3 `boundary`); no existing
golden moved.

## 7. Rejected alternatives

1. **A second exchanger design inside `ColumnSize`.**  Two homes for the
   bundle, the search and the record, drifting the first time either moved.
2. **Typing the process temperatures in the postDict.**  The column has
   decided all four; a typed copy stands still while the column moves.
3. **Announcing a flux above the critical heat flux.**  See section 4: an
   impossible design, not a qualified one.
4. **Kern's empirical tier exponent N^-1/6, or an averaged tier.**  Less
   conservative than Nusselt's N^-1/4 at the deepest tier; the safe side was
   chosen and said.
5. **Reusing C48's gas-film basis for the condenser.**  That route refuses a
   total condenser by design, and the gas film is not the resistance of a
   film condenser.
6. **A default C_sf.**  It would be priced into the area as though somebody
   had chosen it; Rohsenow refuses one already.

## 8. Gate

`check_design_sheet` arm (x): every number of both sheets RECOMPUTED, with
the correlations written out again in the gate from their sources (Nusselt
with the tier, Rohsenow, Zuber, the root, U, A, Sinnott, Bowman, the LMTD
from the column's own `T_top`, distillate and bottoms temperatures, the
utility flow from the record), h_fg held to the column's `V_rect` x the
distillate's molar mass, the `exchanger {}` provenance; five probes refuse
the ITEM by name while the shell is still sized.  Eight by-hand sabotages,
landed between the run and the check, all caught (listed in the gate's
docstring under (x)).

## 9. NOT done, said

* C124 item 2: side coolers, side heaters and pumparounds -- new MESH
  physics, Vítor's.
* In-tube flow boiling and in-tube horizontal condensation (refused by name).
* Mixture corrections (vapour-side resistance of a condensing mixture,
  nucleate-flux suppression of a boiling one): announced, not credited.
* A tube bundle's critical heat flux (lower than Zuber's flat plate).
* The kettle's enlarged vapour shell (the shell is the bundle's) and a
  kettle cost row: the reboiler is costed as every shell-and-tube item.
* A two-phase pressure drop: only the single-phase side's is computed.
* The GUI datasheet draws these sheets (they are `shellTubeHX` items with an
  `exchanger {}` block) but shows the two new regime words raw and no
  process temperatures (a column's process side has no ports; the
  temperatures are `T_process_in` / `T_process_out` in `sizing {}`), and
  does not show the flux against the critical flux.  Proposed, not built.
* Finding 1 above (the column's Watson latent).
