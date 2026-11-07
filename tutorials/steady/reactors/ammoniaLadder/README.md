# The ammonia reactor-model ladder

Four cases over ONE unchanged ammonia synthesis loop.  **Between consecutive
rungs exactly one thing moves: the reactor model.**  Feed, pressure,
components, property package, recycle plan, tear seed, separator, let-down and
purge are the same; diff two `system/flowsheetDict` files and the converter
block is what differs (rung 4 also adds a `V_bed` variable and a feed
preheater).

| rung | case | reactor | claims | must not claim |
|---|---|---|---|---|
| 1 | `ammoniaReactor01_fixedConversion` | `conversionReactor`, declared conversion | a material balance | a reactor size; an equipment-factored cost |
| 2 | `ammoniaReactor02_equilibrium` | `gibbsReactor`, true equilibrium | the thermodynamic ceiling | any size, any cost |
| 3 | `ammoniaReactor03_equilibriumApproach` | `gibbsReactor` + 5 K approach | a realistic outlet; downstream units may be sized | a bed volume the engine computed |
| 4 | `ammoniaReactor04_kineticSizing` | adiabatic `pfr` on the Dyson and Simon (1968) rate law, volume solved by a DesignSpec | a bed volume the engine computed | a pellet effectiveness factor (announced as unpriced) |

Read the rungs in order; each README says what its rung claims and what it
cannot.  Background: `docs/design/how-a-process-design-is-staged.md` and the
props bench `tutorials/props/kinetics/ammoniaRate01_dyson_simon` for the rate
law of rung 4.

This is a TEACHING SEQUENCE, not a family of plants.  The reference plants of
the same process live in `tutorials/plant/` (`ammonia02_full_plant`, the
conventional loop; `greenAmmoniaPEQ_baseCase`, the green-ammonia project).
These cases moved here from `tutorials/plant/` under DEV.md 4c C244 with their
names, goldens and contents unchanged; the old identifiers resolve through
`tutorials/ALIASES`.
